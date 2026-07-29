import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("wallet commerce v2 helpers and additive artifacts are present", () => {
  assert.equal(fs.existsSync("api/_walletCommerce.js"), true);
  assert.equal(fs.existsSync("src/utils/idempotency.ts"), true);
  assert.equal(
    fs.existsSync(
      "supabase/migrations/20260725120000_wallet_commerce_v2.sql",
    ),
    false,
  );
});

test("focused migration contains funding only", () => {
  const sql = read(
    "supabase/migrations/20260728130000_wallet_funding_v2.sql",
  );

  assert.match(sql, /fulfill_wallet_funding_v2/);
  assert.match(sql, /set search_path = pg_catalog/i);
  assert.match(sql, /provider_transaction_id/);
  assert.match(sql, /from public, anon, authenticated/i);
  assert.match(sql, /to service_role/i);

  assert.doesNotMatch(sql, /purchase_wallet_plan_v2/);
  assert.doesNotMatch(sql, /purchase_portfolio_wallet_v2/);
  assert.doesNotMatch(sql, /drop trigger/i);
});

test("funding is authenticated and persisted before provider initialization", () => {
  const source = read("api/_walletFundingWebhook.js");

  const auth = source.indexOf(
    "requireVerifiedClerkUser(req, res)",
  );
  const insert = source.indexOf(
    '.from("wallet_transactions")\n    .insert',
  );
  const provider = source.indexOf(
    '"https://api.flutterwave.com/v3/payments"',
  );

  assert.ok(auth >= 0);
  assert.ok(insert > auth);
  assert.ok(provider > insert);
});

test("both webhooks use one shared funding processor", () => {
  assert.match(
    read("api/wallet.js"),
    /processWalletFundingWebhook/,
  );

  assert.match(
    read("api/payments.js"),
    /processWalletFundingWebhook/,
  );
});

test("wallet money actions use authenticated atomic replacements", () => {
  const wallet = read("api/wallet.js");
  const commerce = read("api/_walletCommerce.js");

  assert.match(wallet, /action === "pay-with-wallet"/);
  assert.match(wallet, /action === "withdraw"/);
  assert.match(wallet, /action === "p2p-transfer"/);
  assert.match(commerce, /requireVerifiedClerkUser/);
  assert.match(commerce, /transfer_wallet_p2p_v2/);
  assert.match(commerce, /reserve_wallet_withdrawal_v2/);
  assert.match(commerce, /Idempotency-Key|idempotencyKey/);
});

test("product provider and split checkout are fail closed", () => {
  const payments = read("api/payments.js");

  assert.match(payments, /DIRECT_PRODUCT_PROVIDER_RETIRED/);
  assert.match(
    payments,
    /SPLIT_WALLET_PURCHASE_RETIRED/,
  );
  assert.match(
    payments,
    /NON_WALLET_PROVIDER_CHARGE_BLOCKED/,
  );
});

test("wallet frontend sends authenticated amount only", () => {
  const source = read("src/pages/Wallet.tsx");
  const start = source.indexOf(
    "const handleFundWallet = async",
  );
  const end = source.indexOf(
    "const handleSetUsername",
    start,
  );
  const handler = source.slice(start, end);

  assert.match(
    handler,
    /Authorization: `Bearer \$\{token\}`/,
  );
  assert.match(
    handler,
    /JSON\.stringify\(\{ amount \}\)/,
  );
  assert.doesNotMatch(
    handler,
    /JSON\.stringify\(\{ userId, userEmail, amount \}\)/,
  );
});
