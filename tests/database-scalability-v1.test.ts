import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260809090000_database_scalability_v1.sql", import.meta.url);
const migration = await readFile(migrationUrl, "utf8");

const expectedIndexes = [
  "idx_messages_chat_created_id",
  "idx_chat_members_user_chat",
  "idx_chat_members_chat_user",
  "idx_calls_chat_status_started",
  "idx_chats_public_group_member_count",
  "idx_orders_status_created_at",
  "idx_orders_delivery_created_at",
  "idx_subscriptions_user_status",
  "idx_statuses_user_expires_created",
  "idx_status_views_viewer_status",
  "idx_status_views_status_viewed_at",
  "idx_vp_portfolios_slug",
];

const queryEvidence: Record<string, { source: string; marker: string; table: string }> = {
  idx_messages_chat_created_id: { source: "../src/pages/PersonalChat.tsx", marker: '.from("messages")', table: "messages" },
  idx_chat_members_user_chat: { source: "../src/pages/ChatHub.tsx", marker: '.from("chat_members")', table: "chat_members" },
  idx_chat_members_chat_user: { source: "../src/pages/PersonalChat.tsx", marker: '.from("chat_members")', table: "chat_members" },
  idx_calls_chat_status_started: { source: "../src/pages/PersonalChat.tsx", marker: '.from("calls")', table: "calls" },
  idx_chats_public_group_member_count: { source: "../src/pages/ChatHub.tsx", marker: '.from("chats")', table: "chats" },
  idx_orders_status_created_at: { source: "../src/pages/Dashboard.tsx", marker: ".from('orders')", table: "orders" },
  idx_orders_delivery_created_at: { source: "../src/pages/Admin.tsx", marker: '.from("orders")', table: "orders" },
  idx_subscriptions_user_status: { source: "../src/pages/Dashboard.tsx", marker: ".from('subscriptions')", table: "subscriptions" },
  idx_statuses_user_expires_created: { source: "../src/components/chat/StatusHub.tsx", marker: '.from("statuses")', table: "statuses" },
  idx_status_views_viewer_status: { source: "../src/components/chat/StatusHub.tsx", marker: '.from("status_views")', table: "status_views" },
  idx_status_views_status_viewed_at: { source: "../src/components/chat/StatusHub.tsx", marker: '.from("status_views")', table: "status_views" },
  idx_vp_portfolios_slug: { source: "../src/pages/PublicPortfolio.tsx", marker: '.from("vp_portfolios")', table: "vp_portfolios" },
};

test("migration contains only additive non-unique index creation", () => {
  const prohibited = /\bDROP\b|\bTRUNCATE\b|\bDELETE\s+FROM\b|\bUPDATE\s+\w|\bINSERT\s+INTO\b|\bALTER\s+TABLE\b|DISABLE\s+ROW\s+LEVEL\s+SECURITY|CREATE\s+POLICY|DROP\s+POLICY|\bGRANT\b|\bREVOKE\b|CREATE\s+UNIQUE\s+INDEX|CREATE\s+TRIGGER|CREATE\s+FUNCTION/i;
  assert.doesNotMatch(migration, prohibited);
  assert.match(migration, /CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/i);
  assert.doesNotMatch(migration, /CREATE\s+INDEX\s+(?!IF\s+NOT\s+EXISTS)/i);
});

test("migration has the expected index names", () => {
  const names = [...migration.matchAll(/create\s+index\s+if\s+not\s+exists\s+(\w+)/gi)].map((match) => match[1]);
  assert.deepEqual(names, expectedIndexes);
  assert.equal(new Set(names).size, names.length);
});

test("every implemented index maps to repository query evidence", async () => {
  for (const indexName of expectedIndexes) {
    const evidence = queryEvidence[indexName];
    assert.ok(evidence, `missing query mapping for ${indexName}`);
    const source = await readFile(new URL(evidence.source, import.meta.url), "utf8");
    assert.ok(source.includes(evidence.marker), `${indexName} query source missing`);
    assert.match(migration, new RegExp(`on\\s+public\\.${evidence.table}\\b`, "i"), `${indexName} references an unproved table`);
  }
});

test("message index matches Phase 1 cursor ordering", async () => {
  assert.match(migration, /on\s+public\.messages\s*\(\s*chat_id,\s*created_at\s+desc,\s*id\s+desc\s*\)/i);
  const source = await readFile(new URL("../src/pages/PersonalChat.tsx", import.meta.url), "utf8");
  assert.match(source, /order\("created_at",\s*\{\s*ascending:\s*false\s*\}\)[\s\S]*order\("id",\s*\{\s*ascending:\s*false\s*\}\)[\s\S]*limit\(CHAT_MESSAGE_PAGE_SIZE\)/);
});
