import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  classifyMedalOrder,
  countQualifyingMedalSalesFromRows,
  handleMedalSales,
  handleMedalStatus,
  countQualifyingMedalSales,
} from "../api/_walletCommerce.js";
import { createMedalSalesRefreshCoordinator } from "../shared/medalSalesRefresh.js";

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
  const methodFailure = await invoke({ method: "POST", query: {} });
  assert.equal(methodFailure.statusCode, 405);
  assert.equal(methodFailure.headers["Cache-Control"], "no-store");
  const result = await invoke({ method: "GET", query: {} }, {
    countQualifyingMedalSales: async () => ({ ok: true, totalSold: 3 }),
  });
  assert.equal(result.statusCode, 200);
  assert.deepEqual(Object.keys(result.body).sort(), ["capacity", "remaining", "soldOut", "success", "totalSold", "updatedAt"].sort());
  assert.equal(result.body.totalSold, 3);
  assert.equal(result.headers["Cache-Control"], "public, s-maxage=5, stale-while-revalidate=10");
});

test("public endpoint safely classifies provider failures and invalid counts", async () => {
  const databaseFailure = await invoke({ method: "GET", query: {} }, { countQualifyingMedalSales: async () => ({ ok: false }) });
  assert.equal(databaseFailure.statusCode, 503);
  assert.equal(databaseFailure.headers["Cache-Control"], "no-store");
  const invalid = await invoke({ method: "GET", query: {} }, { countQualifyingMedalSales: async () => ({ ok: true, totalSold: "3" }) });
  assert.equal(invalid.body.code, "MEDAL_SALES_INVALID_RESULT");
  assert.equal(invalid.headers["Cache-Control"], "no-store");
  const configuration = response();
  await handleMedalSales({ method: "GET", query: {} }, configuration, { getWalletServiceClient: () => null });
  assert.equal(configuration.out.headers["Cache-Control"], "no-store");
});

function pagedSupabase({ plans: planRows, orders: orderRows, failOn, repeatOn } = {}) {
  let calls = 0;
  return {
    get calls() { return calls; },
    from(table) {
      const filters = {};
      return {
        select() { return this; },
        order() { return this; },
        in(column, values) { filters[column] = values; return this; },
        eq(column, value) { filters[column] = value; return this; },
        ilike(column, value) { filters[column] = value; return this; },
        async range(from, to) {
          calls += 1;
          if (calls === failOn) return { data: null, error: new Error("provider failure") };
          const source = table === "plans" ? (planRows || []) : (orderRows || []);
          let rows = source;
          if (filters.product_type) rows = rows.filter((row) => row.product_type === filters.product_type);
          if (filters.plan_id) rows = rows.filter((row) => filters.plan_id.includes(row.plan_id));
          if (filters.product_name) rows = rows.filter((row) => row.product_name?.toLowerCase().includes("medal"));
          if (filters.status) rows = rows.filter((row) => filters.status.includes(row.status));
          const pageRows = repeatOn && calls === repeatOn
            ? source.slice(0, 500)
            : rows.slice(from, to + 1);
          return { data: pageRows, error: null };
        },
      };
    },
  };
}

test("bounded pagination retrieves all pages, deduplicates queries, and preserves counts above capacity", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => order({ id: `medal-${index}`, product_type: "medal", product_name: "Medal" }));
  const result = await countQualifyingMedalSales(pagedSupabase({ plans, orders: rows }));
  assert.equal(result.ok, true);
  assert.equal(result.totalSold, 1001);
});

test("pagination failure on a later page never returns a partial count", async () => {
  const rows = Array.from({ length: 501 }, (_, index) => order({ id: `medal-${index}`, product_type: "medal" }));
  const result = await countQualifyingMedalSales(pagedSupabase({ plans, orders: rows, failOn: 3 }));
  assert.deepEqual(result, { ok: false, code: "MEDAL_SALES_UNAVAILABLE" });
});

test("malformed, repeated, and exhausted pages are invalid results", async () => {
  const malformed = pagedSupabase({ plans, orders: [order({ id: "x", product_type: "medal" })] });
  const originalFrom = malformed.from.bind(malformed);
  malformed.from = (table) => {
    const builder = originalFrom(table);
    if (table === "orders") builder.range = async () => ({ data: [{ product_type: "medal" }], error: null });
    return builder;
  };
  assert.equal((await countQualifyingMedalSales(malformed)).code, "MEDAL_SALES_INVALID_RESULT");
  const repeatedClient = pagedSupabase({ plans, orders: Array.from({ length: 1000 }, (_, index) => order({ id: `x-${index}`, product_type: "medal" })), repeatOn: 3 });
  const repeated = await countQualifyingMedalSales(repeatedClient);
  assert.equal(repeated.code, "MEDAL_SALES_INVALID_RESULT");
  const exhausted = await countQualifyingMedalSales(pagedSupabase({ plans, orders: Array.from({ length: 500 * 100 + 1 }, (_, index) => order({ id: `x-${index}`, product_type: "medal" })) }));
  assert.equal(exhausted.code, "MEDAL_SALES_INVALID_RESULT");
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
  const refreshSource = fs.readFileSync(new URL("../shared/medalSalesRefresh.js", import.meta.url), "utf8");
  assert.match(source, /get-medal-sales/);
  assert.doesNotMatch(source, /from\(["']orders["']\)/);
  assert.match(source, /useState<number \| null>\(null\)/);
  assert.match(source, /createMedalSalesRefreshCoordinator/);
  assert.match(refreshSource, /visibilitychange/);
  assert.match(refreshSource, /intervalMs = 10000/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /Math\.min\(\(totalSold \/ MEDAL_CAPACITY\) \* 100, 100\)/);
  assert.doesNotMatch(source, /cache:\s*["']no-store["']/);
  assert.doesNotMatch(source, /get-medal-sales[^\n]*[?&]t=/);
});

test("refresh coordinator handles visibility, focus, stale responses, overlap, and cleanup", async () => {
  let visible = true;
  let intervalCallback;
  let intervalCleared = false;
  const listeners = new Map();
  const pending = [];
  const confirmed = [];
  const coordinator = createMedalSalesRefreshCoordinator({
    isVisible: () => visible,
    fetchSales: (signal) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      pending.push({ resolve, reject });
    }),
    onConfirmed: (value) => confirmed.push(value),
    setIntervalFn: (callback) => { intervalCallback = callback; return 1; },
    clearIntervalFn: () => { intervalCleared = true; },
    addWindowListener: (event, listener) => listeners.set(`window:${event}`, listener),
    removeWindowListener: (event) => listeners.delete(`window:${event}`),
    addDocumentListener: (event, listener) => listeners.set(`document:${event}`, listener),
    removeDocumentListener: (event) => listeners.delete(`document:${event}`),
  });
  coordinator.start();
  assert.equal(pending.length, 1);
  pending.shift().resolve(4);
  await Promise.resolve();
  intervalCallback();
  assert.equal(pending.length, 1);
  visible = false;
  intervalCallback();
  assert.equal(pending.length, 1);
  visible = true;
  listeners.get("window:focus")();
  assert.equal(pending.length, 1, "overlapping requests are suppressed");
  pending.shift().resolve(5);
  await Promise.resolve();
  listeners.get("document:visibilitychange")();
  assert.equal(pending.length, 1);
  pending.shift().resolve(6);
  await Promise.resolve();
  assert.deepEqual(confirmed, [4, 5, 6]);
  coordinator.stop();
  assert.equal(intervalCleared, true);
  assert.equal(listeners.size, 0);
});
