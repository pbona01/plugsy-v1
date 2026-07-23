import { createClient } from "@supabase/supabase-js"

async function handleUpdate(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" })
  try {
    const { id, name, description } = req.body || JSON.parse(req.body)
    if (!id || !name?.trim()) return res.status(400).json({ error: "Missing id or name" })
    
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
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
    const { id } = req.body || JSON.parse(req.body)
    if (!id) return res.status(400).json({ error: "Missing id" })
    
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    
    const { error } = await supabase.from("vp_custom_categories").delete().eq("id", id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()

  const urlObj = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`);
  const action = req.query?.action || urlObj.searchParams.get("action") || req.url.split("/").pop()?.split("?")[0];
  
  if (action === "update") return await handleUpdate(req, res)
  if (action === "delete") return await handleDelete(req, res)
  
  return res.status(404).json({ error: "Unknown action" })
}
