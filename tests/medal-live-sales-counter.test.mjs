import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  classifyMedalOrder,
  countQualifyingMedalSalesFromRows,
  handleMedalSales,
  handleMedalStatus,
} from "../api/_walletCommerce.js";

const plans = [
  { id: "plan-medal", wallet_product_type: "medal", category: "other" },
  { id: "plan-category", wallet_product_type: "wallet", category: "medal_15k" },
];
const order = (overrides = {}) => ({ id: crypto.randomUUID(), status: "paid", ...overrides });

test("authoritative classifier counts current and legacy medal sales", () => {
  const rows = [
    order({ id: "current", product_type: "medal" }),
    order({ id: "completed", status: "completed", product_type: "medal" }),
    order({ id: "legacy", product_name: "Plugsy Gold Medal" }),
    order({ id: "plan", plan_id: "plan-category", product_name: "Premium" }),
  ];
  assert.equal(countQualifyingMedalSalesFromRows(rows, plans).totalSold, 4);
});

test("orders matching multiple rules count exactly once", () => {
  const result = countQualifyingMedalSalesFromRows([
    order({ id: "same", product_type: "medal", plan_id: "plan-medal", product_name: "Medal" }),
  ], plans);
  assert.equal(result.totalSold, 1);
  assert.equal(classifyMedalOrder(result.qualifyingOrders[0].order, result.plansById).qualifies, true);
});

test("non-qualifying statuses and arbitrary numeric products are excluded", () => {
  const rows = [
    order({ id: "pending", status: "pending", product_name: "Gold Medal" }),
    order({ id: "failed", status: "failed", product_type: "medal" }),
    order({ id: "cancelled", status: "cancelled", product_name: "Medal" }),
    order({ id: "refunded", status: "refunded", product_name: "Medal" }),
    order({ id: "number", product_name: "Premium 20k" }),
  ];
  assert.equal(countQualifyingMedalSalesFromRows(rows, plans).totalSold, 0);
});

const response = () => {
  const out = { statusCode: 200, headers: {}, body: null };
  return {
    out,
    status(code) { out.statusCode = code; return this; },
    setHeader(key, value) { out.headers[key] = value; },
    json(body) { out.body = body; return body; },
  };
};

const fakeClient = {};
const invoke = (req, dependencies = {}) => {
  const res = response();
  return handleMedalSales(req, res, {
    getWalletServiceClient: () => fakeClient,
    ...dependencies,
  }).then(() => res.out);
};

test("public endpoint is GET-only and needs no userId", async () => {
  assert.equal((await invoke({ method: "POST", query: {} })).statusCode, 405);
  const result = await invoke({ method: "GET", query: {} }, {
    countQualifyingMedalSales: async () => ({ ok: true, totalSold: 3 }),
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ["capacity", "remaining", "soldOut", "success", "totalSold", "updatedAt"].sort());
  assert.equal(result.body.totalSold, 3);
});

test("public endpoint safely classifies provider failures and invalid counts", async () => {
  assert.equal((await invoke({ method: "GET", query: {} }, { countQualifyingMedalSales: async () => ({ ok: false }) })).statusCode, 503);
  assert.equal((await invoke({ method: "GET", query: {} }, { countQualifyingMedalSales: async () => ({ ok: true, totalSold: "3" }) })).body.code, "MEDAL_SALES_INVALID_RESULT");
});

test("medal status uses the shared sales definition", async () => {
  const profileBuilder = {
    select() { return this; },
    eq() { return this; },
    async maybeSingle() { return { data: { medal_tier: null, medal_number: null }, error: null }; },
  };
  const result = response();
  await handleMedalStatus({ method: "GET", query: { userId: "user_12345" } }, result, {
    getWalletServiceClient: () => ({ from: () => profileBuilder }),
    countQualifyingMedalSales: async () => ({ ok: true, totalSold: 2, qualifyingOrders: [{ order: { id: "x", user_id: "user_12345", product_name: "Gold Medal", status: "paid" }, classification: { legacyNameMatch: true } }] }),
  });
  assert.equal(result.out.body.totalSold, 2);
  assert.equal(result.out.body.medal.name, "Plugsy Gold Medal");
});

test("Medals page uses only the public aggregate and protects refresh state", () => {
  const source = fs.readFileSync(new URL("../src/pages/Medals.tsx", import.meta.url), "utf8");
  assert.match(source, /get-medal-sales/);
  assert.doesNotMatch(source, /from\(["']orders["']\)/);
  assert.match(source, /useState<number \| null>\(null\)/);
  assert.match(source, /AbortController/);
  assert.match(source, /visibilitychange/);
  assert.match(source, /setInterval\(.*10000/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Math\.min\(\(totalSold \/ MEDAL_CAPACITY\) \* 100, 100\)/);
});
