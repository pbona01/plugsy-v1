import {
  getWalletServiceClient,
  handleListBanks,
  handleP2PTransfer,
  handleResolveBankAccount,
  handleResolveUsername,
  handleSaveBankAccount,
  handleSetPin,
  handleUpdatePinSettings,
  handleUpdateUsername,
  handleVerifyPin,
  handleWithdrawal,
  processWithdrawalWebhook,
} from "./_walletCommerce.js"
import {
  initializeWalletFunding,
  parseJsonRequestBody,
  processWalletFundingWebhook,
  readExactRawRequestBody,
  requireFlutterwaveWebhookSignature,
  verifyWalletFundingStatus,
} from "./_walletFundingWebhook.js"

export const config = {
  api: {
    bodyParser: false,
  },
}

const sendNotFound = (res, action) =>
  res.status(404).json({
    success: false,
    code: "WALLET_ACTION_NOT_FOUND",
    error: `Unknown wallet action: ${action || "none"}`,
  })

const parseSignedEvent = async (req, res, label) => {
  await readExactRawRequestBody(req)

  if (!requireFlutterwaveWebhookSignature(req, res, label)) {
    return null
  }

  try {
    return parseJsonRequestBody(req)
  } catch {
    res.status(400).json({
      received: false,
      code: "INVALID_WEBHOOK_PAYLOAD",
      error: "Invalid webhook payload",
    })
    return null
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS, GET")
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

  if (action === "fund") {
    if (
      String(process.env.WALLET_FUNDING_V2_ENABLED || "") !==
      "true"
    ) {
      return initializeWalletFunding({
        req,
        res,
        supabase: null,
      })
    }

    const supabase = getWalletServiceClient(res)
    if (!supabase) return
    return initializeWalletFunding({ req, res, supabase })
  }

  if (action === "webhook") {
    if (req.method !== "POST") {
      return res.status(405).json({
        received: false,
        error: "Method not allowed",
      })
    }

    try {
      const event = await parseSignedEvent(
        req,
        res,
        "wallet-webhook",
      )
      if (!event) return

      const supabase = getWalletServiceClient(res)
      if (!supabase) return

      const result = await processWalletFundingWebhook({
        supabase,
        event,
      })

      if (!result.handled) {
        return res.status(200).json({
          received: true,
          ignored: true,
        })
      }

      return res.status(result.status).json(result.body)
    } catch (error) {
      console.error(
        "[wallet-webhook] processing failed:",
        error?.message || error,
      )
      return res.status(500).json({
        received: false,
        error: "Webhook processing failed",
      })
    }
  }

  if (action === "verify") {
    const supabase = getWalletServiceClient(res)
    if (!supabase) return
    return verifyWalletFundingStatus({
      req,
      res,
      supabase,
    })
  }

  if (action === "withdraw") {
    return handleWithdrawal(req, res)
  }

  if (action === "transfer-webhook") {
    if (req.method !== "POST") {
      return res.status(405).json({
        received: false,
        error: "Method not allowed",
      })
    }

    try {
      const event = await parseSignedEvent(
        req,
        res,
        "wallet-transfer-webhook",
      )
      if (!event) return
      return processWithdrawalWebhook({ event, res })
    } catch (error) {
      console.error(
        "[wallet-transfer-webhook] processing failed:",
        error?.message || error,
      )
      return res.status(500).json({
        received: false,
        error: "Webhook processing failed",
      })
    }
  }

  if (action === "p2p-transfer") {
    return handleP2PTransfer(req, res)
  }

  if (action === "resolve-account") {
    return handleResolveBankAccount(req, res)
  }

  if (action === "save-bank") {
    return handleSaveBankAccount(req, res)
  }

  if (action === "list-banks") {
    return handleListBanks(req, res)
  }

  if (action === "set-pin") {
    return handleSetPin(req, res)
  }

  if (action === "update-pin-settings") {
    return handleUpdatePinSettings(req, res)
  }

  if (action === "verify-pin") {
    return handleVerifyPin(req, res)
  }

  if (action === "resolve-username") {
    return handleResolveUsername(req, res)
  }

  if (action === "update-username") {
    return handleUpdateUsername(req, res)
  }

  if (action === "pay-with-wallet") {
    return res.status(410).json({
      success: false,
      code: "LEGACY_WALLET_PURCHASE_RETIRED",
      error:
        "Use the authenticated atomic product or portfolio purchase endpoint.",
    })
  }

  return sendNotFound(res, action)
}
