import {
  getWalletServiceClient,
  handlePortfolioPurchaseStatus,
  handlePortfolioWalletPurchase,
} from "./_walletCommerce.js"
import { requireVerifiedClerkUser } from "./_clerkAuth.js"
import { prepareJsonRequestBody } from "./_walletFundingWebhook.js"
import {
  getPurchasedCategoryValues,
  validateExtraCategoryName,
  ExtraCategoryValidationError,
} from "../shared/portfolioExtraCategory.js"

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

const hasJsonContentType = (req) => {
  const contentType = String(
    req.headers?.["content-type"] || "",
  ).trim()
  return /^application\/json(?:\s*;\s*charset\s*=\s*[^;]+)?\s*$/i.test(
    contentType,
  )
}

async function handleUpdateExtraCategory(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      code: "METHOD_NOT_ALLOWED",
      error: "Method not allowed",
    })
  }

  if (!hasJsonContentType(req)) {
    return res.status(415).json({
      success: false,
      code: "JSON_CONTENT_TYPE_REQUIRED",
      error: "Use application/json for this request.",
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

  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (key) => key !== "portfolioId" && key !== "name",
    ) ||
    !Object.prototype.hasOwnProperty.call(body, "name")
  ) {
    return res.status(400).json({
      success: false,
      code: "EXTRA_CATEGORY_REQUEST_INVALID",
      error: "The category badge request is invalid.",
    })
  }

  const portfolioId = String(body.portfolioId || "").trim()
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(portfolioId)) {
    return res.status(400).json({
      success: false,
      code: "PORTFOLIO_ID_INVALID",
      error: "The portfolio is invalid.",
    })
  }

  let normalizedName
  try {
    const supabase = getWalletServiceClient(res)
    if (!supabase) return

    const { data: portfolio, error: portfolioError } = await supabase
      .from("vp_portfolios")
      .select("id,user_id,category,categories")
      .eq("id", portfolioId)
      .maybeSingle()

    if (portfolioError) {
      return res.status(503).json({
        success: false,
        code: "PORTFOLIO_LOOKUP_FAILED",
        error: "The portfolio could not be loaded.",
      })
    }
    if (!portfolio) {
      return res.status(404).json({
        success: false,
        code: "PORTFOLIO_NOT_FOUND",
        error: "Portfolio not found.",
      })
    }
    if (portfolio.user_id !== actor.userId) {
      return res.status(403).json({
        success: false,
        code: "PORTFOLIO_FORBIDDEN",
        error: "You do not own this portfolio.",
      })
    }

    normalizedName = validateExtraCategoryName(
      body.name,
      getPurchasedCategoryValues(portfolio),
    )

    const { data: updated, error: updateError } = await supabase
      .from("vp_portfolios")
      .update({ extra_category_name: normalizedName })
      .eq("id", portfolio.id)
      .eq("user_id", actor.userId)
      .select("id,extra_category_name")
      .maybeSingle()

    if (updateError || !updated) {
      return res.status(503).json({
        success: false,
        code: "EXTRA_CATEGORY_SAVE_FAILED",
        error: "The category badge could not be saved.",
      })
    }

    return res.status(200).json({
      success: true,
      portfolio: {
        id: updated.id,
        extra_category_name: updated.extra_category_name || null,
      },
    })
  } catch (error) {
    if (error instanceof ExtraCategoryValidationError) {
      return res.status(400).json({
        success: false,
        code: error.code,
        error: error.message,
      })
    }
    return res.status(503).json({
      success: false,
      code: "EXTRA_CATEGORY_UNAVAILABLE",
      error: "The category badge service is temporarily unavailable.",
    })
  }
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

  if (action === "update-extra-category") {
    return handleUpdateExtraCategory(req, res)
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
