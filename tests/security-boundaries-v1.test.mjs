import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("privileged category mutations require verified Clerk admin access", async () => {
  const file = await source("api-handlers/categories.js");
  assert.match(file, /requireVerifiedClerkAdmin/);
  assert.match(file, /await requireAdmin\(req, res, supabase\)/);
  assert.doesNotMatch(file, /Access-Control-Allow-Origin/);
});

test("video upload sessions cannot be created anonymously", async () => {
  const file = await source("api/video.js");
  assert.match(file, /requireVerifiedClerkUser/);
  assert.match(file, /const actor = await requireVerifiedClerkUser\(req, res\)/);
  assert.match(file, /video\/quicktime/);
});

test("standalone server keeps bulk data and internal mail flows admin-only", async () => {
  const file = await source("src/server/server.ts");
  assert.match(file, /"\/api\/v1\/profiles", ClerkExpressWithAuth\(\), adminProtectionMiddleware/);
  assert.match(file, /"\/api\/v1\/messages", ClerkExpressWithAuth\(\), adminProtectionMiddleware/);
  assert.match(file, /"\/api\/v1\/plans", ClerkExpressWithAuth\(\), adminProtectionMiddleware/);
  assert.match(file, /"\/api\/email\/trigger",[\s\S]{0,100}adminProtectionMiddleware/);
  assert.match(file, /"\/api\/email\/send", \(_req, res\)[\s\S]{0,220}status\(410\)/);
  assert.match(file, /adminMutableCollections/);
});

test("production Supabase and AI credentials are never compiled in as fallbacks", async () => {
  const files = await Promise.all([
    source("src/lib/supabase.ts"),
    source("src/pages/Admin.tsx"),
    source("src/components/chat/ChatWidget.tsx"),
    source(".env.example"),
  ]);
  for (const file of files) {
    assert.doesNotMatch(file, /vnilkycbtxxcyoynakge/);
    assert.doesNotMatch(file, /sb_publishable_6krQD2xCzjSLtaol0F0YNg_bCk3ZpNa/);
  }
  assert.doesNotMatch(files[2], /VITE_GEMINI_API_KEY/);
});

test("booking alerts require a cron secret or verified admin", async () => {
  const file = await source("api-handlers/bookings.js");
  assert.match(file, /requireVerifiedClerkAdmin/);
  assert.match(file, /if \(action !== "notify-expiring"\)/);
  assert.match(file, /BOOKINGS_CONFIG_REQUIRED/);
});
