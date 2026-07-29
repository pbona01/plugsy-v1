import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { requireVerifiedClerkUser } from "./_clerkAuth.js";
import { prepareJsonRequestBody } from "./_walletFundingWebhook.js";

const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,127}$/;
const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;
const BANK_CODE_PATTERN = /^[A-Za-z0-9_-]{2,12}$/;
const ACCOUNT_NUMBER_PATTERN = /^\d{10}$/;
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,180}$/;

const text = (value) => String(value || "").trim();
const lower = (value) => text(value).toLowerCase();

const send = (res, status, code, error, extra = {}) =>
  res.status(status).json({
    success: false,
    code,
    error,
    ...extra,
  });

export function getWalletServiceClient(res) {
  const url =
    text(process.env.VITE_SUPABASE_URL) ||
    text(process.env.SUPABASE_URL) ||
    text(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = text(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !key) {
    send(
      res,
      503,
      "WALLET_SERVICE_CONFIG_REQUIRED",
      "Secure wallet processing is temporarily unavailable.",
    );
    return null;
  }

  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

const parseBody = async (req, res) => {
  try {
    const body = await prepareJsonRequestBody(req);
    return body && typeof body === "object" ? body : {};
  } catch (error) {
    send(
      res,
      error?.statusCode || 400,
      "INVALID_REQUEST",
      "The request body is invalid.",
    );
    return null;
  }
};

const idempotencyKey = (req, body) => {
  const header =
    req.headers?.["idempotency-key"] ||
    req.headers?.["Idempotency-Key"];
  const value = text(header || body?.idempotencyKey);
  return IDEMPOTENCY_PATTERN.test(value) ? value : "";
};

const requireMutationContext = async (req, res) => {
  if (req.method !== "POST") {
    send(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    return null;
  }

  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return null;

  const body = await parseBody(req, res);
  if (!body) return null;

  return {
    actor,
    body,
  };
};

const requireIdempotency = (req, res, body) => {
  const key = idempotencyKey(req, body);

  if (!key) {
    send(
      res,
      400,
      "IDEMPOTENCY_KEY_REQUIRED",
      "A valid idempotency key is required.",
    );
    return "";
  }

  return key;
};

const normalizeRpcData = (data) =>
  Array.isArray(data) ? data[0] : data;

const rpcErrorResponse = (res, error) => {
  const code = text(error?.message).split(":")[0];
  const mapping = {
    IDEMPOTENCY_KEY_CONFLICT: [409, "IDEMPOTENCY_KEY_CONFLICT"],
    IDEMPOTENCY_OPERATION_INCOMPLETE: [
      409,
      "IDEMPOTENCY_OPERATION_IN_PROGRESS",
    ],
    INSUFFICIENT_FUNDS: [409, "INSUFFICIENT_FUNDS"],
    PRODUCT_REQUEST_INVALID: [400, "PRODUCT_REQUEST_INVALID"],
    TRANSFER_REQUEST_INVALID: [400, "TRANSFER_REQUEST_INVALID"],
    WITHDRAWAL_REQUEST_INVALID: [400, "WITHDRAWAL_REQUEST_INVALID"],
    PROFILE_NOT_FOUND: [404, "PROFILE_NOT_FOUND"],
    PLAN_NOT_FOUND: [404, "PLAN_NOT_FOUND"],
    PLAN_INACTIVE: [409, "PLAN_INACTIVE"],
    PRODUCT_CLASSIFICATION_REQUIRED: [
      409,
      "PRODUCT_CLASSIFICATION_REQUIRED",
    ],
    PRODUCT_TYPE_UNSUPPORTED: [409, "PRODUCT_TYPE_UNSUPPORTED"],
    MEDAL_ALREADY_OWNED: [409, "MEDAL_ALREADY_OWNED"],
    MEDAL_SOLD_OUT: [409, "MEDAL_SOLD_OUT"],
    PORTFOLIO_CATEGORY_INVALID: [
      400,
      "PORTFOLIO_CATEGORY_INVALID",
    ],
    RECIPIENT_NOT_FOUND: [404, "RECIPIENT_NOT_FOUND"],
    SELF_TRANSFER_NOT_ALLOWED: [400, "SELF_TRANSFER_NOT_ALLOWED"],
    WITHDRAWAL_BANK_REQUIRED: [409, "WITHDRAWAL_BANK_REQUIRED"],
    WITHDRAWAL_NOT_FOUND: [404, "WITHDRAWAL_NOT_FOUND"],
    WITHDRAWAL_PROVIDER_ID_MISMATCH: [
      409,
      "WITHDRAWAL_PROVIDER_ID_MISMATCH",
    ],
    WITHDRAWAL_VERIFICATION_MISMATCH: [
      409,
      "WITHDRAWAL_VERIFICATION_MISMATCH",
    ],
  };
  const [status, stableCode] =
    mapping[code] || [503, "WALLET_OPERATION_FAILED"];

  return send(
    res,
    status,
    stableCode,
    stableCode === "INSUFFICIENT_FUNDS"
      ? "Your wallet balance is insufficient."
      : "The wallet operation could not be completed.",
  );
};

const callRpc = async (supabase, res, name, args) => {
  const { data, error } = await supabase.rpc(name, args);

  if (error) {
    rpcErrorResponse(res, error);
    return null;
  }

  const result = normalizeRpcData(data);
  if (!result || result.success !== true) {
    send(
      res,
      503,
      "WALLET_OPERATION_INVALID_RESULT",
      "The wallet operation returned an invalid result.",
    );
    return null;
  }

  return result;
};

const isWithdrawalManualReviewResult = (result) =>
  result?.success === false &&
  result?.manual_review === true &&
  result?.settlement_applied === false &&
  result?.refund_applied === false &&
  text(result?.reason).length > 0;

const callWithdrawalCallbackRpc = async (supabase, res, name, args) => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    rpcErrorResponse(res, error);
    return null;
  }
  const result = normalizeRpcData(data);
  if (result?.success === true || isWithdrawalManualReviewResult(result)) return result;
  send(res, 503, "WITHDRAWAL_CALLBACK_INVALID_RESULT", "The withdrawal callback returned an invalid result.");
  return null;
};

const recordWithdrawalCallbackManualReviewOrFail = async (supabase, res, args) =>
  callWithdrawalCallbackRpc(
    supabase,
    res,
    "record_wallet_withdrawal_callback_manual_review_v2",
    args,
  );

export async function handleWalletProductPurchase(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const key = requireIdempotency(req, res, context.body);
  if (!key) return;

  const planId = text(context.body.planId);
  if (!planId) {
    return send(
      res,
      400,
      "PLAN_ID_REQUIRED",
      "A product plan is required.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;

  const result = await callRpc(
    supabase,
    res,
    "purchase_wallet_product_v2",
    {
      p_actor_user_id: context.actor.userId,
      p_actor_email: context.actor.email,
      p_actor_name: context.actor.fullName,
      p_plan_id: planId,
      p_idempotency_key: key,
      p_purchase_code: text(context.body.purchaseCode) || null,
    },
  );
  if (!result) return;

  return res.status(200).json({
    success: true,
    alreadyProcessed: result.already_processed === true,
    reference: result.reference,
    productType: result.product_type,
    chargedAmount: result.amount,
    balanceAfter: result.balance_after,
    order: result.order,
    medal: result.medal || null,
    deliveryStatus: result.delivery_status,
    pending: result.delivery_status === "pending_login",
  });
}

export async function handleWalletProductStatus(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const reference = text(context.body.reference);
  if (!REFERENCE_PATTERN.test(reference)) {
    return send(
      res,
      400,
      "PURCHASE_REFERENCE_INVALID",
      "The purchase reference is invalid.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;

  const { data, error } = await supabase
    .from("orders")
    .select(
      "id,product_name,product_type,amount,status,delivery_status,order_reference,paystack_ref,created_at",
    )
    .eq("user_id", context.actor.userId)
    .eq("paystack_ref", reference)
    .maybeSingle();

  if (error) {
    return send(
      res,
      503,
      "PURCHASE_STATUS_UNAVAILABLE",
      "Purchase status is temporarily unavailable.",
    );
  }

  if (!data) {
    return send(
      res,
      404,
      "PURCHASE_NOT_FOUND",
      "Purchase not found.",
    );
  }

  return res.status(200).json({
    success: true,
    pending: data.delivery_status === "pending_login",
    order: data,
  });
}

export async function handleMedalStatus(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }

  const userId = text(req.query?.userId);
  if (!/^[A-Za-z0-9_-]{5,128}$/.test(userId)) {
    return send(
      res,
      400,
      "USER_ID_INVALID",
      "The requested user is invalid.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;

  const [{ data: profile, error }, { count, error: countError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("medal_tier,medal_number")
        .eq("clerk_id", userId)
        .maybeSingle(),
      supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("product_type", "medal")
        .in("status", ["paid", "completed"]),
    ]);

  if (error || countError) {
    return send(
      res,
      503,
      "MEDAL_STATUS_UNAVAILABLE",
      "Medal status is temporarily unavailable.",
    );
  }

  const tier = text(profile?.medal_tier);
  const discount =
    tier === "Gold" ? 0.5 : tier === "Silver" ? 0.3 : tier === "Bronze" ? 0.15 : 0;
  const commissionBonus =
    tier === "Gold" ? 0.2 : tier === "Silver" ? 0.15 : tier === "Bronze" ? 0.1 : 0;

  return res.status(200).json({
    success: true,
    medal: tier
      ? {
          tier,
          name: `Plugsy ${tier} Medal`,
          discount,
          commissionBonus,
        }
      : null,
    medalNumber: profile?.medal_number || null,
    totalSold: count || 0,
  });
}

export async function handlePortfolioWalletPurchase(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const key = requireIdempotency(req, res, context.body);
  if (!key) return;

  const categories = Array.isArray(context.body.categories)
    ? [...new Set(context.body.categories.map(text).filter(Boolean))]
    : [];

  if (
    categories.length === 0 ||
    categories.length > 3 ||
    categories.some((category) => !/^[a-z0-9_]{3,64}$/.test(category))
  ) {
    return send(
      res,
      400,
      "PORTFOLIO_CATEGORY_INVALID",
      "A valid portfolio category selection is required.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;

  const result = await callRpc(
    supabase,
    res,
    "purchase_portfolio_wallet_v2",
    {
      p_actor_user_id: context.actor.userId,
      p_actor_email: context.actor.email,
      p_actor_name: context.actor.fullName,
      p_categories: categories,
      p_idempotency_key: key,
      p_purchase_code: text(context.body.purchaseCode) || null,
    },
  );
  if (!result) return;

  if (!result.entitlement?.id) {
    return send(
      res,
      503,
      "PORTFOLIO_ENTITLEMENT_INVALID",
      "Portfolio entitlement could not be confirmed.",
    );
  }

  return res.status(200).json({
    success: true,
    alreadyProcessed: result.already_processed === true,
    reference: result.reference,
    chargedAmount: result.amount,
    balanceAfter: result.balance_after,
    entitlement: result.entitlement,
  });
}

export async function handlePortfolioPurchaseStatus(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const reference = text(context.body.reference);
  if (!REFERENCE_PATTERN.test(reference)) {
    return send(
      res,
      400,
      "PORTFOLIO_REFERENCE_INVALID",
      "The portfolio reference is invalid.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;

  const { data, error } = await supabase
    .from("vp_portfolios")
    .select("id,category,categories,slug,status,is_paid,paystack_ref")
    .eq("user_id", context.actor.userId)
    .eq("paystack_ref", reference)
    .maybeSingle();

  if (error) {
    return send(
      res,
      503,
      "PORTFOLIO_STATUS_UNAVAILABLE",
      "Portfolio status is temporarily unavailable.",
    );
  }

  if (!data || data.status !== "active" || data.is_paid !== true) {
    return send(
      res,
      404,
      "PORTFOLIO_ENTITLEMENT_NOT_FOUND",
      "Portfolio entitlement was not found.",
    );
  }

  return res.status(200).json({
    success: true,
    pending: false,
    entitlement: data,
  });
}

export async function handleP2PTransfer(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const key = requireIdempotency(req, res, context.body);
  if (!key) return;

  const username = lower(context.body.recipientUsername).replace(/^@/, "");
  const amount = Number(context.body.amount);
  const note = text(context.body.note).slice(0, 80);

  if (!USERNAME_PATTERN.test(username)) {
    return send(
      res,
      400,
      "RECIPIENT_USERNAME_INVALID",
      "The recipient username is invalid.",
    );
  }

  if (
    !Number.isFinite(amount) ||
    amount < 10 ||
    Math.round(amount * 100) !== amount * 100
  ) {
    return send(
      res,
      400,
      "TRANSFER_AMOUNT_INVALID",
      "The transfer amount is invalid.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;

  const result = await callRpc(supabase, res, "transfer_wallet_p2p_v2", {
    p_actor_user_id: context.actor.userId,
    p_actor_email: context.actor.email,
    p_recipient_username: username,
    p_amount: amount,
    p_note: note || null,
    p_idempotency_key: key,
  });
  if (!result) return;

  return res.status(200).json({
    success: true,
    alreadyProcessed: result.already_processed === true,
    reference: result.reference,
    amount: result.amount,
    balanceAfter: result.sender_balance_after,
    recipient: result.recipient,
  });
}

export async function handleResolveUsername(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const username = lower(context.body.username).replace(/^@/, "");
  if (!USERNAME_PATTERN.test(username)) {
    return send(
      res,
      400,
      "USERNAME_INVALID",
      "The username is invalid.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;

  const { data, error } = await supabase
    .from("profiles")
    .select("clerk_id,full_name,username")
    .eq("username", username)
    .maybeSingle();

  if (error || !data) {
    return send(
      res,
      404,
      "RECIPIENT_NOT_FOUND",
      "No Plugsy user has that username.",
    );
  }

  if (data.clerk_id === context.actor.userId) {
    return send(
      res,
      400,
      "SELF_TRANSFER_NOT_ALLOWED",
      "You cannot transfer to yourself.",
    );
  }

  return res.status(200).json({
    success: true,
    fullName: data.full_name || `@${data.username}`,
  });
}

const flutterwaveSecret = (res) => {
  const key = text(process.env.FLUTTERWAVE_SECRET_KEY);
  if (!key) {
    send(
      res,
      503,
      "WITHDRAWAL_PROVIDER_CONFIG_REQUIRED",
      "Withdrawal processing is temporarily unavailable.",
    );
    return "";
  }
  return key;
};

const resolveBankAccount = async ({
  accountNumber,
  bankCode,
  secretKey,
}) => {
  const response = await fetch(
    "https://api.flutterwave.com/v3/accounts/resolve",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        account_number: accountNumber,
        account_bank: bankCode,
      }),
    },
  );
  const result = await response.json().catch(() => null);

  if (
    !response.ok ||
    result?.status !== "success" ||
    !text(result?.data?.account_name)
  ) {
    throw new Error("BANK_ACCOUNT_VERIFICATION_FAILED");
  }

  return text(result.data.account_name);
};

export async function handleResolveBankAccount(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const accountNumber = text(context.body.accountNumber);
  const bankCode = text(context.body.bankCode);
  if (
    !ACCOUNT_NUMBER_PATTERN.test(accountNumber) ||
    !BANK_CODE_PATTERN.test(bankCode)
  ) {
    return send(
      res,
      400,
      "BANK_ACCOUNT_INVALID",
      "The bank account details are invalid.",
    );
  }

  const secretKey = flutterwaveSecret(res);
  if (!secretKey) return;

  try {
    const accountName = await resolveBankAccount({
      accountNumber,
      bankCode,
      secretKey,
    });
    return res.status(200).json({
      success: true,
      accountName,
    });
  } catch {
    return send(
      res,
      400,
      "BANK_ACCOUNT_VERIFICATION_FAILED",
      "The bank account could not be verified.",
    );
  }
}

export async function handleSaveBankAccount(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const accountNumber = text(context.body.accountNumber);
  const bankCode = text(context.body.bankCode);
  const bankName = text(context.body.bankName).slice(0, 120);
  if (
    !ACCOUNT_NUMBER_PATTERN.test(accountNumber) ||
    !BANK_CODE_PATTERN.test(bankCode) ||
    !bankName
  ) {
    return send(
      res,
      400,
      "BANK_ACCOUNT_INVALID",
      "The bank account details are invalid.",
    );
  }

  const secretKey = flutterwaveSecret(res);
  if (!secretKey) return;

  let accountName;
  try {
    accountName = await resolveBankAccount({
      accountNumber,
      bankCode,
      secretKey,
    });
  } catch {
    return send(
      res,
      400,
      "BANK_ACCOUNT_VERIFICATION_FAILED",
      "The bank account could not be verified.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;

  const { error } = await supabase
    .from("profiles")
    .update({
      bank_code: bankCode,
      bank_name: bankName,
      account_number: accountNumber,
      account_name: accountName,
      updated_at: new Date().toISOString(),
    })
    .eq("clerk_id", context.actor.userId);

  if (error) {
    return send(
      res,
      503,
      "BANK_ACCOUNT_SAVE_FAILED",
      "The bank account could not be saved.",
    );
  }

  return res.status(200).json({
    success: true,
    accountName,
  });
}

export async function handleListBanks(req, res) {
  if (req.method !== "GET") {
    return send(res, 405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  }

  const actor = await requireVerifiedClerkUser(req, res);
  if (!actor) return;

  const secretKey = flutterwaveSecret(res);
  if (!secretKey) return;

  try {
    const response = await fetch(
      "https://api.flutterwave.com/v3/banks/NG",
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      },
    );
    const result = await response.json().catch(() => null);

    if (!response.ok || !Array.isArray(result?.data)) {
      throw new Error("BANK_LIST_FAILED");
    }

    const seen = new Set();
    const banks = result.data
      .filter((bank) => {
        const code = text(bank?.code);
        if (!code || seen.has(code)) return false;
        seen.add(code);
        return true;
      })
      .map((bank) => ({
        name: text(bank.name),
        code: text(bank.code),
      }))
      .filter((bank) => bank.name && BANK_CODE_PATTERN.test(bank.code))
      .sort((a, b) => a.name.localeCompare(b.name));

    return res.status(200).json({
      success: true,
      banks,
    });
  } catch {
    return send(
      res,
      503,
      "BANK_LIST_UNAVAILABLE",
      "The bank list is temporarily unavailable.",
    );
  }
}

const encodePin = (pin) => {
  const salt = randomBytes(16);
  const digest = scryptSync(pin, salt, 32);
  return `scrypt$${salt.toString("base64")}$${digest.toString("base64")}`;
};

const constantTimePinMatch = (pin, stored) => {
  const value = text(stored);
  if (!/^\d{4}$/.test(pin) || !value) return false;

  if (value.startsWith("scrypt$")) {
    const [, saltText, digestText] = value.split("$");
    try {
      const salt = Buffer.from(saltText, "base64");
      const expected = Buffer.from(digestText, "base64");
      const actual = scryptSync(pin, salt, expected.length);
      return (
        expected.length === actual.length &&
        timingSafeEqual(expected, actual)
      );
    } catch {
      return false;
    }
  }

  if (/^[a-f0-9]{64}$/i.test(value)) {
    const expected = Buffer.from(value, "hex");
    const actual = createHash("sha256").update(pin).digest();
    return timingSafeEqual(expected, actual);
  }

  return false;
};

const getPinState = (profile) => {
  if (text(profile?.wallet_pin)) {
    return {
      hash: text(profile.wallet_pin),
      requireView: profile.require_pin_view === true,
      field: "wallet_pin",
    };
  }

  try {
    const legacy = JSON.parse(text(profile?.phone_number));
    return {
      hash: text(legacy?.pin),
      requireView: legacy?.require_pin_view === true,
      field: "phone_number",
    };
  } catch {
    return {
      hash: "",
      requireView: false,
      field: "phone_number",
    };
  }
};

const loadActorProfile = async (supabase, actorUserId) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("clerk_id", actorUserId)
    .maybeSingle();
  return error ? null : data;
};

export async function handleSetPin(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const pin = text(context.body.pin);
  if (!/^\d{4}$/.test(pin)) {
    return send(
      res,
      400,
      "PIN_INVALID",
      "PIN must be a four-digit number.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;
  const profile = await loadActorProfile(supabase, context.actor.userId);
  if (!profile) {
    return send(res, 404, "PROFILE_NOT_FOUND", "Profile not found.");
  }

  const state = getPinState(profile);
  const hash = encodePin(pin);
  const requireView = context.body.require_pin_view === true;
  const update =
    state.field === "wallet_pin"
      ? {
          wallet_pin: hash,
          require_pin_view: requireView,
          updated_at: new Date().toISOString(),
        }
      : {
          phone_number: JSON.stringify({
            pin: hash,
            require_pin_view: requireView,
          }),
          updated_at: new Date().toISOString(),
        };

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("clerk_id", context.actor.userId);

  if (error) {
    return send(
      res,
      503,
      "PIN_UPDATE_FAILED",
      "The security PIN could not be updated.",
    );
  }

  return res.status(200).json({
    success: true,
    message: "Security PIN updated successfully.",
  });
}

export async function handleUpdatePinSettings(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;
  const profile = await loadActorProfile(supabase, context.actor.userId);
  if (!profile) {
    return send(res, 404, "PROFILE_NOT_FOUND", "Profile not found.");
  }

  const state = getPinState(profile);
  if (!state.hash) {
    return send(res, 409, "PIN_NOT_SET", "Set a security PIN first.");
  }

  const requireView = context.body.require_pin_view === true;
  const update =
    state.field === "wallet_pin"
      ? {
          require_pin_view: requireView,
          updated_at: new Date().toISOString(),
        }
      : {
          phone_number: JSON.stringify({
            pin: state.hash,
            require_pin_view: requireView,
          }),
          updated_at: new Date().toISOString(),
        };

  const { error } = await supabase
    .from("profiles")
    .update(update)
    .eq("clerk_id", context.actor.userId);

  if (error) {
    return send(
      res,
      503,
      "PIN_SETTINGS_UPDATE_FAILED",
      "Security preferences could not be updated.",
    );
  }

  return res.status(200).json({
    success: true,
  });
}

export async function handleVerifyPin(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;
  const profile = await loadActorProfile(supabase, context.actor.userId);
  const state = getPinState(profile);

  if (!profile || !state.hash) {
    return send(res, 409, "PIN_NOT_SET", "Security PIN is not set.");
  }

  if (!constantTimePinMatch(text(context.body.pin), state.hash)) {
    return send(res, 401, "PIN_INVALID", "The security PIN is incorrect.");
  }

  return res.status(200).json({
    success: true,
  });
}

export async function handleUpdateUsername(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const username = lower(context.body.username);
  if (!USERNAME_PATTERN.test(username)) {
    return send(
      res,
      400,
      "USERNAME_INVALID",
      "Username must contain 3–30 lowercase letters, numbers, or underscores.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;

  const { data: existing, error: lookupError } = await supabase
    .from("profiles")
    .select("clerk_id")
    .eq("username", username)
    .maybeSingle();

  if (lookupError) {
    return send(
      res,
      503,
      "USERNAME_CHECK_FAILED",
      "Username availability could not be checked.",
    );
  }

  if (existing && existing.clerk_id !== context.actor.userId) {
    return send(
      res,
      409,
      "USERNAME_TAKEN",
      "That username is already taken.",
    );
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      updated_at: new Date().toISOString(),
    })
    .eq("clerk_id", context.actor.userId);

  if (error) {
    return send(
      res,
      503,
      "USERNAME_UPDATE_FAILED",
      "The username could not be updated.",
    );
  }

  return res.status(200).json({
    success: true,
    username,
  });
}

export async function handleWithdrawal(req, res) {
  const context = await requireMutationContext(req, res);
  if (!context) return;

  const key = requireIdempotency(req, res, context.body);
  if (!key) return;

  const amount = Number(context.body.amount);
  if (
    !Number.isFinite(amount) ||
    amount < 1000 ||
    Math.round(amount * 100) !== amount * 100
  ) {
    return send(
      res,
      400,
      "WITHDRAWAL_AMOUNT_INVALID",
      "The withdrawal amount is invalid.",
    );
  }

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;
  const secretKey = flutterwaveSecret(res);
  if (!secretKey) return;
  const profile = await loadActorProfile(supabase, context.actor.userId);
  const state = getPinState(profile);

  if (!profile || !state.hash) {
    return send(res, 409, "PIN_NOT_SET", "Security PIN is not set.");
  }

  if (!constantTimePinMatch(text(context.body.pin), state.hash)) {
    return send(res, 401, "PIN_INVALID", "The security PIN is incorrect.");
  }

  const reservation = await callRpc(
    supabase,
    res,
    "reserve_wallet_withdrawal_v2",
    {
      p_actor_user_id: context.actor.userId,
      p_actor_email: context.actor.email,
      p_amount: amount,
      p_idempotency_key: key,
    },
  );
  if (!reservation) return;

  if (
    reservation.already_processed === true &&
    reservation.provider_submitted === true
  ) {
    if (reservation.pending_manual_review === true) {
      return res.status(200).json({
        success: false,
        alreadyProcessed: true,
        pending: true,
        manualReview: true,
        reference: reservation.reference,
      });
    }

    if (reservation.withdrawal_final_status === "failed") {
      return send(
        res,
        409,
        "WITHDRAWAL_ALREADY_REFUNDED",
        "The previous withdrawal attempt failed and was refunded.",
        {
          pending: false,
          refunded: true,
          reference: reservation.reference,
        },
      );
    }

    return res.status(200).json({
      success: true,
      alreadyProcessed: true,
      pending:
        reservation.withdrawal_final_status !== "success",
      reference: reservation.reference,
      amount: reservation.amount,
      fee: reservation.fee,
      balanceAfter: reservation.balance_after,
    });
  }

  const attempt = await callRpc(
    supabase,
    res,
    "mark_wallet_withdrawal_attempt_started_v2",
    {
      p_reference: reservation.reference,
    },
  );
  if (!attempt) return;

  let provider;
  try {
    const siteUrl =
      text(process.env.NEXT_PUBLIC_SITE_URL) ||
      text(process.env.SITE_URL) ||
      "https://www.plugsy.ng";
    const response = await fetch(
      "https://api.flutterwave.com/v3/transfers",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          account_bank: reservation.bank_code,
          account_number: reservation.account_number,
          amount: reservation.amount,
          narration: "Plugsy Wallet Withdrawal",
          currency: "NGN",
          reference: reservation.reference,
          callback_url:
            siteUrl.replace(/\/$/, "") +
            "/api/wallet?action=transfer-webhook",
        }),
      },
    );
    provider = await response.json().catch(() => null);

    if (!response.ok || provider?.status !== "success") {
      await callRpc(
        supabase,
        res,
        "refund_wallet_withdrawal_v2",
        {
          p_reference: reservation.reference,
          p_provider_transaction_id:
            text(provider?.data?.id) || null,
          p_provider_status:
            text(provider?.data?.status) || "initialization_failed",
          p_event_key: `init-failed:${key}`,
        },
      );
      if (res.headersSent) return;
      return send(
        res,
        502,
        "WITHDRAWAL_PROVIDER_REJECTED",
        "The withdrawal provider rejected the transfer.",
      );
    }
  } catch {
    await supabase.rpc("mark_wallet_withdrawal_manual_review_v2", {
      p_reference: reservation.reference,
      p_reason: "provider request outcome unknown",
    });
    await supabase.rpc("record_financial_manual_review_v2", {
      p_event_key: `withdrawal-init-unknown:${key}`,
      p_operation_type: "withdrawal",
      p_reference: reservation.reference,
      p_reason: "provider request outcome unknown",
      p_details: {
        actor_user_id: context.actor.userId,
      },
    });

    return send(
      res,
      503,
      "WITHDRAWAL_MANUAL_REVIEW",
      "The withdrawal is reserved and requires provider confirmation.",
      {
        pending: true,
        reference: reservation.reference,
      },
    );
  }

  const submitted = await callWithdrawalCallbackRpc(
    supabase,
    res,
    "mark_wallet_withdrawal_submitted_v2",
    {
      p_reference: reservation.reference,
      p_provider_transaction_id: text(provider?.data?.id),
      p_provider_status:
        text(provider?.data?.status) || "submitted",
    },
  );
  if (!submitted) return;

  if (submitted.manual_review === true) {
    return res.status(200).json({
      success: false,
      pending: true,
      manualReview: true,
      reference: reservation.reference,
    });
  }

  return res.status(200).json({
    success: true,
    pending: true,
    reference: reservation.reference,
    amount: reservation.amount,
    fee: reservation.fee,
    balanceAfter: reservation.balance_after,
  });
}

const normalizeTransferStatus = (value) => {
  const status = lower(value);
  if (["successful", "succeeded", "completed"].includes(status)) {
    return "successful";
  }
  if (
    ["failed", "cancelled", "canceled", "reversed"].includes(status)
  ) {
    return "failed";
  }
  return "unknown";
};

export async function processWithdrawalWebhook({
  event,
  res,
}) {
  const eventData = event?.data || {};
  const reference = text(
    eventData.reference || eventData.tx_ref,
  );
  const providerTransactionId = text(
    eventData.id || eventData.transaction_id,
  );
  const eventKey = text(
    eventData.flw_ref ||
      eventData.id ||
      `${reference}:${eventData.status}`,
  );

  const supabase = getWalletServiceClient(res);
  if (!supabase) return;
  const secretKey = flutterwaveSecret(res);
  if (!secretKey) return;

  if (!reference || !providerTransactionId || !eventKey) {
    const review = await recordWithdrawalCallbackManualReviewOrFail(supabase, res, {
      p_event_key: `withdrawal-malformed:${createHash("sha256")
        .update(JSON.stringify({
          hasReference: Boolean(reference),
          hasProviderId: Boolean(providerTransactionId),
        }))
        .digest("hex")}`,
      p_reference: reference || null,
      p_reason: "malformed withdrawal callback",
      p_provider_transaction_id: providerTransactionId || null,
      p_provider_status: "unknown",
      p_details: {
        has_reference: Boolean(reference),
        has_provider_transaction_id: Boolean(providerTransactionId),
      },
    });
    if (!review) return;
    return res.status(200).json({
      received: true,
      manualReview: true,
      settlementApplied: false,
    });
  }

  let verified;
  try {
    const response = await fetch(
      `https://api.flutterwave.com/v3/transfers/${encodeURIComponent(
        providerTransactionId,
      )}`,
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
        },
      },
    );
    verified = await response.json().catch(() => null);
    if (!response.ok || verified?.status !== "success") {
      throw new Error("provider transfer verification failed");
    }
  } catch {
    const review = await recordWithdrawalCallbackManualReviewOrFail(supabase, res, {
      p_event_key: `withdrawal-verify:${eventKey}`,
      p_reference: reference,
      p_reason: "provider transfer verification unavailable",
      p_provider_transaction_id: providerTransactionId,
      p_provider_status: "unknown",
      p_details: {
        provider_transaction_id: providerTransactionId,
      },
    });
    if (!review) return;
    return res.status(200).json({
      received: true,
      manualReview: true,
      settlementApplied: false,
      reference,
    });
  }

  const verifiedData = verified.data || {};
  const verifiedReference = text(
    verifiedData.reference || verifiedData.tx_ref,
  );
  const verifiedProviderId = text(
    verifiedData.id || verifiedData.transaction_id,
  );
  const currency = text(verifiedData.currency).toUpperCase();
  const amount = Number(verifiedData.amount);
  const status = normalizeTransferStatus(verifiedData.status);

  if (
    verifiedReference !== reference ||
    verifiedProviderId !== providerTransactionId ||
    currency !== "NGN" ||
    !Number.isFinite(amount) ||
    amount <= 0 ||
    status === "unknown"
  ) {
    const review = await recordWithdrawalCallbackManualReviewOrFail(supabase, res, {
      p_event_key: `withdrawal-mismatch:${eventKey}`,
      p_reference: reference,
      p_reason: "verified transfer mismatch",
      p_provider_transaction_id: providerTransactionId,
      p_provider_status: status,
      p_details: {
        provider_transaction_id: providerTransactionId,
        verified_reference_matches:
          verifiedReference === reference,
        verified_provider_id_matches:
          verifiedProviderId === providerTransactionId,
        currency,
        amount,
        status,
      },
    });
    if (!review) return;
    return res.status(200).json({
      received: true,
      manualReview: true,
      settlementApplied: false,
      reference,
    });
  }

  const rpcName =
    status === "successful"
      ? "settle_wallet_withdrawal_success_v2"
      : "refund_wallet_withdrawal_v2";
  const result = await callWithdrawalCallbackRpc(supabase, res, rpcName, {
    p_reference: reference,
    p_provider_transaction_id: providerTransactionId,
    p_provider_status: status,
    p_event_key: eventKey,
    p_amount: amount,
    p_currency: currency,
  });
  if (!result) return;

  return res.status(200).json({
    received: true,
    manualReview: result.manual_review === true,
    settlementApplied: result.settlement_applied === true,
    refundApplied: result.refund_applied === true,
    alreadyProcessed: result.already_processed === true,
    refunded: result.refunded === true,
    reference,
  });
}
