import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  CHAT_MESSAGE_PAGE_SIZE,
  compareMessageCursor,
  createRequestGate,
  getNextMessageCursor,
  mergeIncomingMessage,
  mergeMessagesById,
  prependOlderMessages,
  shouldApplyChatResponse,
} from "../src/utils/chatScalability";

const message = (id: string, created_at: string, extra: Record<string, unknown> = {}) => ({
  id, created_at, sender_id: "u1", message_type: "text", content: id, ...extra,
});

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
  assert.match(text, /updateTypingStatus\(false\)/);
});
test("ChatHub coalesces refreshes and blocks overlap", async () => {
  const text = await source("../src/pages/ChatHub.tsx");
  assert.match(text, /setTimeout\(\(\) =>/);
  assert.match(text, /inboxRefreshRef\.current\.inFlight/);
  assert.match(text, /clearTimeout\(inboxRefreshRef\.current\.timer\)/);
});
test("routes retain chat and admin guards under Suspense", async () => {
  const text = await source("../src/App.tsx");
  assert.match(text, /const PersonalChat = lazy/);
  assert.match(text, /const Admin = lazy/);
  assert.match(text, /userId && isUserAdmin/);
  assert.match(text, /<Suspense fallback=\{<LoadingSplash \/>\}>/);
});
