import { createHash } from "node:crypto";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { createClient } from "@supabase/supabase-js";
import { requireVerifiedClerkUser } from "./_clerkAuth.js";
import { rejectDisallowedOrigin } from "./_httpSecurity.js";

const send = (res, status, code, error, extra = {}) =>
  res.status(status).json({ success: false, code, error, ...extra });

const getClient = () => createClient(
  String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim(),
  String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const parseBody = (req) => {
  if (typeof req.body === "string") return JSON.parse(req.body);
  return req.body || {};
};

const positiveMoney = (value) => Number.isFinite(Number(value)) && Number(value) > 0;

export default async function handler(req, res) {
  if (rejectDisallowedOrigin(req, res, { methods: "GET, POST, OPTIONS" })) return;
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)) {
    return send(res, 503, "ACCOUNT_SERVICE_UNAVAILABLE", "Account controls are temporarily unavailable.");
  }
  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;
  const supabase = getClient();

  if (req.method === "GET") {
    const { data, error } = await supabase.from("account_deletion_requests_v1")
      .select("status,requested_at,completed_at,retention_notice")
      .eq("user_id", actor.userId).maybeSingle();
    if (error) return send(res, 503, "ACCOUNT_STATUS_UNAVAILABLE", "Your deletion status could not be loaded.");
    return res.status(200).json({ success: true, request: data || null });
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return send(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }

  let body;
  try { body = parseBody(req); }
  catch { return send(res, 400, "ACCOUNT_DELETE_INVALID", "The request is invalid."); }
  if (body.confirmation !== "DELETE MY ACCOUNT" || body.understandsRetention !== true) {
    return send(res, 400, "ACCOUNT_DELETE_CONFIRMATION_REQUIRED", "Type DELETE MY ACCOUNT and accept the retention notice.");
  }

  const [{ data: profile, error: profileError }, withdrawals, disputes] = await Promise.all([
    supabase.from("profiles").select("balance,funding_balance,withdrawable_balance").eq("clerk_id", actor.userId).maybeSingle(),
    supabase.from("withdrawals").select("id", { count: "exact", head: true }).eq("user_id", actor.userId).in("status", ["pending", "processing", "submitted", "manual_review"]),
    supabase.from("marketplace_disputes").select("id", { count: "exact", head: true }).or(`buyer_id.eq.${actor.userId},seller_id.eq.${actor.userId}`).in("status", ["open", "seller_response"]),
  ]);
  if (profileError || withdrawals.error || disputes.error) {
    return send(res, 503, "ACCOUNT_DELETE_PREFLIGHT_FAILED", "We could not safely check your account. Nothing was deleted.");
  }
  if ([profile?.balance, profile?.funding_balance, profile?.withdrawable_balance].some(positiveMoney)) {
    return send(res, 409, "ACCOUNT_BALANCE_REMAINS", "Withdraw or spend your remaining wallet balance before deleting your account.");
  }
  if ((withdrawals.count || 0) > 0 || (disputes.count || 0) > 0) {
    return send(res, 409, "ACCOUNT_ACTIVITY_PENDING", "Resolve pending withdrawals or marketplace disputes before deleting your account.");
  }

  const requestedAt = new Date().toISOString();
  const retentionNotice = "Financial, fraud-prevention and dispute records may be retained where legally required; public profile and authentication data are removed.";
  const requestResult = await supabase.from("account_deletion_requests_v1").upsert({
    user_id: actor.userId,
    email_hash: createHash("sha256").update(actor.email.toLowerCase()).digest("hex"),
    status: "processing",
    requested_at: requestedAt,
    completed_at: null,
    failure_code: null,
    retention_notice: retentionNotice,
  }, { onConflict: "user_id" });
  if (requestResult.error) return send(res, 503, "ACCOUNT_DELETE_REQUEST_FAILED", "Nothing was deleted. Please try again.");

  try {
    await clerkClient.users.deleteUser(actor.userId);
  } catch (error) {
    await supabase.from("account_deletion_requests_v1").update({ status: "failed", failure_code: "identity_delete_failed" }).eq("user_id", actor.userId);
    console.error("[account-delete] identity deletion failed", error?.message || error);
    return send(res, 503, "ACCOUNT_DELETE_IDENTITY_FAILED", "Nothing was deleted. Please contact Plugsy Support.");
  }

  const pseudonym = `deleted_${createHash("sha256").update(actor.userId).digest("hex").slice(0, 20)}`;
  const profileUpdate = await supabase.from("profiles").update({
    email: `${pseudonym}@deleted.plugsy.invalid`,
    full_name: "Deleted user",
    username: pseudonym,
    bio: null,
    profile_pic_url: null,
    image_url: null,
    one_link_username: null,
    one_link_display_name: null,
    one_link_biography: null,
    one_link_avatar_url: null,
    one_link_wallpaper_url: null,
    one_link_settings: { published: false },
    updated_at: new Date().toISOString(),
  }).eq("clerk_id", actor.userId);

  await Promise.all([
    supabase.from("marketplace_listings").update({ status: "archived", visibility: "private", updated_at: new Date().toISOString() }).eq("seller_id", actor.userId),
    supabase.from("marketplace_seller_profiles").update({ public_selling_enabled: false, verification_status: "unverified", verification_reference: null, updated_at: new Date().toISOString() }).eq("user_id", actor.userId),
  ]);

  const cleanupFailed = Boolean(profileUpdate.error);
  await supabase.from("account_deletion_requests_v1").update({
    status: cleanupFailed ? "manual_review" : "completed",
    completed_at: new Date().toISOString(),
    failure_code: cleanupFailed ? "profile_cleanup_pending" : null,
  }).eq("user_id", actor.userId);
  if (cleanupFailed) console.error("[account-delete] profile cleanup requires review");

  return res.status(200).json({ success: true, deleted: true, retentionNotice });
}
