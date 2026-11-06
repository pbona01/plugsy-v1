import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("first-time sellers receive one free month with disclosed wallet auto-renewal", () => {
  const ui = read("src/components/marketplace/SellerPremiumPlan.tsx");
  const api = read("api/marketplace.js");
  const migration = read("supabase/migrations/20261105170000_marketplace_premium_trial_autorenew_v1.sql");
  assert.match(ui, /Your first month is free/);
  assert.match(ui, /₦1,500 monthly from your Plugsy Wallet/);
  assert.match(ui, /acceptedAutoRenew: true/);
  assert.match(api, /marketplace_start_premium_trial_v1/);
  assert.match(migration, /premium_trial_claimed_at is not null/);
  assert.match(migration, /exists \(select 1 from public\.marketplace_premium_payments/);
  assert.match(migration, /now\(\) \+ interval '1 month'/);
});

test("premium auto-renewal is user controlled and processed daily from wallet", () => {
  const ui = read("src/components/marketplace/SellerPremiumPlan.tsx");
  const api = read("api/marketplace.js");
  const vercel = read("vercel.json");
  const migration = read("supabase/migrations/20261105170000_marketplace_premium_trial_autorenew_v1.sql");
  assert.match(ui, /set-premium-auto-renew/);
  assert.match(ui, /Turn off/);
  assert.match(api, /marketplace_set_premium_auto_renew_v1/);
  assert.match(api, /marketplace_process_premium_renewals_v1/);
  assert.match(vercel, /process-premium-renewals/);
  assert.match(migration, /coalesce\(v_profile\.balance, 0\) < v_amount/);
  assert.match(migration, /premium_renewal_failure = 'INSUFFICIENT_FUNDS'/);
  assert.match(migration, /public_selling_enabled = true/);
});
