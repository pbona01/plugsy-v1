import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { Readable } from "node:stream";
import test from "node:test";

import {
  getFlutterwaveEventName,
  normalizeFlutterwaveChargeStatus,
  prepareJsonRequestBody,
  processWalletFundingWebhook,
  validateFlutterwaveWebhookSignature,
} from "../api/_walletFundingWebhook.js";

const secretHash = "local-test-secret-hash";

const modernSignature = (body) =>
  createHmac("sha256", secretHash)
    .update(body)
    .digest("base64");

const validate = ({
  headers = {},
  rawBody = null,
  secret = secretHash,
}) =>
  validateFlutterwaveWebhookSignature({
    headers,
    rawBody,
    secretHash: secret,
  });

const read = (path) =>
  fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const fundingHarness = ({
  incomingStatus,
  verifiedStatus,
  eventField = "type",
}) => {
  const reference = "wallet_fund_local_signature_test";
  const eqCalls = [];
  const rpcCalls = [];

  const query = {
    select() {
      return this;
    },
    eq(column, value) {
      eqCalls.push([column, value]);
      return this;
    },
    async maybeSingle() {
      return {
        data: {
          id: "transaction-id",
          user_id: "stored-user",
          user_email: "stored@example.test",
          type: "fund",
          amount: 1250,
          status: "pending",
          reference,
          balance_before: null,
          balance_after: null,
          provider_transaction_id: null,
          currency: "NGN",
        },
        error: null,
      };
    },
  };

  const supabase = {
    from(table) {
      assert.equal(table, "wallet_transactions");
      return query;
    },
    async rpc(name, args) {
      rpcCalls.push([name, args]);
      return {
        data: {
          success: true,
          already_processed: false,
          reference,
        },
        error: null,
      };
    },
  };

  const event = {
    [eventField]: "charge.completed",
    data: {
      tx_ref: reference,
      amount: 1250,
      status: incomingStatus,
    },
  };

  const verifyReference = async (verifiedReference) => {
    assert.equal(verifiedReference, reference);
    return {
      status: "success",
      data: {
        id: "flutterwave-transaction-id",
        tx_ref: reference,
        amount: 1250,
        currency: "NGN",
        status: verifiedStatus,
      },
    };
  };

  return {
    eqCalls,
    event,
    reference,
    rpcCalls,
    supabase,
    verifyReference,
  };
};

test("valid legacy verif-hash is accepted", () => {
  assert.deepEqual(
    validate({
      headers: { "verif-hash": secretHash },
    }),
    { configured: true, valid: true },
  );
});

test("invalid legacy verif-hash is rejected", () => {
  assert.deepEqual(
    validate({
      headers: { "verif-hash": "incorrect" },
    }),
    { configured: true, valid: false },
  );
});

test("valid modern flutterwave-signature HMAC is accepted", () => {
  const rawBody = Buffer.from('{"event":"charge.completed"}');

  assert.equal(
    validate({
      headers: {
        "flutterwave-signature": modernSignature(rawBody),
      },
      rawBody,
    }).valid,
    true,
  );
});

test("invalid modern HMAC is rejected", () => {
  const rawBody = Buffer.from('{"event":"charge.completed"}');

  assert.equal(
    validate({
      headers: {
        "flutterwave-signature": "invalid-base64-signature",
      },
      rawBody,
    }).valid,
    false,
  );
});

test("tampering with the raw body invalidates the modern HMAC", () => {
  const signedBody = Buffer.from('{"amount":1250}');
  const tamperedBody = Buffer.from('{"amount":1251}');

  assert.equal(
    validate({
      headers: {
        "flutterwave-signature": modernSignature(signedBody),
      },
      rawBody: tamperedBody,
    }).valid,
    false,
  );
});

test("missing signature headers fail closed", () => {
  assert.deepEqual(
    validate({
      rawBody: Buffer.from("{}"),
    }),
    { configured: true, valid: false },
  );
});

test("missing secret hash fails closed as unconfigured", () => {
  assert.deepEqual(
    validate({
      headers: { "verif-hash": secretHash },
      secret: "",
    }),
    { configured: false, valid: false },
  );
});

test("modern validation uses exact bytes, not JSON.stringify of parsed JSON", () => {
  const rawBody = Buffer.from(
    '{\n  "data": { "amount": 1250 }\n}\n',
  );
  const signature = modernSignature(rawBody);
  const reconstructed = Buffer.from(
    JSON.stringify(JSON.parse(rawBody.toString("utf8"))),
  );

  assert.equal(
    validate({
      headers: { "flutterwave-signature": signature },
      rawBody,
    }).valid,
    true,
  );
  assert.equal(
    validate({
      headers: { "flutterwave-signature": signature },
      rawBody: reconstructed,
    }).valid,
    false,
  );
});

test("event.type charge.completed is recognized", () => {
  assert.equal(
    getFlutterwaveEventName({
      type: "charge.completed",
    }),
    "charge.completed",
  );
});

test("succeeded is normalized for incoming and verified charge statuses", async () => {
  assert.equal(
    normalizeFlutterwaveChargeStatus("succeeded"),
    "successful",
  );

  const harness = fundingHarness({
    incomingStatus: "succeeded",
    verifiedStatus: "succeeded",
  });

  const result = await processWalletFundingWebhook({
    supabase: harness.supabase,
    event: harness.event,
    verifyReference: harness.verifyReference,
  });

  assert.equal(result.body.credited, true);
  assert.deepEqual(harness.eqCalls, [
    ["reference", harness.reference],
    ["type", "fund"],
  ]);
  assert.equal(
    harness.rpcCalls[0][0],
    "fulfill_wallet_funding_v2",
  );
  assert.equal(
    harness.rpcCalls[0][1].p_provider_status,
    "successful",
  );
});

test("legacy event and successful status remain supported", async () => {
  const harness = fundingHarness({
    incomingStatus: "successful",
    verifiedStatus: "successful",
    eventField: "event",
  });

  const result = await processWalletFundingWebhook({
    supabase: harness.supabase,
    event: harness.event,
    verifyReference: harness.verifyReference,
  });

  assert.equal(result.handled, true);
  assert.equal(result.body.credited, true);
  assert.equal(harness.rpcCalls.length, 1);
});

test("normal actions receive parsed JSON while exact bytes remain available", async () => {
  const rawBody = Buffer.from(
    '{\n  "accountNumber": "0123456789",\n  "bankCode": "044"\n}',
  );
  const req = Readable.from([
    rawBody.subarray(0, 17),
    rawBody.subarray(17),
  ]);

  const body = await prepareJsonRequestBody(req);

  assert.deepEqual(body, {
    accountNumber: "0123456789",
    bankCode: "044",
  });
  assert.equal(req.body, body);
  assert.deepEqual(req.rawBody, rawBody);
});

test("both funding webhook endpoints use the same raw reader and validator", () => {
  const wallet = read("api/wallet.js");
  const payments = read("api/payments.js");

  for (const source of [wallet, payments]) {
    assert.match(
      source,
      /export const config = \{[\s\S]*bodyParser: false/,
    );
  }

  for (const source of [wallet, payments]) {
    assert.match(source, /readExactRawRequestBody\(req\)/);
    assert.match(source, /readExactRawRequestBody\(req\)/);
    assert.match(source, /requireFlutterwaveWebhookSignature\(/);
    assert.match(source, /parseJsonRequestBody\(req\)/);
    assert.doesNotMatch(
      source,
      /JSON\.stringify\(req\.body\)/,
    );
  }
});

test("signature values, headers, raw bodies, and complete events are not logged", () => {
  const helper = read("api/_walletFundingWebhook.js");
  const wallet = read("api/wallet.js");
  const payments = read("api/payments.js");
  const activeSource =
    helper + "\n" + wallet + "\n" + payments;

  assert.doesNotMatch(
    activeSource,
    /console\.(?:log|error|warn)\([^)]*(?:req\.headers|req\.body|rawBody|modernSignature|legacySignature|secretHash)/,
  );
  assert.doesNotMatch(
    activeSource,
    /console\.(?:log|error|warn)\([^)]*JSON\.stringify\(event\)/,
  );
});

test("both supplied signature formats are independently evaluated", () => {
  const rawBody = Buffer.from('{"data":{"amount":1250}}');
  const signature = modernSignature(rawBody);

  assert.equal(
    validate({
      headers: {
        "flutterwave-signature": "incorrect",
        "verif-hash": secretHash,
      },
      rawBody,
    }).valid,
    true,
  );
  assert.equal(
    validate({
      headers: {
        "flutterwave-signature": signature,
        "verif-hash": "incorrect",
      },
      rawBody,
    }).valid,
    true,
  );
});

test("funding and commerce containment guards remain present", () => {
  const helper = read("api/_walletFundingWebhook.js");
  const wallet = read("api/wallet.js");
  const payments = read("api/payments.js");
  const portfolio = read("api/portfolio.js");
  const processor = helper.slice(
    helper.indexOf(
      "export async function processWalletFundingWebhook",
    ),
  );

  assert.match(
    helper,
    /WALLET_FUNDING_V2_ENABLED[\s\S]*!==[\s\S]*"true"/,
  );
  assert.match(wallet, /handleWithdrawal/);
  assert.match(wallet, /processWithdrawalWebhook/);
  assert.match(read("api/_walletCommerce.js"), /purchase_wallet_product_v2/);
  assert.match(payments, /SPLIT_WALLET_PURCHASE_RETIRED/);
  assert.match(payments, /NON_WALLET_PROVIDER_CHARGE_BLOCKED/);
  assert.match(read("api/_walletCommerce.js"), /purchase_portfolio_wallet_v2/);
  assert.match(processor, /fulfill_wallet_funding_v2/);
  assert.doesNotMatch(processor, /\.from\("profiles"\)/);
});
