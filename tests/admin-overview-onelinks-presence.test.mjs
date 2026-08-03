import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminOverviewFailure,
  buildOverviewMetrics,
} from "../shared/admin-overview.js";
import { handleOverviewMetrics } from "../api-handlers/admin.js";

const response = () => {
  const out = { statusCode: 200, headers: {}, body: null };
  return {
    out,
    status(code) { out.statusCode = code; return this; },
    setHeader(key, value) { out.headers[key] = value; },
    json(body) { out.body = body; return body; },
  };
};

test("overview separates authoritative Clerk users from synced profiles", () => {
  const metrics = buildOverviewMetrics({
    clerkCount: 524,
    profiles: Array.from({ length: 417 }, (_, index) => ({ id: `profile-${index}` })),
    orders: [],
    portfolioPurchases: [],
    chats: [],
  });
  assert.equal(metrics.registeredUsers, 524);
  assert.equal(metrics.syncedProfiles, 417);
});

test("profile-only legacy records cannot inflate registeredUsers", () => {
  const metrics = buildOverviewMetrics({
    clerkCount: 524,
    profiles: [{ id: "legacy-profile", clerk_id: "" }],
    orders: [], portfolioPurchases: [], chats: [],
  });
  assert.equal(metrics.registeredUsers, 524);
});

test("overview definitions preserve paid volume, subscriptions, pending deliveries and canonical chats", () => {
  const metrics = buildOverviewMetrics({
    clerkCount: 2,
    profiles: [],
    orders: [
      { id: "o1", status: "paid", amount: "100", delivery_status: "pending_login", product_name: "CapCut" },
      { id: "o2", status: "paid", amount: "50", delivery_status: "pending_login", product_name: "Medal" },
      { id: "o3", status: "completed", amount: "25", delivery_status: "login_sent", subscription_expires_at: "2099-01-01T00:00:00.000Z" },
    ],
    portfolioPurchases: [{ id: "p1", amount: 10 }],
    chats: [
      { id: "chat-old", user_id: "user_1", status: "open", is_support: true, needs_admin_attention: false, created_at: "2020-01-01" },
      { id: "chat-new", user_id: "user_1", status: "open", is_support: true, needs_admin_attention: true, created_at: "2099-01-01" },
    ],
  });
  assert.equal(metrics.paidVolume, 185);
  assert.equal(metrics.activeSubscriptions, 1);
  assert.equal(metrics.pendingOrders, 1);
  assert.equal(metrics.openSupportChats, 1);
  assert.equal(metrics.actionRequiredChats, 1);
});

test("invalid Clerk count fails instead of becoming zero", () => {
  assert.throws(() => buildOverviewMetrics({ clerkCount: -1, profiles: [], orders: [], portfolioPurchases: [], chats: [] }), AdminOverviewFailure);
});

test("overview endpoint is GET-only and requires authentication", async () => {
  const method = response();
  await handleOverviewMetrics({ method: "POST", headers: {} }, method, {});
  assert.equal(method.out.statusCode, 405);
  const auth = response();
  await handleOverviewMetrics({ method: "GET", headers: {} }, auth, {});
  assert.equal(auth.out.statusCode, 401);
});

test("overview endpoint uses injected Clerk count and returns allowlisted metrics", async () => {
  const rows = {
    profiles: [{ id: "profile-1", clerk_id: "user_1", full_name: "A", username: "a" }],
    orders: [{ id: "order-1", status: "paid", amount: 20, product_name: "CapCut" }],
    portfolio_purchases: [],
    chats: [],
  };
  const supabase = {
    from(table) {
      const state = { table, head: false };
      const builder = {
        select(_fields, options) { state.head = options?.head === true; return builder; },
        order() { return builder; },
        range(from, to) { return Promise.resolve({ data: (rows[state.table] || []).slice(from, to + 1), error: null }); },
        then(resolve, reject) {
          if (state.head) return Promise.resolve({ count: (rows[state.table] || []).length, error: null }).then(resolve, reject);
          return Promise.resolve({ data: rows[state.table] || [], error: null }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const res = response();
  await handleOverviewMetrics(
    { method: "GET", headers: { authorization: "Bearer token" } },
    res,
    { authenticate: async () => ({ userId: "user_admin" }), authorize: async () => true, supabase, secretKey: "sk_test", getClerkCount: async () => 524 },
  );
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.body.metrics.registeredUsers, 524);
  assert.equal(res.out.body.metrics.syncedProfiles, 1);
  assert.deepEqual(Object.keys(res.out.body.metrics).sort(), ["actionRequiredChats", "activeSubscriptions", "openSupportChats", "paidVolume", "pendingOrders", "publishedOneLinks", "registeredUsers", "syncedProfiles", "totalOrders"].sort());
});
