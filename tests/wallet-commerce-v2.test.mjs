import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import paymentsHandler from "../api/payments.js";
import walletHandler from "../api/wallet.js";

const read = (path) =>
  fs.readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const responseRecorder = () => {
  let statusCode = 200;
  let payload;
  return {
    get statusCode() {
      return statusCode;
    },
    get payload() {
      return payload;
    },
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      payload = value;
      return this;
    },
    setHeader() {},
    end() {
      return this;
    },
  };
};

const requestWithoutBodyAccess = (action) => {
  const request = {
    method: "POST",
    url: `/api/${action}`,
    query: { action: action.split("=")[1] || action },
    headers: { host: "localhost" },
  };
  let bodyAccessed = false;
  Object.defineProperty(request, "body", {
    get() {
      bodyAccessed = true;
      throw new Error("body must not be accessed before authentication");
    },
  });
  return { request, get bodyAccessed() { return bodyAccessed; } };
};

test("unauthenticated product purchase is rejected before body parsing", async () => {
  const tracked = requestWithoutBodyAccess("payments?action=purchase");
  const response = responseRecorder();
  const originalError = console.error;
  console.error = () => {};
  try {
    await paymentsHandler(tracked.request, response);
  } finally {
    console.error = originalError;
  }
  assert.equal(response.statusCode, 503);
  assert.equal(response.payload.code, "AUTH_CONFIG_REQUIRED");
  assert.equal(tracked.bodyAccessed, false);
});

test("spoofed identity fields are absent from active mutation handlers", () => {
  const commerce = read("api/_walletCommerce.js");
  const frontend = read("src/pages/CheckoutConfirm.tsx") +
    read("src/pages/CreatePortfolio.tsx") +
    read("src/components/wallet/SendMoneyModal.tsx");
  assert.doesNotMatch(commerce, /body\.userId|body\.email/);
  assert.match(commerce, /p_actor_user_id: context\.actor\.userId/);
  assert.doesNotMatch(frontend, /JSON\.stringify\(\{[^}]*userId/);
});

test("product and portfolio prices are server authoritative", () => {
  const commerce = read("api/_walletCommerce.js");
  const sql = read("supabase/migrations/20260729100000_wallet_commerce_atomic_v2.sql");
  const product = commerce.slice(
    commerce.indexOf("export async function handleWalletProductPurchase"),
    commerce.indexOf("export async function handleWalletProductStatus"),
  );
  const portfolio = commerce.slice(
    commerce.indexOf("export async function handlePortfolioWalletPurchase"),
    commerce.indexOf("export async function handlePortfolioPurchaseStatus"),
  );
  assert.doesNotMatch(product, /body\.(?:amount|price|actualPrice|discount)/);
  assert.doesNotMatch(portfolio, /body\.(?:amount|price|actualPrice|discount)/);
  assert.match(sql, /from public\.plans/);
  assert.match(sql, /from public\.portfolio_category_prices_v2/);
  assert.match(sql, /discount_price/);
});

test("idempotency ledger and duplicate constraints cover every financial mutation", () => {
  const sql = read("supabase/migrations/20260729100000_wallet_commerce_atomic_v2.sql") +
    read("supabase/migrations/20260729110000_wallet_transfers_withdrawals_v2.sql");
  for (const marker of [
    "wallet_operation_idempotency_v2",
    "orders_idempotency_unique_v2",
    "portfolio_purchases_idempotency_unique_v2",
    "withdrawals_idempotency_unique_v2",
    "wallet_transactions_operation_idempotency_unique_v2",
  ]) assert.match(sql, new RegExp(marker));
  assert.match(read("api/_walletCommerce.js"), /IDEMPOTENCY_KEY_REQUIRED/);
});

test("insufficient funds, self-transfer, and duplicate operation errors are stable", () => {
  const sql = read("supabase/migrations/20260729100000_wallet_commerce_atomic_v2.sql") +
    read("supabase/migrations/20260729110000_wallet_transfers_withdrawals_v2.sql");
  for (const code of [
    "INSUFFICIENT_FUNDS",
    "SELF_TRANSFER_NOT_ALLOWED",
    "IDEMPOTENCY_KEY_CONFLICT",
  ]) assert.match(sql, new RegExp(code));
});

test("concurrent purchases and transfers lock deterministic identities", () => {
  const sql = read("supabase/migrations/20260729100000_wallet_commerce_atomic_v2.sql") +
    read("supabase/migrations/20260729110000_wallet_transfers_withdrawals_v2.sql");
  assert.match(sql, /for update/gi);
  assert.match(sql, /order by clerk_id\s+for update/i);
  assert.match(sql, /lock table public\.orders in share row exclusive mode/i);
});

test("provider transaction collisions and repeated withdrawal callbacks are contained", () => {
  const funding = read("supabase/migrations/20260728130000_wallet_funding_v2.sql");
  const withdrawal = read("supabase/migrations/20260729110000_wallet_transfers_withdrawals_v2.sql");
  assert.match(funding, /wallet_transactions_fund_provider_tx_unique_v2/);
  assert.match(withdrawal, /withdrawal_callback_event_unique_v2/);
  assert.match(withdrawal, /already_processed/);
  assert.match(withdrawal, /refunded_at/);
});

test("only explicit CapCut products receive pending_login", () => {
  const sql = read("supabase/migrations/20260729100000_wallet_commerce_atomic_v2.sql");
  assert.match(sql, /when v_product_type = 'capcut' then 'pending_login'/);
  assert.match(sql, /'capcut_pro'/);
  assert.match(sql, /else 'delivered'/);
  assert.doesNotMatch(sql, /when v_product_type = 'medal' then 'pending_login'/);
});

test("portfolio entitlement, medal supply, and one-medal rules are atomic", () => {
  const sql = read("supabase/migrations/20260729100000_wallet_commerce_atomic_v2.sql");
  assert.match(sql, /purchase_portfolio_wallet_v2/);
  assert.match(sql, /status = 'active'/);
  assert.match(sql, /MEDAL_ALREADY_OWNED/);
  assert.match(sql, /MEDAL_SOLD_OUT/);
  assert.match(sql, /v_medal_number > 160/);
});

test("referral rewards and notifications are deduplicated and non-blocking", () => {
  const sql = read("supabase/migrations/20260729100000_wallet_commerce_atomic_v2.sql");
  assert.match(sql, /wallet_commerce_rewards_source_unique_v2/);
  assert.match(sql, /wallet_notification_outbox_dedupe_unique_v2/);
  assert.match(sql, /exception\s+when others then/);
  assert.match(sql, /on conflict \(dedupe_key\) do nothing/);
});

test("withdrawal reservation precedes provider transfer and uses manual review", () => {
  const commerce = read("api/_walletCommerce.js");
  const reserve = commerce.indexOf("reserve_wallet_withdrawal_v2");
  const provider = commerce.indexOf("api.flutterwave.com/v3/transfers");
  assert.ok(reserve >= 0 && provider > reserve);
  assert.match(commerce, /record_financial_manual_review_v2/);
  assert.match(commerce, /mark_wallet_withdrawal_submitted_v2/);
});

test("active financial API routes contain no JavaScript balance arithmetic", () => {
  const source = read("api/_walletCommerce.js") +
    read("api/wallet.js") +
    read("api/payments.js") +
    read("api/portfolio.js");
  assert.doesNotMatch(source, /balance(?:Before|After)?\s*=\s*[^;]*(?:\+|-)\s*[^;]+/);
  assert.doesNotMatch(source, /\.from\(["']profiles["']\)[\s\S]{0,200}balance[\s\S]{0,200}\.update/);
});

test("frontend financial mutations send Clerk bearer tokens and stable idempotency keys", () => {
  const frontend = read("src/pages/CheckoutConfirm.tsx") +
    read("src/pages/CreatePortfolio.tsx") +
    read("src/pages/Wallet.tsx") +
    read("src/components/wallet/SendMoneyModal.tsx") +
    read("src/components/wallet/BankAccountForm.tsx");
  assert.match(frontend, /Authorization: `Bearer \$\{token\}`/);
  assert.match(frontend, /getStableIdempotencyKey/);
  assert.doesNotMatch(frontend, /action=initialize/);
  assert.doesNotMatch(frontend, /action=create-from-wallet/);
});

test("staging verification artifacts are present but not invoked by package scripts", () => {
  assert.ok(fs.existsSync("supabase/wallet-commerce-v2_staging_verify.sql"));
  assert.ok(fs.existsSync("scripts/wallet-commerce-v2-staging.mjs"));
  const packageJson = JSON.parse(read("package.json"));
  assert.doesNotMatch(JSON.stringify(packageJson.scripts || {}), /wallet-commerce-v2-staging/);
});

test("production preflight and postmigration verification are read-only", () => {
  const files = [
    "supabase/wallet-commerce-v2-production-preflight.sql",
    "supabase/wallet-commerce-v2-production-postmigration-verify.sql",
  ];
  const stripSqlCommentsAndLiterals = (source) => source
    .replace(/--[^\r\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/'(?:''|[^'])*'/g, "''")
    .replace(/"(?: ""|[^"])*"/g, '""');
  const destructive = /\b(?:begin|create|alter|drop|insert|update|delete|truncate|grant|revoke|execute)\b/i;
  const financialRpcCall = /\b(?:select|call|perform)\s+(?:public\.)?(?:fulfill_wallet_funding_v2|purchase_wallet_product_v2|purchase_portfolio_wallet_v2|transfer_wallet_p2p_v2|reserve_wallet_withdrawal_v2|settle_wallet_withdrawal_success_v2|refund_wallet_withdrawal_v2)\s*\(/i;

  for (const file of files) {
    const source = read(file);
    const executable = stripSqlCommentsAndLiterals(source);
    assert.doesNotMatch(executable, destructive, `${file} contains destructive SQL`);
    assert.doesNotMatch(executable, financialRpcCall, `${file} calls a financial RPC`);
    assert.doesNotMatch(executable, /\.rpc\s*\(/i, `${file} uses a client RPC call`);
  }
});

test("postmigration verifier keeps a four-column checks contract and final summary", () => {
  const source = read("supabase/wallet-commerce-v2-production-postmigration-verify.sql");
  const checksStart = source.indexOf("checks(check_name, ok, blocking, details) as (");
  const summaryStart = source.indexOf("final_summary as (");
  assert.ok(checksStart >= 0 && summaryStart > checksStart);
  const checks = source.slice(checksStart, summaryStart);
  const branches = checks.split(/\n\s*union all\s*\n/i);
  assert.ok(branches.length >= 2);
  for (const branch of branches) {
    assert.match(
      branch,
      /,\n\s*(?:true|false),\n\s*(?:case|['"])/i,
      "each checks branch must supply its blocking and details columns",
    );
  }
  assert.match(source, /coalesce\(bool_and\(ok\) filter \(where blocking\), true\)/i);
  assert.match(source, /'FINAL_SUMMARY'/);
  assert.match(source, /then 'READY: every blocking post-migration check passed'/);
  assert.match(source, /else 'BLOCKED: one or more blocking post-migration checks failed'/);
  assert.match(source, /select check_name, case when ok then 'READY' else 'BLOCKED' end as status/i);
});

test("postmigration verifier resolves exact RPC regprocedures and ACL privileges", () => {
  const source = read("supabase/wallet-commerce-v2-production-postmigration-verify.sql");
  assert.match(source, /pg_catalog\.to_regprocedure\(regprocedure_identity\)/);
  assert.match(source, /on p\.oid = f\.function_oid/);
  assert.match(source, /public\.purchase_wallet_product_v2\(text,text,text,uuid,text,text\)/);
  assert.match(source, /public\.purchase_portfolio_wallet_v2\(text,text,text,text\[\],text,text\)/);
  assert.doesNotMatch(source, /pg_get_function_identity_arguments/);
  assert.match(source, /aclexplode\(coalesce\(p\.proacl, acldefault\('f', p\.proowner\)\)\)/);
  assert.match(source, /a\.grantee = 0 and a\.privilege_type = 'EXECUTE'/);
});

test("production compatibility migration repairs only the additive topic and confirmed reward triggers", () => {
  const compat = read("supabase/migrations/20260729090000_wallet_commerce_production_compat_v2.sql");
  const postmigration = read("supabase/wallet-commerce-v2-production-postmigration-verify.sql");
  assert.match(compat, /alter table public\.messages\s+add column if not exists topic text/i);
  assert.doesNotMatch(compat, /update\s+public\.(?:messages|profiles|orders|wallet_transactions)/i);
  assert.doesNotMatch(compat, /delete\s+from\s+public\./i);
  for (const trigger of [
    "on_order_paid_referral",
    "tr_purchase_code_reward",
    "tr_sync_balance",
  ]) assert.match(compat, new RegExp(`drop trigger if exists ${trigger}`, "i"));
  assert.doesNotMatch(compat, /drop trigger if exists on_login_sent/i);
  assert.doesNotMatch(compat, /drop trigger if exists trg_assign_purchase_code/i);
  assert.match(compat, /apply_wallet_referral_reward_v2/);
  assert.match(compat, /wallet_commerce_rewards_v2/);
  for (const trigger of [
    "on_order_paid_referral",
    "tr_purchase_code_reward",
    "tr_sync_balance",
  ]) assert.match(postmigration, new RegExp(`compatibility\.trigger\.absent[\\s\\S]*${trigger}`, "i"));
  assert.match(postmigration, /compatibility\.trigger\.preserved[\s\S]*on_login_sent/i);
  assert.match(postmigration, /compatibility\.trigger\.preserved[\s\S]*trg_assign_purchase_code/i);
});

test("preflight treats compatible and migration-created objects as non-blocking", () => {
  const preflight = read("supabase/wallet-commerce-v2-production-preflight.sql");
  assert.match(preflight, /\('orders', 'plan_id', 'uuid'\)/);
  assert.match(preflight, /when 'uuid' then c\.udt_name = 'uuid'/);
  assert.match(preflight, /not exists \([\s\S]*p\.proname = f\.function_name[\s\S]*\) or exists/);
  assert.match(preflight, /absent; migration is expected to create it/);
  assert.match(preflight, /data\.duplicate\.reward_order_relationship',[\s\S]*?true,[\s\S]*?false/);
  assert.match(preflight, /data\.invalid\.historical_order_amounts',[\s\S]*?true,[\s\S]*?false/);
  assert.match(preflight, /bool_and\(ok\) filter \(where blocking\)/i);
  assert.match(preflight, /messages\.topic is absent and compatibility migration will add it/);
});

test("V2 rewards and prices are isolated from dirty legacy rows", () => {
  const commerce = read("supabase/migrations/20260729100000_wallet_commerce_atomic_v2.sql");
  const preflight = read("supabase/wallet-commerce-v2-production-preflight.sql");
  assert.doesNotMatch(commerce, /insert\s+into\s+public\.purchase_code_rewards/i);
  assert.match(commerce, /wallet_commerce_rewards_source_unique_v2/);
  assert.match(commerce, /PRODUCT_PRICE_INVALID/);
  assert.match(commerce, /PORTFOLIO_PRICE_INVALID/);
  assert.doesNotMatch(commerce, /alter table public\.orders[\s\S]{0,300}check\s*\(/i);
  assert.match(preflight, /no legacy uniqueness constraint will be created/);
  assert.match(preflight, /historical orders with null, non-numeric or non-positive amounts=/);
});

test("compatibility migration is ordered before commerce and transfer migrations", () => {
  const migrations = [
    "20260728130000_wallet_funding_v2.sql",
    "20260729090000_wallet_commerce_production_compat_v2.sql",
    "20260729100000_wallet_commerce_atomic_v2.sql",
    "20260729110000_wallet_transfers_withdrawals_v2.sql",
  ];
  assert.deepEqual([...migrations].sort(), migrations);
  assert.doesNotMatch(
    read("supabase/migrations/20260728130000_wallet_funding_v2.sql"),
    /required\(table_name, column_name\)[\s\S]*\('messages', 'topic'\)/i,
  );
});

test("production schema types, product plans, and referral identity are exact", () => {
  const commerce = read("supabase/migrations/20260729100000_wallet_commerce_atomic_v2.sql");
  const preflight = read("supabase/wallet-commerce-v2-production-preflight.sql");
  const post = read("supabase/wallet-commerce-v2-production-postmigration-verify.sql");
  assert.match(commerce, /vp_portfolios\.categories must be text\[\]/i);
  assert.match(commerce, /categories = p_categories/);
  assert.doesNotMatch(commerce, /categories = to_jsonb\(p_categories\)/);
  assert.match(commerce, /add column if not exists plan_id uuid/i);
  assert.match(commerce, /p_plan_id uuid/);
  assert.match(commerce, /where id = p_plan_id/);
  assert.match(commerce, /text, text, text, uuid, text, text/);
  assert.match(commerce, /34849e6d-b139-4048-a72a-9f3f9c83778c/);
  assert.match(commerce, /wallet_product_type = 'capcut'/);
  assert.match(commerce, /profiles_purchase_code_lower_unique_v2/);
  assert.match(preflight, /duplicate\.profile_purchase_code/);
  assert.match(post, /type\.orders\.plan_id_uuid/);
  assert.match(post, /categories_text_array/);
});

test("withdrawal callback manual review is durable and non-settling", () => {
  const sql = read("supabase/migrations/20260729110000_wallet_transfers_withdrawals_v2.sql");
  const api = read("api/_walletCommerce.js");
  for (const code of [
    "WITHDRAWAL_NOT_FOUND",
    "WITHDRAWAL_VERIFICATION_MISMATCH",
    "WITHDRAWAL_ALREADY_REFUNDED",
    "WITHDRAWAL_ALREADY_SETTLED",
  ]) assert.match(sql, new RegExp(code));
  assert.match(sql, /'manual_review'/);
  assert.match(sql, /manual_review', true, 'settlement_applied', false, 'refund_applied', false/);
  assert.doesNotMatch(sql, /WITHDRAWAL_ALREADY_REFUNDED';\s*raise exception/i);
  assert.match(api, /record_wallet_withdrawal_callback_manual_review_v2/);
  assert.match(api, /manualReview: result\.manual_review === true/);
});

test("withdrawal callback result handling accepts only exact durable review results", () => {
  const api = read("api/_walletCommerce.js");
  const sql = read("supabase/migrations/20260729110000_wallet_transfers_withdrawals_v2.sql");
  assert.match(api, /const callRpc = async/);
  assert.match(api, /result\.success !== true/);
  assert.match(api, /callWithdrawalCallbackRpc/);
  assert.match(api, /result\?\.success === true \|\| isWithdrawalManualReviewResult/);
  assert.match(api, /recordWithdrawalCallbackManualReviewOrFail/);
  assert.match(sql, /on conflict \(event_key\) do nothing/);
  assert.doesNotMatch(sql, /set outcome = 'manual_review'/);
  assert.match(sql, /withdrawal_callback_outcome_v2/);
  assert.match(sql, /'success', 'failure', 'manual_review'/);
  assert.match(sql, /where event_key = p_event_key\s+for update/);
  assert.match(sql, /v_existing_event\.reference is distinct from p_reference/);
  assert.match(sql, /WITHDRAWAL_CALLBACK_EVENT_CONFLICT/);
  assert.match(sql, /WITHDRAWAL_PROVIDER_TRANSACTION_COLLISION/);
  assert.match(sql, /where provider_transaction_id = p_provider_transaction_id/);
});

test("withdrawal submission owns provider-ID collision handling and cannot retry a reviewed attempt", () => {
  const sql = read("supabase/migrations/20260729110000_wallet_transfers_withdrawals_v2.sql");
  const api = read("api/_walletCommerce.js");
  const start = sql.indexOf("create or replace function public.mark_wallet_withdrawal_attempt_started_v2(");
  const submitted = sql.indexOf("create or replace function public.mark_wallet_withdrawal_submitted_v2(");
  const manual = sql.indexOf("create or replace function public.mark_wallet_withdrawal_manual_review_v2(");
  assert.ok(start >= 0 && submitted > start && manual > submitted);
  const attemptFunction = sql.slice(start, submitted);
  const submittedFunction = sql.slice(submitted, manual);
  assert.doesNotMatch(attemptFunction, /p_provider_transaction_id/);
  assert.match(submittedFunction, /where provider_transaction_id = p_provider_transaction_id/);
  assert.match(submittedFunction, /and reference <> p_reference/);
  assert.match(submittedFunction, /WITHDRAWAL_PROVIDER_TRANSACTION_COLLISION/);
  assert.match(submittedFunction, /'pending_manual_review', true/);
  assert.match(submittedFunction, /'provider_submitted', true/);

  const withdrawalStart = api.indexOf("export async function handleWithdrawal");
  const webhookStart = api.indexOf("export async function processWithdrawalWebhook");
  assert.ok(withdrawalStart >= 0 && webhookStart > withdrawalStart);
  const withdrawal = api.slice(withdrawalStart, webhookStart);
  const secret = withdrawal.indexOf("const secretKey = flutterwaveSecret(res);");
  const reserve = withdrawal.indexOf("reserve_wallet_withdrawal_v2");
  const reviewedRetry = withdrawal.indexOf("reservation.pending_manual_review === true");
  const attempt = withdrawal.indexOf("mark_wallet_withdrawal_attempt_started_v2");
  assert.ok(secret >= 0 && reserve > secret);
  assert.ok(reviewedRetry >= 0 && attempt > reviewedRetry);
  assert.match(withdrawal, /callWithdrawalCallbackRpc\([\s\S]*mark_wallet_withdrawal_submitted_v2/);
  assert.match(withdrawal, /submitted\.manual_review === true/);
});

test("withdrawal callback records final outcomes only after validation", () => {
  const sql = read("supabase/migrations/20260729110000_wallet_transfers_withdrawals_v2.sql");
  const settleStart = sql.indexOf("create or replace function public.settle_wallet_withdrawal_success_v2(");
  const refundStart = sql.indexOf("create or replace function public.refund_wallet_withdrawal_v2(");
  const grantsStart = sql.indexOf("revoke all\non table");
  assert.ok(settleStart >= 0 && refundStart > settleStart && grantsStart > refundStart);
  const settle = sql.slice(settleStart, refundStart);
  const refund = sql.slice(refundStart, grantsStart);
  for (const [fn, outcome] of [[settle, "success"], [refund, "failure"]]) {
    const lock = fn.indexOf("where event_key = p_event_key\n  for update;");
    const withdrawalLock = fn.indexOf("where reference = p_reference\n  for update;");
    const finalInsert = fn.indexOf(`p_provider_status, '${outcome}'`);
    assert.ok(lock >= 0 && withdrawalLock > lock && finalInsert > withdrawalLock);
    assert.match(fn, /return public\.record_wallet_withdrawal_callback_manual_review_v2/);
    assert.match(fn, /on conflict \(event_key\) do nothing/);
  }
  const reviewStart = sql.indexOf("create or replace function public.record_wallet_withdrawal_callback_manual_review_v2(");
  assert.ok(reviewStart >= 0 && settleStart > reviewStart);
  const review = sql.slice(reviewStart, settleStart);
  assert.match(review, /where event_key = p_event_key\n  for update/);
  assert.doesNotMatch(review, /update public\.withdrawal_callback_events_v2/);
  assert.match(review, /WITHDRAWAL_CALLBACK_EVENT_CONFLICT/);
});

test("withdrawal UI uses the persisted Flutterwave bank fields without changing the transfer request", () => {
  const wallet = read("src/pages/Wallet.tsx");
  const commerce = read("api/_walletCommerce.js");
  assert.doesNotMatch(wallet, /paystack_recipient_code/);
  assert.match(wallet, /const hasWithdrawalBankAccount = Boolean\(/);
  assert.match(wallet, /profile\?\.bank_code/);
  assert.match(wallet, /profile\?\.bank_name/);
  assert.match(wallet, /\^\\d\{10\}\$\/.test\(String\(profile\?\.account_number \|\| ""\)\)/);
  assert.match(wallet, /profile\?\.account_name/);
  assert.match(wallet, /disabled=\{isWithdrawing \|\| !withdrawAmount \|\| !hasWithdrawalBankAccount\}/);
  assert.match(wallet, /\{!hasWithdrawalBankAccount && \(/);
  assert.match(wallet, /Continue to Flutterwave/);

  const submitStart = wallet.indexOf("const handleWithdrawSubmit = async");
  const filterStart = wallet.indexOf("const filteredTransactions");
  assert.ok(submitStart >= 0 && filterStart > submitStart);
  const submit = wallet.slice(submitStart, filterStart);
  assert.match(submit, /fetch\('\/api\/wallet\?action=withdraw'/);
  assert.match(submit, /body: JSON\.stringify\(\{\s*amount: Number\(withdrawAmount\),\s*pin: withdrawPin\s*\}\)/);
  assert.doesNotMatch(submit, /bank_code|bank_name|account_number|account_name/);
  assert.match(commerce, /https:\/\/api\.flutterwave\.com\/v3\/transfers/);
});
