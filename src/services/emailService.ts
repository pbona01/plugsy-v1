import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY || 're_mock_key');
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

async function logNotification(type: string, userId: string, details: any) {
  try {
    if (!supabase) return;
    
    await supabase.from('notification_logs').insert([{
      type,
      user_id: userId,
      details,
      sent_at: new Date().toISOString()
    }]);
  } catch (error) {
    console.error("Failed to log notification:", error);
  }
}

export async function sendPaymentConfirmedEmail(userId: string, email: string) {
  await resend.emails.send({
    from: "Plugsy Billing <billing@plugsy.ng>",
    replyTo: "hello@plugsy.ng",
    to: [email],
    subject: "Payment Confirmed",
    html: "<p>Your payment has been confirmed. Your plan is now active.</p>",
  });
  await logNotification("payment_confirmed", userId, { email });
}

export async function sendPlanExpiringEmail(userId: string, email: string) {
  await resend.emails.send({
    from: "Plugsy System <system@plugsy.ng>",
    replyTo: "hello@plugsy.ng",
    to: [email],
    subject: "Plan Expiring Soon",
    html: "<p>Your plan is expiring soon. Please renew to avoid interruption.</p>",
  });
  await logNotification("plan_expiring", userId, { email });
}

export async function sendPlanExpiredEmail(userId: string, email: string) {
  await resend.emails.send({
    from: "Plugsy System <system@plugsy.ng>",
    replyTo: "hello@plugsy.ng",
    to: [email],
    subject: "Plan Expired",
    html: "<p>Your plan has expired. Please renew to continue using Plugsy.</p>",
  });
  await logNotification("plan_expired", userId, { email });
}
