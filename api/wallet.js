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
  reconcileWalletFunding,
  verifyWalletFundingStatus,
} from "./_walletFundingWebhook.js"
import { timingSafeEqual } from "node:crypto"
import { requireVerifiedClerkUser } from "./_clerkAuth.js"
import { syncVerifiedClerkProfile } from "./_profileSync.js"

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

const secretMatches = (actual, expected) => {
  const actualBuffer = Buffer.from(String(actual || ""))
  const expectedBuffer = Buffer.from(String(expected || ""))
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
}

const handlePendingFundingReconciliation = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" })
  }

  const cronSecret = String(process.env.CRON_SECRET || "").trim()
  if (!cronSecret) {
    return res.status(503).json({ success: false, error: "Cron authentication is unavailable" })
  }

  const authorization = String(req.headers?.authorization || "")
  if (!secretMatches(authorization, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ success: false, error: "Unauthorized" })
  }

  const supabase = getWalletServiceClient(res)
  if (!supabase) return
  const now = Date.now()
  const { data, error } = await supabase
    .from("wallet_transactions")
    .select("reference")
    .eq("type", "fund")
    .eq("status", "pending")
    .lte("created_at", new Date(now - 2 * 60_000).toISOString())
    .gte("created_at", new Date(now - 7 * 24 * 60 * 60_000).toISOString())
    .order("created_at", { ascending: true })
    .limit(25)

  if (error) {
    return res.status(503).json({ success: false, error: "Pending funding is temporarily unavailable" })
  }

  const counts = {
    inspected: 0,
    credited: 0,
    alreadyProcessed: 0,
    pending: 0,
    failed: 0,
    retryable: 0,
  }
  const references = (data || []).map((entry) => entry.reference).filter(Boolean)
  let cursor = 0

  const worker = async () => {
    while (cursor < references.length) {
      const index = cursor
      cursor += 1
      counts.inspected += 1
      const result = await reconcileWalletFunding({ supabase, reference: references[index] })
      if (result.outcome === "credited") counts.credited += 1
      else if (result.outcome === "already_processed") counts.alreadyProcessed += 1
      else if (result.outcome === "pending") counts.pending += 1
      else if (result.outcome === "failed") counts.failed += 1
      else counts.retryable += 1
    }
  }

  await Promise.all([worker(), worker()])
  return res.status(200).json({ success: true, ...counts })
}

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

  if (action === "reconcile-pending") {
    return handlePendingFundingReconciliation(req, res)
  }

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

  if (action === "sync-user") {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, error: "Method not allowed" })
    }
    const actor = await requireVerifiedClerkUser(req, res)
    if (!actor) return
    const supabase = getWalletServiceClient(res)
    if (!supabase) return

    try {
      const result = await syncVerifiedClerkProfile({ supabase, actor })
      return res.status(result.status).json(result)
    } catch (error) {
      console.error("[profile-sync] synchronization failed:", error?.message || error)
      return res.status(503).json({
        success: false,
        code: "PROFILE_SYNC_UNAVAILABLE",
        error: "Account synchronization is temporarily unavailable.",
      })
    }
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
