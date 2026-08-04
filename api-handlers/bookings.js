import { createClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { timingSafeEqual } from "node:crypto"
import { resolveOrCreateSupportChat } from "./_supportChats.js"
import { deterministicEventUuid, sendOneSignal } from "../api/_oneSignal.js";
import { resolveCanonicalClerkId } from "../api/_recipient.js";

const resend = new Resend(process.env.RESEND_API_KEY || "re_mock_key")

async function insertSupportTimelineMessage(supabase, order, messageData) {
  const supportChat = await resolveOrCreateSupportChat(
    supabase,
    order.user_id,
    order.user_email
  )
  const { error: insertError } = await supabase.from("messages").insert({
    ...messageData,
    chat_id: supportChat.id,
    user_id: supportChat.user_id,
    user_email: order.user_email
  })
  if (insertError) throw new Error("SUPPORT_MESSAGE_INSERT_FAILED")
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store")
  const urlObj = new URL(req.originalUrl || req.url || "/", `http://${req.headers?.host || 'localhost'}`);
  const action = req.query?.action || urlObj.searchParams.get("action");
  if (action === "notify-expiring") {
    const expected = String(process.env.CRON_SECRET || "");
    const supplied = String(req.headers?.authorization || "");
    const actual = supplied.startsWith("Bearer ") ? supplied.slice(7) : "";
    const valid = expected && actual && expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
    if (req.method !== "GET" || !valid) return res.status(expected ? 401 : 503).json({ success: false, code: expected ? "CRON_UNAUTHORIZED" : "CRON_NOT_CONFIGURED" });
  } else if (req.method !== "POST" && req.method !== "GET") return res.status(405).end()
  
  try {
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: {
        schema: "public"
      },
      global: {
        headers: { "x-connection-encrypted": "true" }
      }
    })
    
    const tomorrow = new Date()
    tomorrow.setHours(tomorrow.getHours() + 24)
    
    const { data: bookings, error } = await supabase.from("bookings").select("*").eq("status", "scheduled").is("notified_admin_at", null).lte("delivery_date", tomorrow.toISOString())
    if (error) return res.status(500).json({ error: error.message })
    
    // Add new notify-expiring action
    if (action === "notify-expiring") {
      try {
        const now = new Date()
        
        // Find orders expiring in exactly 3 days
        // (run daily, checks a 24h window around the 3-day mark)
        const threeDaysFromNow = new Date(now)
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
        
        const windowStart = new Date(threeDaysFromNow)
        windowStart.setHours(0, 0, 0, 0)
        const windowEnd = new Date(threeDaysFromNow)
        windowEnd.setHours(23, 59, 59, 999)

        const { data: expiringOrders, error: expiringOrdersError } = await supabase
          .from("orders")
          .select("id, user_id, user_email, product_name, subscription_expires_at")
          .eq("status", "completed")
          .gte("subscription_expires_at", windowStart.toISOString())
          .lte("subscription_expires_at", windowEnd.toISOString())
        if (expiringOrdersError) throw new Error("EXPIRING_ORDERS_LOOKUP_FAILED")

        console.log("[expiry-notify] expiring in 3 days:", expiringOrders?.length)

        for (const order of expiringOrders || []) {
          const expiryDate = new Date(order.subscription_expires_at)
            .toLocaleDateString("en-NG", { day: "numeric", month: "long" })

          // Send push notification as a contained secondary effect.
          const recipient = await resolveCanonicalClerkId(supabase, order.user_id, order.user_email);
          if (recipient) await sendOneSignal({ title: `Your ${order.product_name || "subscription"} expires soon`, body: `Your subscription expires on ${expiryDate}. Renew now to keep access.`, url: "/dashboard", targeting: { include_aliases: { external_id: [recipient] } }, requestKey: deterministicEventUuid("expiry-warning", `${order.id}:${order.subscription_expires_at}`) });
          // Send chat message so they see it in the app
          try {
            await insertSupportTimelineMessage(supabase, order, {
              sender_id: "system",
              sender_role: "system",
              sender_name: "Plugsy",
              content: "⏰ Your " + (order.product_name || "subscription") + " subscription expires on " +
                expiryDate + ". Renew before it expires to avoid losing access.",
              event: "expiry_warning",
              topic: "subscription",
              is_from_user: false,
              is_bot: true,
              is_bot_message: true,
              read_by_admin: true,
              read_by_user: false
            })
          } catch {
            console.error("[expiry-notify] support timeline write failed", {
              orderId: order.id,
              code: "SUPPORT_TIMELINE_WRITE_FAILED"
            })
          }

          // Send Email via Resend
          if (order.user_email) {
            try {
              const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.plugsy.ng"
              await resend.emails.send({
                from: "Plugsy <hello@plugsy.ng>",
                to: [order.user_email],
                subject: `⏰ Your subscription for ${order.product_name || "Plugsy"} expires soon`,
                html: `
<div style="background-color: #f8fafc; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">
    <div style="background-color: #0f172a; padding: 24px; text-align: center;">
      <span style="color: #38bdf8; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em;">Plugsy Update</span>
      <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 8px 0 0 0;">Subscription Expiring Soon</h1>
    </div>
    <div style="padding: 32px 24px;">
      <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #334155;">Hi there,</p>
      <p style="font-size: 16px; line-height: 1.6; color: #334155;">This is a friendly reminder that your subscription for <strong style="color: #0f172a;">${order.product_name || "your active service"}</strong> is expiring soon on <strong style="color: #0f172a;">${expiryDate}</strong>.</p>
      <p style="font-size: 16px; line-height: 1.6; color: #334155;">Renew your plan today to ensure uninterrupted access and continue enjoying your subscription without any downtime.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${siteUrl}/dashboard" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 14px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.2);">Renew My Subscription</a>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin-bottom: 0;">If you have any questions or need assistance, feel free to reply to this email or reach out to our team at hello@plugsy.ng.</p>
    </div>
    <div style="background-color: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
      <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Plugsy. All rights reserved.</p>
      <p style="margin: 0;">Plugsy &bull; Secure subscription delivery simplified.</p>
    </div>
  </div>
</div>`
              });

              // Log the email notification
              await supabase.from('notification_logs').insert([{
                type: "plan_expiring",
                user_id: order.user_id,
                details: { email: order.user_email, product: order.product_name },
                sent_at: new Date().toISOString()
              }]);
              console.log("[expiry-notify] expiring email sent", {
                orderId: order.id
              });
            } catch (emailErr) {
              console.error("[expiry-notify] expiring email error:", emailErr.message);
            }
          }
        }

        // Also check orders that expired TODAY and notify
        const todayStart = new Date(now)
        todayStart.setHours(0, 0, 0, 0)
        const todayEnd = new Date(now)
        todayEnd.setHours(23, 59, 59, 999)

        const { data: expiredToday, error: expiredTodayError } = await supabase
          .from("orders")
          .select("id, user_id, user_email, product_name, subscription_expires_at")
          .eq("status", "completed")
          .gte("subscription_expires_at", todayStart.toISOString())
          .lte("subscription_expires_at", todayEnd.toISOString())
        if (expiredTodayError) throw new Error("EXPIRED_ORDERS_LOOKUP_FAILED")

        console.log("[expiry-notify] expired today:", expiredToday?.length)

        for (const order of expiredToday || []) {
          // Send push notification as a contained secondary effect.
          const recipient = await resolveCanonicalClerkId(supabase, order.user_id, order.user_email);
          if (recipient) await sendOneSignal({ title: `Your ${order.product_name || "subscription"} has expired`, body: "Your subscription ended today. Renew now to restore access.", url: "/dashboard", targeting: { include_aliases: { external_id: [recipient] } }, requestKey: deterministicEventUuid("expired", `${order.id}:${order.subscription_expires_at}`) });
          // Send chat message so they see it in the app
          try {
            await insertSupportTimelineMessage(supabase, order, {
              sender_id: "system",
              sender_role: "system",
              sender_name: "Plugsy",
              content: "🔴 Your subscription for " + (order.product_name || "your active service") + " has expired today. Renew now to restore access.",
              event: "expired",
              topic: "subscription",
              is_from_user: false,
              is_bot: true,
              is_bot_message: true,
              read_by_admin: true,
              read_by_user: false
            })
          } catch {
            console.error("[expiry-notify] support timeline write failed", {
              orderId: order.id,
              code: "SUPPORT_TIMELINE_WRITE_FAILED"
            })
          }

          // Send Email via Resend
          if (order.user_email) {
            try {
              const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://www.plugsy.ng"
              await resend.emails.send({
                from: "Plugsy <hello@plugsy.ng>",
                to: [order.user_email],
                subject: `🔴 Your subscription for ${order.product_name || "Plugsy"} has expired`,
                html: `
<div style="background-color: #f8fafc; padding: 32px 16px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03); border: 1px solid #e2e8f0;">
    <div style="background-color: #7f1d1d; padding: 24px; text-align: center;">
      <span style="color: #fca5a5; font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.15em;">Plugsy Update</span>
      <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 8px 0 0 0;">Subscription Expired</h1>
    </div>
    <div style="padding: 32px 24px;">
      <p style="font-size: 16px; line-height: 1.6; margin-top: 0; color: #334155;">Hi there,</p>
      <p style="font-size: 16px; line-height: 1.6; color: #334155;">Your subscription for <strong style="color: #0f172a;">${order.product_name || "your active service"}</strong> has ended today.</p>
      <p style="font-size: 16px; line-height: 1.6; color: #334155;">Renew your subscription now to instantly restore access and resume using your account without losing any progress.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${siteUrl}/dashboard" style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 14px 28px; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 8px; box-shadow: 0 4px 10px rgba(220, 38, 38, 0.2);">Renew Subscription Now</a>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #64748b; margin-bottom: 0;">If you have already renewed, please ignore this message. Need help? Reply to this email or message us at hello@plugsy.ng.</p>
    </div>
    <div style="background-color: #f1f5f9; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b;">
      <p style="margin: 0 0 8px 0;">&copy; ${new Date().getFullYear()} Plugsy. All rights reserved.</p>
      <p style="margin: 0;">Plugsy &bull; Secure subscription delivery simplified.</p>
    </div>
  </div>
</div>`
              });

              // Log the email notification
              await supabase.from('notification_logs').insert([{
                type: "plan_expired",
                user_id: order.user_id,
                details: { email: order.user_email, product: order.product_name },
                sent_at: new Date().toISOString()
              }]);
              console.log("[expiry-notify] expired email sent", {
                orderId: order.id
              });
            } catch (emailErr) {
              console.error("[expiry-notify] expired email error:", emailErr.message);
            }
          }
        }

        return res.status(200).json({ success: true })
      } catch (e) {
        console.error("[expiry-notify] crash:", e.message)
        return res.status(500).json({ success: false, error: e.message })
      }
    }
    
    let notifiedCount = 0;
    const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN
    const TELEGRAM_CHAT = process.env.TELEGRAM_CHAT_ID
    
    if (TELEGRAM_TOKEN && TELEGRAM_CHAT && bookings && bookings.length > 0) {
      for (const booking of bookings) {
        const msg = "⏰ BOOKING DUE SOON — PLUGSY\n\n👤 " + booking.user_email + "\n📦 " + booking.product_name + "\n🗓 Due: " + new Date(booking.delivery_date).toLocaleDateString() + "\n💰 " + booking.quantity + " month(s)\n👉 Send login: https://www.plugsy.ng/admin/bookings"
        try {
          await fetch("https://api.telegram.org/bot" + TELEGRAM_TOKEN + "/sendMessage", {
             method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT, text: msg })
          })
          await supabase.from("bookings").update({ notified_admin_at: new Date().toISOString() }).eq("id", booking.id)
          notifiedCount++
        } catch (e) {
          console.error("Failed to notify for booking:", booking.id, e)
        }
      }
    }
    return res.status(200).json({ success: true, count: notifiedCount })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
