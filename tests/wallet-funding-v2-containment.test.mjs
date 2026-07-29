import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) =>
  fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

test("funding verification authenticates and scopes the reference to its owner", () => {
  const helper = read("api/_walletFundingWebhook.js");

  const start = helper.indexOf(
    "export async function verifyWalletFundingStatus",
  );
  const end = helper.indexOf(
    "export async function processWalletFundingWebhook",
    start,
  );
  const block = helper.slice(start, end);

  assert.notEqual(start, -1);
  assert.match(block, /requireVerifiedClerkUser\(req, res\)/);
  assert.match(block, /\.eq\("user_id", actor\.userId\)/);
  assert.match(block, /\.eq\("type", "fund"\)/);
  assert.match(block, /wallet_fund_/);
  assert.doesNotMatch(block, /\.update\(/);
  assert.doesNotMatch(block, /\.insert\(/);
  assert.doesNotMatch(block, /\.delete\(/);
});

test("wallet transfer webhook is signed and delegates settlement to atomic RPCs", () => {
  const source = read("api/wallet.js");

  const start = source.indexOf(
    'if (action === "transfer-webhook")',
  );
  const end = source.indexOf('if (action === "p2p-transfer")', start);
  assert.notEqual(end, -1);
  const block = source.slice(start, end);

  assert.notEqual(start, -1);
  assert.match(source, /requireFlutterwaveWebhookSignature/);
  assert.match(block, /parseSignedEvent/);
  assert.match(block, /processWithdrawalWebhook/);
  assert.doesNotMatch(block, /\.from\(/);
  assert.doesNotMatch(block, /\.update\(/);
  assert.doesNotMatch(block, /\.insert\(/);
});

test("payments webhook blocks non-wallet charges without settlement writes", () => {
  const source = read("api/payments.js");
  const start = source.indexOf("async function handleFundingWebhook");
  assert.notEqual(start, -1);
  const block = source.slice(start);
  assert.match(block, /manualReview: true/);
  assert.match(block, /settlementApplied: false/);
  assert.doesNotMatch(block, /\.from\(/);
  assert.doesNotMatch(block, /\.update\(/);
  assert.doesNotMatch(block, /\.insert\(/);
});

test("payments webhook logs no secrets and retains no legacy money writes", () => {
  const source = read("api/payments.js");

  const start = source.indexOf("async function handleFundingWebhook");
  assert.notEqual(start, -1);
  const block = source.slice(start);

  assert.doesNotMatch(
    block,
    /JSON\.stringify\(req\.headers\)/,
  );

  assert.doesNotMatch(
    block,
    /JSON\.stringify\(event\)/,
  );

  assert.doesNotMatch(
    block,
    /balanceAfter\s*=\s*balanceBefore\s*\+\s*amount/,
  );

  assert.doesNotMatch(
    block,
    /\.from\("orders"\)/,
  );

  assert.doesNotMatch(
    block,
    /handlePortfolioWebhook\(event/,
  );

  assert.match(
    block,
    /NON_WALLET_PROVIDER_CHARGE_BLOCKED/,
  );
});

test("wallet callback sends auth and never assumes success after polling", () => {
  const source = read("src/pages/WalletCallback.tsx");

  assert.match(source, /useAuth/);
  assert.match(
    source,
    /Authorization: `Bearer \$\{token\}`/,
  );
  assert.match(source, /searchParams\.get\('tx_ref'\)/);
  assert.match(source, /setStatus\('pending'\)/);
  assert.doesNotMatch(
    source,
    /If we get here[\s\S]*setStatus\('success'\)/,
  );
});
