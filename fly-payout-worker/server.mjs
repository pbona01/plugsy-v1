import { createServer } from "node:http";
import {
  createHash,
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { pathToFileURL } from "node:url";

const MAX_BODY_BYTES = 16 * 1024;
const HMAC_WINDOW_SECONDS = 90;
const NONCE_TTL_MS = 5 * 60 * 1000;
const NONCE_CLEANUP_INTERVAL_MS = 30 * 1000;
const MAX_REPLAY_CACHE_ENTRIES = 10_000;
const PROVIDER_TIMEOUT_MS = 15_000;
const HMAC_SECRET_MIN_BYTES = 32;
const EXPECTED_CALLBACK_ORIGIN = "https://www.plugsy.ng";
const PROVIDER_ORIGIN = "https://api.flutterwave.com";
const BANK_CODE_PATTERN = /^[A-Za-z0-9_-]{2,12}$/;
const ACCOUNT_NUMBER_PATTERN = /^\d{10}$/;
const REFERENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,180}$/;
const PROVIDER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const INITIATION_KEYS = [
  "account_bank",
  "account_number",
  "amount",
  "narration",
  "currency",
  "debit_currency",
  "reference",
  "callback_url",
];
const VERIFICATION_KEYS = ["providerTransactionId"];
const PROVIDER_TRACE_HEADERS = [
  "x-request-id",
  "request-id",
  "x-trace-id",
  "trace-id",
  "x-flw-request-id",
];
const SAFE_TRACE_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

class RequestError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const writeJson = (res, status, payload, extraHeaders = {}) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders,
  });
  res.end(body);
};

const errorResponse = (res, status, code, message) =>
  writeJson(res, status, { success: false, code, error: message });

const readRawBody = (req) =>
  new Promise((resolve, reject) => {
    const declaredLength = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      req.resume();
      reject(
        new RequestError(
          413,
          "REQUEST_TOO_LARGE",
          "The request body is too large.",
        ),
      );
      return;
    }

    const chunks = [];
    let totalBytes = 0;
    let finished = false;
    req.on("data", (chunk) => {
      if (finished) return;
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        finished = true;
        req.resume();
        reject(
          new RequestError(
            413,
            "REQUEST_TOO_LARGE",
            "The request body is too large.",
          ),
        );
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!finished) resolve(Buffer.concat(chunks));
    });
    req.on("error", () => {
      if (!finished) {
        finished = true;
        reject(
          new RequestError(
            400,
            "REQUEST_INVALID",
            "The request could not be read.",
          ),
        );
      }
    });
  });

const parseJsonObject = (rawBody) => {
  let parsed;
  try {
    parsed = JSON.parse(rawBody.toString("utf8"));
  } catch {
    throw new RequestError(
      400,
      "JSON_INVALID",
      "A valid JSON object is required.",
    );
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new RequestError(
      400,
      "JSON_INVALID",
      "A valid JSON object is required.",
    );
  }
  return parsed;
};

const hasExactKeys = (value, expectedKeys) => {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const readRuntimeConfig = (env) => {
  const flutterwaveSecretKey = String(
    env.FLUTTERWAVE_SECRET_KEY || "",
  );
  const hmacSecret = String(env.PLUGSY_PAYOUT_HMAC_SECRET || "");
  const callbackOriginValue = String(env.PLUGSY_CALLBACK_ORIGIN || "").trim();
  let callbackOrigin;
  try {
    callbackOrigin = new URL(callbackOriginValue);
  } catch {
    callbackOrigin = null;
  }

  if (
    !flutterwaveSecretKey ||
    flutterwaveSecretKey !== flutterwaveSecretKey.trim() ||
    hmacSecret !== hmacSecret.trim() ||
    Buffer.byteLength(hmacSecret, "utf8") < HMAC_SECRET_MIN_BYTES ||
    !callbackOrigin ||
    callbackOrigin.origin !== EXPECTED_CALLBACK_ORIGIN ||
    callbackOrigin.pathname !== "/" ||
    callbackOrigin.search ||
    callbackOrigin.hash ||
    callbackOrigin.username ||
    callbackOrigin.password
  ) {
    return null;
  }

  return {
    flutterwaveSecretKey,
    hmacSecret,
    callbackOrigin,
  };
};

const createReplayCache = () => {
  const nonces = new Map();
  let lastCleanupAt = 0;

  const cleanup = (nowMs) => {
    if (
      nowMs - lastCleanupAt < NONCE_CLEANUP_INTERVAL_MS &&
      nonces.size < MAX_REPLAY_CACHE_ENTRIES
    ) {
      return;
    }
    lastCleanupAt = nowMs;
    for (const [nonce, expiresAt] of nonces) {
      if (expiresAt <= nowMs) nonces.delete(nonce);
    }
  };

  return {
    consume(nonce, nowMs) {
      cleanup(nowMs);
      const expiresAt = nonces.get(nonce);
      if (expiresAt && expiresAt > nowMs) return "replayed";
      if (expiresAt) nonces.delete(nonce);
      if (nonces.size >= MAX_REPLAY_CACHE_ENTRIES) return "full";
      nonces.set(nonce, nowMs + NONCE_TTL_MS);
      return "accepted";
    },
  };
};

const headerString = (req, name) => {
  const value = req.headers[name];
  return typeof value === "string" ? value : "";
};

const authenticateRequest = ({
  req,
  rawBody,
  config,
  replayCache,
  nowMs,
}) => {
  const timestampValue = headerString(req, "x-plugsy-timestamp");
  const nonce = headerString(req, "x-plugsy-nonce");
  const suppliedSignature = headerString(req, "x-plugsy-signature");
  if (
    !/^\d{10,}$/.test(timestampValue) ||
    !/^[a-f0-9]{32}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(suppliedSignature)
  ) {
    return { accepted: false, status: 401 };
  }

  const timestamp = Number(timestampValue);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(nowSeconds - timestamp) > HMAC_WINDOW_SECONDS
  ) {
    return { accepted: false, status: 401 };
  }

  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const canonical = `${timestampValue}.${nonce}.${bodyHash}`;
  const expectedSignature = createHmac("sha256", config.hmacSecret)
    .update(canonical, "utf8")
    .digest();
  const suppliedBytes = Buffer.from(suppliedSignature, "hex");
  if (
    suppliedBytes.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedBytes, expectedSignature)
  ) {
    return { accepted: false, status: 401 };
  }

  const replayResult = replayCache.consume(nonce, nowMs);
  if (replayResult === "full") {
    return { accepted: false, status: 503 };
  }
  if (replayResult !== "accepted") {
    return { accepted: false, status: 401 };
  }
  return { accepted: true, status: 200 };
};

const validateCallbackUrl = (value, config) => {
  if (typeof value !== "string") return false;
  let callback;
  try {
    callback = new URL(value);
  } catch {
    return false;
  }
  const queryKeys = [...callback.searchParams.keys()];
  return (
    callback.protocol === "https:" &&
    callback.origin === config.callbackOrigin.origin &&
    callback.hostname === config.callbackOrigin.hostname &&
    !callback.username &&
    !callback.password &&
    !callback.hash &&
    callback.pathname === "/api/wallet" &&
    queryKeys.length === 1 &&
    queryKeys[0] === "action" &&
    callback.searchParams.get("action") === "transfer-webhook"
  );
};

const validateInitiationPayload = (payload, config) =>
  hasExactKeys(payload, INITIATION_KEYS) &&
  typeof payload.account_bank === "string" &&
  BANK_CODE_PATTERN.test(payload.account_bank) &&
  typeof payload.account_number === "string" &&
  ACCOUNT_NUMBER_PATTERN.test(payload.account_number) &&
  typeof payload.amount === "number" &&
  Number.isFinite(payload.amount) &&
  payload.amount >= 1000 &&
  Math.round(payload.amount * 100) === payload.amount * 100 &&
  payload.narration === "Plugsy Wallet Withdrawal" &&
  payload.currency === "NGN" &&
  payload.debit_currency === "NGN" &&
  typeof payload.reference === "string" &&
  REFERENCE_PATTERN.test(payload.reference) &&
  validateCallbackUrl(payload.callback_url, config);

const validateVerificationPayload = (payload) =>
  hasExactKeys(payload, VERIFICATION_KEYS) &&
  typeof payload.providerTransactionId === "string" &&
  PROVIDER_ID_PATTERN.test(payload.providerTransactionId);

const providerTrace = (response) => {
  for (const name of PROVIDER_TRACE_HEADERS) {
    const value = response?.headers?.get?.(name);
    if (value && SAFE_TRACE_PATTERN.test(value)) return value;
  }
  return "";
};

const forwardProviderResponse = async (res, response) => {
  let payload;
  try {
    const providerBody = await response.text();
    payload = JSON.parse(providerBody);
  } catch {
    payload = null;
  }
  const trace = providerTrace(response);
  writeJson(
    res,
    response.status,
    payload,
    trace ? { "x-plugsy-provider-trace": trace } : {},
  );
};

const callProviderOnce = async ({
  res,
  providerFetch,
  url,
  options,
  timeoutMs,
}) => {
  const signal = AbortSignal.timeout(timeoutMs);
  let response;
  try {
    response = await providerFetch(url, { ...options, signal });
  } catch (error) {
    const timedOut =
      signal.aborted ||
      error?.name === "TimeoutError" ||
      error?.name === "AbortError";
    if (timedOut) {
      return errorResponse(
        res,
        504,
        "PROVIDER_TIMEOUT",
        "The payout provider did not confirm the request in time.",
      );
    }
    return errorResponse(
      res,
      502,
      "PROVIDER_UNAVAILABLE",
      "The payout provider is temporarily unavailable.",
    );
  }
  return forwardProviderResponse(res, response);
};

export const createPayoutWorkerHandler = ({
  env,
  providerFetch = globalThis.fetch,
  now = () => Date.now(),
  providerTimeoutMs = PROVIDER_TIMEOUT_MS,
} = {}) => {
  const config = readRuntimeConfig(env || {});
  const replayCache = createReplayCache();

  return async (req, res) => {
    const requestUrl = new URL(req.url || "/", "http://worker.invalid");
    if (requestUrl.pathname === "/healthz" && !requestUrl.search) {
      if (req.method !== "GET") {
        return errorResponse(
          res,
          405,
          "METHOD_NOT_ALLOWED",
          "Method not allowed.",
        );
      }
      return writeJson(
        res,
        config ? 200 : 503,
        { ready: Boolean(config) },
      );
    }

    const isInitiation = requestUrl.pathname === "/v1/transfers/initiate";
    const isVerification = requestUrl.pathname === "/v1/transfers/verify";
    if (requestUrl.search || (!isInitiation && !isVerification)) {
      return errorResponse(res, 404, "NOT_FOUND", "Not found.");
    }
    if (req.method !== "POST") {
      return errorResponse(
        res,
        405,
        "METHOD_NOT_ALLOWED",
        "Method not allowed.",
      );
    }
    if (!config) {
      return errorResponse(
        res,
        503,
        "WORKER_UNAVAILABLE",
        "Payout processing is temporarily unavailable.",
      );
    }
    try {
      const rawBody = await readRawBody(req);
      const authentication = authenticateRequest({
        req,
        rawBody,
        config,
        replayCache,
        nowMs: now(),
      });
      if (!authentication.accepted) {
        return errorResponse(
          res,
          authentication.status,
          authentication.status === 503
            ? "WORKER_BUSY"
            : "UNAUTHORIZED",
          authentication.status === 503
            ? "Payout processing is temporarily unavailable."
            : "Unauthorized.",
        );
      }
      if (
        String(req.headers["content-type"] || "")
          .split(";", 1)[0]
          .trim()
          .toLowerCase() !== "application/json"
      ) {
        return errorResponse(
          res,
          415,
          "CONTENT_TYPE_REQUIRED",
          "Use application/json.",
        );
      }

      const payload = parseJsonObject(rawBody);
      if (isInitiation) {
        if (!validateInitiationPayload(payload, config)) {
          return errorResponse(
            res,
            400,
            "TRANSFER_REQUEST_INVALID",
            "The transfer request is invalid.",
          );
        }
        return callProviderOnce({
          res,
          providerFetch,
          url: `${PROVIDER_ORIGIN}/v3/transfers`,
          options: {
            method: "POST",
            headers: {
              Authorization: `Bearer ${config.flutterwaveSecretKey}`,
              "Content-Type": "application/json",
            },
            body: rawBody,
          },
          timeoutMs: providerTimeoutMs,
        });
      }

      if (!validateVerificationPayload(payload)) {
        return errorResponse(
          res,
          400,
          "TRANSFER_VERIFICATION_INVALID",
          "The transfer verification request is invalid.",
        );
      }
      return callProviderOnce({
        res,
        providerFetch,
        url: `${PROVIDER_ORIGIN}/v3/transfers/${encodeURIComponent(
          payload.providerTransactionId,
        )}`,
        options: {
          method: "GET",
          headers: {
            Authorization: `Bearer ${config.flutterwaveSecretKey}`,
          },
        },
        timeoutMs: providerTimeoutMs,
      });
    } catch (error) {
      if (error instanceof RequestError) {
        return errorResponse(res, error.status, error.code, error.message);
      }
      return errorResponse(
        res,
        500,
        "WORKER_ERROR",
        "Payout processing is temporarily unavailable.",
      );
    }
  };
};

export const createPayoutWorkerServer = (options = {}) =>
  createServer(createPayoutWorkerHandler(options));

const isMainModule =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMainModule) {
  const runtimeEnv = {
    FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY,
    PLUGSY_PAYOUT_HMAC_SECRET: process.env.PLUGSY_PAYOUT_HMAC_SECRET,
    PLUGSY_CALLBACK_ORIGIN: process.env.PLUGSY_CALLBACK_ORIGIN,
    PORT: process.env.PORT,
  };
  const portValue = Number(runtimeEnv.PORT || 8080);
  const port =
    Number.isInteger(portValue) && portValue > 0 && portValue <= 65_535
      ? portValue
      : 8080;
  createPayoutWorkerServer({ env: runtimeEnv }).listen(port, "0.0.0.0");
}
