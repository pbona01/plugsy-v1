import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { handleSaveBankAccount } from "../api/_walletCommerce.js";

const read = (path) => fs.readFileSync(path, "utf8");

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  },
});

const validBody = (overrides = {}) => ({
  accountNumber: "0123456789",
  bankCode: "044",
  bankName: "Access Bank",
  accountName: "Browser supplied name must be ignored",
  ...overrides,
});

const invokeSave = async (body, options = {}) => {
  const calls = { updates: [], resolutions: 0 };
  const result = options.result || {
    data: {
      bank_code: "044",
      bank_name: "Access Bank",
      account_number: "0123456789",
      account_name: "Provider Confirmed Name",
    },
    error: null,
  };
  const client = {
    from(table) {
      assert.equal(table, "profiles");
      return {
        update(patch) {
          calls.updates.push({ patch, filters: [] });
          const call = calls.updates.at(-1);
          return {
            eq(column, value) {
              call.filters.push({ column, value });
              return this;
            },
            select() {
              return this;
            },
            async maybeSingle() {
              return result;
            },
          };
        },
      };
    },
  };
  const res = response();
  await handleSaveBankAccount(
    { method: "POST", body },
    res,
    {
      requireMutationContext: async () => ({
        actor: { userId: "clerk_owner", email: "owner@example.com" },
        body,
      }),
      secretKey: "test-secret-key",
      resolveBankAccount: async () => {
        calls.resolutions += 1;
        return options.resolvedName || "Provider Confirmed Name";
      },
      getWalletServiceClient: () => client,
    },
  );
  return { res, calls };
};

test("wallet UI exposes deliberate bank editing from the card and withdrawal modal", () => {
  const wallet = read("src/pages/Wallet.tsx");
  const form = read("src/components/wallet/BankAccountForm.tsx");
  assert.match(wallet, /Withdrawal Account/);
  assert.match(wallet, /Edit Bank/);
  assert.match(wallet, /setIsWithdrawModalOpen\(false\)[\s\S]*setIsBankModalOpen\(true\)/);
  assert.match(wallet, /bank_code: profile\.bank_code/);
  assert.match(form, /currentBank\.bank_code/);
  assert.match(form, /setSelectedBank\(savedBank/);
  assert.match(form, /setAccountNumber\(currentBank\.account_number\)/);
  assert.match(form, /Edit Bank Account/);
  assert.match(form, /Add Bank Account/);
  assert.match(form, /Save Account/);
  assert.match(form, /Verify & Update/);
  assert.match(form, /Changing your bank affects future withdrawals only/);
  assert.match(form, /type="button"/);
  assert.match(wallet, /await loadWalletData\(\)/);
  assert.match(wallet, /Bank account updated successfully/);
});

test("wallet masks saved account numbers and only preloads the full number in the edit form", () => {
  const wallet = read("src/pages/Wallet.tsx");
  const form = read("src/components/wallet/BankAccountForm.tsx");
  assert.match(wallet, /maskedWithdrawalAccount/);
  assert.doesNotMatch(wallet, /\{profile\.account_number\}/);
  assert.match(form, /value=\{accountNumber\}/);
  assert.match(form, /setAccountNumber\(currentBank\.account_number\)/);
});

test("editing clears verification, cancels stale resolution, and requires a fresh result", () => {
  const form = read("src/components/wallet/BankAccountForm.tsx");
  assert.match(form, /resolveSequenceRef/);
  assert.match(form, /AbortController/);
  assert.match(form, /signal: controller\.signal/);
  assert.match(form, /sequence !== resolveSequenceRef\.current/);
  assert.match(form, /clearResolution\(\)\s*\n\s*setSelectedBank/);
  assert.match(form, /clearResolution\(\)\s*\n\s*setAccountNumber/);
  assert.match(form, /disabled=\{!resolvedName \|\| resolving \|\| saving\}/);
  assert.match(form, /setEditing\(false\)/);
});

test("save requires an authenticated mutation context", async () => {
  const res = response();
  await handleSaveBankAccount(
    { method: "POST", body: validBody() },
    res,
    {
      requireMutationContext: async (_req, innerRes) => {
        innerRes.status(401).json({
          success: false,
          code: "AUTH_REQUIRED",
          error: "Sign-in is required.",
        });
        return null;
      },
    },
  );
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "AUTH_REQUIRED");
});

test("server rejects invalid account numbers and bank codes before provider resolution", async () => {
  const invalidAccount = await invokeSave(validBody({ accountNumber: "123" }));
  assert.equal(invalidAccount.res.statusCode, 400);
  assert.equal(invalidAccount.res.body.code, "BANK_ACCOUNT_INVALID");
  assert.equal(invalidAccount.calls.resolutions, 0);

  const invalidBank = await invokeSave(validBody({ bankCode: "x" }));
  assert.equal(invalidBank.res.statusCode, 400);
  assert.equal(invalidBank.res.body.code, "BANK_ACCOUNT_INVALID");
  assert.equal(invalidBank.calls.resolutions, 0);
});

test("server ignores browser accountName, stores provider confirmation, scopes clerk_id, and returns only masked fields", async () => {
  const { res, calls } = await invokeSave(
    validBody({ accountName: "Attacker Supplied Name" }),
    { resolvedName: "Provider Confirmed Name" },
  );
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    bank: {
      bankCode: "044",
      bankName: "Access Bank",
      maskedAccountNumber: "••••6789",
      accountName: "Provider Confirmed Name",
    },
  });
  assert.equal(calls.updates[0].patch.account_name, "Provider Confirmed Name");
  assert.notEqual(calls.updates[0].patch.account_name, "Attacker Supplied Name");
  assert.deepEqual(calls.updates[0].filters, [
    { column: "clerk_id", value: "clerk_owner" },
  ]);
  assert.equal(JSON.stringify(res.body).includes("0123456789"), false);
});

test("database failure is 503 and a missing profile is 404", async () => {
  const failed = await invokeSave(validBody(), {
    result: { data: null, error: { code: "DB_UNAVAILABLE" } },
  });
  assert.equal(failed.res.statusCode, 503);
  assert.equal(failed.res.body.code, "BANK_ACCOUNT_SAVE_FAILED");

  const missing = await invokeSave(validBody(), {
    result: { data: null, error: null },
  });
  assert.equal(missing.res.statusCode, 404);
  assert.equal(missing.res.body.code, "PROFILE_NOT_FOUND");
});

test("existing withdrawals use reserved bank snapshots after reservation", () => {
  const commerce = read("api/_walletCommerce.js");
  const start = commerce.indexOf("export async function handleWithdrawal");
  const end = commerce.indexOf("export async function processWithdrawalWebhook");
  const withdrawal = commerce.slice(start, end);
  assert.match(withdrawal, /reserve_wallet_withdrawal_v2/);
  assert.match(withdrawal, /account_bank: reservation\.bank_code/);
  assert.match(withdrawal, /account_number: reservation\.account_number/);
  assert.doesNotMatch(withdrawal, /profile\.bank_code[\s\S]*requestPayoutWorker/);
});
