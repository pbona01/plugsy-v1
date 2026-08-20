import { createClient } from "@supabase/supabase-js"
import { requireVerifiedClerkUser } from "../api/_clerkAuth.js"

const bodyOf = (req) => {
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body) } catch { return {} }
  }
  return req.body && typeof req.body === "object" ? req.body : {}
}

const adminClient = () => createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  { auth: { persistSession: false, autoRefreshToken: false } },
)

const requireCategoryOwner = async (req, res, supabase, categoryId) => {
  const actor = await requireVerifiedClerkUser(req, res)
  if (!actor) return null

  const { data: category, error: categoryError } = await supabase
    .from("vp_custom_categories")
    .select("id, portfolio_id")
    .eq("id", categoryId)
    .maybeSingle()
  if (categoryError) {
    res.status(503).json({ success: false, error: "Could not verify category ownership." })
    return null
  }
  if (!category) {
    res.status(404).json({ success: false, error: "Category not found." })
    return null
  }

  const { data: portfolio, error: portfolioError } = await supabase
    .from("vp_portfolios")
    .select("user_id")
    .eq("id", category.portfolio_id)
    .maybeSingle()
  if (portfolioError) {
    res.status(503).json({ success: false, error: "Could not verify portfolio ownership." })
    return null
  }

  if (portfolio?.user_id !== actor.userId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("clerk_id", actor.userId)
      .maybeSingle()
    const isAdmin = String(profile?.role || actor.clerkUser?.publicMetadata?.role || "").toLowerCase() === "admin"
    if (!isAdmin) {
      res.status(403).json({ success: false, error: "You can only edit your own portfolio categories." })
      return null
    }
  }
  return actor
}

async function handleUpdate(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    const { id, name, description } = bodyOf(req)
    if (!id || !name?.trim()) return res.status(400).json({ error: "Missing id or name" })
    if (String(id).length > 128 || String(name).trim().length > 120 || String(description || "").trim().length > 2000) return res.status(400).json({ error: "Invalid category input" })
    const supabase = adminClient()
    if (!(await requireCategoryOwner(req, res, supabase, id))) return
    
    const { data, error } = await supabase.from("vp_custom_categories").update({ name: name.trim(), description: description?.trim() || null }).eq("id", id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true, data })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

async function handleDelete(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    const { id } = bodyOf(req)
    if (!id) return res.status(400).json({ error: "Missing id" })
    if (String(id).length > 128) return res.status(400).json({ error: "Invalid category input" })
    const supabase = adminClient()
    if (!(await requireCategoryOwner(req, res, supabase, id))) return
    
    const { error } = await supabase.from("vp_custom_categories").delete().eq("id", id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")
  if (req.method === "OPTIONS") return res.status(200).end()

  const urlObj = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`);
  const action = req.query?.action || urlObj.searchParams.get("action") || req.url.split("/").pop()?.split("?")[0];
  
  if (action === "update") return await handleUpdate(req, res)
  if (action === "delete") return await handleDelete(req, res)
  
  return res.status(404).json({ error: "Unknown action" })
}
