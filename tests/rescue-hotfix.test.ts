import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  filterSupportChatRows,
  markMessageFailed,
  markMessageSent,
  mergeSupportChatMessages,
} from "../src/utils/supportChatMessages";
import {
  PORTFOLIO_PURCHASE_PAUSE_CODE,
  PORTFOLIO_PURCHASE_PAUSE_MESSAGE,
  getPortfolioInitializationPause,
  getPortfolioPurchasePause,
} from "../api/_portfolioPurchasePause.js";
import { executeMessageSendContract } from "../src/utils/messageSendContract";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("support history is filtered by chat_id and includes admin messages without email", () => {
  const rows = [
    {
      id: "user-message",
      chat_id: "support-chat",
      sender_role: "user",
      user_email: "customer@example.com",
    },
    {
      id: "admin-message",
      chat_id: "support-chat",
      sender_role: "admin",
      user_email: null,
    },
    {
      id: "other-chat-message",
      chat_id: "another-chat",
      sender_role: "admin",
      user_email: null,
    },
  ];

  const history = filterSupportChatRows(rows, "support-chat");

  assert.deepEqual(
    history.map((message) => message.id),
    ["user-message", "admin-message"],
  );
});

test("support merge deduplicates database and system duplicates without collapsing user messages", () => {
  const messages = mergeSupportChatMessages([
    {
      id: "same-id",
      chat_id: "support-chat",
      sender_role: "admin",
      content: "First",
      created_at: "2026-07-25T00:00:00Z",
    },
    {
      id: "same-id",
      chat_id: "support-chat",
      sender_role: "admin",
      content: "Duplicate ID",
      created_at: "2026-07-25T00:00:01Z",
    },
    {
      id: "system-1",
      chat_id: "support-chat",
      sender_role: "system",
      event: "payment_confirmed",
      order_id: "order-1",
      content: "Payment confirmed",
      created_at: "2026-07-25T00:00:02Z",
    },
    {
      id: "system-2",
      chat_id: "support-chat",
      sender_role: "system",
      event: "payment_confirmed",
      order_id: "order-1",
      content: "Payment confirmed",
      created_at: "2026-07-25T00:00:08Z",
    },
    {
      id: "user-1",
      chat_id: "support-chat",
      sender_role: "user",
      message: "Hello",
      created_at: "2026-07-25T00:00:09Z",
    },
    {
      id: "user-2",
      chat_id: "support-chat",
      sender_role: "user",
      message: "Hello",
      created_at: "2026-07-25T00:00:10Z",
    },
  ]);

  assert.deepEqual(
    messages.map((message) => message.id),
    ["same-id", "system-1", "user-1", "user-2"],
  );
});

test("support fetches, realtime, and send failures retain the rescue contracts", () => {
  const chatPage = readSource("../src/pages/Chat.tsx");
  const fetchStart = chatPage.indexOf("const fetchMessages = async");
  const fetchEnd = chatPage.indexOf("fetchMessages();", fetchStart);
  const fetchBlock = chatPage.slice(fetchStart, fetchEnd);
  const chatService = readSource("../src/services/chatService.ts");

  assert.match(fetchBlock, /\.eq\("chat_id", chat\.id\)/);
  assert.doesNotMatch(fetchBlock, /user_email|user_id/);
  assert.match(chatPage, /filter: "chat_id=eq\." \+ chatId/);
  assert.match(chatPage, /mergeSupportChatMessages/);
  assert.match(chatService, /if \(msgError\) throw msgError/);
  assert.match(chatService, /Message insert did not return a message ID/);
  assert.match(chatService, /executeMessageSendContract/);

  const failed = markMessageFailed(
    [{ id: "temp-1", status: "pending" as const }],
    "temp-1",
  );
  assert.equal(failed[0].status, "failed");
});

test("message insert failures reject, while post-insert failures still mark the message sent", async () => {
  await assert.rejects(
    executeMessageSendContract({
      insert: async () => {
        throw new Error("insert failed");
      },
      getInsertedId: () => undefined,
      runPostInsertSideEffects: async () => {},
    }),
    /insert failed/,
  );

  await assert.rejects(
    executeMessageSendContract({
      insert: async () => ({}),
      getInsertedId: (inserted: { id?: string }) => inserted.id,
      runPostInsertSideEffects: async () => {},
    }),
    /Message insert did not return a message ID/,
  );

  const insertedId = await executeMessageSendContract({
    insert: async () => ({ id: "message-123" }),
    getInsertedId: (inserted) => inserted.id,
    runPostInsertSideEffects: async () => {
      throw new Error("summary update failed");
    },
    logPostInsertError: () => {},
  });
  const sent = markMessageSent(
    [{ id: "temp-1", status: "pending" as const }],
    "temp-1",
    insertedId,
  );

  assert.equal(insertedId, "message-123");
  assert.equal(sent[0].status, "sent");
});

test("wallet funding remains paused by default before identity, Flutterwave, or transaction work", () => {
  const walletSource = readSource("../api/wallet.js");
  const helperSource = readSource(
    "../api/_walletFundingWebhook.js",
  );

  const fundStart = walletSource.indexOf(
    'if (action === "fund")',
  );
  const fundEnd = walletSource.indexOf(
    'if (action === "webhook")',
    fundStart,
  );
  const fundBlock = walletSource.slice(
    fundStart,
    fundEnd,
  );

  assert.notEqual(fundStart, -1);
  assert.match(
    fundBlock,
    /return initializeWalletFunding\(\{ req, res, supabase \}\)/,
  );

  const initializerStart = helperSource.indexOf(
    "export async function initializeWalletFunding",
  );
  const initializerEnd = helperSource.indexOf(
    "export async function processWalletFundingWebhook",
    initializerStart,
  );
  const initializer = helperSource.slice(
    initializerStart,
    initializerEnd,
  );

  const flagIndex = initializer.indexOf(
    "WALLET_FUNDING_V2_ENABLED",
  );
  const pauseIndex = initializer.indexOf(
    "FUNDING_PAUSE_CODE",
  );
  const identityIndex = initializer.indexOf(
    "requireVerifiedClerkUser(req, res)",
  );
  const transactionIndex = initializer.indexOf(
    '.from("wallet_transactions")',
  );
  const flutterwaveIndex = initializer.indexOf(
    '"https://api.flutterwave.com/v3/payments"',
  );

  assert.notEqual(initializerStart, -1);
  assert.notEqual(flagIndex, -1);
  assert.notEqual(pauseIndex, -1);
  assert.notEqual(identityIndex, -1);
  assert.notEqual(transactionIndex, -1);
  assert.notEqual(flutterwaveIndex, -1);

  assert.match(
    initializer,
    /WALLET_FUNDING_V2_ENABLED[\s\S]*!==[\s\S]*"true"[\s\S]*return res\.status\(503\)/,
  );
  assert.match(
    helperSource,
    /const FUNDING_PAUSE_MESSAGE[\s\S]*Wallet deposits are temporarily paused while we complete an urgent balance-credit fix\. No payment has been initiated\./,
  );

  assert.match(
    initializer,
    /error: FUNDING_PAUSE_MESSAGE/,
  );

  assert.ok(flagIndex < identityIndex);
  assert.ok(pauseIndex < identityIndex);
  assert.ok(pauseIndex < transactionIndex);
  assert.ok(pauseIndex < flutterwaveIndex);
});
test("wallet funding UI shows the exact pause and blocks repeated active submissions", () => {
  const walletPage = readSource("../src/pages/Wallet.tsx");
  const handlerStart = walletPage.indexOf("const handleFundWallet = async");
  const handlerEnd = walletPage.indexOf(
    "const handleSetUsername",
    handlerStart,
  );
  const handler = walletPage.slice(handlerStart, handlerEnd);
  const repeatGuard = handler.indexOf("if (isFunding) return;");
  const request = handler.indexOf(
    'fetch("/api/wallet?action=fund"',
  );

  assert.match(
    walletPage,
    /Wallet deposits are temporarily paused while we complete an urgent balance-credit fix\. No payment has been initiated\./,
  );
  assert.match(
    handler,
    /data\.code === "WALLET_FUNDING_TEMPORARILY_PAUSED"/,
  );
  assert.ok(repeatGuard >= 0);
  assert.ok(repeatGuard < request);
  assert.match(walletPage, /disabled=\{isFunding \|\| !fundAmount\}/);
});

test("portfolio wallet payment uses authenticated atomic entitlement purchase", () => {
  const portfolioApi = readSource("../api/portfolio.js");
  const commerce = readSource("../api/_walletCommerce.js");
  const createPortfolioPage = readSource("../src/pages/CreatePortfolio.tsx");

  assert.match(portfolioApi, /handlePortfolioWalletPurchase/);
  assert.match(commerce, /purchase_portfolio_wallet_v2/);
  assert.match(commerce, /PORTFOLIO_ENTITLEMENT_INVALID/);
  assert.match(createPortfolioPage, /\/api\/portfolio\?action=purchase/);
  assert.match(createPortfolioPage, /Authorization: `Bearer \$\{token\}`/);
  assert.doesNotMatch(createPortfolioPage, /action=pay-with-wallet/);
});

test("portfolio purchase route is reachable while provider and split routes stay retired", () => {
  const portfolioApi = readSource("../api/portfolio.js");
  const apiHandler = portfolioApi.slice(
    portfolioApi.indexOf("export default async function handler"),
  );
  const purchaseDispatchIndex = apiHandler.indexOf(
    'if (action === "purchase")',
  );
  assert.ok(purchaseDispatchIndex >= 0);
  assert.match(apiHandler, /SPLIT_PORTFOLIO_PURCHASE_RETIRED/);
  assert.match(apiHandler, /PORTFOLIO_PROVIDER_WEBHOOK_RETIRED/);
  assert.match(apiHandler, /if \(action === "webhook"\)/);
  assert.match(apiHandler, /if \(action === "verify"\)/);
});
