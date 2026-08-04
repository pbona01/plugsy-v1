import assert from "node:assert/strict";
import test from "node:test";
import { buildOneSignalPayload, getOneSignalConfiguration, sendOneSignal } from "../api/_oneSignal.js";

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
