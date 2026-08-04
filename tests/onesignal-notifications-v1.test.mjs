import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { buildOneSignalPayload, deterministicEventUuid, getOneSignalConfiguration, sendOneSignal } from "../api/_oneSignal.js";

const originalFetch = global.fetch;
const originalEnv = { ...process.env };
const restore = () => { process.env = { ...originalEnv }; global.fetch = originalFetch; };

test("uses current OneSignal endpoint and Key authentication", async () => {
  process.env.ONESIGNAL_APP_ID = "app"; process.env.ONESIGNAL_APP_API_KEY = "preferred"; delete process.env.ONESIGNAL_REST_API_KEY;
  let request;
  global.fetch = async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ id: "message-1" }), { status: 200 }); };
  const result = await sendOneSignal({ title: "Title", body: "Body", url: "/dashboard", targeting: { included_segments: ["Subscribed Users"] } });
  assert.equal(result.ok, true); assert.equal(request.url, "https://api.onesignal.com/notifications"); assert.equal(request.options.headers.Authorization, "Key preferred"); assert.match(request.options.body, /"target_channel":"push"/); restore();
});

test("prefers App API key and reports fallback without exposing it", () => {
  process.env.ONESIGNAL_APP_ID = "app"; process.env.ONESIGNAL_APP_API_KEY = "preferred"; process.env.ONESIGNAL_REST_API_KEY = "deprecated";
  const configuration = getOneSignalConfiguration(); assert.equal(configuration.appApiKey, "preferred"); assert.equal(configuration.deprecatedKeyFallbackActive, false); assert.equal(JSON.stringify(configuration).includes("preferred"), true); restore();
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
  global.fetch = async (_url, options) => { const payload = JSON.parse(options.body); assert.equal(payload.idempotency_key, deterministicEventUuid("message", "m1")); assert.equal(options.headers["Idempotency-Key"], undefined); return new Response(JSON.stringify({ id: "accepted" }), { status: 200 }); };
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

test("transactional source paths use derived authenticated actions", async () => {
  const [api, admin, chat, portfolio, dashboard] = await Promise.all([
    readFile(new URL("../api/notifications.js", import.meta.url), "utf8"),
    readFile(new URL("../api-handlers/admin.js", import.meta.url), "utf8"),
    readFile(new URL("../src/services/chatService.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/PublicPortfolio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../src/pages/Dashboard.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(api, /action === "notify-message"/);
  assert.match(api, /action === "notify-portfolio-reaction"/);
  assert.match(api, /message\.sender_id !== actor\.userId/);
  assert.match(api, /deterministicEventUuid\("message", message\.id\)/);
  assert.match(admin, /sendOneSignal\(/);
  assert.doesNotMatch(admin, /api\/notifications\?action=.*send/);
  assert.match(chat, /action=notify-message/);
  assert.match(portfolio, /action=notify-portfolio-reaction/);
  assert.match(dashboard, /action=send-test-to-self/);
  assert.doesNotMatch(chat, /action=unavailable/);
});

test("service worker remains badge-only", async () => {
  const worker = await readFile(new URL("../public/onesignal-badge-sw.js", import.meta.url), "utf8");
  assert.doesNotMatch(worker, /showNotification/);
  const vite = await readFile(new URL("../vite.config.ts", import.meta.url), "utf8");
  assert.match(vite, /OneSignalSDK\.sw\.js/); assert.match(vite, /onesignal-badge-sw\.js/);
});
