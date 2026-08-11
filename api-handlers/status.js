import { createClient } from "@supabase/supabase-js";
import { timingSafeEqual } from "node:crypto";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const action = req.query?.action || urlObj.searchParams.get("action");

  if (action === "cleanup-expired") {
    const expected = String(process.env.CRON_SECRET || "");
    const supplied = String(req.headers?.authorization || "");
    const actual = supplied.startsWith("Bearer ") ? supplied.slice(7) : "";
    const authorized = expected && actual && expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
    if (req.method !== "GET" || !authorized) {
      return res.status(expected ? 401 : 503).json({ success: false, code: expected ? "CRON_UNAUTHORIZED" : "CRON_NOT_CONFIGURED" });
    }
    try {
      const { data: lease, error: leaseError } = await supabase.rpc("claim_scheduled_job_lease", {
        p_job_name: "status-cleanup-expired",
        p_lease_seconds: 300,
      });
      if (leaseError) throw leaseError;
      if (!lease) return res.status(202).json({ success: true, skipped: "JOB_ALREADY_RUNNING" });

      // Find expired statuses with image_url to also
      // clean up Cloudinary if needed (optional — Cloudinary
      // free tier storage is generous, but DB rows still
      // need clearing regardless)
      const { data: expired } = await supabase
        .from("statuses")
        .select("id")
        .lt("expires_at", new Date().toISOString())
        .order("expires_at", { ascending: true })
        .limit(200);

      if (expired && expired.length > 0) {
        const ids = expired.map(s => s.id);
        
        await supabase.from("status_views").delete().in("status_id", ids);
        await supabase.from("statuses").delete().in("id", ids);
        
        console.log("[status-cleanup] deleted:", ids.length, "expired statuses");
      }

      return res.status(200).json({ 
        success: true, 
        deleted: expired?.length || 0 
      });
    } catch (e) {
      console.error("[status-cleanup] crash:", e.message);
      return res.status(500).json({ success: false, error: e.message });
    }
  }

  return res.status(404).json({ success: false, error: "Action not found" });
}
