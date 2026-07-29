import {
  getWalletServiceClient,
  handlePortfolioPurchaseStatus,
  handlePortfolioWalletPurchase,
} from "./_walletCommerce.js"
import { requireVerifiedClerkUser } from "./_clerkAuth.js"
import { prepareJsonRequestBody } from "./_walletFundingWebhook.js"

export const config = {
  api: {
    bodyParser: false,
  },
}

async function handleDeleteItem(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      code: "METHOD_NOT_ALLOWED",
      error: "Method not allowed",
    })
  }

  const actor = await requireVerifiedClerkUser(req, res)
  if (!actor) return

  let body
  try {
    body = await prepareJsonRequestBody(req)
  } catch {
    return res.status(400).json({
      success: false,
      code: "INVALID_REQUEST",
      error: "The request body is invalid.",
    })
  }

  const itemId = String(body?.id || "").trim()
  if (!/^[A-Za-z0-9-]{8,128}$/.test(itemId)) {
    return res.status(400).json({
      success: false,
      code: "PORTFOLIO_ITEM_INVALID",
      error: "The portfolio item is invalid.",
    })
  }

  const supabase = getWalletServiceClient(res)
  if (!supabase) return

  const { data: item, error: itemError } = await supabase
    .from("vp_portfolio_items")
    .select("id,portfolio_id")
    .eq("id", itemId)
    .maybeSingle()

  if (itemError || !item) {
    return res.status(404).json({
      success: false,
      code: "PORTFOLIO_ITEM_NOT_FOUND",
      error: "Portfolio item not found.",
    })
  }

  const { data: portfolio, error: portfolioError } =
    await supabase
      .from("vp_portfolios")
      .select("id,user_id")
      .eq("id", item.portfolio_id)
      .eq("user_id", actor.userId)
      .maybeSingle()

  if (portfolioError || !portfolio) {
    return res.status(403).json({
      success: false,
      code: "PORTFOLIO_ITEM_FORBIDDEN",
      error: "You do not own this portfolio item.",
    })
  }

  const { error } = await supabase
    .from("vp_portfolio_items")
    .delete()
    .eq("id", item.id)
    .eq("portfolio_id", portfolio.id)

  if (error) {
    return res.status(503).json({
      success: false,
      code: "PORTFOLIO_ITEM_DELETE_FAILED",
      error: "The portfolio item could not be deleted.",
    })
  }

  return res.status(200).json({
    success: true,
  })
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Idempotency-Key",
  )

  if (req.method === "OPTIONS") {
    return res.status(200).end()
  }

  const url = new URL(
    req.originalUrl || req.url,
    `http://${req.headers?.host || "localhost"}`,
  )
  const action =
    req.query?.action ||
    url.searchParams.get("action") ||
    req.url.split("/").pop()?.split("?")[0]

  if (action === "purchase") {
    return handlePortfolioWalletPurchase(req, res)
  }

  if (action === "verify") {
    return handlePortfolioPurchaseStatus(req, res)
  }

  if (action === "delete-item") {
    return handleDeleteItem(req, res)
  }

  if (action === "create-from-wallet") {
    return res.status(410).json({
      success: false,
      code: "SPLIT_PORTFOLIO_PURCHASE_RETIRED",
      error: "The split portfolio wallet endpoint is retired.",
    })
  }

  if (action === "webhook") {
    return res.status(410).json({
      received: true,
      ignored: true,
      code: "PORTFOLIO_PROVIDER_WEBHOOK_RETIRED",
    })
  }

  return res.status(404).json({
    success: false,
    code: "PORTFOLIO_ACTION_NOT_FOUND",
    error: `Unknown portfolio action: ${action || "none"}`,
  })
}
