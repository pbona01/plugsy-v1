import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  CHAT_MESSAGE_PAGE_SIZE,
  compareMessageCursor,
  createRefreshCoordinator,
  createRequestGate,
  deriveActiveTypingUsers,
  getNextMessageCursor,
  getNextTypingExpiry,
  mergeIncomingMessage,
  mergeMessagesById,
  ownsChatRequest,
  prependOlderMessages,
  shouldScheduleChatHubRefresh,
  shouldApplyChatResponse,
} from "../src/utils/chatScalability";

const message = (id: string, created_at: string, extra: Record<string, unknown> = {}) => ({
  id, created_at, sender_id: "u1", message_type: "text", content: id, ...extra,
});
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test("initial message query page size is 50", () => assert.equal(CHAT_MESSAGE_PAGE_SIZE, 50));
test("messages render oldest to newest", () => assert.deepEqual(
  mergeMessagesById([message("new", "2026-01-02"), message("old", "2026-01-01")]).map(m => m.id), ["old", "new"],
));
test("older messages prepend without changing chronological order", () => assert.deepEqual(
  prependOlderMessages([message("old", "2026-01-01")], [message("new", "2026-01-02")]).map(m => m.id), ["old", "new"],
));
test("persisted IDs deduplicate", () => assert.equal(mergeMessagesById([message("m", "2026-01-01"), message("m", "2026-01-01", { content: "latest" })]).length, 1));
test("equal timestamps use ID as stable cursor tie-breaker", () => assert.equal(compareMessageCursor({ id: "a", created_at: "same" }, { id: "b", created_at: "same" }) < 0, true));
test("next cursor is the oldest loaded message", () => assert.deepEqual(getNextMessageCursor([message("old", "2026-01-01"), message("new", "2026-01-02")]), { id: "old", created_at: "2026-01-01" }));
test("empty cursor is null", () => assert.equal(getNextMessageCursor([]), null));
test("realtime message appends once", () => assert.deepEqual(mergeIncomingMessage([message("a", "2026-01-01")], message("b", "2026-01-02")).map(m => m.id), ["a", "b"]));
test("sender realtime echo replaces matching optimistic row", () => assert.deepEqual(
  mergeIncomingMessage([message("temp_1", "2026-01-01", { content: "hello" })], message("persisted", "2026-01-01", { content: "hello" })).map(m => m.id), ["persisted"],
));
test("out-of-order arrival is sorted", () => assert.deepEqual(
  mergeIncomingMessage([message("b", "2026-01-02")], message("a", "2026-01-01")).map(m => m.id), ["a", "b"],
));
test("response generation rejects stale chat responses", () => assert.equal(shouldApplyChatResponse(1, 2), false));
test("response generation accepts current chat responses", () => assert.equal(shouldApplyChatResponse(2, 2), true));
test("older-page request gate prevents overlap", async () => {
  const gate = createRequestGate();
  let calls = 0;
  let release!: () => void;
  const first = gate.run(() => new Promise(resolve => { calls++; release = () => resolve("done"); }));
  const second = await gate.run(async () => { calls++; return "wrong"; });
  assert.equal(second, undefined);
  assert.equal(calls, 1);
  release();
  await first;
  assert.equal(gate.active, false);
});
test("request gate releases after failure", async () => {
  const gate = createRequestGate();
  await assert.rejects(gate.run(async () => { throw new Error("fail"); }));
  assert.equal(gate.active, false);
});

const source = async (path: string) => readFile(new URL(path, import.meta.url), "utf8");
test("PersonalChat uses bounded queries and no aggressive message polling", async () => {
  const text = await source("../src/pages/PersonalChat.tsx");
  assert.match(text, /select\(CHAT_MESSAGE_COLUMNS\)[\s\S]*limit\(CHAT_MESSAGE_PAGE_SIZE\)/);
  assert.doesNotMatch(text, /setInterval\(fetchNewMessages,\s*2500\)/);
  assert.match(text, /setInterval\(fetchNewMessages, 30000\)/);
});
test("PersonalChat wires persisted message realtime and deduplication", async () => {
  const text = await source("../src/pages/PersonalChat.tsx");
  assert.match(text, /table: "messages"/);
  assert.match(text, /mergeIncomingMessage/);
  assert.match(text, /Load earlier messages/);
});
test("PersonalChat cleans typing timers on chat changes", async () => {
  const text = await source("../src/pages/PersonalChat.tsx");
  assert.match(text, /clearTimeout\(debouncedStopTypingRef\.current\)/);
  assert.doesNotMatch(text, /pollTyping/);
  assert.doesNotMatch(text, /setInterval\([\s\S]{0,300}select\("typing_users"\)/);
  assert.match(text, /updateTypingStatus\(false\)/);
});
test("ChatHub coalesces refreshes and blocks overlap", async () => {
  const text = await source("../src/pages/ChatHub.tsx");
  assert.match(text, /setTimeout\(\(\) =>/);
  assert.match(text, /createRefreshCoordinator\(150\)/);
  assert.match(text, /inboxRefreshCoordinator\.dispose\(\)/);
  assert.doesNotMatch(text, /table: '\''messages'\''/);
  assert.doesNotMatch(text, /table: '\''chats'\''/);
});
test("routes retain chat and admin guards under Suspense", async () => {
  const text = await source("../src/App.tsx");
  assert.match(text, /const PersonalChat = lazy/);
  assert.match(text, /const Admin = lazy/);
  assert.match(text, /userId && isUserAdmin/);
  assert.match(text, /<Suspense fallback=\{<LoadingSplash \/>\}>/);
});

test("fresh typing from another user is shown", () => assert.deepEqual(
  [...deriveActiveTypingUsers({ u2: { name: "Alex", timestamp: 1000 } }, "u1", 2000)], [["u2", "Alex"]],
));
test("own typing entry is ignored", () => assert.equal(deriveActiveTypingUsers({ u1: { name: "Me", timestamp: 1000 } }, "u1", 2000).size, 0));
test("expired typing entry is removed", () => assert.equal(deriveActiveTypingUsers({ u2: { name: "Alex", timestamp: 1000 } }, "u1", 5000, 4000).size, 0));
test("multiple active typers are preserved", () => assert.deepEqual(
  [...deriveActiveTypingUsers({ u2: { name: "Alex", timestamp: 3000 }, u3: { name: "Sam", timestamp: 3500 } }, "u1", 4000).keys()], ["u2", "u3"],
));
test("typing expiry is local and needs no database reader", () => assert.equal(getNextTypingExpiry({ u2: { timestamp: 1000 } }, "u1", 2000, 4000), 5000));
test("typing expiry has no current-user timer", () => assert.equal(getNextTypingExpiry({ u1: { timestamp: 1000 } }, "u1", 2000, 4000), null));

test("refresh events in the debounce window produce one run", async () => {
  const coordinator = createRefreshCoordinator(5);
  let runs = 0;
  for (let i = 0; i < 5; i++) coordinator.schedule(async () => { runs++; });
  await wait(20);
  assert.equal(runs, 1);
  coordinator.dispose();
});
test("refresh events during in-flight work set pending", async () => {
  const coordinator = createRefreshCoordinator(1);
  let release!: () => void;
  const first = new Promise<void>(resolve => { release = resolve; });
  coordinator.schedule(() => first);
  await wait(5);
  coordinator.schedule(async () => {});
  assert.equal(coordinator.getState().pending, true);
  release();
  await wait(10);
  coordinator.dispose();
});
test("ten in-flight events create one follow-up", async () => {
  const coordinator = createRefreshCoordinator(1);
  let release!: () => void;
  let runs = 0;
  const first = new Promise<void>(resolve => { release = resolve; });
  coordinator.schedule(async () => { runs++; await first; });
  await wait(5);
  for (let i = 0; i < 10; i++) coordinator.schedule(async () => { runs++; });
  release();
  await wait(15);
  assert.equal(runs, 2);
  coordinator.dispose();
});
test("refreshes never overlap", async () => {
  const coordinator = createRefreshCoordinator(1);
  let active = 0;
  let maximum = 0;
  let runs = 0;
  coordinator.schedule(async () => { active++; maximum = Math.max(maximum, active); runs++; await wait(5); active--; });
  await wait(2);
  coordinator.schedule(async () => { active++; maximum = Math.max(maximum, active); runs++; active--; });
  await wait(20);
  assert.equal(maximum, 1);
  assert.equal(runs, 2);
  coordinator.dispose();
});
test("pending clears after follow-up", async () => {
  const coordinator = createRefreshCoordinator(1);
  let release!: () => void;
  const first = new Promise<void>(resolve => { release = resolve; });
  coordinator.schedule(() => first);
  await wait(5);
  coordinator.schedule(async () => {});
  release();
  await wait(15);
  assert.equal(coordinator.getState().pending, false);
  coordinator.dispose();
});
test("failed refresh still permits its pending follow-up", async () => {
  const coordinator = createRefreshCoordinator(1);
  let release!: () => void;
  let runs = 0;
  const first = new Promise<void>((_, reject) => { release = () => reject(new Error("failed")); });
  coordinator.schedule(async () => { runs++; await first; });
  await wait(5);
  coordinator.schedule(async () => { runs++; });
  release();
  await wait(15);
  assert.equal(runs, 2);
  coordinator.dispose();
});
test("dispose clears pending timers and prevents future runs", async () => {
  const coordinator = createRefreshCoordinator(10);
  let runs = 0;
  coordinator.schedule(async () => { runs++; });
  coordinator.dispose();
  await wait(20);
  coordinator.schedule(async () => { runs++; });
  assert.equal(runs, 0);
  assert.equal(coordinator.getState().timer, null);
});

test("current user's new_unread schedules inbox refresh", () => assert.equal(shouldScheduleChatHubRefresh("new_unread", "u1"), true));
test("global message and chat events do not schedule inbox refresh", () => {
  assert.equal(shouldScheduleChatHubRefresh("messages", "u1"), false);
  assert.equal(shouldScheduleChatHubRefresh("chats", "u1"), false);
});
test("current user's membership insert and delete schedule refresh", () => {
  assert.equal(shouldScheduleChatHubRefresh("chat_members", "u1", { new: { user_id: "u1" } }), true);
  assert.equal(shouldScheduleChatHubRefresh("chat_members", "u1", { old: { user_id: "u1" } }), true);
});
test("another user's membership mutation does not schedule refresh", () => assert.equal(
  shouldScheduleChatHubRefresh("chat_members", "u1", { old: { user_id: "u2" } }), false,
));

test("stale chat A success cannot own chat B", () => assert.equal(
  ownsChatRequest({ generation: 1, chatId: "a" }, { generation: 2, chatId: "b" }), false,
));
test("stale chat A failure cannot clear chat B loading owner", () => assert.equal(
  ownsChatRequest({ generation: 1, chatId: "a" }, { generation: 2, chatId: "b" }), false,
));
test("stale older completion cannot change chat B pagination owner", () => assert.equal(
  ownsChatRequest({ generation: 3, chatId: "a" }, { generation: 4, chatId: "b" }), false,
));
test("stale reconciliation cannot clear chat B request ownership", () => assert.equal(
  ownsChatRequest({ generation: 5, chatId: "a" }, { generation: 6, chatId: "b" }), false,
));
