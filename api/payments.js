import {
  getWalletServiceClient,
  handleMedalStatus,
  handleWalletProductPurchase,
  handleWalletProductStatus,
} from "./_walletCommerce.js"
import {
  getFlutterwaveEventName,
  parseJsonRequestBody,
  processWalletFundingWebhook,
  readExactRawRequestBody,
  requireFlutterwaveWebhookSignature,
} from "./_walletFundingWebhook.js"

export const config = {
  api: {
    bodyParser: false,
  },
}

const retiredProductProvider = (res) =>
  res.status(410).json({
    success: false,
    code: "DIRECT_PRODUCT_PROVIDER_RETIRED",
    error: "Products can only be purchased with Plugsy Wallet.",
  })

async function handleFundingWebhook(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      received: false,
      error: "Method not allowed",
    })
  }

  try {
    await readExactRawRequestBody(req)

    if (
      !requireFlutterwaveWebhookSignature(
        req,
        res,
        "payments-webhook",
      )
    ) {
      return
    }

    let event
    try {
      event = parseJsonRequestBody(req)
    } catch {
      return res.status(400).json({
        received: false,
        error: "Invalid webhook payload",
      })
    }

    const supabase = getWalletServiceClient(res)
    if (!supabase) return

    const fundingResult = await processWalletFundingWebhook({
      supabase,
      event,
    })

    if (fundingResult.handled) {
      return res
        .status(fundingResult.status)
        .json(fundingResult.body)
    }

    const eventName = getFlutterwaveEventName(event)
    const eventData = event?.data || {}
    const reference =
      eventData.tx_ref ||
      eventData.reference ||
      eventData.flw_ref ||
      null

    if (eventName === "transfer.completed") {
      return res.status(200).json({
        received: true,
        manualReview: true,
        settlementApplied: false,
        reference,
      })
    }

    return res.status(200).json({
      received: true,
      ignored: true,
      manualReview: true,
      code: "NON_WALLET_PROVIDER_CHARGE_BLOCKED",
    })
  } catch (error) {
    console.error(
      "[payments-webhook] processing failed:",
      error?.message || error,
    )
    return res.status(500).json({
      received: false,
      error: "Webhook processing failed",
    })
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Idempotency-Key, flutterwave-signature, verif-hash",
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
    return handleWalletProductPurchase(req, res)
  }

  if (action === "verify") {
    return handleWalletProductStatus(req, res)
  }

  if (action === "webhook") {
    return handleFundingWebhook(req, res)
  }

  if (action === "get-medal-status") {
    return handleMedalStatus(req, res)
  }

  if (action === "initialize") {
    return retiredProductProvider(res)
  }

  if (action === "create-from-wallet") {
    return res.status(410).json({
      success: false,
      code: "SPLIT_WALLET_PURCHASE_RETIRED",
      error: "The old split wallet purchase endpoint is retired.",
    })
  }

  return res.status(404).json({
    success: false,
    code: "PAYMENT_ACTION_NOT_FOUND",
    error: `Unknown payment action: ${action || "none"}`,
  })
}
