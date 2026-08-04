import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildOneSignalPayload, deterministicEventUuid, getOneSignalConfiguration, sendOneSignal } from "../api/_oneSignal.js";
import { canonicalClerkId, classifyCallRecipients, classifyVerifiedAudience, mapBounded } from "../api/_recipient.js";
import { createNotificationOperationCoordinator, notificationDraftKey } from "../src/utils/notificationOperation.js";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const restore = () => { process.env = { ...originalEnv }; global.fetch = originalFetch; };

test("uses current OneSignal endpoint and Key authentication", async () => {
  process.env.ONESIGNAL_APP_ID = "app"; process.env.ONESIGNAL_APP_API_KEY = "preferred"; delete process.env.ONESIGNAL_REST_API_KEY;
  let request;
  global.fetch = async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ id: "11111111-1111-5111-8111-111111111111" }), { status: 200 }); };
  const result = await sendOneSignal({ title: "Title", body: "Body", url: "/dashboard", targeting: { included_segments: ["Subscribed Users"] } });
  assert.equal(result.ok, true); assert.equal(request.url, "https://api.onesignal.com/notifications"); assert.equal(request.options.headers.Authorization, "Key preferred"); assert.match(request.options.body, /"target_channel":"push"/); restore();
});

test("prefers App API key and reports fallback without exposing it", () => {
  process.env.ONESIGNAL_APP_ID = "app"; process.env.ONESIGNAL_APP_API_KEY = "preferred"; process.env.ONESIGNAL_REST_API_KEY = "deprecated";
  const configuration = getOneSignalConfiguration(); assert.equal(configuration.appApiKey, undefined); assert.equal(configuration.deprecatedKeyFallbackActive, false); assert.equal(JSON.stringify(configuration).includes("preferred"), false); restore();
});

test("maps provider outcomes safely", async () => {
  process.env.ONESIGNAL_APP_ID = "app"; process.env.ONESIGNAL_APP_API_KEY = "key";
  global.fetch = async () => new Response(JSON.stringify({ errors: ["bad request"] }), { status: 400 });
  assert.equal((await sendOneSignal({ title: "a", body: "b", url: "/dashboard", targeting: { include_aliases: { external_id: ["user_abc"] } } })).code, "ONESIGNAL_REQUEST_REJECTED");
  global.fetch = async () => new Response("{}", { status: 200 });
  assert.equal((await sendOneSignal({ title: "a", body: "b", url: "/dashboard", targeting: { include_aliases: { external_id: ["user_abc"] } } })).code, "ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS"); restore();
});

test("rejects mixed targeting and unsafe routes", () => {
  process.env.ONESIGNAL_APP_ID = "app";
  assert.throws(() => buildOneSignalPayload({ title: "a", body: "b", url: "https://evil.example", targeting: { include_aliases: {}, included_segments: [] } })); restore();
});

test("uses JSON idempotency and rejects invalid UUIDs", async () => {
  process.env.ONESIGNAL_APP_ID = "app"; process.env.ONESIGNAL_APP_API_KEY = "key";
  assert.equal(deterministicEventUuid("message", "m1"), deterministicEventUuid("message", "m1"));
  assert.notEqual(deterministicEventUuid("message", "m1"), deterministicEventUuid("message", "m2"));
  global.fetch = async (_url, options) => { const payload = JSON.parse(options.body); assert.equal(payload.idempotency_key, deterministicEventUuid("message", "m1")); assert.equal(options.headers["Idempotency-Key"], undefined); return new Response(JSON.stringify({ id: deterministicEventUuid("message", "m1") }), { status: 200 }); };
  const result = await sendOneSignal({ title: "Title", body: "Body", url: "/dashboard", targeting: { include_aliases: { external_id: ["user_abc"] } }, requestKey: deterministicEventUuid("message", "m1") });
  assert.equal(result.ok, true);
  assert.equal((await sendOneSignal({ title: "Title", body: "Body", url: "/dashboard", targeting: { included_segments: ["Subscribed Users"] }, requestKey: "not-a-uuid" })).code, "ONESIGNAL_REQUEST_REJECTED"); restore();
});

test("does not return provider identifiers on failure", async () => {
  process.env.ONESIGNAL_APP_ID = "app"; process.env.ONESIGNAL_APP_API_KEY = "key";
  global.fetch = async () => new Response(JSON.stringify({ errors: ["subscription_id=secret-sub", "external_id=user_secret"] }), { status: 400 });
  const result = await sendOneSignal({ title: "Title", body: "Body", url: "/dashboard", targeting: { included_segments: ["Subscribed Users"] } });
  assert.equal(result.code, "ONESIGNAL_REQUEST_REJECTED"); assert.equal(JSON.stringify(result).includes("secret-sub"), false); assert.equal(JSON.stringify(result).includes("user_secret"), false); restore();
});

test("classifies provider response shapes without leaking identifiers", async () => {
  process.env.ONESIGNAL_APP_ID = "app"; process.env.ONESIGNAL_APP_API_KEY = "key";
  for (const response of [new Response("not-json", { status: 200 }), new Response("null", { status: 200 }), new Response("[]", { status: 200 }), new Response(JSON.stringify({ id: "not-a-uuid" }), { status: 200 })]) {
    global.fetch = async () => response;
    assert.equal((await sendOneSignal({ title: "a", body: "b", url: "/dashboard", targeting: { included_segments: ["Subscribed Users"] } })).code, "ONESIGNAL_INVALID_RESPONSE");
  }
  global.fetch = async () => new Response(JSON.stringify({ id: "" }), { status: 200 });
  assert.equal((await sendOneSignal({ title: "a", body: "b", url: "/dashboard", targeting: { included_segments: ["Subscribed Users"] } })).code, "ONESIGNAL_NO_ELIGIBLE_SUBSCRIPTIONS");
  restore();
});

test("deferred reaction push has no guessed endpoint and calls remain authenticated", async () => {
  const [api, portfolio, calls, cron] = await Promise.all([
    readFile(new URL("../api/notifications.js", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/PublicPortfolio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../api-handlers/calls.js", import.meta.url), "utf8"),
    readFile(new URL("../api-handlers/bookings.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(api, /portfolio_reactions|notify-portfolio-reaction/);
  assert.doesNotMatch(portfolio, /notify-portfolio-reaction/);
  assert.match(portfolio, /vp_add_reaction/);
  assert.match(calls, /requireVerifiedClerkUser/);
  assert.doesNotMatch(calls, /Access-Control-Allow-Origin/);
  assert.match(cron, /CRON_SECRET/);
});

test("transactional source paths use derived authenticated actions", async () => {
  const [api, admin, chat, portfolio, dashboard] = await Promise.all([
    readFile(new URL("../api/notifications.js", import.meta.url), "utf8"),
    readFile(new URL("../api-handlers/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../src/services/chatService.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/PublicPortfolio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/Dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /action === "notify-message"/);
  assert.doesNotMatch(api, /notify-portfolio-reaction/);
  assert.match(api, /message\.sender_id !== actor\.userId/);
  assert.match(api, /deterministicEventUuid\("message", message\.id\)/);
  assert.match(admin, /sendOneSignal\(/);
  assert.doesNotMatch(admin, /api\/notifications\?action=.*send/);
  assert.match(chat, /action=notify-message/);
  assert.doesNotMatch(portfolio, /notify-portfolio-reaction/);
  assert.match(dashboard, /requestOneSignalPermission/);
  assert.doesNotMatch(chat, /action=unavailable/);
});

test("service worker remains badge-only", async () => {
  const worker = await readFile(new URL("../public/onesignal-badge-sw.js", import.meta.url), "utf8");
  assert.doesNotMatch(worker, /showNotification/);
  const vite = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(vite, /OneSignalSDK\.sw\.js/); assert.match(vite, /onesignal-badge-sw\.js/);
});

test("canonical membership helpers resolve and deduplicate historical IDs", async () => {
  assert.equal(canonicalClerkId("user_abc"), "user_abc");
  assert.equal(canonicalClerkId("profile-uuid"), "");
  const queries = [];
  const supabase = { from: () => ({ select: () => ({ eq: (_field, value) => ({ maybeSingle: async () => { queries.push(value); return { data: { clerk_id: value === "profile-1" ? "user_profile" : null } }; } }) }) }) };
  const { canonicalizeChatMembers } = await import("../api/_recipient.js");
  const ids = await canonicalizeChatMembers(supabase, [{ user_id: "user_direct" }, { user_id: "profile-1" }, { user_id: "profile-1" }, { user_id: "unknown" }]);
  assert.deepEqual(ids.sort(), ["user_direct", "user_profile"].sort());
  assert.equal(queries.length, 2);
});

test("bounded canonical mapping and recipient exclusion are executable", async () => {
  let inFlight = 0; let peak = 0;
  const values = await mapBounded([1, 2, 3, 4, 5], async (value) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((resolve) => setTimeout(resolve, 1)); inFlight--; return value * 2; }, 2);
  assert.deepEqual(values, [2, 4, 6, 8, 10]); assert.ok(peak <= 2);
  assert.deepEqual(classifyCallRecipients("dm", ["user_actor", "user_other", "user_other"], "user_actor"), ["user_other"]);
  assert.deepEqual(classifyCallRecipients("dm", ["user_actor", "user_one", "user_two"], "user_actor"), []);
  assert.deepEqual(classifyCallRecipients("group", ["user_actor", "user_one", "user_one"], "user_actor"), ["user_one"]);
});

test("verified audience classification uses profile OR Clerk admin authority and enforces the provider limit", () => {
  const audience = classifyVerifiedAudience(["user_aaa", "user_bbb", "user_bbb", "user_ccc"], new Set(["user_aaa"]), new Set(["user_bbb"]));
  assert.deepEqual(audience.admin.sort(), ["user_aaa", "user_bbb"]); assert.deepEqual(audience.user, ["user_ccc"]);
  assert.equal(classifyVerifiedAudience(Array.from({ length: 20001 }, (_, i) => `user_${String(i).padStart(3, "0")}`)).code, "AUDIENCE_LIMIT_EXCEEDED");
});

test("broadcast draft operation retains ambiguous UUID and replaces it only on draft change", () => {
  const keys = ["11111111-1111-5111-8111-111111111111", "22222222-2222-5222-8222-222222222222"];
  const coordinator = createNotificationOperationCoordinator(() => keys.shift());
  const draft = { title: "a", body: "b", url: "/dashboard", target: "all", mode: "broadcast" };
  const first = coordinator.begin(draft); assert.equal(first, coordinator.ambiguous()); assert.equal(coordinator.begin(draft), first);
  coordinator.accepted(); const second = coordinator.begin(draft); assert.notEqual(second, first);
  assert.notEqual(notificationDraftKey(draft), notificationDraftKey({ ...draft, body: "changed" }));
});

test("message and client source paths contain only actor-scoped message IDs", async () => {
  const chat = await readFile(new URL("../src/services/chatService.ts", import.meta.url), "utf8");
  const personal = await readFile(new URL("../src/pages/PersonalChat.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(chat, /if \(false\)|playerIds|userId:.*\n.*notify-message/);
  assert.match(chat, /body: JSON\.stringify\(\{ messageId: createdMsgId \}\)/);
  assert.doesNotMatch(personal, /playerIds/);
});

test("unresolved canonical identities are excluded rather than substituted", () => {
  const result = classifyCallRecipients("group", ["user_valid", "profile_uuid", "user_valid"], "user_actor");
  assert.deepEqual(result, ["user_valid"]);
});

test("legacy missing chat type remains support-compatible in source", async () => {
  const calls = await readFile(new URL("../api-handlers/calls.js", import.meta.url), "utf8");
  assert.match(calls, /isSupportChat/);
  assert.match(await readFile(new URL("../api/_recipient.js", import.meta.url), "utf8"), /dm.*group.*channel/);
});

test("DM recipient classification rejects stale extra membership", () => {
  assert.deepEqual(classifyCallRecipients("dm", ["user_actor", "user_one", "user_two"], "user_actor"), []);
});

test("group and channel recipients exclude the sender", () => {
  assert.deepEqual(classifyCallRecipients("group", ["user_actor", "user_one", "user_two"], "user_actor"), ["user_one", "user_two"]);
  assert.deepEqual(classifyCallRecipients("channel", ["user_actor", "user_one"], "user_actor"), ["user_one"]);
});

test("profile and Clerk admin authorities are independently additive", () => {
  const result = classifyVerifiedAudience(["user_aaa", "user_bbb", "user_ccc"], new Set(["user_aaa"]), new Set(["user_bbb"]));
  assert.equal(result.admin.includes("user_aaa"), true); assert.equal(result.admin.includes("user_bbb"), true); assert.equal(result.user.includes("user_ccc"), true);
});

test("audience deduplication is complete beyond the old 2,000 boundary", () => {
  const ids = Array.from({ length: 3000 }, (_, i) => `user_${String(i).padStart(4, "0")}`);
  const result = classifyVerifiedAudience(ids);
  assert.equal(result.user.length, 3000);
});

test("subscription actions are actor scoped and preserve compatible JSON fields", async () => {
  const api = await readFile(new URL("../api/notifications.js", import.meta.url), "utf8");
  assert.match(api, /unregister-subscription/); assert.match(api, /eq\("user_id", actor\.userId\)/); assert.match(api, /playerId: subscriptionId/);
});

test("NotificationBell owns refresh generation and disposed state", async () => {
  const bell = await readFile(new URL("../src/components/NotificationBell.tsx", import.meta.url), "utf8");
  assert.match(bell, /useRef/); assert.match(bell, /disposed/); assert.match(bell, /generation/); assert.match(bell, /await initOneSignal/);
});

test("only the serialized identity coordinator performs SDK login", async () => {
  const onesignal = await readFile(new URL("../src/utils/onesignal.ts", import.meta.url), "utf8");
  assert.equal((onesignal.match(/OneSignal\.login\(/g) || []).length, 1); assert.match(onesignal, /serializedLogin/); assert.match(onesignal, /identityGeneration/);
});

test("broadcast operation does not overlap and keeps ambiguous ownership", async () => {
  const broadcast = await readFile(new URL("../src/pages/AdminBroadcast.tsx", import.meta.url), "utf8");
  assert.match(broadcast, /if \(sending/); assert.match(broadcast, /AbortController/); assert.match(broadcast, /operation\.current\.begin/); assert.match(broadcast, /requestKey/);
});
