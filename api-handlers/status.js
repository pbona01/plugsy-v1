import { createClient } from "@supabase/supabase-js";

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
    try {
      // Find expired statuses with image_url to also
      // clean up Cloudinary if needed (optional — Cloudinary
      // free tier storage is generous, but DB rows still
      // need clearing regardless)
      const { data: expired } = await supabase
        .from("statuses")
        .select("id")
        .lt("expires_at", new Date().toISOString());

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
