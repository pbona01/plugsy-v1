import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminOverviewFailure,
  buildOverviewMetrics,
  fetchBoundedRows,
  collectPublishedOneLinks,
  parseMoneyToKobo,
} from "../shared/admin-overview.js";
import { handleOverviewMetrics } from "../api-handlers/admin.js";
import { handleListPublishedOneLinks } from "../api-handlers/admin.js";
import { getPublishedOneLinkRecord } from "../shared/admin-overview.js";
import fs from "node:fs";
import { extractCanonicalClerkIds, presenceStatusForChannelEvent } from "../shared/presence.js";
import { createOwnedRequestCoordinator } from "../shared/admin-refresh.js";

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
  assert.equal(metrics.subscriptionPaidVolume, 175);
  assert.equal(metrics.portfolioPaidVolume, 10);
  assert.equal(metrics.paidVolume, metrics.subscriptionPaidVolume + metrics.portfolioPaidVolume);
});

test("fractional revenue uses exact kobo arithmetic while counts stay integral", () => {
  const metrics = buildOverviewMetrics({
    clerkCount: 524,
    profiles: [],
    orders: [{ id: "o1", status: "paid", amount: "1058171.29" }],
    portfolioPurchases: [{ id: "p1", amount: 165450 }],
    chats: [],
  });
  assert.equal(metrics.subscriptionPaidVolume, 1058171.29);
  assert.equal(metrics.portfolioPaidVolume, 165450);
  assert.equal(metrics.paidVolume, 1223621.29);
  assert.equal(metrics.paidVolume, metrics.subscriptionPaidVolume + metrics.portfolioPaidVolume);
  assert.equal(parseMoneyToKobo("1058171.29"), 105817129);
  assert.equal(parseMoneyToKobo(0), 0);
  assert.equal(parseMoneyToKobo(""), null);
  assert.equal(parseMoneyToKobo("1.234"), null);
  assert.equal(parseMoneyToKobo("-1"), null);
  assert.equal(parseMoneyToKobo("Infinity"), null);
  assert.equal(parseMoneyToKobo("90071992547409.92"), null);
  assert.throws(() => buildOverviewMetrics({ clerkCount: 1.5, profiles: [], orders: [], portfolioPurchases: [], chats: [] }), AdminOverviewFailure);
  assert.throws(() => buildOverviewMetrics({ clerkCount: 1, totalOrders: 1.5, profiles: [], orders: [], portfolioPurchases: [], chats: [] }), AdminOverviewFailure);
  assert.throws(() => buildOverviewMetrics({ clerkCount: 1, profiles: [], orders: [{ status: "paid", amount: "" }], portfolioPurchases: [], chats: [] }), AdminOverviewFailure);
  assert.throws(() => buildOverviewMetrics({ clerkCount: 1, profiles: [], orders: [{ status: "paid", amount: "not-a-number" }], portfolioPurchases: [], chats: [] }), AdminOverviewFailure);
  assert.throws(() => buildOverviewMetrics({ clerkCount: 1, profiles: [], orders: [{ status: "paid", amount: "1.234" }], portfolioPurchases: [], chats: [] }), AdminOverviewFailure);
});

test("canonical support chat activity and tie-breakers are authoritative", () => {
  const base = (id, extra = {}) => ({ id, user_id: "user_support", status: "open", chat_type: null, needs_admin_attention: false, ...extra });
  const latestMessage = base("message", { last_message_at: "2099-01-03", updated_at: "2020-01-01", created_at: "2020-01-01", needs_admin_attention: true });
  const latestUpdated = base("updated", { last_message_at: "2020-01-01", updated_at: "2099-01-02", created_at: "2020-01-01" });
  const latestCreated = base("created", { last_message_at: "2020-01-01", updated_at: "2020-01-01", created_at: "2099-01-01" });
  const tieA = base("a", { last_message_at: "2020-01-01", updated_at: "2020-01-01", created_at: "2020-01-01" });
  const tieB = base("b", { last_message_at: "2020-01-01", updated_at: "2020-01-01", created_at: "2020-01-01", needs_admin_attention: true });
  const result = buildOverviewMetrics({ clerkCount: 1, profiles: [], orders: [], portfolioPurchases: [], chats: [latestMessage, latestUpdated, latestCreated, tieA, tieB, base("dm", { chat_type: "dm" }), base("group", { chat_type: "group" }), base("channel", { chat_type: "channel" })] });
  assert.equal(result.openSupportChats, 1);
  assert.equal(result.actionRequiredChats, 1);
});

test("overview chat query selects canonical persisted support fields", () => {
  const source = fs.readFileSync(new URL("../api-handlers/admin.js", import.meta.url), "utf8");
  assert.match(source, /select\("id,user_id,chat_type,status,needs_admin_attention,last_message_at,updated_at,created_at"\)/);
  assert.doesNotMatch(source, /select\("id,user_id,userId,status,needs_admin_attention,metadata,created_at"\)/);
});

test("Overview revenue rendering has explicit placeholder, split formatter, and stale warning", () => {
  const source = fs.readFileSync(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");
  assert.match(source, /formatOverviewRevenue/);
  assert.match(source, /Refresh failed; showing the last confirmed overview data\./);
  assert.match(source, /new Date\(overviewMetrics\.updatedAt\)\.toLocaleString\(\)/);
  assert.match(source, /subscriptionPaidVolume/);
  assert.match(source, /portfolioPaidVolume/);
  assert.match(source, /maximumFractionDigits: 2/);
});

test("invalid Clerk count fails instead of becoming zero", () => {
  assert.throws(() => buildOverviewMetrics({ clerkCount: -1, profiles: [], orders: [], portfolioPurchases: [], chats: [] }), AdminOverviewFailure);
});

test("bounded rows enforce stable keys, exact counts, duplicate pages, and full-page completeness", async () => {
  const page = (offset) => Array.from({ length: offset === 0 ? 500 : 2 }, (_, index) => ({ id: `id-${offset + index}` }));
  assert.equal((await fetchBoundedRows(async (from) => ({ data: page(from), error: null }), { expectedCount: 502 })).length, 502);
  assert.equal((await fetchBoundedRows(async (from) => ({ data: from < 1000 ? Array.from({ length: 500 }, (_, index) => ({ id: `many-${from + index}` })) : Array.from({ length: 200 }, (_, index) => ({ id: `many-${from + index}` })), error: null }), { expectedCount: 1200 })).length, 1200);
  await assert.rejects(() => fetchBoundedRows(async () => ({ data: [{ id: "same" }], error: null }), { expectedCount: 2 }), /ADMIN_OVERVIEW_RESPONSE_INVALID/);
  await assert.rejects(() => fetchBoundedRows(async (from) => ({ data: from ? [{ id: "id-0" }] : Array.from({ length: 500 }, (_, i) => ({ id: `id-${i}` })), error: null })), /ADMIN_OVERVIEW_RESPONSE_INVALID/);
  await assert.rejects(() => fetchBoundedRows(async (from) => ({ data: from ? null : Array.from({ length: 500 }, (_, i) => ({ id: `later-${i}` })), error: from ? new Error("later") : null })), /ADMIN_OVERVIEW_DATABASE_ERROR/);
  await assert.rejects(() => fetchBoundedRows(async () => ({ data: [{ id: "" }], error: null })), /ADMIN_OVERVIEW_RESPONSE_INVALID/);
});

test("invalid financial values fail while explicit zero remains valid", () => {
  const base = { clerkCount: 1, profiles: [], portfolioPurchases: [], chats: [] };
  assert.equal(buildOverviewMetrics({ ...base, orders: [{ status: "paid", amount: 0 }] }).paidVolume, 0);
  assert.throws(() => buildOverviewMetrics({ ...base, orders: [{ status: "paid", amount: "" }] }), /ADMIN_OVERVIEW_RESPONSE_INVALID/);
  assert.throws(() => buildOverviewMetrics({ ...base, orders: [{ status: "paid", amount: "NaN" }] }), /ADMIN_OVERVIEW_RESPONSE_INVALID/);
});

test("Clerk provider failure has its own stable classification", async () => {
  const res = response();
  const supabase = { from() { const builder = { select() { return builder; }, order() { return builder; }, range() { return Promise.resolve({ data: [], error: null }); }, then(resolve) { return Promise.resolve({ count: 0, error: null }).then(resolve); } }; return builder; } };
  await handleOverviewMetrics({ method: "GET", headers: { authorization: "Bearer token" } }, res, { authenticate: async () => ({ userId: "user_admin" }), authorize: async () => true, supabase, secretKey: "sk_test", getClerkCount: async () => { throw new Error("clerk down"); } });
  assert.equal(res.out.body.code, "ADMIN_OVERVIEW_CLERK_COUNT_FAILED");
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
  assert.deepEqual(Object.keys(res.out.body.metrics).sort(), ["actionRequiredChats", "activeSubscriptions", "openSupportChats", "paidVolume", "pendingOrders", "portfolioPaidVolume", "publishedOneLinks", "registeredUsers", "subscriptionPaidVolume", "syncedProfiles", "totalOrders"].sort());
});

test("published One Link compatibility includes legacy and independent pages only once", () => {
  const legacy = getPublishedOneLinkRecord({ clerk_id: "user_legacy", username: "legacy", full_name: "Legacy", bio: JSON.stringify({ onelink: { theme: "midnight" } }), one_link_updated_at: null, one_link_settings: null });
  const independent = getPublishedOneLinkRecord({ clerk_id: "user_independent", one_link_username: "independent", one_link_updated_at: "2026-01-01T00:00:00Z", one_link_settings: { published: true } });
  const draft = getPublishedOneLinkRecord({ clerk_id: "user_draft", one_link_username: "draft", one_link_updated_at: "2026-01-01T00:00:00Z", one_link_settings: { published: false } });
  assert.equal(legacy.publicationSource, "legacy");
  assert.equal(independent.publicationSource, "independent");
  assert.equal(draft, null);
  const settingsOnly = getPublishedOneLinkRecord({ clerk_id: "user_settings", username: "fallback", one_link_updated_at: "2026-01-01T00:00:00Z", one_link_username: null, one_link_settings: { published: true } });
  assert.equal(settingsOnly, null);
  const mixedLegacy = getPublishedOneLinkRecord({ clerk_id: "user_mixed", username: "legacy_name", one_link_username: "new_name", one_link_updated_at: "2026-01-01T00:00:00Z", one_link_settings: null, bio: JSON.stringify({ onelink: { published: true } }) });
  assert.equal(mixedLegacy, null);
  const mixedLegacyWithoutRevision = getPublishedOneLinkRecord({ clerk_id: "user_mixed_2", username: "legacy_name", one_link_username: "new_name", one_link_updated_at: null, one_link_settings: null, bio: JSON.stringify({ onelink: { published: true } }) });
  assert.equal(mixedLegacyWithoutRevision.username, "new_name");
  assert.equal(mixedLegacyWithoutRevision.publicationSource, "legacy");
  assert.equal(getPublishedOneLinkRecord({ clerk_id: "user_empty", username: "empty", one_link_updated_at: "2026-01-01T00:00:00Z", one_link_settings: {} }), null);
  const profileOnly = collectPublishedOneLinks([{ id: "profile-only", username: "legacy_owner", bio: JSON.stringify({ onelink: {} }), one_link_settings: null, one_link_updated_at: null }]);
  assert.equal(profileOnly.length, 1);
});

test("published One Links endpoint is read-only, allowlisted, and deduplicates owners", async () => {
  const rows = [
    { id: "1", clerk_id: "user_1", username: "legacy", full_name: "Legacy", email: "legacy@example.com", bio: JSON.stringify({ onelink: {} }), one_link_settings: null, one_link_updated_at: null },
    { id: "2", clerk_id: "user_1", one_link_username: "independent", one_link_settings: { published: true }, one_link_updated_at: "2026-01-01T00:00:00Z" },
    { id: "3", clerk_id: "user_3", one_link_username: "draft", one_link_settings: { published: false }, one_link_updated_at: "2026-01-01T00:00:00Z" },
  ];
  const supabase = { from() { const state = { head: false }; const builder = { select(_fields, options) { state.head = options?.head === true; return builder; }, order() { return builder; }, range(from, to) { return Promise.resolve({ data: rows.slice(from, to + 1), error: null }); }, then(resolve, reject) { return Promise.resolve({ count: state.head ? rows.length : null, error: null }).then(resolve, reject); } }; return builder; } };
  const res = response();
  await handleListPublishedOneLinks({ method: "GET", headers: { authorization: "Bearer token" } }, res, { authenticate: async () => ({ userId: "user_admin" }), authorize: async () => true, supabase });
  assert.equal(res.out.statusCode, 200);
  assert.equal(res.out.body.total, 1);
  assert.equal(res.out.body.oneLinks[0].publicationSource, "legacy");
  assert.equal("one_link_settings" in res.out.body.oneLinks[0], false);
});

test("presence exposes canonical Clerk-only aggregate and cleans up channel", () => {
  const source = fs.readFileSync(new URL("../src/contexts/OnlinePresenceContext.tsx", import.meta.url), "utf8");
  const helperSource = fs.readFileSync(new URL("../shared/presence.js", import.meta.url), "utf8");
  assert.match(source, /onlineClerkUserIds/);
  assert.match(source, /onlineSignedInCount/);
  assert.match(helperSource, /\^user_\[A-Za-z0-9_\-\]/);
  assert.doesNotMatch(source, /profile_id\) onlineSet/);
  assert.match(source, /removeChannel\(channel\)/);
  assert.deepEqual([...extractCanonicalClerkIds({ a: [{ clerk_id: "user_abc" }, { clerk_id: "user_abc" }, { profile_id: "user_xyz" }, { clerk_id: "bad" }] })], ["user_abc"]);
  assert.equal(presenceStatusForChannelEvent('SYNC'), 'confirmed');
  assert.equal(presenceStatusForChannelEvent('CHANNEL_ERROR'), 'unavailable');
  assert.equal(presenceStatusForChannelEvent('TIMED_OUT'), 'unavailable');
  assert.equal(presenceStatusForChannelEvent('CLOSED'), 'unavailable');
  assert.equal(presenceStatusForChannelEvent('SUBSCRIBED'), 'connecting');
});

test("owned refresh coordinator cannot let an aborted stale request release a newer guard", async () => {
  const deferred = [];
  const successes = [];
  const coordinator = createOwnedRequestCoordinator({
    request: (signal) => new Promise((resolve, reject) => { signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))); deferred.push({ resolve }); }),
    onSuccess: (value) => successes.push(value),
    onFailure: () => { throw new Error("unexpected failure"); },
  });
  coordinator.start();
  await Promise.resolve();
  coordinator.abort();
  coordinator.start();
  await Promise.resolve();
  assert.equal(coordinator.start(), null);
  deferred[0].resolve("stale");
  deferred[1].resolve("current");
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(successes, ["current"]);
  assert.equal(coordinator.inFlight, false);
});
