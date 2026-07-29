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

const verifyFlutterwaveReference = async (reference) => {
  const secretKey =
    String(process.env.FLUTTERWAVE_SECRET_KEY || "").trim();

  if (!secretKey) {
    throw new Error("Flutterwave configuration is unavailable");
  }

  const response = await fetch(
    "https://api.flutterwave.com/v3/transactions/" +
      "verify_by_reference?tx_ref=" +
      encodeURIComponent(reference),
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    },
  );

  const result = await response.json().catch(() => null);

  if (!response.ok || !result) {
    throw new Error("Flutterwave verification failed");
  }

  return result;
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

export async function verifyWalletFundingStatus({
  req,
  res,
  supabase,
}) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      code: "METHOD_NOT_ALLOWED",
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
      error: "The verification request is invalid.",
    });
  }

  const reference = textValue(body.reference);

  if (
    !/^wallet_fund_[A-Za-z0-9_-]{6,180}$/.test(reference)
  ) {
    return res.status(400).json({
      success: false,
      code: "INVALID_FUNDING_REFERENCE",
      error: "The funding reference is invalid.",
    });
  }

  const { data: transaction, error: lookupError } =
    await supabase
      .from("wallet_transactions")
      .select(
        "reference,status,amount,balance_after,currency",
      )
      .eq("reference", reference)
      .eq("user_id", actor.userId)
      .eq("type", "fund")
      .maybeSingle();

  if (lookupError) {
    console.error(
      "[wallet-fund-verify] transaction lookup failed:",
      lookupError.message,
    );

    return res.status(503).json({
      success: false,
      code: "FUNDING_STATUS_UNAVAILABLE",
      error: "Funding status is temporarily unavailable.",
    });
  }

  if (!transaction) {
    return res.status(404).json({
      success: false,
      code: "FUNDING_TRANSACTION_NOT_FOUND",
      error: "Funding transaction not found.",
    });
  }

  if (transaction.status === "success") {
    return res.status(200).json({
      success: true,
      pending: false,
      transaction: {
        reference: transaction.reference,
        status: transaction.status,
        amount: transaction.amount,
        balanceAfter: transaction.balance_after,
      },
    });
  }

  if (transaction.status === "failed") {
    return res.status(409).json({
      success: false,
      pending: false,
      code: "FUNDING_FAILED",
      error: "This wallet funding attempt was not completed.",
    });
  }

  let verified;
  try {
    verified = await verifyFlutterwaveReference(reference);
  } catch (error) {
    console.error(
      "[wallet-fund-verify] provider verification unavailable:",
      error?.message || error,
    );

    return res.status(200).json({
      success: false,
      pending: true,
      code: "FUNDING_VERIFICATION_PENDING",
      error: "Payment confirmation is still pending.",
    });
  }

  const verifiedData = verified?.data || {};
  const verifiedReference =
    verifiedData.tx_ref ||
    verifiedData.reference ||
    "";

  const verifiedStatus = normalizeFlutterwaveChargeStatus(
    verifiedData.status,
  );
  const verifiedCurrency =
    textValue(verifiedData.currency).toUpperCase();
  const verifiedAmount = Number(verifiedData.amount);

  const verifiedMatches =
    verified?.status === "success" &&
    verifiedReference === reference &&
    verifiedCurrency === "NGN" &&
    Number.isFinite(verifiedAmount) &&
    verifiedAmount === Number(transaction.amount);

  if (!verifiedMatches) {
    return res.status(200).json({
      success: false,
      pending: true,
      code: "FUNDING_MANUAL_REVIEW",
      error: "Payment confirmation requires review.",
    });
  }

  if (verifiedStatus === "successful") {
    return res.status(200).json({
      success: false,
      pending: true,
      code: "FUNDING_AWAITING_WEBHOOK",
      error: "Payment was received and wallet crediting is still processing.",
    });
  }

  if (
    verifiedStatus === "failed" ||
    verifiedStatus === "cancelled"
  ) {
    return res.status(200).json({
      success: false,
      pending: false,
      code: "FUNDING_PROVIDER_FAILED",
      error: "The payment provider did not complete this funding attempt.",
    });
  }

  return res.status(200).json({
    success: false,
    pending: true,
    code: "FUNDING_VERIFICATION_PENDING",
    error: "Payment confirmation is still pending.",
  });
}
export async function processWalletFundingWebhook({
  supabase,
  event,
  verifyReference = verifyFlutterwaveReference,
}) {
  const eventName = getFlutterwaveEventName(event);

  const eventData = event?.data || {};
  const reference =
    eventData.tx_ref ||
    eventData.reference ||
    null;

  const metadata =
    eventData.meta ||
    eventData.metadata ||
    event?.meta ||
    {};

  const storedTransaction =
    await getFundingTransaction(supabase, reference);

  const markedAsFunding =
    fundingMarked(metadata, reference);

  if (!storedTransaction) {
    if (markedAsFunding) {
      console.error(
        "[wallet-fund-webhook] funding reference has no stored transaction:",
        reference,
      );

      return {
        handled: true,
        status: 200,
        body: {
          received: true,
          manualReview: true,
          credited: false,
        },
      };
    }

    return {
      handled: false,
      status: 200,
      body: {
        received: true,
        ignored: true,
      },
    };
  }

  if (
    eventName !== "charge.completed" ||
    normalizeFlutterwaveChargeStatus(eventData.status) !==
      "successful"
  ) {
    return {
      handled: true,
      status: 200,
      body: {
        received: true,
        credited: false,
      },
    };
  }

  const verified = await verifyReference(
    storedTransaction.reference,
  );

  const verifiedData = verified?.data || {};
  const verifiedReference =
    verifiedData.tx_ref ||
    verifiedData.reference;

  const verifiedStatus = normalizeFlutterwaveChargeStatus(
    verifiedData.status,
  );
  const verifiedCurrency =
    textValue(verifiedData.currency).toUpperCase();
  const verifiedAmount = Number(verifiedData.amount);
  const providerTransactionId = textValue(
    verifiedData.id ||
    verifiedData.flw_ref ||
    verifiedData.transaction_id,
  );

  const eventAmount = Number(eventData.amount);

  if (
    verified?.status !== "success" ||
    verifiedStatus !== "successful" ||
    verifiedReference !== storedTransaction.reference ||
    verifiedCurrency !== "NGN" ||
    !Number.isFinite(verifiedAmount) ||
    verifiedAmount !== Number(storedTransaction.amount) ||
    (
      Number.isFinite(eventAmount) &&
      eventAmount !== verifiedAmount
    ) ||
    !providerTransactionId
  ) {
    console.error(
      "[wallet-fund-webhook] provider verification mismatch:",
      storedTransaction.reference,
    );

    return {
      handled: true,
      status: 200,
      body: {
        received: true,
        manualReview: true,
        credited: false,
      },
    };
  }

  const { data, error } = await supabase.rpc(
    "fulfill_wallet_funding_v2",
    {
      p_reference: storedTransaction.reference,
      p_provider_transaction_id: providerTransactionId,
      p_provider_status: verifiedStatus,
      p_currency: verifiedCurrency,
      p_amount: verifiedAmount,
    },
  );

  if (error) {
    console.error(
      "[wallet-fund-webhook] atomic fulfilment failed:",
      error.message,
    );
    throw new Error("Atomic wallet funding fulfilment failed");
  }

  const result = normalizeRpcResult(data);

  if (
    !result ||
    result.success !== true ||
    !result.reference
  ) {
    throw new Error(
      "Atomic wallet funding returned an invalid result",
    );
  }

  return {
    handled: true,
    status: 200,
    body: {
      received: true,
      credited: result.already_processed !== true,
      alreadyProcessed:
        result.already_processed === true,
      reference: result.reference,
    },
  };
}
