import { createClient } from "@supabase/supabase-js"
import { requireVerifiedClerkUser } from "../api/_clerkAuth.js"
import { prepareJsonRequestBody } from "../api/_walletFundingWebhook.js"
import {
  PurchaseCodeProfileError,
  clearSavedPurchaseCode,
  getSavedPurchaseCode,
  lookupPurchaseCodeOwner,
  savePurchaseCode,
} from "../api/_savedPurchaseCode.js"

const getClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null
}

async function handleValidate(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" })
  try {
    const actor = await requireVerifiedClerkUser(req, res)
    if (!actor) return
    const body = await prepareJsonRequestBody(req)
    const { code } = body || {}
    if (!code) return res.status(400).json({ valid: false, message: "No code provided" })
    
    const supabase = getClient()
    if (!supabase) return res.status(500).json({ valid: false, message: "Server config error" })
    const normalized = code.trim().toUpperCase()
    const owner = await lookupPurchaseCodeOwner(supabase, normalized)
    if (!owner) return res.status(200).json({ valid: false, message: "Invalid purchase code" })
    if (owner.ownerId === actor.userId) return res.status(200).json({ valid: false, message: "You cannot use your own purchase code" })
    // The checkout needs a stable referral owner ID and a display name, but
    // must not turn a purchase-code lookup into a customer-email directory.
    return res.status(200).json({ valid: true, ownerName: owner.ownerName, ownerId: owner.ownerId, message: "Code applied: " + owner.ownerName })
  } catch (e) {
    return res.status(500).json({ valid: false, message: "Server error: " + e.message })
  }
}

async function handleSaved(req, res, action) {
  const actor = await requireVerifiedClerkUser(req, res)
  if (!actor) return
  const supabase = getClient()
  if (!supabase) return res.status(500).json({ success: false, error: "Server config error" })
  try {
    if (action === "saved" && req.method === "GET") {
      const code = await getSavedPurchaseCode(supabase, actor.userId)
      if (!code) return res.status(200).json({ success: true, savedCode: null, ownerName: null })
      const owner = await lookupPurchaseCodeOwner(supabase, code)
      if (!owner || owner.ownerId === actor.userId) {
        await clearSavedPurchaseCode(supabase, actor.userId)
        return res.status(200).json({ success: true, savedCode: null, ownerName: null })
      }
      return res.status(200).json({ success: true, savedCode: owner.code, ownerName: owner.ownerName })
    }
    if (action === "save" && req.method === "POST") {
      const body = await prepareJsonRequestBody(req)
      const owner = await savePurchaseCode(supabase, actor.userId, body?.code)
      return res.status(200).json({ success: true, savedCode: owner.code, ownerName: owner.ownerName })
    }
    if (action === "clear" && (req.method === "POST" || req.method === "DELETE")) {
      await clearSavedPurchaseCode(supabase, actor.userId)
      return res.status(200).json({ success: true, savedCode: null, ownerName: null })
    }
    return res.status(405).json({ success: false, error: "Method not allowed" })
  } catch (error) {
    if (error instanceof PurchaseCodeProfileError) return res.status(400).json({ success: false, code: error.code, error: error.message })
    console.error('[purchase-code] saved code update failed', error?.message || error)
    return res.status(503).json({ success: false, error: "Your saved purchase code could not be updated." })
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()

  const urlObj = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`);
  const action = req.query?.action || urlObj.searchParams.get("action") || req.url.split("/").pop()?.split("?")[0];
  
  if (action === "validate" || !action) return await handleValidate(req, res)
  if (["saved", "save", "clear"].includes(action)) return await handleSaved(req, res, action)
  return res.status(404).json({ error: "Unknown action" })
}
