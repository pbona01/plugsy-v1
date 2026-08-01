import { createClient } from "@supabase/supabase-js"
import { Resend } from 'resend';
import {
  isSupportChat,
  resolveExistingSupportChat,
  resolveOrCreateSupportChat,
} from "./_supportChats.js";
import { requireVerifiedClerkUser } from "../api/_clerkAuth.js";
import { reconcileWalletFunding } from "../api/_walletFundingWebhook.js";

const getClient = () => createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://vnilkycbtxxcyoynakge.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "",
  {
    db: {
      schema: "public"
    },
    global: {
      headers: { "x-connection-encrypted": "true" }
    }
  }
);

const textValue = (value) => String(value || "").trim();
const normalizeEmail = (value) => textValue(value).toLowerCase();
const normalizeRole = (value) => textValue(value).toLowerCase() || "user";
const toIsoDate = (value) => {
  if (!value) return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) && numeric > 0
    ? new Date(numeric < 1_000_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const CLERK_PAGE_SIZE = 100;
const MAX_CLERK_PAGES = 100;
const MAX_CLERK_RECORDS = 10_000;
const PROFILE_PAGE_SIZE = 1000;
const MAX_PROFILE_PAGES = 50;

const clerkPageData = (payload) => {
  if (Array.isArray(payload)) return { users: payload, total: null };
  if (!payload || typeof payload !== "object") return null;
  const users = Array.isArray(payload.data)
    ? payload.data
    : Array.isArray(payload.users)
      ? payload.users
      : null;
  if (!users) return null;
  const totalValue = payload.total_count ?? payload.totalCount ?? payload.total;
  const total = Number.isFinite(Number(totalValue)) ? Number(totalValue) : null;
  return { users, total };
};

export async function fetchAllClerkUsers(fetchImpl = fetch) {
  const secretKey = textValue(process.env.CLERK_SECRET_KEY);
  if (!secretKey || secretKey === "your_clerk_secret_key" || secretKey.startsWith("your_")) {
    throw new Error("CLERK_NOT_CONFIGURED");
  }

  const users = [];
  for (let page = 0; page < MAX_CLERK_PAGES; page += 1) {
    const offset = page * CLERK_PAGE_SIZE;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let payload;
    try {
      const response = await fetchImpl(
        `https://api.clerk.com/v1/users?limit=${CLERK_PAGE_SIZE}&offset=${offset}`,
        {
          headers: { Authorization: `Bearer ${secretKey}` },
          signal: controller.signal,
        },
      );
      if (!response?.ok) throw new Error("CLERK_USERS_LOOKUP_FAILED");
      payload = await response.json().catch(() => null);
    } finally {
      clearTimeout(timeout);
    }
    const parsed = clerkPageData(payload);
    if (!parsed) throw new Error("CLERK_USERS_RESPONSE_INVALID");
    users.push(...parsed.users);
    if (users.length > MAX_CLERK_RECORDS) throw new Error("CLERK_USERS_LIMIT_EXCEEDED");
    if (parsed.total !== null && users.length >= parsed.total) {
      return users;
    }
    if (parsed.users.length < CLERK_PAGE_SIZE) {
      if (parsed.total !== null && users.length < parsed.total) {
        throw new Error("CLERK_USERS_RESPONSE_INVALID");
      }
      return users;
    }
  }
  throw new Error("CLERK_USERS_PAGE_LIMIT_EXCEEDED");
}

async function fetchAllProfiles(supabase) {
  const profiles = [];
  for (let page = 0; page < MAX_PROFILE_PAGES; page += 1) {
    const from = page * PROFILE_PAGE_SIZE;
    const { data, error } = await supabase
      .from("profiles")
      .select("id,clerk_id,email,full_name,username,wallet_tag,role,image_url,profile_pic_url,balance,bio,phone_number,last_login_at,last_seen_at,created_at,updated_at")
      .order("created_at", { ascending: false })
      .range(from, from + PROFILE_PAGE_SIZE - 1);
    if (error) throw new Error("PROFILE_PAGE_LOOKUP_FAILED");
    if (!Array.isArray(data)) throw new Error("PROFILE_PAGE_RESPONSE_INVALID");
    profiles.push(...data);
    if (data.length < PROFILE_PAGE_SIZE) return profiles;
  }
  throw new Error("PROFILE_PAGE_LIMIT_EXCEEDED");
}

const primaryClerkEmail = (user) => {
  const addresses = user.email_addresses || user.emailAddresses || [];
  const primaryId = user.primary_email_address_id || user.primaryEmailAddressId;
  return normalizeEmail(
    addresses.find((entry) => (entry.id || entry.emailAddressId) === primaryId)?.email_address ||
      addresses.find((entry) => (entry.id || entry.emailAddressId) === primaryId)?.emailAddress ||
      addresses[0]?.email_address ||
      addresses[0]?.emailAddress,
  );
};

export function normalizeAdminUsers(clerkUsers, profiles) {
  const profilesByClerkId = new Map();
  const profilesByEmail = new Map();
  for (const profile of profiles) {
    const clerkId = textValue(profile.clerk_id);
    const email = normalizeEmail(profile.email);
    if (clerkId && !profilesByClerkId.has(clerkId)) profilesByClerkId.set(clerkId, profile);
    if (email && !profilesByEmail.has(email)) profilesByEmail.set(email, profile);
  }

  const claimedProfiles = new Set();
  const normalized = [];
  const seenClerkIds = new Set();
  const seenEmails = new Set();

  for (const clerkUser of clerkUsers) {
    const clerkId = textValue(clerkUser.id);
    const email = primaryClerkEmail(clerkUser);
    if (!clerkId || seenClerkIds.has(clerkId) || (email && seenEmails.has(email))) continue;

    let profile = profilesByClerkId.get(clerkId) || null;
    if (!profile && email) {
      const emailCandidate = profilesByEmail.get(email) || null;
      if (!textValue(emailCandidate?.clerk_id) || textValue(emailCandidate?.clerk_id) === clerkId) {
        profile = emailCandidate;
      }
    }
    if (profile) claimedProfiles.add(profile.id);

    const firstName = textValue(clerkUser.first_name || clerkUser.firstName);
    const lastName = textValue(clerkUser.last_name || clerkUser.lastName);
    const clerkUsername = textValue(clerkUser.username);
    const fullName = textValue(`${firstName} ${lastName}`) || clerkUsername || email.split("@")[0] || "Plugsy Member";
    const clerkRole = clerkUser.public_metadata?.role ?? clerkUser.publicMetadata?.role;
    const role = normalizeRole(clerkRole || profile?.role || "user");

    normalized.push({
      id: profile?.id || clerkId,
      profile_id: profile?.id || null,
      clerk_id: clerkId,
      clerk_linked: true,
      email,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      clerk_username: clerkUsername || null,
      username: clerkUsername || textValue(profile?.username) || null,
      wallet_tag: textValue(profile?.wallet_tag) || null,
      imageUrl: textValue(clerkUser.image_url || clerkUser.imageUrl),
      created_at: toIsoDate(clerkUser.created_at || clerkUser.createdAt),
      last_login_at: toIsoDate(clerkUser.last_sign_in_at || clerkUser.lastSignInAt),
      role,
      balance: profile?.balance ?? null,
      bio: profile?.bio ?? null,
      phone_number: profile?.phone_number ?? null,
      last_seen_at: profile?.last_seen_at ?? profile?.last_login_at ?? null,
    });
    seenClerkIds.add(clerkId);
    if (email) seenEmails.add(email);
  }

  for (const profile of profiles) {
    const email = normalizeEmail(profile.email);
    const clerkId = textValue(profile.clerk_id);
    if (claimedProfiles.has(profile.id) || (clerkId && seenClerkIds.has(clerkId)) || (email && seenEmails.has(email))) continue;
    normalized.push({
      id: profile.id,
      profile_id: profile.id,
      clerk_id: clerkId || null,
      clerk_linked: false,
      email,
      first_name: null,
      last_name: null,
      full_name: textValue(profile.full_name) || textValue(profile.username) || "Legacy Profile",
      clerk_username: null,
      username: textValue(profile.username) || null,
      wallet_tag: textValue(profile.wallet_tag) || null,
      imageUrl: textValue(profile.profile_pic_url || profile.image_url),
      created_at: toIsoDate(profile.created_at),
      last_login_at: toIsoDate(profile.last_login_at),
      role: normalizeRole(profile.role),
      balance: profile.balance ?? null,
      bio: profile.bio ?? null,
      phone_number: profile.phone_number ?? null,
      last_seen_at: profile.last_seen_at ?? profile.last_login_at ?? null,
    });
    if (clerkId) seenClerkIds.add(clerkId);
    if (email) seenEmails.add(email);
  }

  return normalized;
}

const ADMIN_MESSAGE_INSERT_FIELDS = new Set([
  "chat_id",
  "sender_id",
  "sender_name",
  "sender_role",
  "content",
  "attachment_url",
  "attachment_type",
  "message_type",
  "audio_url",
  "read_by_admin",
  "read_by_user",
  "order_id",
  "user_id",
  "is_bot",
]);

async function requireSupportWriter(req, res, supabase) {
  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return null;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("clerk_id", actor.userId)
    .maybeSingle();
  if (profileError) {
    res.status(503).json({ error: "SUPPORT_WRITER_LOOKUP_FAILED" });
    return null;
  }

  const clerkRole = String(
    actor.clerkUser?.publicMetadata?.role ||
      actor.clerkUser?.public_metadata?.role ||
      "",
  ).toLowerCase();
  return {
    actor,
    isAdmin:
      String(profile?.role || "").toLowerCase() === "admin" ||
      clerkRole === "admin",
  };
}

async function requireVerifiedAdmin(req, res, supabase) {
  const writer = await requireSupportWriter(req, res, supabase);
  if (!writer) return null;
  if (!writer.isAdmin) {
    res.status(403).json({
      success: false,
      error: "ADMIN_REQUIRED",
    });
    return null;
  }
  return writer;
}

async function handleSendLoginEmail(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    let parsedBody = req.body;
    if (typeof parsedBody === 'string') {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {}
    }
    parsedBody = parsedBody || {};
    
    const { orderId, loginDetails } = parsedBody;

    console.log("[send-login] STARTING for order:", orderId)

    if (!orderId || !loginDetails) {
      return res.status(400).json({ success: false, error: "Missing orderId or loginDetails" })
    }

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, user_email, product_name, plan_name, plan_months")
      .eq("id", orderId)
      .single()

    if (orderErr || !order) {
      console.error("[send-login] order lookup failed", { orderId })
      return res.status(404).json({ success: false, error: "Order not found" })
    }

    let supportChat;
    try {
      supportChat = await resolveOrCreateSupportChat(
        supabase,
        order.user_id,
        order.user_email
      );
    } catch {
      console.error("[send-login] support chat resolution failed", { orderId });
      return res.status(500).json({
        success: false,
        error: "Support timeline unavailable"
      });
    }

    // STEP 1: Update order (critical — must succeed)
    console.log("[send-login] STEP 1: updating order")
    const months = order.plan_months || 1;
    const subscriptionExpiresAt = new Date(Date.now() + (months * 29 * 24 * 60 * 60 * 1000)).toISOString();

    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "completed",
        delivery_status: "login_sent",
        logins: loginDetails,
        logins_sent_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        confirmed_by: writer.actor.userId,
        updated_at: new Date().toISOString(),
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: subscriptionExpiresAt
      })
      .eq("id", orderId)

    if (updateError) {
      console.error("[send-login] order update failed", { orderId })
      return res.status(500).json({ success: false, error: "ORDER_UPDATE_FAILED" })
    }
    console.log("[send-login] ✅ order updated")

    // STEP 2: Chat message (isolated)
    try {
      const { error: messageError } = await supabase.from("messages").insert({
        chat_id: supportChat.id,
        sender_id: writer.actor.userId,
        sender_role: "admin",
        sender_name: writer.actor.email || "Plugsy Team",
        content: loginDetails,
        user_id: supportChat.user_id,
        user_email: order.user_email,
        is_from_user: false,
        is_bot: false,
        read_by_admin: true,
        read_by_user: false
      });
      if (messageError) throw new Error("SUPPORT_MESSAGE_INSERT_FAILED");

      const { error: summaryError } = await supabase
        .from("chats")
        .update({
          last_message: "Login details sent",
          last_message_at: new Date().toISOString(),
          needs_admin_attention: false
        })
        .eq("id", supportChat.id);
      if (summaryError) {
        console.error("[send-login] support chat summary update failed", {
          orderId,
          chatId: supportChat.id
        });
      }

      console.log("[send-login] chat message sent", {
        orderId,
        chatId: supportChat.id
      });
    } catch {
      console.error("[send-login] chat message failed", {
        orderId,
        code: "SUPPORT_TIMELINE_WRITE_FAILED"
      });
      return res.status(500).json({
        success: false,
        error: "Support timeline delivery failed"
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
      process.env.SITE_URL || "https://www.plugsy.ng"

    // STEP 3: EMAIL (isolated)
    try {
      if (process.env.RESEND_API_KEY) {
        console.log("[send-login] sending email via Resend...")
        
        const emailRes = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: "Bearer " + process.env.RESEND_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            from: "Plugsy <noreply@plugsy.ng>",
            to: order.user_email,
            subject: "🔑 Your " + (order.product_name || "CapCut Pro") + 
              " login is ready!",
            html: 
              "<div style='font-family: sans-serif; padding: 20px;'>" +
              "<h2>Your login details are ready</h2>" +
              "<p>Hi there,</p>" +
              "<p>Your " + (order.product_name || "CapCut Pro") + 
              " subscription has been activated. Here are your details:</p>" +
              "<div style='background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;'>" +
              "<pre style='white-space: pre-wrap; font-family: monospace;'>" + 
              loginDetails + "</pre>" +
              "</div>" +
              "<p>You can also view this anytime in your " +
              "<a href='" + siteUrl + "/dashboard/messages'>Plugsy messages</a>.</p>" +
              "<p>— Team Plugsy</p>" +
              "</div>"
          })
        })

        await emailRes.json().catch(() => null)
        console.log("[send-login] email response status:", emailRes.status)

        if (!emailRes.ok) {
          console.error("[send-login] email delivery failed", {
            status: emailRes.status
          })
        } else {
          console.log("[send-login] ✅ email sent")
        }
      } else {
        console.warn("[send-login] ⚠️ RESEND_API_KEY not set, skipping email")
      }
    } catch {
      console.error("[send-login] email delivery crashed", { orderId })
    }

    // STEP 4: TELEGRAM to admin (isolated)
    try {
      const telegramToken = process.env.TELEGRAM_BOT_TOKEN
      const telegramChatId = process.env.TELEGRAM_CHAT_ID

      if (telegramToken && telegramChatId) {
        const tgRes = await fetch(
          "https://api.telegram.org/bot" + telegramToken + "/sendMessage",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: telegramChatId,
              text: "✅ Login sent to: " + order.user_email + 
                "\nProduct: " + (order.product_name || "CapCut Pro")
            })
          }
        )
        const tgData = await tgRes.json()
        
        if (!tgData.ok) {
          console.error("[send-login] Telegram delivery failed", {
            orderId,
            status: tgRes.status,
          })
        } else {
          console.log("[send-login] ✅ telegram sent")
        }
      } else {
        console.warn("[send-login] ⚠️ Telegram env vars missing, skipping")
      }
    } catch {
      console.error("[send-login] Telegram delivery crashed", { orderId })
    }

    // STEP 5: OneSignal push notification (isolated)
    try {
      console.log("[send-login] sending push notification...")
      const pushRes = await fetch(siteUrl + "/api/notifications?action=send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: order.user_id,
          title: "🔑 Your login is ready!",
          body: "Your " + (order.product_name || "CapCut Pro") + 
            " login has been sent. Check your messages.",
          url: "/dashboard/messages",
          tag: "login-sent-" + orderId
        })
      })
      const pushData = await pushRes.json()
      console.log("[send-login] push response status:", pushRes.status)
      
      if (pushData.playerIds === 0) {
        console.warn("[send-login] ⚠️ user has no push subscription")
      } else {
        console.log("[send-login] ✅ push sent")
      }
    } catch {
      console.error("[send-login] push delivery crashed", { orderId })
    }

    console.log("[send-login] ============ ALL STEPS COMPLETE ============")
    return res.status(200).json({ success: true, message: "Login sent" })

  } catch {
    console.error("[send-login] request failed")
    return res.status(500).json({ success: false, error: "SEND_LOGIN_FAILED" })
  }
}

async function handleBroadcastEmail(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    let parsedBody = req.body;
    if (typeof parsedBody === 'string') {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch {}
    }
    parsedBody = parsedBody || {};

    const { subject, html, recipientEmails } = parsedBody;

    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    if (!subject || !html) {
      return res.status(400).json({ success: false, error: "Missing subject or content" });
    }

    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey || resendApiKey === "re_mock_key") {
      return res.status(500).json({ success: false, error: "Resend API key not configured" });
    }

    const resend = new Resend(resendApiKey);

    // Formatted elegant HTML
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
      return res.status(400).json({ success: false, error: "No recipients provided" });
    }

    const batchSize = 50;
    const results = [];
    const errors = [];

    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);
      try {
        const { data, error } = await resend.emails.send({
          from: "Plugsy <hello@plugsy.ng>",
          to: "hello@plugsy.ng",
          bcc: batch,
          subject: subject,
          html: formattedHtml,
        });
        results.push({ data, error });
        if (error) errors.push(error);
      } catch (err) {
        errors.push(err.message);
      }
    }

    if (errors.length > 0) {
      console.error("[broadcast] email delivery failures", {
        count: errors.length,
      });
    }

    return res.status(200).json({
      success: true,
      resultsCount: results.length,
      errorCount: errors.length
    });

  } catch {
    console.error("[broadcast] request failed");
    return res.status(500).json({ success: false, error: "BROADCAST_FAILED" });
  }
}

async function handleAdd(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const parsedBody =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { collection, data } = parsedBody;
    if (!collection || !data) return res.status(400).json({ error: "Missing required fields" });
    if (collection !== "messages") {
      return res.status(403).json({ error: "COLLECTION_NOT_ALLOWED" });
    }
    if (
      Object.keys(data).some(
        (field) => !ADMIN_MESSAGE_INSERT_FIELDS.has(field),
      )
    ) {
      return res.status(400).json({ error: "MESSAGE_FIELDS_INVALID" });
    }
    const supabase = getClient();
    const writer = await requireSupportWriter(req, res, supabase);
    if (!writer) return;

    const chatId = String(data.chat_id || "").trim();
    if (!chatId) {
      return res.status(400).json({ error: "CHAT_ID_REQUIRED" });
    }

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id, user_id, chat_type")
      .eq("id", chatId)
      .maybeSingle();
    if (chatError) {
      return res.status(500).json({ error: "CHAT_LOOKUP_FAILED" });
    }
    if (!chat) return res.status(404).json({ error: "CHAT_NOT_FOUND" });

    const senderRole = String(data.sender_role || "").toLowerCase();
    if (!["admin", "system", "bot"].includes(senderRole)) {
      return res.status(403).json({
        error: "SUPPORT_WRITER_ROLE_INVALID",
      });
    }

    const supportChat = isSupportChat(chat);
    const isConversationOwner =
      supportChat && writer.actor.userId === chat.user_id;
    if (
      !writer.isAdmin &&
      (senderRole === "admin" || !isConversationOwner)
    ) {
      return res.status(403).json({ error: "SUPPORT_WRITE_FORBIDDEN" });
    }

    const insertData = {
      ...data,
      chat_id: chat.id,
      sender_id:
        senderRole === "admin" ? writer.actor.userId : data.sender_id,
    };
    if (supportChat) {
      if (!String(chat.user_id || "").startsWith("user_")) {
        return res.status(500).json({ error: "SUPPORT_CHAT_OWNER_REQUIRED" });
      }
      const canonical = await resolveExistingSupportChat(
        supabase,
        chat.user_id,
      );
      if (!canonical.chat) {
        return res.status(404).json({ error: "SUPPORT_CHAT_NOT_FOUND" });
      }
      if (canonical.chat.id !== chat.id) {
        return res.status(409).json({ error: "SUPPORT_CHAT_NOT_CANONICAL" });
      }
      insertData.user_id = canonical.canonicalUserId;
    }

    const { data: result, error } = await supabase
      .from("messages")
      .insert([insertData])
      .select()
      .maybeSingle();
    if (error) throw error;
    return res.json({ success: true, id: result?.id });
  } catch {
    console.error("[admin-add] insert failed");
    return res.status(500).json({ error: "INSERT_FAILED" });
  }
}

async function handleUpdate(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const { collection, id, data } = body;
    if (!collection || !id || !data) return res.status(400).json({ error: "Missing required fields" });
    if (collection !== "chats") {
      return res.status(403).json({ error: "COLLECTION_NOT_ALLOWED" });
    }

    const supabase = getClient();
    const writer = await requireSupportWriter(req, res, supabase);
    if (!writer) return;

    const { data: chat, error: chatError } = await supabase
      .from("chats")
      .select("id, user_id, chat_type")
      .eq("id", id)
      .maybeSingle();
    if (chatError) {
      return res.status(500).json({ error: "CHAT_LOOKUP_FAILED" });
    }
    if (!chat) return res.status(404).json({ error: "CHAT_NOT_FOUND" });

    const supportChat = isSupportChat(chat);
    if (
      !writer.isAdmin &&
      (!supportChat || writer.actor.userId !== chat.user_id)
    ) {
      return res.status(403).json({ error: "CHAT_UPDATE_FORBIDDEN" });
    }

    const allowedKeys = new Set(
      writer.isAdmin
        ? [
            "last_message",
            "last_message_at",
            "needs_admin_attention",
            "updated_at",
            "status",
            "unread_count",
            "assigned_admin_id",
          ]
        : [
            "last_message",
            "last_message_at",
            "needs_admin_attention",
            "updated_at",
          ],
    );
    const updateFields = Object.keys(data);
    if (
      updateFields.length === 0 ||
      updateFields.some((key) => !allowedKeys.has(key))
    ) {
      return res.status(400).json({
        error: "CHAT_UPDATE_FIELDS_INVALID",
      });
    }

    const { error } = await supabase
      .from("chats")
      .update(data)
      .eq("id", id);
    if (error) throw error;
    return res.json({ success: true });
  } catch {
    console.error("[admin-update] update failed");
    return res.status(500).json({ error: "UPDATE_FAILED" });
  }
}

async function handleDelete(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  return res.status(405).json({ error: "ADMIN_DELETE_DISABLED" });
}

async function handleListSubscriptions(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    const { data: subscriptions, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return res.status(200).json({ success: true, subscriptions });
  } catch {
    return res.status(500).json({ success: false, error: "LIST_SUBSCRIPTIONS_FAILED" });
  }
}

async function handleListProfiles(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return res.status(200).json({ success: true, profiles });
  } catch {
    return res.status(500).json({ success: false, error: "LIST_PROFILES_FAILED" });
  }
}

async function handleListUsers(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
  }
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    const [clerkUsers, profiles] = await Promise.all([
      fetchAllClerkUsers(),
      fetchAllProfiles(supabase),
    ]);
    const normalizedUsers = normalizeAdminUsers(clerkUsers, profiles);

    return res.status(200).json({
      success: true,
      users: normalizedUsers,
      admins: normalizedUsers.filter((user) => user.role === "admin"),
      totalClerkUsers: clerkUsers.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[list-users] unified user lookup failed:", error?.message || error);
    return res.status(503).json({ success: false, error: "LIST_USERS_FAILED" });
  }
}

async function handleReconcileWalletFunding(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
  }
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    let body = req.body;
    if (typeof body === "string") body = JSON.parse(body);
    const reference = textValue(body?.reference);
    if (!/^wallet_fund_[A-Za-z0-9_-]{6,180}$/.test(reference)) {
      return res.status(400).json({ success: false, error: "INVALID_FUNDING_REFERENCE" });
    }

    const result = await reconcileWalletFunding({ supabase, reference });
    return res.status(200).json({ success: true, result });
  } catch (error) {
    console.error("[admin-funding-reconcile] reconciliation failed:", error?.message || error);
    return res.status(503).json({ success: false, error: "FUNDING_RECONCILIATION_FAILED" });
  }
}

async function handleListPortfolioPurchases(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    const { data: portfolio_purchases, error } = await supabase
      .from("portfolio_purchases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return res.status(200).json({ success: true, portfolio_purchases });
  } catch {
    return res.status(500).json({ success: false, error: "LIST_PORTFOLIO_PURCHASES_FAILED" });
  }
}

async function handleListOrders(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return res.status(200).json({ success: true, orders });
  } catch {
    return res.status(500).json({ success: false, error: "LIST_ORDERS_FAILED" });
  }
}

async function handleListAdmins(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;
    const [clerkUsers, profiles] = await Promise.all([
      fetchAllClerkUsers(),
      fetchAllProfiles(supabase),
    ]);
    const admins = normalizeAdminUsers(clerkUsers, profiles)
      .filter((user) => user.role === "admin");

    return res.status(200).json({ 
      success: true, 
      admins 
    });

  } catch {
    console.error("[list-admins] request failed");
    return res.status(500).json({ 
      success: false, 
      error: "LIST_ADMINS_FAILED"
    });
  }
}

async function handleFinancialDashboard(req, res) {
  try {
    const supabase = getClient();
    const writer = await requireVerifiedAdmin(req, res, supabase);
    if (!writer) return;

    // 1. Global Balance Tracking (aggregate total of all balances)
    const { data: profiles, error: pErr } = await supabase
      .from("profiles")
      .select("id, email, full_name, balance, clerk_id, created_at");

    if (pErr) throw pErr;

    const totalLiquidity = profiles.reduce((sum, p) => sum + (Number(p.balance) || 0), 0);

    // 2. Individual History (all wallet transactions to see deposits/withdrawals)
    const { data: txs, error: tErr } = await supabase
      .from("wallet_transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (tErr) throw tErr;

    // 3. Paystack Funding Estimate (sum of all pending withdrawals)
    const pendingWithdrawals = txs.filter(t => t.type === 'withdraw' && t.status === 'pending');
    const pendingFundingEstimate = pendingWithdrawals.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    return res.status(200).json({
      success: true,
      totalLiquidity,
      pendingFundingEstimate,
      users: profiles,
      transactions: txs
    });

  } catch {
    console.error("[financial-dashboard] request failed");
    return res.status(500).json({ success: false, error: "FINANCIAL_DASHBOARD_FAILED" });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()

  const urlObj = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`);
  const action = req.query?.action || urlObj.searchParams.get("action") || req.url.split("/").pop()?.split("?")[0];

  if (action === "financial-dashboard") return await handleFinancialDashboard(req, res)
  if (action === "list-orders") return await handleListOrders(req, res)
  if (action === "list-subscriptions") return await handleListSubscriptions(req, res)
  if (action === "list-profiles") return await handleListProfiles(req, res)
  if (action === "list-users") return await handleListUsers(req, res)
  if (action === "list-portfolio_purchases") return await handleListPortfolioPurchases(req, res)
  if (action === "send-login-email" || action === "send-logins-email") return await handleSendLoginEmail(req, res)
  if (action === "broadcast-email") return await handleBroadcastEmail(req, res)
  if (action === "list-admins") return await handleListAdmins(req, res)
  if (action === "reconcile-wallet-funding") return await handleReconcileWalletFunding(req, res)
  if (action === "add") return await handleAdd(req, res)
  if (action === "update") return await handleUpdate(req, res)
  if (action === "delete") return await handleDelete(req, res)

  return res.status(404).json({ error: "Unknown action" })
}
