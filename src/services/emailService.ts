import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY || 're_mock_key');
const supabase = createClient(
  process.env.VITE_SUPABASE_URL || 'https://vnilkycbtxxcyoynakge.supabase.co', 
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_6krQD2xCzjSLtaol0F0YNg_bCk3ZpNa'
);

async function logNotification(type: string, userId: string, details: any) {
  try {
    if (!process.env.VITE_SUPABASE_URL) return;
    
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
