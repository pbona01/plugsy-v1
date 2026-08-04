import "dotenv/config";

// Global Telegram environment variable auto-detection and correction for swapped credentials
if (
  process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN &&
  process.env.VITE_TELEGRAM_ADMIN_GROUP_ID
) {
  const token = process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN.trim();
  const group = process.env.VITE_TELEGRAM_ADMIN_GROUP_ID.trim();
  if (group.includes(":") && !token.includes(":")) {
    console.log("[telegram] Global auto-correction of swapped Telegram credentials applied.");
    process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN = group;
    process.env.VITE_TELEGRAM_ADMIN_GROUP_ID = token;
    
    // Mirror to standard variables used by other parts of the backend
    process.env.TELEGRAM_BOT_TOKEN = group;
    process.env.TELEGRAM_CHAT_ID = token;
  } else {
    // Normal alignment
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      process.env.TELEGRAM_BOT_TOKEN = token;
    }
    if (!process.env.TELEGRAM_CHAT_ID) {
      process.env.TELEGRAM_CHAT_ID = group;
    }
  }
} else {
  // If only some are set, ensure standard ones are mirrored
  if (process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN && !process.env.TELEGRAM_BOT_TOKEN) {
    process.env.TELEGRAM_BOT_TOKEN = process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN;
  }
  if (process.env.VITE_TELEGRAM_ADMIN_GROUP_ID && !process.env.TELEGRAM_CHAT_ID) {
    process.env.TELEGRAM_CHAT_ID = process.env.VITE_TELEGRAM_ADMIN_GROUP_ID;
  }
}

import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import crypto from "crypto";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import { clerkClient, ClerkExpressWithAuth } from "@clerk/clerk-sdk-node";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramAlert } from "../lib/telegram";
import { google } from "googleapis";
import multer from "multer";
import { PassThrough } from "stream";
import { requireVerifiedClerkUser } from "../../api/_clerkAuth.js";
import { syncVerifiedClerkProfile } from "../../api/_profileSync.js";
import { sendOneSignal } from "../../api/_oneSignal.js";

const upload = multer({ storage: multer.memoryStorage() });

const resend = new Resend(process.env.RESEND_API_KEY || "re_mock_key");
let supabaseUrl = (
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  "https://vnilkycbtxxcyoynakge.supabase.co"
).trim();
if (supabaseUrl.endsWith("/")) supabaseUrl = supabaseUrl.slice(0, -1);
const supabaseKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  "sb_publishable_6krQD2xCzjSLtaol0F0YNg_bCk3ZpNa"
).trim();
const supabase = createClient(supabaseUrl, supabaseKey);

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "WARNING: SUPABASE_SERVICE_ROLE_KEY is not defined. Backend processes like Payment Verification may fail due to Row-Level Security (RLS) rules.",
  );
}

async function sendLocalPush(userId: string, title: string, body: string, url: string = "/dashboard", tag: string = "plugsy") {
  try {
    await sendOneSignal({ title, body, url, targeting: { include_aliases: { external_id: [userId] } } });
  } catch (e) {
    console.error("[push] transactional notification failed safely");
  }
}

async function sendLocalPushToAdmins(title: string, body: string, url: string = "/admin", tag: string = "admin-notif") {
  try {
    await sendOneSignal({ title, body, url, targeting: { filters: [{ field: "tag", key: "user_role", relation: "=", value: "admin" }] } });
  } catch (e) {
    console.error("[push] admin notification failed safely");
  }
}

async function cleanDuplicatePortfolioOrders() {
  try {
    const { count, error } = await supabase
      .from("orders")
      .delete({ count: "exact" })
      .or(
        "order_reference.ilike.portfolio_%,paystack_ref.ilike.portfolio_%,order_reference.ilike.port_%,paystack_ref.ilike.port_%",
      );

    if (error) {
      console.log(
        "[Startup-Cleanup] Failed to clean misplaced portfolio orders:",
        error.message,
      );
    } else {
      console.log(
        `[Startup-Cleanup] Misplaced portfolio orders cleaned successfully on server startup. Total deleted: ${count}`,
      );
    }
  } catch (err: any) {
    console.log("[Startup-Cleanup] Error on startup cleanup:", err.message);
  }
}
const _filename = typeof __filename !== "undefined" ? __filename : "";
const _dirname = typeof __dirname !== "undefined" ? __dirname : path.dirname(_filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust the proxy (needed for accurate IP identification behind Nginx/Cloud Run)
  app.set("trust proxy", 1);

  // Rate Limiting
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Increased to 1000 for dev stability
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(limiter);
  app.use(
    express.json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Sitemap generator
  app.get("/sitemap.xml", (req, res) => {
    try {
      const baseUrl = "https://www.plugsy.ng";
      const pages = [
        { url: "/", changefreq: "daily", priority: 1.0 },
        { url: "/market", changefreq: "daily", priority: 0.9 },
        { url: "/support", changefreq: "weekly", priority: 0.8 },
      ];

      let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;

      for (const page of pages) {
        sitemap += `
  <url>
    <loc>${baseUrl}${page.url}</loc>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`;
      }

      sitemap += `\n</urlset>`;

      res.header("Content-Type", "application/xml");
      return res.status(200).send(sitemap);
    } catch (err) {
      console.error("Sitemap generation error:", err);
      return res.status(500).send("Error generating sitemap");
    }
  });

  // Admin Data Fetching Routes
  const adminProtectionMiddleware = async (req: any, res: any, next: any) => {
    console.log(
      `[MIDDLEWARE] Checking admin for user ${req.auth?.userId || "none"}`,
    );
    if (!req.auth || !req.auth.userId)
      return res.status(401).json({ error: "Unauthorized" });
    try {
      const user = await clerkClient.users.getUser(req.auth.userId);
      console.log(
        `[MIDDLEWARE] User fetched: ${user.id}, role: ${user.publicMetadata?.role}`,
      );
      if (user.publicMetadata?.role !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admins only" });
      }
      next();
    } catch (e) {
      console.error(`[MIDDLEWARE] ERROR:`, e);
      return res.status(500).json({ error: "Auth verification failed" });
    }
  };

  app.post(
    "/api/admin/send-login-email",
    ClerkExpressWithAuth(),
    adminProtectionMiddleware,
    async (req, res) => {
      try {
        const {
          userEmail,
          userName,
          loginDetails,
          productName,
          orderReference,
        } = req.body;
        const email = userEmail;
        const orderRef = orderReference;

        const resendApiKey = process.env.RESEND_API_KEY;
        if (resendApiKey && resendApiKey !== "re_mock_key" && email) {
          const { Resend } = require("resend");
          const resend = new Resend(resendApiKey);

          const html = `
           <div style="font-family:sans-serif;max-w:600px;margin:0 auto;">
              <h2>Your Logins Are Ready!</h2>
              <p>Hi ${userName || "there"},</p>
              <p>The logins for your <b>${productName || "Premium Plan"}</b> subscription are ready.</p>
              <div style="background:#f4f4f4;padding:20px;border-radius:10px;margin:20px 0;">
                <p style="white-space:pre-wrap;font-family:monospace;margin:0;">${loginDetails}</p>
              </div>
              <p>You can also view this anytime in your <a href="https://plugsy.ng/dashboard">Plugsy Dashboard</a>.</p>
           </div>
         `;

          await resend.emails.send({
            from: "Plugsy <hello@plugsy.ng>",
            to: email,
            subject: "Your Premium Logins are Ready! 🗝️",
            html: html,
          });
        }

        // Telegram Notify
        const telegramToken =
          process.env.TELEGRAM_BOT_TOKEN ||
          process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN;
        let telegramChatId =
          process.env.TELEGRAM_CHAT_ID ||
          process.env.VITE_TELEGRAM_ADMIN_GROUP_ID;

        if (telegramToken && telegramChatId) {
          if (!telegramChatId.startsWith("-100")) {
            telegramChatId = "-100" + telegramChatId.replace(/^-/, "");
          }

          const telegramMessage =
            "✅ LOGIN SENT — PLUGSY\n\n" +
            "👤 User: " +
            (email || "Unknown") +
            "\n" +
            "📧 Email: " +
            (email || "Unknown") +
            "\n" +
            "📦 Plan: " +
            (productName || "Premium Plan") +
            "\n" +
            "🔑 Ref: " +
            (orderRef || "N/A");

          fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: telegramMessage,
              parse_mode: "HTML",
            }),
          }).catch(() => {});
        }

        // Try sending Push Notification to the user!
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("clerk_id")
            .eq("email", email)
            .limit(1)
            .single();
          if (profile?.clerk_id) {
            await sendLocalPush(
              profile.clerk_id,
              "🔑 Your Login is Ready!",
              `Your ${productName || "Premium"} login details have been sent. Check your messages.`,
              "/dashboard/messages"
            );
          }
        } catch (e) {
          console.warn("Failed to lookup profile for push:", e);
        }

        res.json({ success: true });
      } catch (err: any) {
        console.error("Email ping err:", err.message);
        res.status(500).json({ error: "Failed to send email" });
      }
    },
  );

  app.post("/api/admin/withdrawal-ping", async (req, res) => {
    try {
      const { email, amount } = req.body;

      // Telegram Notify
      const telegramToken = process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN;
      let chatId = process.env.VITE_TELEGRAM_ADMIN_GROUP_ID;

      if (telegramToken && chatId) {
        if (!chatId.startsWith("-100")) {
          chatId = "-100" + chatId.replace(/^-/, "");
        }
        const telResponse = await fetch(
          `https://api.telegram.org/bot${telegramToken}/sendMessage`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_id: chatId,
              text: `💸 WITHDRAWAL REQUEST: ${email || "A user"} - ₦${amount?.toLocaleString() || 0}. Check Admin Panel to process.`,
              parse_mode: "HTML",
            }),
          },
        );
        if (!telResponse.ok) {
          console.error("Telegram API Error:", await telResponse.text());
        }
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Telegram ping err:", err.message);
      res.status(500).json({ error: "Failed to ping" });
    }
  });

  app.get("/api/plans", async (req, res) => {
    console.log("HIT /api/plans route!");
    try {
      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("price", { ascending: true });
      if (error) throw error;
      res.json(data || []);
    } catch (error: any) {
      console.error(`Plans Fetch Error:`, error);
      res.status(500).json({ error: error.message });
    }
  });

  // Environment Diagnostics (helpful for debugging live site issues)
  app.get("/api/health/env", ClerkExpressWithAuth(), async (req: any, res) => {
    try {
      res.json({
        status: "ok",
        auth: !!req.auth?.userId,
        supabase_connected: !!supabase,
        is_production: process.env.NODE_ENV === "production",
        clerk_key_type: process.env.CLERK_SECRET_KEY?.startsWith("sk_live")
          ? "live"
          : "test",
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get(
    "/api/admin/data/:collection",
    ClerkExpressWithAuth(),
    adminProtectionMiddleware,
    async (req: any, res) => {
      try {
        const { collection } = req.params;

        const allowedCollections = [
          "profiles",
          "orders",
          "plans",
          "subscriptions",
          "chats",
          "messages",
          "withdrawals",
          "site_settings",
          "purchase_code_rewards",
        ];
        if (!allowedCollections.includes(collection)) {
          return res.status(403).json({ error: "Access denied" });
        }

        let query = supabase.from(collection).select("*");

        if (collection === "orders") {
          const { data: viewData, error: viewError } = await supabase
            .from("orders")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(500);
          if (!viewError && viewData) return res.json(viewData);
          query = query.order("created_at", { ascending: false }).limit(500);
        } else if (
          [
            "profiles",
            "plans",
            "subscriptions",
            "chats",
            "withdrawals",
          ].includes(collection)
        ) {
          query = query.order("created_at", { ascending: false }).limit(500);
        } else {
          query = query.limit(5000);
        }

        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
      } catch (error: any) {
        console.error(
          `[ADMIN] Data Fetch Error (${req.params.collection}):`,
          error,
        );
        res
          .status(500)
          .json({ error: error.message || "Failed to fetch admin data" });
      }
    },
  );

  app.post(
    "/api/admin/broadcast-email",
    ClerkExpressWithAuth(),
    adminProtectionMiddleware,
    async (req: any, res) => {
      try {
        const { subject, html, recipientEmails } = req.body;
        
        if (!subject || !html) {
          return res.status(400).json({ error: "Missing subject or content" });
        }

        const resendApiKey = process.env.RESEND_API_KEY;
        if (!resendApiKey || resendApiKey === "re_mock_key") {
          return res.status(500).json({ error: "Resend API key not configured" });
        }

        const resend = new Resend(resendApiKey);
        
        // Wrap the raw text message in a highly polished, responsive email HTML template
        const formattedHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #030303;
      margin: 0;
      padding: 0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #030303;
      padding: 40px 0;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #0d0d0d;
      border: 1px solid #1a1a1a;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    }
    .header {
      padding: 40px 30px;
      text-align: center;
      border-bottom: 1px solid #1a1a1a;
      background: linear-gradient(180deg, #0d0d0d 0%, #080808 100%);
    }
    .logo {
      font-size: 28px;
      font-weight: 900;
      color: #ffffff;
      letter-spacing: -0.05em;
      text-decoration: none;
      text-transform: uppercase;
      margin: 0;
    }
    .logo-dot {
      color: #3b82f6;
    }
    .content {
      padding: 40px 35px;
      color: #cccccc;
      font-size: 15px;
      line-height: 1.8;
    }
    .content p {
      margin: 0 0 20px 0;
    }
    .footer {
      padding: 30px;
      background-color: #080808;
      border-top: 1px solid #1a1a1a;
      text-align: center;
      font-size: 11px;
      color: #555555;
    }
    .footer p {
      margin: 0 0 10px 0;
    }
    .footer a {
      color: #888888;
      text-decoration: none;
      font-weight: 600;
    }
    .footer a:hover {
      color: #ffffff;
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header">
        <div class="logo">PLUGSY<span class="logo-dot">.</span></div>
      </div>
      <div class="content">
        ${html.split("\n").map(paragraph => paragraph.trim() ? `<p>${paragraph}</p>` : "").join("")}
      </div>
      <div class="footer">
        <p>&copy; ${new Date().getFullYear()} Plugsy Nigeria. All rights reserved.</p>
        <p>Premium digital tool subscriptions at the best rates.</p>
        <p>
          <a href="https://www.plugsy.ng">Visit Website</a> &nbsp;|&nbsp; 
          <a href="https://www.plugsy.ng/dashboard">Your Dashboard</a>
        </p>
      </div>
    </div>
  </div>
</body>
</html>
`;

        const recipients = recipientEmails || [];
        if (recipients.length === 0) {
          return res.status(400).json({ error: "No recipients provided" });
        }

        // Batch sending (Resend limit is often 100 per batch for some tiers, let's use 50 to be safe)
        const batchSize = 50;
        const results = [];
        
        for (let i = 0; i < recipients.length; i += batchSize) {
          const batch = recipients.slice(i, i + batchSize);
          const { data, error } = await resend.emails.send({
            from: "Plugsy <hello@plugsy.ng>",
            to: "hello@plugsy.ng",
            bcc: batch,
            subject: subject,
            html: formattedHtml,
          });
          results.push({ data, error });
        }

        const errors = results.filter(r => r.error);
        if (errors.length > 0) {
          console.error("[BROADCAST] Some emails failed:", errors);
        }

        res.json({ success: true, resultsCount: results.length, errorCount: errors.length });
      } catch (error: any) {
        console.error("[BROADCAST] Error:", error);
        res.status(500).json({ error: error.message || "Failed to send broadcast" });
      }
    }
  );

  app.all("/api/purchase-code", async (req: any, res) => {
    try {
      const handlerModule = await import("../../api-handlers/purchase-code.js");
      if (handlerModule.default) {
        return handlerModule.default(req, res);
      }
      return res.status(500).json({ error: "No default export" });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Old Purchase Code Validation (in case old clients use it)
  app.post(
    "/api/purchase-code/validate",
    ClerkExpressWithAuth(),
    async (req: any, res) => {
      const handlerModule = await import("../../api-handlers/purchase-code.js");
      return handlerModule.default(req, res);
      try {
        const { code } = req.body;
        const userId = req.auth?.userId;
        if (!code) return res.status(400).json({ error: "Code required" });

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("clerk_id, email, full_name, purchase_code")
          .ilike("purchase_code", code.trim())
          .maybeSingle();

        if (error) throw error;
        if (!profile) {
          console.warn(`[VALIDATE] Code not found: ${code}`);
          try {
            require("fs").appendFileSync(
              "paystack_error.log",
              `\n[VALIDATE ERROR] ${new Date().toISOString()} - Code not found: ${code}\n`,
            );
          } catch (e) {}
          return res.status(404).json({ error: "Invalid purchase code" });
        }
        if (profile.clerk_id === userId) {
          console.warn(`[VALIDATE] Self code use: ${code} by ${userId}`);
          return res
            .status(400)
            .json({ error: "You cannot use your own code" });
        }

        res.json({
          valid: true,
          owner_id: profile.clerk_id,
          owner_name:
            profile.full_name ||
            (profile.email ? profile.email.split("@")[0] : "Supportive User"),
        });
      } catch (err: any) {
        res.status(500).json({ error: err.message });
      }
    },
  );

  app.get("/api/v1/profiles", ClerkExpressWithAuth(), async (req: any, res) => {
    try {
      if (!req.auth || !req.auth.userId)
        return res.status(401).json({ error: "Unauthorized" });

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      res.json(data || []);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/v1/messages", ClerkExpressWithAuth(), async (req: any, res) => {
    try {
      if (!req.auth || !req.auth.userId)
        return res.status(401).json({ error: "Unauthorized" });

      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) throw error;
      res.json(data || []);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/v1/plans", ClerkExpressWithAuth(), async (req: any, res) => {
    try {
      if (!req.auth || !req.auth.userId)
        return res.status(401).json({ error: "Unauthorized" });

      const { data, error } = await supabase
        .from("plans")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (error) {
        // Fallback for tables without created_at
        const { data: data2, error: error2 } = await supabase
          .from("plans")
          .select("*")
          .limit(5000);
        if (error2) throw error2;
        return res.json(data2 || []);
      }
      res.json(data || []);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Sync the verified Clerk identity to its Supabase profile.
  app.post("/api/sync-user", async (req: any, res) => {
    try {
      const actor = await requireVerifiedClerkUser(req, res);
      if (!actor) return;
      const result = await syncVerifiedClerkProfile({ supabase, actor });
      return res.status(result.status).json(result);
    } catch (error: any) {
      console.error("[profile-sync] synchronization failed:", error?.message || error);
      res.status(503).json({
        success: false,
        code: "PROFILE_SYNC_UNAVAILABLE",
        error: "Account synchronization is temporarily unavailable.",
      });
    }
  });

  // Admin Add Generic Route
  app.post(
    "/api/admin/add",
    ClerkExpressWithAuth(),
    adminProtectionMiddleware,
    async (req: any, res) => {
      try {
        if (!req.auth || !req.auth.userId)
          return res.status(401).json({ error: "Unauthorized" });

        const { collection, data } = req.body;
        if (!collection || !data) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        const { data: result, error } = await supabase
          .from(collection)
          .insert([data])
          .select()
          .maybeSingle();
        if (error) throw error;

        res.json({ success: true, id: result.id });
      } catch (error: any) {
        console.error(`Admin Add Error:`, error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Admin Update Generic Route
  app.post(
    "/api/admin/update",
    ClerkExpressWithAuth(),
    adminProtectionMiddleware,
    async (req: any, res) => {
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
      }

      // Telegram test ping before anything else
      sendTelegramAlert(
        `Triggering update flow for ${req.body?.collection}...`,
      ).catch(() => {});

      try {
        if (!req.auth || !req.auth.userId)
          return res.status(401).json({ error: "Unauthorized" });

        const { collection, id, data } = req.body;
        if (!collection || !id || !data) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        // Telegram Bot execution FIRST
        if (collection === "orders" && data.status === "confirmed") {
          data.confirmed_at = new Date().toISOString();
          data.confirmed_by = req.auth.userId;

          const { data: orderData } = await supabase
            .from("orders")
            .select("*")
            .eq("id", id)
            .single();
          if (orderData) {
            const caption = `🔥 <b>ORDER CONFIRMED</b>\n------------------------\n👤 User: ${orderData.user_email}\n📦 Product: ${orderData.product_name}\n💰 Amount: ₦${orderData.amount}\n------------------------\n🔗 Confirmed By: ${data.confirmed_by}`;
            sendTelegramAlert(caption).catch(console.error);
          }
        }

        let query = supabase.from(collection).update(data).eq("id", id);

        const { error } = await query;
        if (error) throw error;

        res.json({ success: true });
      } catch (error: any) {
        console.error(`Admin Update Error:`, error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Admin Delete Generic Route
  app.post(
    "/api/admin/delete",
    ClerkExpressWithAuth(),
    adminProtectionMiddleware,
    async (req: any, res) => {
      try {
        if (!req.auth || !req.auth.userId)
          return res.status(401).json({ error: "Unauthorized" });

        const { collection, id } = req.body;
        if (!collection || !id) {
          return res.status(400).json({ error: "Missing required fields" });
        }

        const { error } = await supabase.from(collection).delete().eq("id", id);
        if (error) throw error;

        res.json({ success: true });
      } catch (error: any) {
        console.error(`Admin Delete Error:`, error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  app.post(
    "/api/payments/initialize",
    ClerkExpressWithAuth(),
    async (req: any, res) => {
      return res.status(410).json({
        success: false,
        code: "DIRECT_PRODUCT_PROVIDER_RETIRED",
        error: "Product purchases must use the Plugsy Wallet.",
      });
      const DIRECT_PAYSTACK_ENABLED = false;
      if (!DIRECT_PAYSTACK_ENABLED) {
        return res.status(403).json({
          success: false,
          error: "Direct card payments are temporarily paused. Please pay using your Plugsy Wallet balance."
        });
      }

      try {
        console.log(`[PAYMENT] Initialization Request:`, req.body);
        const userId = req.auth?.userId || req.body.userId; // fallback to body if not attached by clerk

        const body = req.body;
        console.log("[init] purchase code received:", {
          purchaseCodeUsed: body.purchaseCodeUsed,
          purchaseCodeOwnerId: body.purchaseCodeOwnerId,
        });

        const userEmail = body.userEmail || body.email;
        const planId = body.planId;
        const purchaseCode = body.purchaseCode || body.purchaseCodeUsed;
        const purchaseCodeOwnerId = body.purchaseCodeOwnerId;
        const purchaseCodeOwnerName = body.purchaseCodeOwnerName;
        const fullName = body.fullName;

        if (!planId)
          return res
            .status(400)
            .json({ success: false, error: "Missing planId" });
        if (!userEmail)
          return res
            .status(400)
            .json({ success: false, error: "Missing user email" });

        if (!process.env.PAYSTACK_SECRET_KEY)
          return res
            .status(500)
            .json({ success: false, error: "Missing Paystack secret key" });
        if (!process.env.NEXT_PUBLIC_SITE_URL && !process.env.VITE_SITE_URL)
          return res
            .status(500)
            .json({ success: false, error: "Missing SITE URL env var" });

        // 1. Fetch Plan
        const { data: plan, error: planError } = await supabase
          .from("plans")
          .select("*")
          .eq("id", planId)
          .maybeSingle();

        if (planError || !plan) {
          console.error("[PAYMENT] Plan Fetch Error:", planError);
          return res
            .status(400)
            .json({
              success: false,
              error: "Plan not found: " + (planError?.message || "No data"),
            });
        }

        // 2. Calculate Amount in Kobo
        const now = new Date();
        const discountPrice =
          plan.discount_price != null
            ? plan.discount_price
            : plan.discountPrice != null
              ? plan.discountPrice
              : null;
        const discountExpiry = plan.discount_expires_at;

        const hasValidDiscount =
          discountPrice !== null &&
          Number(discountPrice) > 0 &&
          Number(discountPrice) < Number(plan.price) &&
          (!discountExpiry || new Date(discountExpiry) > now);

        const actualPrice = hasValidDiscount
          ? Number(discountPrice)
          : Number(plan.price);

        console.log("[init] pricing:", {
          originalPrice: plan.price,
          discountPrice: discountPrice,
          discountExpiry: discountExpiry,
          hasValidDiscount: hasValidDiscount,
          actualPrice: actualPrice,
        });

        const amountInKobo = Math.round(actualPrice * 100);

        console.log("[init] amountInKobo:", amountInKobo);

        if (!amountInKobo || isNaN(amountInKobo) || amountInKobo <= 0) {
          return res.status(400).json({
            success: false,
            error: "Invalid amount: " + actualPrice,
          });
        }

        // 3. Setup Paystack Variables
        const siteUrl =
          process.env.NEXT_PUBLIC_SITE_URL || process.env.VITE_SITE_URL;
        const rawBaseUrl = siteUrl || `${req.protocol}://${req.get("host")}`;
        const baseUrl = rawBaseUrl.replace(/\/$/, "");
        const callback_url = `${baseUrl}/api/payments/callback`;
        const reference = `plugsy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

        // 4. Resolve Purchase Code Owner if only code was provided
        let ownerId = purchaseCodeOwnerId || null;
        let ownerName = purchaseCodeOwnerName || null;
        if (purchaseCode && (!ownerId || !ownerName)) {
          const { data: ownerProfile } = await supabase
            .from("profiles")
            .select("clerk_id, full_name")
            .ilike("purchase_code", purchaseCode.trim())
            .maybeSingle();
          if (ownerProfile) {
            ownerId = ownerProfile.clerk_id;
            ownerName = ownerProfile.full_name || "Supporter";
          }
        }

        const payload = {
          email: String(userEmail),
          amount: amountInKobo,
          reference,
          callback_url,
          metadata: {
            userId: userId ? String(userId) : null,
            userEmail: String(userEmail),
            fullName: fullName
              ? String(fullName)
              : String(userEmail).split("@")[0],
            planId: String(plan.id),
            productName: String(
              plan.name || plan.product_name || "Premium Plan",
            ),
            planDuration: String(
              plan.duration_label || plan.duration || "Monthly",
            ),
            planMonths: Number(plan.duration_months || plan.months || 1),
            amount: amountInKobo,
            originalPrice: plan.price,
            discountedPrice: hasValidDiscount ? actualPrice : null,
            purchaseCodeUsed: purchaseCode || null,
            purchaseCodeOwnerId: ownerId,
            purchaseCodeOwnerName: ownerName,
          },
        };

        console.log(`[PAYMENT] Call Paystack:`, payload);

        const paystackRes = await fetch(
          "https://api.paystack.co/transaction/initialize",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          },
        );

        const paystackData = await paystackRes.json();
        console.log("[Init] Paystack response:", paystackData);

        if (!paystackData.status) {
          return res
            .status(400)
            .json({
              success: false,
              error: "Paystack error: " + paystackData.message,
            });
        }

        return res.json({
          success: true,
          authorization_url: paystackData.data.authorization_url,
          reference: paystackData.data.reference,
        });
      } catch (e: any) {
        console.error("[PAYMENT] CRASH:", e?.message, e?.stack);
        return res
          .status(500)
          .json({
            success: false,
            error: "Server crash: " + (e?.message || "unknown"),
          });
      }
    },
  );

  // Paystack Verify Payment (Manual Trigger)
  app.post(
    "/api/payments/verify",
    ClerkExpressWithAuth(),
    async (req: any, res) => {
      const handlerModule = await import("../../api/payments.js");
      return handlerModule.default(req, res);
      const { reference } = req.body;
      if (!reference)
        return res.status(400).json({ error: "No reference provided" });

      try {
        const response = await axios.get(
          `https://api.paystack.co/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
            },
          },
        );

        if (response.data.data.status === "success") {
          await handleSuccessfulPayment(reference, response.data.data.metadata);
          res.json({ success: true });
        } else {
          res.status(400).json({ error: "Payment verification failed" });
        }
      } catch (err: any) {
        console.error(
          "Manual verification failed:",
          err.response?.data || err.message,
        );
        res.status(500).json({ error: "Verification error" });
      }
    },
  );

  // Paystack Callback (Redirect)
  app.get("/api/payments/callback", async (req, res) => {
    return res.redirect("/dashboard?payment=failed");
    const { reference } = req.query;
    if (!reference || typeof reference !== "string")
      return res.redirect("/dashboard?payment=failed");

    try {
      const response = await axios.get(
        `https://api.paystack.co/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
          },
        },
      );

      if (response.data.data.status === "success") {
        await handleSuccessfulPayment(String(reference), response.data.data.metadata);
        res.redirect("/portfolio?payment=success");
      } else {
        res.redirect("/dashboard?payment=failed");
      }
    } catch (err) {
      res.redirect("/dashboard?payment=failed");
    }
  });

  // Paystack Webhook
  app.post("/api/payments/webhook", async (req: any, res) => {
    const handlerModule = await import("../../api/payments.js");
    return handlerModule.default(req, res);
    try {
      const secret =
        process.env.PAYSTACK_WEBHOOK_SECRET ||
        process.env.PAYSTACK_SECRET_KEY ||
        "";
      if (!req.rawBody) {
        return res.status(400).send("No body");
      }
      const hash = crypto
        .createHmac("sha512", secret)
        .update(req.rawBody)
        .digest("hex");

      if (hash !== req.headers["x-paystack-signature"]) {
        return res.status(400).send("Invalid signature");
      }

      const event = req.body;
      if (["transfer.success", "transfer.failed", "transfer.reversed"].includes(event.event)) {
        console.log("[server-webhook] transfer event detected:", event.event);
        const reference = event.data?.reference;

        if (event.event === "transfer.success") {
          await supabase
            .from("wallet_transactions")
            .update({ status: "success", updated_at: new Date().toISOString() })
            .eq("reference", reference);

          const { data: tx } = await supabase
            .from("wallet_transactions")
            .select("user_id, amount")
            .eq("reference", reference)
            .maybeSingle();

          if (tx) {
            // Sync with withdrawals table
            await supabase
              .from("withdrawals")
              .update({
                status: "confirmed",
                confirmed_at: new Date().toISOString(),
                confirmed_by: "paystack_webhook_main"
              })
              .eq("user_id", tx.user_id)
              .eq("amount", tx.amount)
              .eq("status", "pending");

            await supabase.from("messages").insert({
              sender_id: "system",
              sender_role: "system",
              sender_name: "Plugsy",
              content: "✅ Your withdrawal of ₦" + tx.amount.toLocaleString() +
                " has been sent to your bank account.",
              user_id: tx.user_id,
              event: "withdrawal_success",
              topic: "wallet",
              is_from_user: false,
              is_bot: true,
              is_bot_message: true,
              read_by_admin: true,
              read_by_user: false
            });
          }
        }

        if (event.event === "transfer.failed" || event.event === "transfer.reversed") {
          const { data: tx } = await supabase
            .from("wallet_transactions")
            .select("user_id, user_email, amount, fee, balance_before")
            .eq("reference", reference)
            .maybeSingle();

          if (tx) {
            // Sync with withdrawals table
            await supabase
              .from("withdrawals")
              .update({
                status: "failed",
                admin_note: "Paystack transfer failed / reversed"
              })
              .eq("user_id", tx.user_id)
              .eq("amount", tx.amount)
              .eq("status", "pending");

            // Refund the user
            const { data: profile } = await supabase
              .from("profiles")
              .select("balance")
              .eq("clerk_id", tx.user_id)
              .maybeSingle();

            const refundedBalance = (profile?.balance || 0) + tx.amount + tx.fee;

            await supabase
              .from("profiles")
              .update({ balance: refundedBalance })
              .eq("clerk_id", tx.user_id);

            await supabase
              .from("wallet_transactions")
              .update({ status: "failed", updated_at: new Date().toISOString() })
              .eq("reference", reference);

            await supabase.from("messages").insert({
              sender_id: "system",
              sender_role: "system",
              sender_name: "Plugsy",
              content: "⚠️ Your withdrawal failed and ₦" +
                (tx.amount + tx.fee).toLocaleString() +
                " has been refunded to your wallet.",
              user_id: tx.user_id,
              event: "withdrawal_failed",
              topic: "wallet",
              is_from_user: false,
              is_bot: true,
              is_bot_message: true,
              read_by_admin: true,
              read_by_user: false
            });
          }
        }
      } else if (event.event === "charge.success") {
        const { reference, metadata } = event.data;
        await handleSuccessfulPayment(reference, metadata);
      }
      res.sendStatus(200);
    } catch (err) {
      console.error("Webhook processing error:", err);
      res.status(500).send("Webhook error");
    }
  });

  async function handleSuccessfulPayment(reference: string, metadata: any) {
    if (!metadata) {
      console.error("[PAYMENT] Missing metadata for reference:", reference);
      return;
    }

    if (metadata.type === "portfolio_purchase") {
      console.log("[PORTFOLIO] Processing purchase for", reference);
      const { userId, userEmail, category, fullName } = metadata;

      // 1. Check duplicate
      const { data: existingPort } = await supabase
        .from("portfolios_v2")
        .select("id")
        .eq("paystack_ref", reference)
        .maybeSingle();

      if (existingPort) {
        console.log("[PORTFOLIO] Already processed:", reference);
        return;
      }

      // 2. Generate slug
      const baseSlug =
        (fullName || "user").toLowerCase().replace(/\s+/g, "-") +
        "-" +
        category.split(" ")[0].toLowerCase();
      let slug = baseSlug;
      let counter = 1;
      while (true) {
        const { data: s } = await supabase
          .from("portfolios_v2")
          .select("id")
          .eq("slug", slug)
          .maybeSingle();
        if (!s) break;
        slug = baseSlug + "-" + counter;
        counter++;
      }

      // 3. Insert portfolio
      const { error: insertErr } = await supabase.from("portfolios_v2").insert({
        user_id: userId,
        user_email: userEmail,
        category: category,
        full_name: fullName,
        is_paid: true,
        status: "draft",
        slug: slug,
        paystack_ref: reference,
      });

      if (insertErr) {
        console.error("[PORTFOLIO] Insert failed:", insertErr);
      } else {
        // Push Notification for Admin
        try {
          await sendLocalPushToAdmins(
            "🎨 New Portfolio Purchase!",
            (userEmail || "Someone") + " bought a " + (category || "portfolio") + " portfolio",
            "/admin"
          );
        } catch (e) {}

        // Push notification to User
        try {
          await sendLocalPush(
            userId,
            "✅ Payment Confirmed!",
            "Your portfolio payment was received.",
            "/dashboard"
          );
        } catch (e) {}
      }
      return;
    }

    console.log("[verify] purchase code from metadata:", {
      purchaseCodeUsed: metadata.purchaseCodeUsed,
      purchaseCodeOwnerId: metadata.purchaseCodeOwnerId,
    });

    // 1. Idempotency Check: Does an order with this Paystack reference already exist?
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("paystack_reference", reference)
      .maybeSingle();

    if (existingOrder) {
      console.log(
        "[PAYMENT] Order already processed for reference:",
        reference,
      );
      return;
    }

    let finalUserId = metadata.userId;
    const userEmail = metadata.userEmail;

    console.log("[handleSuccessfulPayment] userId from metadata:", finalUserId);
    if (!finalUserId) {
      console.error(
        "[handleSuccessfulPayment] CRITICAL: userId is null, order will be orphaned",
      );
    }

    if (!finalUserId && userEmail) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("clerk_id")
        .eq("email", userEmail)
        .single();
      finalUserId = profile?.clerk_id || null;
      console.log(
        "[handleSuccessfulPayment] userId from email lookup:",
        finalUserId,
      );
    }

    const userId = finalUserId;
    const productName = metadata.productName;
    const amountInKobo = metadata.amount;
    const amount = amountInKobo ? amountInKobo / 100 : 0;
    const planMonths = metadata.planMonths || 1;
    const purchaseCode = metadata.purchaseCodeUsed;
    const ownerId = metadata.purchaseCodeOwnerId;

    console.log(`[PAYMENT] Creating order for reference: ${reference}...`);

    // 2. Create Order
    const orderRef = `ORD-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    const { data: newOrder, error: orderError } = await supabase
      .from("orders")
      .insert({
        user_id: userId,
        user_email: userEmail,
        product_name: productName,
        plan_duration: metadata.planDuration || "Monthly",
        plan_months: planMonths,
        amount: amount,
        order_reference: orderRef,
        paystack_reference: reference,
        paystack_ref: reference,
        status: "confirmed",
        order_status: "confirmed",
        payment_status: "paid",
        delivery_status: "pending_login",
        subscription_status: "pending_activation",
        paid_at: new Date().toISOString(),
        confirmed_at: new Date().toISOString(),
        purchase_code_used: purchaseCode || null,
        purchase_code_owner_id: ownerId,
        reward_amount: purchaseCode ? 800 : 0,
        reward_status: purchaseCode ? "earned" : "none",
      })
      .select()
      .single();

    if (orderError) {
      console.error("[PAYMENT] Order creation failed:", orderError);
      return;
    }

    const orderId = newOrder.id;

    // 3. Create subscription as pending_activation
    try {
      await supabase.from("subscriptions").insert({
        user_id: userId,
        order_id: orderId,
        status: "pending_activation",
        created_at: new Date().toISOString(),
      });
    } catch (subErr) {
      console.error("Failed to create subscription:", subErr);
    }

    // 4. Handle Purchase Code Reward
    if (purchaseCode && ownerId) {
      try {
        const rewardAmt = 800;
        console.log(
          "[server] calculating reward:",
          rewardAmt,
          "from amount:",
          amount / 100,
        );

        const { data: owner } = await supabase
          .from("profiles")
          .select("balance, total_referral_earnings, referral_count")
          .eq("clerk_id", ownerId)
          .single();
        if (owner) {
          await supabase
            .from("profiles")
            .update({
              balance: (owner.balance || 0) + rewardAmt,
              total_referral_earnings:
                (owner.total_referral_earnings || 0) + rewardAmt,
              referral_count: (owner.referral_count || 0) + 1,
            })
            .eq("clerk_id", ownerId);

          await supabase
            .from("orders")
            .update({
              reward_amount: rewardAmt,
              reward_status: "paid",
            })
            .eq("id", orderId);

          await supabase.from("messages").insert({
            sender_id: "system",
            sender_role: "system",
            sender_name: "Plugsy",
            content:
              "🎉 You earned ₦" +
              rewardAmt.toLocaleString() +
              " commission! Someone used your code " +
              (purchaseCode || "") +
              " to buy a plan.",
            user_id: ownerId,
            attachment_type: "event_reward",
            is_bot: true,
            read_by_admin: true,
            read_by_user: false,
          });
        }
      } catch (refErr) {
        console.warn("Purchase code reward error:", refErr);
      }
    }

    // 5. Telegram Notification for Admin
    try {
      const telegramToken =
        process.env.TELEGRAM_BOT_TOKEN ||
        process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN;
      const telegramChatId =
        process.env.TELEGRAM_CHAT_ID ||
        process.env.VITE_TELEGRAM_ADMIN_GROUP_ID;

      if (telegramToken && telegramChatId) {
        let telegramMessage =
          "🔔 NEW PAYMENT — PLUGSY\n\n" +
          "👤 " +
          (metadata.fullName || "Unknown") +
          "\n" +
          "📧 " +
          (userEmail || "Unknown") +
          "\n" +
          "📦 " +
          (productName || "Plugsy Plan") +
          "\n" +
          "⏱ " +
          (metadata.planDuration || planMonths + " month(s)") +
          "\n" +
          "💰 ₦" +
          amount.toLocaleString() +
          "\n" +
          "🎟 Code: " +
          (purchaseCode || "None") +
          "\n" +
          "🔑 Ref: " +
          orderRef +
          "\n\n" +
          "👉 Send login at: https://www.plugsy.ng/admin";

        const tgRes = await fetch(
          "https://api.telegram.org/bot" + telegramToken + "/sendMessage",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: telegramMessage,
            }),
          },
        );
        const tgData = await tgRes.json();
        if (!tgData.ok) {
          console.error("[verify] telegram failed:", tgData.description);
        }
      }
    } catch (telErr) {
      console.error("Telegram notification failed:", telErr.message);
    }

    // Send Push Notification to admins
    try {
      await sendLocalPushToAdmins(
        "💰 New Purchase!",
        (userEmail || "Someone") + " paid ₦" + amount.toLocaleString(),
        "/admin"
      );
    } catch (e) {}

    // 6. Send Confirmation Email
    try {
      const { sendPaymentConfirmedEmail } =
        await import("../services/emailService");
      await sendPaymentConfirmedEmail(userId, userEmail);
    } catch (emailErr) {
      console.error("Failed to send payment confirmed email:", emailErr);
    }

    // 7. Send System Message in Chat
    try {
      let { data: chat } = await supabase
        .from("chats")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();
      if (!chat) {
        const userName = userEmail.split("@")[0];
        const { data: newChat, error: chatErr } = await supabase
          .from("chats")
          .insert({
            user_id: userId,
            user_name: userName,
            status: "open",
            needs_admin_attention: true,
          })
          .select("id")
          .single();
        if (!chatErr) chat = newChat;
      }
      if (chat) {
        await supabase.from("messages").insert({
          chat_id: chat.id,
          content: `Your payment has been confirmed. Our team will send your ${productName} login/access details shortly.`,
          is_user: false,
          sender_role: "system",
          sender_name: "Plugsy Bot",
          order_id: orderId,
          user_id: userId,
        });
      }
    } catch (chatErr) {
      console.error("Failed to send system message into chat:", chatErr);
    }

    // 8. Final Alert for Admin Queue
    const telegramTokenQ = process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN;
    let adminChatId = process.env.VITE_TELEGRAM_ADMIN_GROUP_ID;
    if (telegramTokenQ && adminChatId) {
      if (!adminChatId.startsWith("-100"))
        adminChatId = "-100" + adminChatId.replace(/^-/, "");
      const message = `🚨 <b>QUEUE ALERT:</b> New order from <code>${userEmail}</code>! Logins needed now. 🚀`;
      axios
        .post(`https://api.telegram.org/bot${telegramTokenQ}/sendMessage`, {
          chat_id: adminChatId,
          text: message,
          parse_mode: "HTML",
        })
        .catch((e) => console.error("Admin queue alert failed:", e.message));
    }

    // 9. Send Push Notification User Alert
    try {
      await sendLocalPush(
        userId,
        "✅ Payment Confirmed!",
        `Your payment for ${productName} was received. Login details coming soon.`,
        "/dashboard"
      );
      console.log("[PAYMENT] Push notification triggered");
    } catch (e: any) {
      console.error("[PAYMENT] Push notification failed:", e.message);
    }
  }

  // AI Chatbot Route - Disabled due to quota (migrated to frontend Gemini)
  app.post("/api/bot/chat", async (req, res) => {
    res.status(503).json({ error: "Service migrated to frontend." });
  });

  // Telegram Chat Alert
  app.post("/api/chat/alert", ClerkExpressWithAuth(), async (req: any, res) => {
    try {
      if (!req.auth || !req.auth.userId)
        return res.status(401).json({ error: "Unauthorized" });

      const { message, email, userId } = req.body;
      const telegramMsg = `💬 <b>NEW CUSTOMER MESSAGE!</b>\n👤 From: ${email}\n📝 Message: ${message}\n🔗 Reply here: https://www.plugsy.ng/admin/chats?user_id=${userId}`;

      await sendTelegramAlert(telegramMsg).catch(console.error);
      res.json({ success: true });
    } catch (error) {
      console.error("Chat alert failed:", error);
      res.status(500).json({ error: "Notification failed" });
    }
  });

  // Push Notifications API
  app.all(["/api/notifications", "/api/send-notification", "/api/notifications/send", "/api/notifications/notify-admins"], async (req: any, res) => {
    try {
      const handlerModule = await import("../../api/notifications.js");
      if (handlerModule.default) {
        return handlerModule.default(req, res);
      }
      return res.status(500).json({ error: "No default export" });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Cron Job for Reminders
  app.post("/api/cron/reminders", async (req, res) => {
    try {
      if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: "Unauthorized cron execution" });
      }

      // Fetch all active subscriptions
      const { data: subscriptions, error } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("status", "active");

      if (error) throw error;

      const now = new Date();
      let sentCount = 0;

      for (const sub of subscriptions || []) {
        if (!sub.ends_at) continue;

        const endsAt = new Date(sub.ends_at);
        const daysLeft = Math.ceil(
          (endsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
        );
        const remindersBase = sub.reminder_days || [3, 1]; // default remind at 3 and 1 days
        const sentReminders = sub.sent_reminders || [];

        for (const rDay of remindersBase) {
          if (daysLeft === rDay && !sentReminders.includes(rDay)) {
            // Need to send reminder
            console.log(`Sending ${rDay} day reminder for sub ${sub.id}`);

            // Placeholder: WhatsApp integration
            // await fetch('WHATSAPP_API', ...)
            // Alternatively, Resend Email:

            // Mark as sent
            sentReminders.push(rDay);
            await supabase
              .from("subscriptions")
              .update({ sent_reminders: sentReminders })
              .eq("id", sub.id);
            sentCount++;
          }
        }
      }

      res.json({
        success: true,
        count: sentCount,
        message: "Reminders processed successfully",
      });
    } catch (error: any) {
      console.error("Cron Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // AI Bio Generation Route - Disabled due to quota
  app.post("/api/ai/generate-bio", async (req, res) => {
    res.status(503).json({ error: "Service migrated to frontend." });
  });

  // Resend Email Triggers
  app.post(
    "/api/email/trigger",
    ClerkExpressWithAuth(),
    async (req: any, res) => {
      try {
        if (!req.auth || !req.auth.userId)
          return res.status(401).json({ error: "Unauthorized" });

        const { type, email, userId } = req.body;
        const {
          sendPaymentConfirmedEmail,
          sendPlanExpiringEmail,
          sendPlanExpiredEmail,
        } = await import("../services/emailService");

        switch (type) {
          case "payment_confirmed":
            await sendPaymentConfirmedEmail(userId, email);
            break;
          case "plan_expiring":
            await sendPlanExpiringEmail(userId, email);
            break;
          case "plan_expired":
            await sendPlanExpiredEmail(userId, email);
            break;
          default:
            return res.status(400).json({ error: "Invalid email type" });
        }

        res.json({ success: true });
      } catch (error: any) {
        console.error("Email trigger error:", error);
        res.status(500).json({ error: error.message });
      }
    },
  );

  // Resend Email API - Legacy support
  app.post("/api/email/send", ClerkExpressWithAuth(), async (req: any, res) => {
    try {
      if (!req.auth || !req.auth.userId)
        return res.status(401).json({ error: "Unauthorized" });

      const { to, subject, html, type } = req.body;
      if (!to || !subject || !html) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Check admin for some types
      if (type === "payment_confirmed") {
      }

      const resendKey = process.env.RESEND_API_KEY;
      const isMockKey = resendKey === "re_mock_key" || !resendKey;

      if (isMockKey) {
        console.warn(
          "RESEND_API_KEY is not configured or using mock key. Simulating email send:",
          { to, subject },
        );
        return res.json({ success: true, simulated: true });
      }

      console.log(
        `Sending email via Resend to ${to} using key: ${resendKey.substring(0, 7)}...`,
      );

      const { data, error } = await resend.emails.send({
        from: "Plugsy <hello@plugsyapp.com>",
        to: [to],
        subject: subject,
        html: html,
      });

      if (error) {
        console.error("Resend send error:", error);
        return res.status(400).json({ error });
      }

      res.json({ success: true, data });
    } catch (error: any) {
      console.error("Email send error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Category Update Endpoint
  app.post("/api/categories/update", async (req: any, res) => {
    try {
      const { id, name, description } = req.body;
      console.log("[category-update] id:", id, "name:", name);

      if (!id || !name?.trim()) {
        return res.status(400).json({ error: "Missing id or name" });
      }

      const { createClient } = await import("@supabase/supabase-js");
      const supabaseAdmin = createClient(
        process.env.VITE_SUPABASE_URL ||
          process.env.SUPABASE_URL ||
          process.env.NEXT_PUBLIC_SUPABASE_URL ||
          "",
        process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      );

      const { data, error } = await supabaseAdmin
        .from("vp_custom_categories")
        .update({
          name: name.trim(),
          description: description?.trim() || null,
        })
        .eq("id", id)
        .select()
        .single();

      console.log("[category-update] result:", data, error);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true, data });
    } catch (e: any) {
      console.error("[category-update] crash:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

  // Category Delete Endpoint
  app.post("/api/categories/delete", async (req: any, res) => {
    try {
      const { id } = req.body;
      console.log("[category-delete] id:", id);

      if (!id) {
        return res.status(400).json({ error: "Missing id" });
      }

      const { createClient } = await import("@supabase/supabase-js");
      const supabaseAdmin = createClient(
        process.env.VITE_SUPABASE_URL ||
          process.env.SUPABASE_URL ||
          process.env.NEXT_PUBLIC_SUPABASE_URL ||
          "",
        process.env.SUPABASE_SERVICE_ROLE_KEY || "",
      );

      const { error } = await supabaseAdmin
        .from("vp_custom_categories")
        .delete()
        .eq("id", id);

      console.log("[category-delete] error:", error);

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      return res.status(200).json({ success: true });
    } catch (e: any) {
      console.error("[category-delete] crash:", e.message);
      return res.status(500).json({ error: e.message });
    }
  });

  const createApiProxy = (route: string, file: string) => {
    app.all(route, async (req: any, res) => {
      try {
        const handlerModule = await import(file);
        if (handlerModule.default) {
          return handlerModule.default(req, res);
        }
        return res.status(500).json({ error: `No default export in ${file}` });
      } catch (e: any) {
        console.error(`${route} error:`, e);
        return res.status(500).json({ error: e.message });
      }
    });
  };

  createApiProxy("/api/admin", "../../api-handlers/admin.js");
  createApiProxy("/api/categories", "../../api-handlers/categories.js");
  createApiProxy("/api/payments", "../../api/payments.js");
  createApiProxy("/api/video", "../../api/video.js");
  createApiProxy("/api/wallet", "../../api/wallet.js");
  createApiProxy("/api/calls", "../../api-handlers/calls.js");
  createApiProxy("/api/status", "../../api-handlers/status.js");
  createApiProxy("/api/bookings", "../../api-handlers/bookings.js");
  createApiProxy("/api/misc", "../../api/misc.js");
  createApiProxy("/api/purchase-code", "../../api-handlers/purchase-code.js");
  createApiProxy("/api/onelink", "../../api/onelink.js");
  createApiProxy("/api/profile", "../../api/profile.js");

  app.all("/api/portfolio", async (req: any, res) => {
    try {
      const handlerModule = await import("../../api/portfolio.js");
      if (handlerModule.default) {
        return handlerModule.default(req, res);
      }
      return res
        .status(500)
        .json({ error: "No default export in portfolio.js" });
    } catch (e: any) {
      console.error("/api/portfolio error:", e);
      return res.status(500).json({ error: e.message });
    }
  });

  // Video Thumbnail Proxy
  app.get("/api/video/thumbnail", async (req, res) => {
    const { id } = req.query;
    if (!id || typeof id !== "string")
      return res.status(400).json({ error: "Missing id" });

    try {
      const thumbRes = await fetch(
        "https://img.youtube.com/vi/" + id + "/maxresdefault.jpg",
      );
      if (!thumbRes.ok) {
        // Fallback to hqdefault
        const fallbackRes = await fetch(
          "https://img.youtube.com/vi/" + id + "/hqdefault.jpg",
        );
        const fallbackBuffer = await fallbackRes.arrayBuffer();
        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Cache-Control", "public, max-age=86400");
        return res.end(Buffer.from(fallbackBuffer));
      }
      const buffer = await thumbRes.arrayBuffer();
      res.setHeader("Content-Type", "image/jpeg");
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.end(Buffer.from(buffer));
    } catch (e) {
      res.status(500).json({ error: "Could not load thumbnail" });
    }
  });

  // Video Status Checker
  app.get("/api/video/status", async (req, res) => {
    const { videoId } = req.query;
    if (!videoId || typeof videoId !== "string") {
      return res.status(400).json({ error: "Missing videoId" });
    }

    try {
      if (
        !process.env.YOUTUBE_CLIENT_ID ||
        !process.env.YOUTUBE_CLIENT_SECRET ||
        !process.env.YOUTUBE_REFRESH_TOKEN
      ) {
        return res
          .status(500)
          .json({ error: "Missing video delivery credentials in environment" });
      }

      const oAuth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
      );
      oAuth2Client.setCredentials({
        refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      });

      const youtube = google.youtube({ version: "v3", auth: oAuth2Client });

      const response = await youtube.videos.list({
        part: ["status", "processingDetails", "snippet"],
        id: [videoId],
      });

      const video = response.data.items?.[0];
      if (!video) {
        return res.status(404).json({ error: "Video not found", ready: false });
      }

      const uploadStatus = video.status?.uploadStatus;
      const processingStatus = video.processingDetails?.processingStatus;

      console.log(
        "[video-status] videoId:",
        videoId,
        "uploadStatus:",
        uploadStatus,
        "processingStatus:",
        processingStatus,
      );

      const isReady =
        uploadStatus === "processed" ||
        (uploadStatus === "uploaded" && processingStatus !== "processing");

      return res.status(200).json({
        ready: isReady,
        uploadStatus,
        processingStatus,
        title: video.snippet?.title,
        thumbnailUrl:
          video.snippet?.thumbnails?.maxres?.url ||
          video.snippet?.thumbnails?.high?.url ||
          null,
      });
    } catch (error: any) {
      if (
        error.message &&
        error.message.includes("insufficient authentication scopes")
      ) {
        console.warn(
          `[video-status] Notice: Your YouTube OAuth refresh token lacks 'youtube.readonly' or 'youtube' scopes. Unable to check exact processing status for ${videoId}. UI will poll and fallback after 5 mins.`,
        );
        return res.status(200).json({
          ready: false,
          error: "insufficient_scopes",
          message: "Wait for fallback timeout",
        });
      }
      console.error("[video-status] Error:", error.message);
      return res.status(500).json({ error: error.message, ready: false });
    }
  });

  // Video Upload Endpoint
  app.post(
    "/api/video/upload",
    ClerkExpressWithAuth(),
    upload.single("file"),
    async (req: any, res) => {
      try {
        if (!req.auth || !req.auth.userId)
          return res.status(401).json({ error: "Unauthorized" });

        const file = req.file;
        const title = req.body.title || "Uploaded Portfolio Video";
        const description =
          req.body.description ||
          "Portfolio video uploaded via Plugsy Verification Engine";

        if (!file) {
          return res.status(400).json({ error: "No video file provided" });
        }

        if (file.size > 500 * 1024 * 1024) {
          return res
            .status(400)
            .json({ error: "File too large. Maximum 500MB." });
        }

        if (
          !process.env.YOUTUBE_CLIENT_ID ||
          !process.env.YOUTUBE_CLIENT_SECRET ||
          !process.env.YOUTUBE_REFRESH_TOKEN
        ) {
          return res
            .status(500)
            .json({
              error: "Missing video delivery credentials in environment",
            });
        }

        const oAuth2Client = new google.auth.OAuth2(
          process.env.YOUTUBE_CLIENT_ID,
          process.env.YOUTUBE_CLIENT_SECRET,
        );

        oAuth2Client.setCredentials({
          refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
        });

        const youtube = google.youtube({
          version: "v3",
          auth: oAuth2Client,
        });

        const bufferStream = new PassThrough();
        bufferStream.end(file.buffer);

        console.log("[video-upload] Starting video upload...");

        const response = await youtube.videos.insert(
          {
            part: ["snippet", "status"],
            requestBody: {
              snippet: {
                title: title || "Portfolio Video",
                description: description || "",
                categoryId: "22", // People & Blogs
                tags: ["portfolio", "plugsy", "verification"],
              },
              status: {
                privacyStatus: "unlisted",
                selfDeclaredMadeForKids: false,
              },
            },
            media: {
              mimeType: file.mimetype,
              body: bufferStream,
            },
          },
          {
            onUploadProgress: (event: any) => {
              if (file.buffer && file.buffer.length > 0) {
                const progress = Math.round(
                  (event.bytesRead / file.buffer.length) * 100,
                );
                console.log("[video-upload] Progress:", progress + "%");
              } else {
                console.log(
                  "[video-upload] Uploading... bytes:",
                  event.bytesRead,
                );
              }
            },
          },
        );

        const videoId = response.data.id;
        if (!videoId)
          throw new Error("No videoId returned from delivery network");

        console.log("[video-upload] Upload successful! videoId:", videoId);

        return res.json({
          success: true,
          videoId,
          embedUrl:
            "https://www.youtube.com/embed/" +
            videoId +
            "?rel=0&modestbranding=1&showinfo=0&controls=1&iv_load_policy=3",
          watchUrl: "https://www.youtube.com/watch?v=" + videoId,
        });
      } catch (err: any) {
        console.error(
          "[video-upload] Error:",
          err.response?.data || err.message || err,
        );

        const msg = err.message || "";
        if (msg.includes("invalid_grant")) {
          return res.status(401).json({ error: "invalid_grant" });
        }
        if (msg.includes("quota")) {
          return res.status(429).json({ error: "quotaExceeded" });
        }

        return res.status(500).json({ error: "Failed to upload video" });
      }
    },
  );

  // When a user accesses /admin directly via browser refresh/URL bar,
  // this middleware checks their Clerk __session cookie and publicMetadata.
  app.get(
    ["/admin", "/admin/*"],
    ClerkExpressWithAuth(),
    async (req: any, res, next) => {
      try {
        if (!req.auth || !req.auth.userId) {
          return res.redirect("/login");
        }

        const user = await clerkClient.users.getUser(req.auth.userId);
        const role = user.publicMetadata?.role;

        if (role !== "admin") {
          return res.redirect("/dashboard");
        }

        // User is authenticated and is an admin
        next();
      } catch (error) {
        console.error("Admin Route Protection Error:", error);
        return res.redirect("/login");
      }
    },
  );

  app.use("/api", (err: any, req: any, res: any, next: any) => {
    if (err.message && err.message.includes("Unauthenticated")) {
      return res.status(401).json({ error: "Unauthenticated" });
    }
    console.error("API Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
  });

  app.get("/sitemap.xml", (req, res) => {
    res.header("Content-Type", "application/xml");

    const host = req.get("host") || "www.plugsy.ng";
    const protocol =
      req.headers["x-forwarded-proto"] || req.protocol || "https";
    const baseUrl = `${protocol}://${host}`;

    const staticPages = [
      "",
      "/products",
      "/support",
      "/about",
      "/terms",
      "/privacy",
    ];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages
  .map(
    (page) => `  <url>
    <loc>${baseUrl}${page}</loc>
    <changefreq>${page === "" ? "daily" : "weekly"}</changefreq>
    <priority>${page === "" ? "1.0" : "0.8"}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

    res.send(sitemap);
  });

  // Vite middleware for development

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // SEED DATA: Ensure default site settings
  await supabase.from("site_settings").upsert(
    {
      id: 1,
      withdrawal_threshold: "5000",
    },
    { onConflict: "id" },
  );

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
