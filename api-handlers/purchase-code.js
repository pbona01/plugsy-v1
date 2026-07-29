import { createClient } from "@supabase/supabase-js"
import { requireVerifiedClerkUser } from "../api/_clerkAuth.js"
import { prepareJsonRequestBody } from "../api/_walletFundingWebhook.js"

async function handleValidate(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" })
  try {
    const actor = await requireVerifiedClerkUser(req, res)
    if (!actor) return
    const body = await prepareJsonRequestBody(req)
    const { code } = body || {}
    if (!code) return res.status(400).json({ valid: false, message: "No code provided" })
    
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) return res.status(500).json({ valid: false, message: "Server config error" })
    
    const supabase = createClient(supabaseUrl, supabaseKey)
    const normalized = code.trim().toUpperCase()
    
    const { data: profile, error } = await supabase.from("profiles").select("clerk_id, full_name, email, purchase_code").eq("purchase_code", normalized).single()
    if (error || !profile) return res.status(200).json({ valid: false, message: "Invalid purchase code" })
    if (profile.clerk_id === actor.userId) return res.status(200).json({ valid: false, message: "You cannot use your own purchase code" })
    
    const displayName = profile.full_name || profile.email || "Unknown"
    return res.status(200).json({ valid: true, ownerName: profile.full_name, ownerEmail: profile.email, ownerId: profile.clerk_id, message: "Code applied: " + displayName })
  } catch (e) {
    return res.status(500).json({ valid: false, message: "Server error: " + e.message })
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()

  const urlObj = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`);
  const action = req.query?.action || urlObj.searchParams.get("action") || req.url.split("/").pop()?.split("?")[0];
  
  if (action === "validate" || !action) return await handleValidate(req, res)
  return res.status(404).json({ error: "Unknown action" })
}
