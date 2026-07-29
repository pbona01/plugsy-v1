import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) =>
  fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const bounded = (source, startMarker, endMarker, label) => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `${label} start boundary is missing`);
  assert.ok(end >= 0, `${label} end boundary is missing`);
  assert.ok(end > start, `${label} boundaries are out of order`);
  return source.slice(start, end);
};

test("payments final dispatch sends product purchases to authenticated status/purchase handlers", () => {
  const source = read("api/payments.js");
  const handler = source.slice(source.indexOf("export default async function handler"));
  const verify = handler.indexOf('if (action === "verify")');
  const webhook = handler.indexOf('if (action === "webhook")');
  assert.ok(verify >= 0);
  assert.ok(webhook > verify);
  assert.match(handler.slice(verify, webhook), /handleWalletProductStatus/);
  assert.doesNotMatch(handler, /handleVerify/);
  assert.match(source, /DIRECT_PRODUCT_PROVIDER_RETIRED/);
});

test("wallet profile/security actions are authenticated actor-owned implementations", () => {
  const wallet = read("api/wallet.js");
  const commerce = read("api/_walletCommerce.js");
  const actions = [
    "resolve-account",
    "save-bank",
    "set-pin",
    "update-pin-settings",
    "verify-pin",
    "update-username",
  ];
  for (const action of actions) {
    assert.match(wallet, new RegExp(`action === "${action}"`));
  }
  assert.match(commerce, /requireVerifiedClerkUser/);
  assert.match(commerce, /context\.actor\.userId/);
  assert.doesNotMatch(commerce, /body\.userId/);
  assert.match(commerce, /timingSafeEqual/);
});

test("funding, webhook, transfer webhook, and username routes remain reachable", () => {
  const wallet = read("api/wallet.js");
  const handler = wallet.slice(wallet.indexOf("export default async function handler"));
  for (const action of [
    "fund",
    "webhook",
    "verify",
    "transfer-webhook",
    "p2p-transfer",
    "resolve-username",
  ]) {
    assert.ok(handler.indexOf(`action === "${action}"`) >= 0, action);
  }
  assert.match(wallet, /WALLET_FUNDING_V2_ENABLED/);
  assert.match(wallet, /processWithdrawalWebhook/);
});

test("completed commerce flows replace old pause guards and keep legacy provider paths retired", () => {
  const payments = read("api/payments.js");
  const portfolio = read("api/portfolio.js");
  const commerce = read("api/_walletCommerce.js");
  assert.match(payments, /handleWalletProductPurchase/);
  assert.match(portfolio, /handlePortfolioWalletPurchase/);
  assert.match(commerce, /purchase_wallet_product_v2/);
  assert.match(commerce, /purchase_portfolio_wallet_v2/);
  assert.match(payments, /DIRECT_PRODUCT_PROVIDER_RETIRED/);
  assert.match(payments, /SPLIT_WALLET_PURCHASE_RETIRED/);
  assert.match(portfolio, /SPLIT_PORTFOLIO_PURCHASE_RETIRED/);
});

test("all source-boundary helpers reject missing markers", () => {
  const source = read("api/payments.js");
  assert.throws(
    () => bounded(source, "missing-start", "missing-end", "guard"),
    /guard start boundary is missing/,
  );
});
