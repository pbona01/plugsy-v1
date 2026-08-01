import {
  createHmac,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { requireVerifiedClerkUser } from "./_clerkAuth.js";

const MAX_REQUEST_BODY_BYTES = 1_000_000;

const FUNDING_PAUSE_CODE =
  "WALLET_FUNDING_TEMPORARILY_PAUSED";

const FUNDING_PAUSE_MESSAGE =
  "Wallet deposits are temporarily paused while we complete an urgent balance-credit fix. No payment has been initiated.";

const asObject = (body) => {
  if (!body) return {};
  if (typeof body === "object") return body;
  return JSON.parse(body);
};

const textValue = (value) =>
  String(value || "").trim();

const lower = (value) =>
  textValue(value).toLowerCase();

export const getFlutterwaveEventName = (event) =>
  lower(
    event?.event ||
    event?.["event.type"] ||
    event?.type,
  );

export const normalizeFlutterwaveChargeStatus = (value) => {
  const status = lower(value);
  return status === "succeeded" ? "successful" : status;
};

const fundingMarked = (metadata, reference) =>
  lower(metadata?.type) === "wallet_funding" ||
  textValue(reference).startsWith("wallet_fund_");

const safeEqual = (actual, expected) => {
  if (!actual || !expected) return false;

  const actualBuffer = Buffer.from(String(actual));
  const expectedBuffer = Buffer.from(String(expected));

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
};

const headerValue = (headers, name) => {
  if (!headers || typeof headers !== "object") return "";

  const direct = headers[name];
  if (typeof direct === "string") return direct;

  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name,
  );

  return typeof entry?.[1] === "string" ? entry[1] : "";
};

export async function readExactRawRequestBody(req) {
  if (Buffer.isBuffer(req.rawBody)) {
    return req.rawBody;
  }

  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    return req.rawBody;
  }

  // A parsed object or decoded string is usable by normal actions and
  // legacy webhooks, but it can never be treated as exact signed bytes.
  if (req.body !== undefined && req.body !== null) {
    return null;
  }

  if (typeof req[Symbol.asyncIterator] !== "function") {
    req.rawBody = Buffer.alloc(0);
    return req.rawBody;
  }

  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk)
      ? chunk
      : Buffer.from(chunk);

    totalBytes += buffer.length;

    if (totalBytes > MAX_REQUEST_BODY_BYTES) {
      const error = new Error("Request body is too large");
      error.statusCode = 413;
      throw error;
    }

    chunks.push(buffer);
  }

  req.rawBody = Buffer.concat(chunks, totalBytes);
  return req.rawBody;
}

export function parseJsonRequestBody(req) {
  if (
    req.body !== null &&
    typeof req.body === "object" &&
    !Buffer.isBuffer(req.body)
  ) {
    return req.body;
  }

  const source = Buffer.isBuffer(req.rawBody)
    ? req.rawBody.toString("utf8")
    : typeof req.body === "string"
      ? req.body
      : "";

  const body = source.length === 0
    ? {}
    : JSON.parse(source);

  req.body = body;
  return body;
}

export async function prepareJsonRequestBody(req) {
  await readExactRawRequestBody(req);
  return parseJsonRequestBody(req);
}

export function validateFlutterwaveWebhookSignature({
  headers,
  rawBody,
  secretHash,
}) {
  if (typeof secretHash !== "string" || !secretHash) {
    return {
      configured: false,
      valid: false,
    };
  }

  const modernSignature = headerValue(
    headers,
    "flutterwave-signature",
  );
  const legacySignature = headerValue(
    headers,
    "verif-hash",
  );

  const modernValid =
    Boolean(modernSignature) &&
    Buffer.isBuffer(rawBody) &&
    safeEqual(
      modernSignature,
      createHmac("sha256", secretHash)
        .update(rawBody)
        .digest("base64"),
    );

  const legacyValid =
    Boolean(legacySignature) &&
    safeEqual(legacySignature, secretHash);

  // If both formats are supplied, each is checked independently and
  // the request is accepted only when at least one check succeeds.
  return {
    configured: true,
    valid: modernValid || legacyValid,
  };
}

export function requireFlutterwaveWebhookSignature(
  req,
  res,
  label = "flutterwave-webhook",
) {
  const expected = process.env.FLUTTERWAVE_SECRET_HASH;
  const validation = validateFlutterwaveWebhookSignature({
    headers: req.headers,
    rawBody: req.rawBody,
    secretHash: expected,
  });

  if (!validation.configured) {
    console.error(
      `[${label}] MISSING FLUTTERWAVE_SECRET_HASH`,
    );
    res.status(503).json({
      success: false,
      code: "PAYMENT_WEBHOOK_CONFIG_REQUIRED",
      error: "Payment webhook configuration is unavailable.",
    });
    return false;
  }

  if (!validation.valid) {
    console.error(`[${label}] invalid webhook signature`);
    res.status(401).json({
      success: false,
      code: "PAYMENT_WEBHOOK_INVALID",
      error: "Invalid webhook signature.",
    });
    return false;
  }

  return true;
}

const getFundingTransaction = async (
  supabase,
  reference,
) => {
  if (!reference) return null;

  const { data, error } = await supabase
    .from("wallet_transactions")
    .select(
      [
        "id",
        "user_id",
        "user_email",
        "type",
        "amount",
        "status",
        "reference",
        "balance_before",
        "balance_after",
        "provider_transaction_id",
        "currency",
      ].join(","),
    )
    .eq("reference", reference)
    .eq("type", "fund")
    .maybeSingle();

  if (error) {
    throw new Error("Funding transaction lookup failed");
  }

  return data;
};

export const verifyFlutterwaveReference = async (reference) => {
  const secretKey =
    String(process.env.FLUTTERWAVE_SECRET_KEY || "").trim();

  if (!secretKey) {
    throw new Error("Flutterwave configuration is unavailable");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(
      "https://api.flutterwave.com/v3/transactions/" +
        "verify_by_reference?tx_ref=" +
        encodeURIComponent(reference),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
        signal: controller.signal,
      },
    );
    const result = await response.json().catch(() => null);
    if (!response.ok || !result) {
      throw new Error("Flutterwave verification failed");
    }
    return result;
  } finally {
    clearTimeout(timeout);
  }
};

const normalizeRpcResult = (data) =>
  Array.isArray(data) ? data[0] : data;

const markInitializationFailed = async (
  supabase,
  reference,
  reason,
) => {
  if (!reference) return;

  const { error } = await supabase
    .from("wallet_transactions")
    .update({
      status: "failed",
      description:
        "Wallet top-up initialization failed: " + reason,
      updated_at: new Date().toISOString(),
    })
    .eq("reference", reference)
    .eq("type", "fund")
    .eq("status", "pending");

  if (error) {
    console.error(
      "[wallet-fund] failed to mark initialization failure:",
      error.message,
    );
  }
};

export async function initializeWalletFunding({
  req,
  res,
  supabase,
}) {
  if (
    String(process.env.WALLET_FUNDING_V2_ENABLED || "") !==
    "true"
  ) {
    return res.status(503).json({
      success: false,
      code: FUNDING_PAUSE_CODE,
      error: FUNDING_PAUSE_MESSAGE,
    });
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  }

  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;

  let body;
  try {
    body = asObject(await prepareJsonRequestBody(req));
  } catch {
    return res.status(400).json({
      success: false,
      code: "INVALID_REQUEST",
      error: "The funding request is invalid.",
    });
  }

  const amount = Number(body.amount);

  if (
    !Number.isFinite(amount) ||
    amount < 100 ||
    Math.round(amount * 100) !== amount * 100
  ) {
    return res.status(400).json({
      success: false,
      code: "INVALID_FUNDING_AMOUNT",
      error: "Minimum funding amount is ₦100.",
    });
  }

  const flutterwaveSecret =
    String(process.env.FLUTTERWAVE_SECRET_KEY || "").trim();

  if (!flutterwaveSecret) {
    return res.status(503).json({
      success: false,
      code: "PAYMENT_CONFIG_REQUIRED",
      error: "Payment initialization is temporarily unavailable.",
    });
  }

  const reference =
    "wallet_fund_" +
    Date.now() +
    "_" +
    randomUUID().replaceAll("-", "").slice(0, 16);

  const { error: pendingError } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id: actor.userId,
      user_email: actor.email,
      type: "fund",
      amount,
      fee: 0,
      status: "pending",
      reference,
      currency: "NGN",
      description: "Wallet top-up via Flutterwave",
      metadata: {
        provider: "flutterwave",
        purpose: "wallet_funding",
      },
    });

  if (pendingError) {
    console.error(
      "[wallet-fund] pending transaction insert failed:",
      pendingError.message,
    );
    return res.status(503).json({
      success: false,
      code: "FUNDING_INITIALIZATION_FAILED",
      error: "Wallet funding could not be initialized.",
    });
  }

  try {
    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      "https://www.plugsy.ng";

    const response = await fetch(
      "https://api.flutterwave.com/v3/payments",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${flutterwaveSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tx_ref: reference,
          amount,
          currency: "NGN",
          redirect_url: siteUrl + "/wallet/callback",
          customer: {
            email: actor.email,
            name:
              actor.fullName ||
              actor.email.split("@")[0],
          },
          customizations: {
            title: "Plugsy Wallet Top-up",
            description: "Fund Plugsy Wallet",
          },
          meta: {
            type: "wallet_funding",
            userId: actor.userId,
          },
        }),
      },
    );

    const result = await response.json().catch(() => null);

    if (
      !response.ok ||
      result?.status !== "success" ||
      !result?.data?.link
    ) {
      await markInitializationFailed(
        supabase,
        reference,
        "provider rejected initialization",
      );

      return res.status(502).json({
        success: false,
        code: "FUNDING_INITIALIZATION_FAILED",
        error: "Wallet funding could not be initialized.",
      });
    }

    return res.status(200).json({
      success: true,
      authorization_url: result.data.link,
      reference,
    });
  } catch (error) {
    console.error(
      "[wallet-fund] provider initialization failed:",
      error?.message || error,
    );

    await markInitializationFailed(
      supabase,
      reference,
      "provider request failed",
    );

    return res.status(502).json({
      success: false,
      code: "FUNDING_INITIALIZATION_FAILED",
      error: "Wallet funding could not be initialized.",
    });
  }
}

export async function reconcileWalletFunding({
  supabase,
  reference,
  expectedUserId,
  verifyReference = verifyFlutterwaveReference,
}) {
  const normalizedReference = textValue(reference);
  if (!/^wallet_fund_[A-Za-z0-9_-]{6,180}$/.test(normalizedReference)) {
    return { outcome: "not_found", code: "INVALID_FUNDING_REFERENCE" };
  }

  let transaction;
  try {
    transaction = await getFundingTransaction(supabase, normalizedReference);
  } catch {
    return { outcome: "retryable", code: "FUNDING_STATUS_UNAVAILABLE" };
  }

  if (!transaction || transaction.type !== "fund") {
    return { outcome: "not_found", code: "FUNDING_TRANSACTION_NOT_FOUND" };
  }
  if (expectedUserId && transaction.user_id !== expectedUserId) {
    return { outcome: "not_found", code: "FUNDING_TRANSACTION_NOT_FOUND" };
  }
  if (transaction.status === "success") {
    if (!textValue(transaction.provider_transaction_id) || transaction.balance_after === null || transaction.balance_after === undefined) {
      return { outcome: "retryable", code: "SETTLEMENT_STATE_AMBIGUOUS" };
    }
    return {
      outcome: "already_processed",
      reference: transaction.reference,
      amount: transaction.amount,
      balanceAfter: transaction.balance_after,
    };
  }
  if (transaction.status === "failed") {
    return { outcome: "failed", reference: transaction.reference };
  }
  if (transaction.status !== "pending") {
    return { outcome: "retryable", code: "FUNDING_STATUS_AMBIGUOUS" };
  }

  let verified;
  try {
    verified = await verifyReference(transaction.reference);
  } catch {
    return { outcome: "retryable", code: "PROVIDER_TEMPORARILY_UNAVAILABLE" };
  }

  const verifiedData = verified?.data;
  if (lower(verified?.status) !== "success" || !verifiedData || typeof verifiedData !== "object") {
    return { outcome: "retryable", code: "PROVIDER_RESPONSE_INVALID" };
  }

  const verifiedReference = textValue(verifiedData.tx_ref || verifiedData.reference);
  if (verifiedReference !== transaction.reference) {
    return { outcome: "retryable", code: "PROVIDER_REFERENCE_MISMATCH" };
  }

  const verifiedStatus = normalizeFlutterwaveChargeStatus(verifiedData.status);
  if (["pending", "processing", "incomplete"].includes(verifiedStatus)) {
    return { outcome: "pending", reference: transaction.reference };
  }

  const verifiedCurrency = textValue(verifiedData.currency).toUpperCase();
  const storedCurrency = textValue(transaction.currency || "NGN").toUpperCase();
  const verifiedAmount = Number(verifiedData.amount);
  const providerTransactionId = textValue(
    verifiedData.id || verifiedData.flw_ref || verifiedData.transaction_id,
  );
  const providerEmail = lower(
    verifiedData.customer?.email || verifiedData.customer?.email_address,
  );
  const storedEmail = lower(transaction.user_email);
  const verifiedDetailsMismatch =
    verifiedCurrency !== "NGN" ||
    storedCurrency !== "NGN" ||
    !Number.isFinite(verifiedAmount) ||
    verifiedAmount !== Number(transaction.amount) ||
    !providerTransactionId ||
    (providerEmail && storedEmail && providerEmail !== storedEmail);

  if (verifiedDetailsMismatch) {
    return { outcome: "retryable", code: "PROVIDER_DETAILS_MISMATCH" };
  }
  if (["failed", "cancelled", "canceled"].includes(verifiedStatus)) {
    return { outcome: "failed", reference: transaction.reference };
  }
  if (verifiedStatus !== "successful") {
    return { outcome: "retryable", code: "PROVIDER_STATUS_AMBIGUOUS" };
  }

  let settlement;
  try {
    settlement = await supabase.rpc("fulfill_wallet_funding_v2", {
      p_reference: transaction.reference,
      p_provider_transaction_id: providerTransactionId,
      p_provider_status: verifiedStatus,
      p_currency: verifiedCurrency,
      p_amount: verifiedAmount,
    });
  } catch {
    return { outcome: "retryable", code: "SETTLEMENT_TEMPORARILY_UNAVAILABLE" };
  }
  const { data, error } = settlement;

  if (error) {
    console.error("[wallet-fund-reconcile] atomic fulfilment failed:", transaction.reference);
    return { outcome: "retryable", code: "SETTLEMENT_TEMPORARILY_UNAVAILABLE" };
  }

  const result = normalizeRpcResult(data);
  if (!result || result.success !== true || result.reference !== transaction.reference) {
    return { outcome: "retryable", code: "SETTLEMENT_RESPONSE_INVALID" };
  }

  return {
    outcome: result.already_processed === true ? "already_processed" : "credited",
    reference: result.reference,
    amount: transaction.amount,
    balanceAfter: result.balance_after ?? transaction.balance_after,
  };
}

export async function verifyWalletFundingStatus({ req, res, supabase }) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed" });
  }
  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;

  let body;
  try {
    body = asObject(await prepareJsonRequestBody(req));
  } catch {
    return res.status(400).json({ success: false, code: "INVALID_REQUEST", error: "The verification request is invalid." });
  }

  const result = await reconcileWalletFunding({
    supabase,
    reference: body.reference,
    expectedUserId: actor.userId,
  });

  if (result.outcome === "credited" || result.outcome === "already_processed") {
    return res.status(200).json({
      success: true,
      pending: false,
      credited: result.outcome === "credited",
      alreadyProcessed: result.outcome === "already_processed",
      transaction: {
        reference: result.reference,
        status: "success",
        amount: result.amount,
        balanceAfter: result.balanceAfter,
      },
    });
  }
  if (result.outcome === "not_found") {
    return res.status(404).json({ success: false, pending: false, code: result.code, error: "Funding transaction not found." });
  }
  if (result.outcome === "failed") {
    return res.status(409).json({ success: false, pending: false, code: "FUNDING_PROVIDER_FAILED", error: "The payment provider did not complete this funding attempt." });
  }
  return res.status(200).json({
    success: false,
    pending: true,
    retryable: result.outcome === "retryable",
    code: result.code || "FUNDING_VERIFICATION_PENDING",
    error: "Payment confirmation is still processing.",
  });
}

export async function processWalletFundingWebhook({
  supabase,
  event,
  verifyReference = verifyFlutterwaveReference,
}) {
  const eventName = getFlutterwaveEventName(event);
  const eventData = event?.data || {};
  const reference = textValue(eventData.tx_ref || eventData.reference);
  const metadata = eventData.meta || eventData.metadata || event?.meta || {};

  if (eventName !== "charge.completed") {
    return { handled: false, status: 200, body: { received: true, ignored: true } };
  }
  if (!fundingMarked(metadata, reference)) {
    return { handled: false, status: 200, body: { received: true, ignored: true } };
  }

  const result = await reconcileWalletFunding({ supabase, reference, verifyReference });
  if (result.outcome === "not_found") {
    console.error("[wallet-fund-webhook] stored funding reference not found:", reference);
  }

  return {
    handled: true,
    status: 200,
    body: {
      received: true,
      credited: result.outcome === "credited",
      alreadyProcessed: result.outcome === "already_processed",
      pending: result.outcome === "pending" || result.outcome === "retryable",
      failed: result.outcome === "failed",
      manualReview: result.outcome === "retryable" || result.outcome === "not_found",
      reference: result.reference || reference || undefined,
    },
  };
}
