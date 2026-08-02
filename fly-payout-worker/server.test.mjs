import test from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { once } from "node:events";
import { createPayoutWorkerServer } from "./server.mjs";

const TEST_NOW_MS = 1_800_000_000_000;
const TEST_SECRET = "test-only-hmac-secret-32-bytes-minimum-value";
const TEST_ENV = {
  FLUTTERWAVE_SECRET_KEY: "test-only-provider-secret",
  PLUGSY_PAYOUT_HMAC_SECRET: TEST_SECRET,
  PLUGSY_CALLBACK_ORIGIN: "https://plugsy.ng",
  PORT: "8080",
};
const VALID_INITIATION = {
  account_bank: "TEST",
  account_number: "0000000000",
  amount: 1000,
  narration: "Plugsy Wallet Withdrawal",
  currency: "NGN",
  debit_currency: "NGN",
  reference: "test:withdrawal:reference:0001",
  callback_url:
    "https://plugsy.ng/api/wallet?action=transfer-webhook",
};
const PRE_PROVIDER_REJECTION_HEADER = "x-plugsy-worker-outcome";
const PRE_PROVIDER_REJECTION_VALUE = "pre-provider-rejected";

let nonceSequence = 0;
const nextNonce = () => (++nonceSequence).toString(16).padStart(32, "0");

const signBody = ({
  rawBody,
  timestamp = Math.floor(TEST_NOW_MS / 1000),
  nonce = nextNonce(),
  secret = TEST_SECRET,
}) => {
  const timestampText = String(timestamp);
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const canonical = `${timestampText}.${nonce}.${bodyHash}`;
  return {
    timestamp: timestampText,
    nonce,
    signature: createHmac("sha256", secret)
      .update(canonical)
      .digest("hex"),
  };
};

const defaultProviderFetch = async () =>
  new Response(JSON.stringify({ status: "success", data: { id: "12345" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

const withWorker = async (
  callback,
  {
    providerFetch = defaultProviderFetch,
    now = () => TEST_NOW_MS,
    providerTimeoutMs = 50,
    env = TEST_ENV,
  } = {},
) => {
  const server = createPayoutWorkerServer({
    env,
    providerFetch,
    now,
    providerTimeoutMs,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const origin = `http://127.0.0.1:${address.port}`;
  try {
    await callback(origin);
  } finally {
    server.close();
    await once(server, "close");
  }
};

const postSigned = async (
  origin,
  path,
  payload,
  {
    signedBody,
    timestamp,
    nonce,
    signature,
    contentType = "application/json",
  } = {},
) => {
  const rawBody =
    typeof payload === "string" ? payload : JSON.stringify(payload);
  const authentication = signBody({
    rawBody: signedBody ?? rawBody,
    timestamp,
    nonce,
  });
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "x-plugsy-timestamp": authentication.timestamp,
      "x-plugsy-nonce": authentication.nonce,
      "x-plugsy-signature": signature ?? authentication.signature,
    },
    body: rawBody,
  });
};

test("accepts a valid HMAC request", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/verify",
      { providerTransactionId: "12345" },
    );
    assert.equal(response.status, 200);
  });
});

test("rejects an invalid HMAC without calling the provider", async () => {
  let calls = 0;
  await withWorker(
    async (origin) => {
      const response = await postSigned(
        origin,
        "/v1/transfers/initiate",
        VALID_INITIATION,
        { signature: "0".repeat(64) },
      );
      assert.equal(response.status, 401);
      assert.equal(calls, 0);
    },
    { providerFetch: async () => { calls += 1; } },
  );
});

test("rejects a request whose body was changed after signing", async () => {
  await withWorker(async (origin) => {
    const signedBody = JSON.stringify(VALID_INITIATION);
    const tampered = { ...VALID_INITIATION, amount: 2000 };
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      tampered,
      { signedBody },
    );
    assert.equal(response.status, 401);
  });
});

test("rejects a stale timestamp", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      VALID_INITIATION,
      { timestamp: Math.floor(TEST_NOW_MS / 1000) - 91 },
    );
    assert.equal(response.status, 401);
  });
});

test("rejects a future timestamp", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      VALID_INITIATION,
      { timestamp: Math.floor(TEST_NOW_MS / 1000) + 91 },
    );
    assert.equal(response.status, 401);
  });
});

test("rejects a repeated nonce for a signed request", async () => {
  await withWorker(async (origin) => {
    const nonce = "a".repeat(32);
    const first = await postSigned(
      origin,
      "/v1/transfers/initiate",
      VALID_INITIATION,
      { nonce },
    );
    const second = await postSigned(
      origin,
      "/v1/transfers/initiate",
      VALID_INITIATION,
      { nonce },
    );
    assert.equal(first.status, 200);
    assert.equal(second.status, 401);
  });
});

test("rejects a request body larger than 16 KB", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      JSON.stringify({ padding: "x".repeat(17 * 1024) }),
    );
    assert.equal(response.status, 413);
  });
});

test("rejects the wrong content type", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      VALID_INITIATION,
      { contentType: "text/plain" },
    );
    assert.equal(response.status, 415);
  });
});

test("rejects an unknown endpoint", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(origin, "/v1/proxy", {});
    assert.equal(response.status, 404);
  });
});

test("rejects unknown initiation keys", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      { ...VALID_INITIATION, unexpected: true },
    );
    assert.equal(response.status, 400);
  });
});

test("rejects an invalid account number", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      { ...VALID_INITIATION, account_number: "000000000" },
    );
    assert.equal(response.status, 400);
  });
});

test("rejects an invalid amount", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      { ...VALID_INITIATION, amount: 999.999 },
    );
    assert.equal(response.status, 400);
  });
});

test("rejects the wrong currency", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      { ...VALID_INITIATION, currency: "USD" },
    );
    assert.equal(response.status, 400);
  });
});

test("rejects any other callback origin", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      {
        ...VALID_INITIATION,
        callback_url:
          "https://example.invalid/api/wallet?action=transfer-webhook",
      },
    );
    assert.equal(response.status, 400);
    assert.equal(
      response.headers.get(PRE_PROVIDER_REJECTION_HEADER),
      PRE_PROVIDER_REJECTION_VALUE,
    );
  });
});

test("rejects the www callback origin before calling the provider", async () => {
  let calls = 0;
  await withWorker(
    async (origin) => {
      const response = await postSigned(
        origin,
        "/v1/transfers/initiate",
        {
          ...VALID_INITIATION,
          callback_url:
            "https://www.plugsy.ng/api/wallet?action=transfer-webhook",
        },
      );
      assert.equal(response.status, 400);
      assert.equal(
        response.headers.get(PRE_PROVIDER_REJECTION_HEADER),
        PRE_PROVIDER_REJECTION_VALUE,
      );
      assert.equal(calls, 0);
    },
    { providerFetch: async () => { calls += 1; } },
  );
});

test("rejects the wrong callback path", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      {
        ...VALID_INITIATION,
        callback_url:
          "https://plugsy.ng/api/other?action=transfer-webhook",
      },
    );
    assert.equal(response.status, 400);
  });
});

test("rejects extra callback query parameters", async () => {
  await withWorker(async (origin) => {
    const response = await postSigned(
      origin,
      "/v1/transfers/initiate",
      {
        ...VALID_INITIATION,
        callback_url:
          "https://plugsy.ng/api/wallet?action=transfer-webhook&extra=1",
      },
    );
    assert.equal(response.status, 400);
  });
});

test("accepts https://plugsy.ng and forwards one exact initiation payload", async () => {
  const providerCalls = [];
  await withWorker(
    async (origin) => {
      const response = await postSigned(
        origin,
        "/v1/transfers/initiate",
        VALID_INITIATION,
      );
      assert.equal(response.status, 200);
      assert.equal(
        response.headers.get(PRE_PROVIDER_REJECTION_HEADER),
        null,
      );
      assert.equal(providerCalls.length, 1);
      assert.equal(
        providerCalls[0].url,
        "https://api.flutterwave.com/v3/transfers",
      );
      assert.equal(providerCalls[0].options.method, "POST");
      assert.deepEqual(
        JSON.parse(providerCalls[0].options.body.toString("utf8")),
        VALID_INITIATION,
      );
    },
    {
      providerFetch: async (url, options) => {
        providerCalls.push({ url, options });
        return defaultProviderFetch();
      },
    },
  );
});

test("forwards one valid verification request", async () => {
  const providerCalls = [];
  await withWorker(
    async (origin) => {
      const response = await postSigned(
        origin,
        "/v1/transfers/verify",
        { providerTransactionId: "transfer:12345" },
      );
      assert.equal(response.status, 200);
      assert.equal(providerCalls.length, 1);
      assert.equal(
        providerCalls[0].url,
        "https://api.flutterwave.com/v3/transfers/transfer%3A12345",
      );
      assert.equal(providerCalls[0].options.method, "GET");
      assert.equal(providerCalls[0].options.body, undefined);
    },
    {
      providerFetch: async (url, options) => {
        providerCalls.push({ url, options });
        return defaultProviderFetch();
      },
    },
  );
});

test("returns 504 on provider timeout without retrying", async () => {
  let calls = 0;
  await withWorker(
    async (origin) => {
      const response = await postSigned(
        origin,
        "/v1/transfers/initiate",
        VALID_INITIATION,
      );
      assert.equal(response.status, 504);
      assert.equal((await response.json()).code, "PROVIDER_TIMEOUT");
      assert.equal(calls, 1);
    },
    {
      providerTimeoutMs: 5,
      providerFetch: async (_url, { signal }) => {
        calls += 1;
        await new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        });
      },
    },
  );
});

test("returns 502 on provider network failure without retrying", async () => {
  let calls = 0;
  await withWorker(
    async (origin) => {
      const response = await postSigned(
        origin,
        "/v1/transfers/initiate",
        VALID_INITIATION,
      );
      assert.equal(response.status, 502);
      assert.equal((await response.json()).code, "PROVIDER_UNAVAILABLE");
      assert.equal(calls, 1);
    },
    {
      providerFetch: async () => {
        calls += 1;
        throw new Error("mock network unavailable");
      },
    },
  );
});

test("forwards provider responses without worker outcome headers or retries", async () => {
  let calls = 0;
  await withWorker(
    async (origin) => {
      const response = await postSigned(
        origin,
        "/v1/transfers/initiate",
        VALID_INITIATION,
      );
      assert.equal(response.status, 500);
      assert.equal(
        response.headers.get(PRE_PROVIDER_REJECTION_HEADER),
        null,
      );
      assert.equal(calls, 1);
    },
    {
      providerFetch: async () => {
        calls += 1;
        return new Response(
          JSON.stringify({ status: "error", message: "provider error" }),
          { status: 500 },
        );
      },
    },
  );
});

test("keeps a malformed provider response non-object and ambiguous", async () => {
  let calls = 0;
  await withWorker(
    async (origin) => {
      const response = await postSigned(
        origin,
        "/v1/transfers/initiate",
        VALID_INITIATION,
      );
      assert.equal(response.status, 400);
      assert.equal(await response.json(), null);
      assert.equal(calls, 1);
    },
    {
      providerFetch: async () => {
        calls += 1;
        return new Response("not-json", { status: 400 });
      },
    },
  );
});

test("does not call the provider when HMAC validation fails", async () => {
  let calls = 0;
  await withWorker(
    async (origin) => {
      const response = await fetch(
        `${origin}/v1/transfers/verify`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ providerTransactionId: "12345" }),
        },
      );
      assert.equal(response.status, 401);
      assert.equal(calls, 0);
    },
    { providerFetch: async () => { calls += 1; } },
  );
});

test("does not call the provider when schema validation fails", async () => {
  let calls = 0;
  await withWorker(
    async (origin) => {
      const response = await postSigned(
        origin,
        "/v1/transfers/verify",
        { providerTransactionId: "../arbitrary-path" },
      );
      assert.equal(response.status, 400);
      assert.equal(
        response.headers.get(PRE_PROVIDER_REJECTION_HEADER),
        null,
      );
      assert.equal(calls, 0);
    },
    { providerFetch: async () => { calls += 1; } },
  );
});
