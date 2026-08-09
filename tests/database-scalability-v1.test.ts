import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

const candidateUrl = new URL("../supabase/rollouts/database_scalability_v1_candidates.sql", import.meta.url);
const documentationUrl = new URL("../docs/database-scalability-v1.md", import.meta.url);
const preflightUrl = new URL("../supabase/audits/database_scalability_v1_preflight.sql", import.meta.url);
const candidate = await readFile(candidateUrl, "utf8");
const documentation = await readFile(documentationUrl, "utf8");
const preflight = await readFile(preflightUrl, "utf8");

const readyCandidates = [
  "idx_messages_chat_created_id",
  "idx_chat_members_user_chat",
  "idx_chat_members_chat_user",
  "idx_calls_chat_status_started",
  "idx_chats_public_group_member_count",
  "idx_orders_delivery_created_at",
  "idx_subscriptions_user_status",
  "idx_status_views_viewer_status",
];

const sourceContracts: Record<string, { source: string; markers: string[] }> = {
  idx_messages_chat_created_id: {
    source: "../src/pages/PersonalChat.tsx",
    markers: ['.from("messages")', '.eq("chat_id"', '.order("created_at"', '.order("id"', ".limit(CHAT_MESSAGE_PAGE_SIZE)"],
  },
  idx_chat_members_user_chat: {
    source: "../src/pages/ChatHub.tsx",
    markers: ['.from("chat_members")', '.eq("user_id"'],
  },
  idx_chat_members_chat_user: {
    source: "../src/pages/PersonalChat.tsx",
    markers: ['.from("chat_members")', '.eq("chat_id"'],
  },
  idx_calls_chat_status_started: {
    source: "../src/pages/PersonalChat.tsx",
    markers: ['.from("calls")', '.eq("chat_id"', '.eq("status", "active")', '.order("started_at"'],
  },
  idx_chats_public_group_member_count: {
    source: "../src/pages/ChatHub.tsx",
    markers: ['.from("chats")', '.eq("chat_type", "group")', '.eq("is_public", true)', '.order("member_count"'],
  },
  idx_orders_delivery_created_at: {
    source: "../src/pages/Admin.tsx",
    markers: ['.from("orders")', '.eq("delivery_status", "login_sent")', '.order("created_at"'],
  },
  idx_subscriptions_user_status: {
    source: "../src/pages/Dashboard.tsx",
    markers: [".from('subscriptions')", ".eq('user_id'", ".eq('status'"],
  },
  idx_status_views_viewer_status: {
    source: "../src/components/chat/StatusHub.tsx",
    markers: ['.from("status_views")', '.eq("viewer_id"', '.eq("status_id"'],
  },
};

const stripSqlComments = (sql: string) => sql.replace(/--[^\r\n]*/g, "");

test("Phase 2 has no automatically runnable Supabase migration", async () => {
  const migrationFiles = await readdir(new URL("../supabase/migrations/", import.meta.url));
  assert.equal(migrationFiles.some((name) => name.includes("database_scalability_v1")), false);
});

test("candidate rollout contains only non-unique CREATE INDEX statements", () => {
  const executableSql = stripSqlComments(candidate);
  const statements = executableSql.split(";").map((statement) => statement.trim()).filter(Boolean);
  assert.equal(statements.length, readyCandidates.length);
  for (const statement of statements) {
    assert.match(statement, /^create\s+index\s+if\s+not\s+exists\s+\w+/i);
  }
  assert.doesNotMatch(executableSql, /create\s+unique\s+index/i);
  assert.doesNotMatch(executableSql, /\b(drop|truncate|delete|update|insert|alter|grant|revoke)\b/i);
});

test("candidate names are unique and the two plan-testing candidates are absent", () => {
  const names = [...candidate.matchAll(/create\s+index\s+if\s+not\s+exists\s+(\w+)/gi)].map((match) => match[1]);
  assert.deepEqual(names, readyCandidates);
  assert.equal(new Set(names).size, names.length);
  assert.doesNotMatch(candidate, /create\s+index\s+if\s+not\s+exists\s+idx_status_views_status_viewed_at/i);
  assert.doesNotMatch(candidate, /create\s+index\s+if\s+not\s+exists\s+idx_vp_portfolios_slug/i);
  assert.match(candidate, /idx_status_views_status_viewed_at[\s\S]*NOT APPLIED[\s\S]*NEEDS LIVE PLAN TESTING/i);
  assert.match(candidate, /idx_vp_portfolios_slug[\s\S]*NOT APPLIED[\s\S]*REDUNDANT IN PRODUCTION/i);
  assert.doesNotMatch(candidate, /idx_orders_status_created_at/);
  assert.doesNotMatch(candidate, /idx_statuses_user_expires_created/);
});

test("production rollout documentation records the verified result", () => {
  assert.match(documentation, /Production rollout\s+2026-08-09/);
  assert.match(documentation, /Phase 2[\s\S]*COMPLETE/);
  assert.match(documentation, /indisvalid\s*=\s*true/);
  assert.match(documentation, /indisready\s*=\s*true/);
  assert.match(documentation, /indislive\s*=\s*true/);
  assert.match(candidate, /valid=true, ready=true, live=true/);
});

test("every ready candidate maps to a specific repository query shape", async () => {
  for (const indexName of readyCandidates) {
    const contract = sourceContracts[indexName];
    assert.ok(contract, `missing query contract for ${indexName}`);
    const source = await readFile(new URL(contract.source, import.meta.url), "utf8");
    for (const marker of contract.markers) {
      assert.ok(source.includes(marker), `${indexName} is missing query marker ${marker}`);
    }
  }
});

test("runtime source does not reference the manual rollout artifact", async () => {
  const runtimeFiles: string[] = [];
  const visit = async (directory: URL): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, directory);
      if (entry.isDirectory()) await visit(entryUrl);
      else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) runtimeFiles.push(entryUrl.href);
    }
  };
  await visit(new URL("../src/", import.meta.url));
  for (const fileUrl of runtimeFiles) {
    const source = await readFile(new URL(fileUrl), "utf8");
    assert.doesNotMatch(source, /database_scalability_v1_candidates|supabase\/rollouts/);
  }
});

test("read-only preflight inspects catalog structure and query plans without execution", () => {
  const executableSql = stripSqlComments(preflight);
  assert.doesNotMatch(executableSql, /\b(insert|update|delete|drop|truncate|alter|grant|revoke)\b/i);
  assert.doesNotMatch(preflight, /generate_subscripts\(ix\.indkey/i);
  assert.doesNotMatch(preflight, /pg_get_indexdef\(i\.oid,\s*p\s*,/i);
  assert.doesNotMatch(preflight, /pg_get_indexdef\(i\.oid,\s*0\s*,/i);
  assert.match(preflight, /generate_series\(1,\s*ix\.indnatts\)/i);
  assert.match(preflight, /ix\.indkey\[pos\s*-\s*1\]/i);
  assert.match(preflight, /ix\.indoption\[pos\s*-\s*1\]/i);
  assert.match(preflight, /pos\s*<=\s*ix\.indnkeyatts/i);
  assert.match(preflight, /generate_series\(ix\.indnkeyatts\s*\+\s*1,\s*ix\.indnatts\)/i);
  assert.match(preflight, /pg_index/i);
  assert.match(preflight, /pg_class/i);
  assert.match(preflight, /pg_am/i);
  assert.match(preflight, /pg_attribute/i);
  assert.match(preflight, /pg_get_expr/i);
  assert.match(preflight, /indisvalid/i);
  assert.match(preflight, /indisready/i);
  assert.match(preflight, /indisunique/i);
  assert.match(preflight, /indisprimary/i);
  assert.match(preflight, /indislive/i);
  assert.match(preflight, /indkey_signature/i);
  assert.match(preflight, /indcollation_signature/i);
  assert.match(preflight, /indclass_signature/i);
  assert.match(preflight, /indoption_signature/i);
  assert.match(preflight, /exact_equivalent_indexes/i);
  assert.match(preflight, /covering_same_key_indexes/i);
  assert.match(preflight, /candidate_key_prefix_or_superset_indexes/i);
  assert.match(preflight, /existing_key_prefix_indexes/i);
  assert.match(preflight, /'statuses'/i);
  assert.match(preflight, /created_at < '<CREATED_AT>'/i);
  assert.match(preflight, /created_at = '<CREATED_AT>'/i);
  assert.match(preflight, /id < '<MESSAGE_ID>'/i);
  assert.match(preflight, /user_id = '<USER_ID>'/i);
  assert.match(preflight, /user_email = '<USER_EMAIL>'/i);
  assert.match(preflight, /--\s*OR\s+user_email/i);
  assert.match(preflight, /status IN \('paid', 'confirmed', 'completed', 'success', 'active', 'pending'\)/i);
  assert.match(preflight, /FROM public\.statuses/i);
  assert.match(preflight, /user_id IN \('<USER_ID_1>', '<USER_ID_2>'\)/i);
  assert.match(preflight, /expires_at > '<NOW>'/i);
  assert.match(preflight, /EXPLAIN \(COSTS, VERBOSE, FORMAT TEXT\)/g);
  assert.doesNotMatch(executableSql, /EXPLAIN\s+ANALYZE/i);
});

test("rollout artifact has no destructive SQL", () => {
  assert.doesNotMatch(candidate, /\b(drop|truncate|delete|update|insert|alter|grant|revoke)\b/i);
});
