import { createClient } from "@supabase/supabase-js"
import { Resend } from 'resend';

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

async function handleSendLoginEmail(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    let parsedBody = req.body;
    if (typeof parsedBody === 'string') {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch (err) {}
    }
    parsedBody = parsedBody || {};
    
    const { orderId, loginDetails, adminEmail } = parsedBody;

    console.log("[send-login] STARTING for order:", orderId)

    if (!orderId || !loginDetails) {
      return res.status(400).json({ success: false, error: "Missing orderId or loginDetails" })
    }

    const supabase = getClient();

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, user_id, user_email, product_name, plan_name, plan_months")
      .eq("id", orderId)
      .single()

    if (orderErr || !order) {
      console.error("[send-login] order not found:", orderErr?.message)
      return res.status(404).json({ success: false, error: "Order not found" })
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
        confirmed_by: adminEmail || "admin",
        updated_at: new Date().toISOString(),
        subscription_started_at: new Date().toISOString(),
        subscription_expires_at: subscriptionExpiresAt
      })
      .eq("id", orderId)

    if (updateError) {
      console.error("[send-login] order update FAILED:", updateError.message)
      return res.status(500).json({ success: false, error: updateError.message })
    }
    console.log("[send-login] ✅ order updated")

    // STEP 2: Chat message (isolated)
    try {
      let chatId = null
      const { data: existingChat } = await supabase
        .from("chats")
        .select("id")
        .eq("user_id", order.user_id)
        .maybeSingle()

      if (existingChat) {
        chatId = existingChat.id
      } else {
        const { data: newChat } = await supabase
          .from("chats")
          .insert({
            user_id: order.user_id,
            user_email: order.user_email,
            status: "open",
            last_message: "Login details sent",
            last_message_at: new Date().toISOString()
          })
          .select("id")
          .single()
        chatId = newChat?.id
      }

      if (chatId) {
        await supabase.from("messages").insert({
          chat_id: chatId,
          sender_id: "admin",
          sender_role: "admin",
          sender_name: adminEmail || "Plugsy Team",
          content: loginDetails,
          user_id: order.user_id,
          user_email: order.user_email,
          is_from_user: false,
          is_bot: false,
          read_by_admin: true,
          read_by_user: false
        })
        
        await supabase
          .from("chats")
          .update({
            last_message: "Login details sent",
            last_message_at: new Date().toISOString(),
            needs_admin_attention: false
          })
          .eq("id", chatId)

        console.log("[send-login] ✅ chat message sent")
      }
    } catch (chatErr) {
      console.error("[send-login] ⚠️ chat message failed:", chatErr.message)
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

        const emailData = await emailRes.json()
        console.log("[send-login] email response:", emailRes.status, JSON.stringify(emailData))

        if (!emailRes.ok) {
          console.error("[send-login] ⚠️ EMAIL FAILED:", emailData)
        } else {
          console.log("[send-login] ✅ email sent")
        }
      } else {
        console.warn("[send-login] ⚠️ RESEND_API_KEY not set, skipping email")
      }
    } catch (emailError) {
      console.error("[send-login] ⚠️ email crashed:", emailError.message)
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
          console.error("[send-login] ⚠️ TELEGRAM FAILED:", tgData.description)
        } else {
          console.log("[send-login] ✅ telegram sent")
        }
      } else {
        console.warn("[send-login] ⚠️ Telegram env vars missing, skipping")
      }
    } catch (tgError) {
      console.error("[send-login] ⚠️ telegram crashed:", tgError.message)
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
      console.log("[send-login] push response:", JSON.stringify(pushData))
      
      if (pushData.playerIds === 0) {
        console.warn("[send-login] ⚠️ user has no push subscription")
      } else {
        console.log("[send-login] ✅ push sent")
      }
    } catch (pushError) {
      console.error("[send-login] ⚠️ push crashed:", pushError.message)
    }

    console.log("[send-login] ============ ALL STEPS COMPLETE ============")
    return res.status(200).json({ success: true, message: "Login sent" })

  } catch (e) {
    console.error("[send-login] FATAL CRASH:", e.message)
    return res.status(500).json({ success: false, error: e.message })
  }
}

async function handleBroadcastEmail(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    let parsedBody = req.body;
    if (typeof parsedBody === 'string') {
      try {
        parsedBody = JSON.parse(parsedBody);
      } catch (err) {}
    }
    parsedBody = parsedBody || {};

    const { subject, html, recipientEmails, callerClerkId } = parsedBody;

    if (!callerClerkId) {
      return res.status(400).json({ success: false, error: "Caller Clerk ID is required for security verification." });
    }

    const supabase = getClient();

    // Verify caller is admin
    let isAuthorized = false;
    const { data: callerProfile, error: verifyErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("clerk_id", callerClerkId)
      .maybeSingle();

    if (callerProfile && callerProfile.role === 'admin') {
      isAuthorized = true;
    } else {
      // Fallback check
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (secretKey) {
        try {
          const clerkUserRes = await fetch(
            `https://api.clerk.com/v1/users/${callerClerkId}`,
            { headers: { Authorization: "Bearer " + secretKey } }
          );
          if (clerkUserRes.ok) {
            const clerkUser = await clerkUserRes.json();
            if (clerkUser?.public_metadata?.role === "admin") {
              isAuthorized = true;
            }
          }
        } catch (clerkErr) {
          console.error("[broadcast] Clerk role fallback check error:", clerkErr);
        }
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: "Access denied. Unauthorized." });
    }

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
      console.error("[BROADCAST] Some emails failed:", errors);
    }

    return res.status(200).json({
      success: true,
      resultsCount: results.length,
      errorCount: errors.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (e) {
    console.error("[broadcast] error:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function handleAdd(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const { collection, data } = req.body || JSON.parse(req.body);
    if (!collection || !data) return res.status(400).json({ error: "Missing required fields" });
    const { data: result, error } = await getClient().from(collection).insert([data]).select().maybeSingle();
    if (error) throw error;
    return res.json({ success: true, id: result?.id });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleUpdate(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    let body = req.body || JSON.parse(req.body);
    const { collection, id, data } = body;
    if (!collection || !id || !data) return res.status(400).json({ error: "Missing required fields" });

    if (collection === 'orders' && data.status === 'confirmed') {
      data.confirmed_at = new Date().toISOString();
      data.confirmed_by = 'Admin';
      const { data: orderData } = await getClient().from('orders').select('*').eq('id', id).single();
      if (orderData) {
        let token = process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN;
        let chatId = process.env.VITE_TELEGRAM_ADMIN_GROUP_ID;
        if (chatId && !chatId.startsWith('-100')) chatId = '-100' + chatId.replace(/^-/, '');
        if (token && chatId) {
          try {
            const caption = `🔥 ORDER CONFIRMED\n------------------------\n👤 User: ${orderData.user_email}\n📦 Product: ${orderData.product_name}\n💰 Amount: ₦${orderData.amount}\n------------------------\n🔗 Confirmed By: ${data.confirmed_by}`;
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: caption })
            });
          } catch (err) { }
        }
      }
    }

    let query = getClient().from(collection).update(data);
    if (collection === 'site_settings') query = query.eq('setting_key', id);
    else query = query.eq('id', id);

    const { error } = await query;
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleDelete(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  try {
    const { collection, id } = req.body || JSON.parse(req.body);
    if (!collection || !id) return res.status(400).json({ error: "Missing required fields" });
    const { error } = await getClient().from(collection).delete().eq('id', id);
    if (error) throw error;
    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}

async function handleListSubscriptions(req, res) {
  try {
    const callerClerkId = req.headers['x-caller-clerk-id'] || req.query.callerClerkId || req.body.callerClerkId;
    if (!callerClerkId) return res.status(400).json({ success: false, error: "Caller Clerk ID required" });

    const supabase = getClient();
    
    // Verify admin
    const { data: callerProfile } = await supabase.from("profiles").select("role").eq("clerk_id", callerClerkId).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'admin') {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const { data: subscriptions, error } = await supabase
      .from("subscriptions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return res.status(200).json({ success: true, subscriptions });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function handleListProfiles(req, res) {
  try {
    const callerClerkId = req.headers['x-caller-clerk-id'] || req.query.callerClerkId || req.body.callerClerkId;
    if (!callerClerkId) return res.status(400).json({ success: false, error: "Caller Clerk ID required" });

    const supabase = getClient();
    
    // Verify admin
    const { data: callerProfile } = await supabase.from("profiles").select("role").eq("clerk_id", callerClerkId).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'admin') {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return res.status(200).json({ success: true, profiles });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function handleListPortfolioPurchases(req, res) {
  try {
    const callerClerkId = req.headers['x-caller-clerk-id'] || req.query.callerClerkId || req.body.callerClerkId;
    if (!callerClerkId) return res.status(400).json({ success: false, error: "Caller Clerk ID required" });

    const supabase = getClient();
    
    // Verify admin
    const { data: callerProfile } = await supabase.from("profiles").select("role").eq("clerk_id", callerClerkId).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'admin') {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const { data: portfolio_purchases, error } = await supabase
      .from("portfolio_purchases")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return res.status(200).json({ success: true, portfolio_purchases });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function handleListOrders(req, res) {
  try {
    const callerClerkId = req.headers['x-caller-clerk-id'] || req.query.callerClerkId || req.body.callerClerkId;
    if (!callerClerkId) return res.status(400).json({ success: false, error: "Caller Clerk ID required" });

    const supabase = getClient();
    
    // Verify admin
    const { data: callerProfile } = await supabase.from("profiles").select("role").eq("clerk_id", callerClerkId).maybeSingle();
    if (!callerProfile || callerProfile.role !== 'admin') {
      return res.status(403).json({ success: false, error: "Unauthorized" });
    }

    const { data: orders, error } = await supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;
    return res.status(200).json({ success: true, orders });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}

async function handleListAdmins(req, res) {
  try {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey || secretKey === "your_clerk_secret_key" || secretKey.startsWith("your_")) {
      console.warn("[list-admins] CLERK_SECRET_KEY is not configured or is placeholder");
      return res.status(200).json({ success: false, error: "CLERK_NOT_CONFIGURED" });
    }

    const clerkRes = await fetch(
      "https://api.clerk.com/v1/users?limit=100",
      {
        headers: {
          Authorization: "Bearer " + secretKey
        }
      }
    );

    if (!clerkRes.ok) {
      const errText = await clerkRes.text();
      console.error("[list-admins] Clerk API error response:", errText);
      throw new Error(`Clerk API returned status ${clerkRes.status}: ${errText}`);
    }
    
    const allUsers = await clerkRes.json();
    console.log("[list-admins] total clerk users:", allUsers?.length);

    if (!Array.isArray(allUsers)) {
      console.warn("[list-admins] Expected array of users, got:", allUsers);
      return res.status(200).json({ success: true, admins: [] });
    }

    const admins = allUsers.filter(
      (u) => u.public_metadata?.role === "admin"
    ).map((u) => {
      const email = u.email_addresses?.[0]?.email_address || "";
      const firstName = u.first_name || "";
      const lastName = u.last_name || "";
      const full_name = (firstName + " " + lastName).trim() || "Admin Node";
      return {
        id: u.id,
        clerk_id: u.id,
        email,
        firstName,
        lastName,
        full_name,
        imageUrl: u.image_url || "",
        created_at: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString(),
        createdAt: u.created_at,
        role: "admin",
        last_login_at: u.last_sign_in_at ? new Date(u.last_sign_in_at).toISOString() : null
      };
    });

    console.log("[list-admins] admins found:", admins.length);

    return res.status(200).json({ 
      success: true, 
      admins 
    });

  } catch (e) {
    console.error("[list-admins] error:", e.message);
    return res.status(500).json({ 
      success: false, 
      error: e.message 
    });
  }
}

async function handleFinancialDashboard(req, res) {
  try {
    const callerClerkId = req.headers['x-caller-clerk-id'] || req.query.callerClerkId || req.body.callerClerkId;
    if (!callerClerkId) {
      return res.status(400).json({ success: false, error: "Caller Clerk ID is required for security verification." });
    }

    const supabase = getClient();

    // Secure Gate check: verify caller is indeed an admin
    let isAuthorized = false;
    const { data: callerProfile, error: verifyErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("clerk_id", callerClerkId)
      .maybeSingle();

    if (callerProfile && callerProfile.role === 'admin') {
      isAuthorized = true;
    } else {
      // Fallback check: verify with Clerk API directly using the secret key
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (secretKey) {
        try {
          const clerkUserRes = await fetch(
            `https://api.clerk.com/v1/users/${callerClerkId}`,
            {
              headers: {
                Authorization: "Bearer " + secretKey
              }
            }
          );
          if (clerkUserRes.ok) {
            const clerkUser = await clerkUserRes.json();
            if (clerkUser?.public_metadata?.role === "admin") {
              isAuthorized = true;
              // Auto-heal/sync database role to admin!
              if (callerProfile) {
                await supabase
                  .from("profiles")
                  .update({ role: 'admin', updated_at: new Date().toISOString() })
                  .eq("clerk_id", callerClerkId);
              } else {
                // profile does not exist yet, let's create it
                const email = clerkUser.email_addresses?.[0]?.email_address || "";
                const fullName = `${clerkUser.first_name || ''} ${clerkUser.last_name || ''}`.trim();
                await supabase.from("profiles").insert({
                  clerk_id: callerClerkId,
                  email,
                  full_name: fullName || "Admin User",
                  role: "admin",
                  balance: 0,
                  updated_at: new Date().toISOString()
                });
              }
            }
          } else {
            console.error(`[financial-dashboard] Clerk returned status ${clerkUserRes.status}`);
          }
        } catch (clerkErr) {
          console.error("[financial-dashboard] Clerk role fallback check error:", clerkErr);
        }
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ success: false, error: "Access denied. Unauthorized request." });
    }

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

  } catch (e) {
    console.error("[financial-dashboard] error:", e.message);
    return res.status(500).json({ success: false, error: e.message });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()

  const urlObj = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`);
  const action = req.query?.action || urlObj.searchParams.get("action") || req.url.split("/").pop()?.split("?")[0];

  if (action === "financial-dashboard") return await handleFinancialDashboard(req, res)
  if (action === "list-orders") return await handleListOrders(req, res)
  if (action === "list-subscriptions") return await handleListSubscriptions(req, res)
  if (action === "list-profiles") return await handleListProfiles(req, res)
  if (action === "list-portfolio_purchases") return await handleListPortfolioPurchases(req, res)
  if (action === "send-login-email" || action === "send-logins-email") return await handleSendLoginEmail(req, res)
  if (action === "broadcast-email") return await handleBroadcastEmail(req, res)
  if (action === "list-admins") return await handleListAdmins(req, res)
  if (action === "add") return await handleAdd(req, res)
  if (action === "update") return await handleUpdate(req, res)
  if (action === "delete") return await handleDelete(req, res)

  return res.status(404).json({ error: "Unknown action" })
}
