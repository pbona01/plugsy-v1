import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  AdminUsersFailure,
  fetchAllClerkUsers,
  fetchAllProfiles,
  handleListUsers,
  normalizeAdminUsers,
} from "../api-handlers/admin.js";
import {
  ADMIN_USERS_CLIENT_MESSAGES,
  createAdminUsersRequestGate,
  parseAdminUsersResponse,
} from "../shared/admin-users.js";

const rootFile = (path) => new URL(`../${path}`, import.meta.url);

const responseRecorder = () => ({
  headers: new Map(),
  statusCode: 200,
  body: null,
  setHeader(name, value) {
    this.headers.set(String(name).toLowerCase(), String(value));
  },
  status(value) {
    this.statusCode = value;
    return this;
  },
  json(value) {
    this.body = value;
    return value;
  },
});

const request = (method = "GET") => ({
  method,
  headers: { authorization: "Bearer test-token-not-logged" },
  url: "/api/admin?action=list-users",
  query: { action: "list-users" },
});

const clerkUser = (id, overrides = {}) => ({
  id,
  email_addresses: [
    { id: `email_${id}`, email_address: `${id}@example.com` },
  ],
  primary_email_address_id: `email_${id}`,
  first_name: "Plugsy",
  last_name: "Member",
  created_at: 1_700_000_000_000,
  ...overrides,
});

const okProviderResponse = (payload, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: { get: (name) => headers[String(name).toLowerCase()] || null },
  json: async () => payload,
});

const successfulDependencies = (overrides = {}) => ({
  authenticate: async () => ({
    userId: "user_admin",
    clerkUser: { publicMetadata: { role: "admin" } },
  }),
  authorize: async () => true,
  supabase: {},
  fetchClerkUsers: async () => [clerkUser("user_member")],
  fetchProfiles: async () => [],
  ...overrides,
});

test("list-users requires GET", async () => {
  const res = responseRecorder();
  await handleListUsers(request("POST"), res, {});
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.get("allow"), "GET");
});

test("missing authentication returns 401", async () => {
  const res = responseRecorder();
  const req = request();
  req.headers = {};
  await handleListUsers(req, res, {});
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "ADMIN_AUTH_REQUIRED");
});

test("authenticated non-admin returns 403", async () => {
  const res = responseRecorder();
  await handleListUsers(
    request(),
    res,
    successfulDependencies({
      authorize: async (_actor, authRes) => {
        authRes.status(403).json({
          success: false,
          code: "ADMIN_ACCESS_DENIED",
          error: "This account does not have admin access.",
        });
        return false;
      },
    }),
  );
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "ADMIN_ACCESS_DENIED");
});

test("valid admin receives the exact successful array contract", async () => {
  const res = responseRecorder();
  await handleListUsers(request(), res, successfulDependencies());
  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ["admins", "success", "users"]);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.users));
  assert.ok(Array.isArray(res.body.admins));
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(res.headers.get("content-type"), /application\/json/);
});

test("browser users contain only allowlisted fields", () => {
  const [user] = normalizeAdminUsers(
    [
      clerkUser("user_allowlist", {
        private_metadata: { secret: "never" },
        unsafe_metadata: { token: "never" },
      }),
    ],
    [],
  );
  const allowlist = new Set([
    "id",
    "profile_id",
    "clerk_id",
    "clerk_linked",
    "email",
    "first_name",
    "last_name",
    "full_name",
    "clerk_username",
    "username",
    "wallet_tag",
    "imageUrl",
    "created_at",
    "last_login_at",
    "role",
  ]);
  assert.ok(Object.keys(user).every((field) => allowlist.has(field)));
  assert.equal(JSON.stringify(user).includes("private_metadata"), false);
  assert.equal(JSON.stringify(user).includes("unsafe_metadata"), false);
});

test("duplicate Clerk IDs are deduplicated", () => {
  const users = normalizeAdminUsers(
    [clerkUser("user_duplicate"), clerkUser("user_duplicate")],
    [],
  );
  assert.equal(users.length, 1);
});

test("a profile UUID is never treated as a Clerk user ID", () => {
  const [profile] = normalizeAdminUsers([], [
    {
      id: "4d8bc8d8-8b48-4a8a-9b35-074f3f58f10a",
      clerk_id: "4d8bc8d8-8b48-4a8a-9b35-074f3f58f10a",
      email: "legacy@example.com",
      full_name: "Legacy Profile",
    },
  ]);
  assert.equal(profile.clerk_id, null);
  assert.equal(profile.clerk_linked, false);
});

test("missing optional Clerk fields do not crash", () => {
  const [user] = normalizeAdminUsers([{ id: "user_minimal" }], []);
  assert.equal(user.clerk_id, "user_minimal");
  assert.equal(user.email, "");
  assert.equal(user.full_name, "Plugsy Member");
  assert.equal(user.imageUrl, "");
});

test("Clerk pagination retrieves every bounded page", async () => {
  const calls = [];
  const pages = [
    [clerkUser("user_page1"), clerkUser("user_page2")],
    [clerkUser("user_page3")],
  ];
  const users = await fetchAllClerkUsers(
    async (url) => {
      calls.push(url);
      return okProviderResponse(pages[calls.length - 1]);
    },
    { secretKey: "sk_test_safe", pageSize: 2, maxPages: 3 },
  );
  assert.equal(calls.length, 2);
  assert.deepEqual(users.map((user) => user.id), [
    "user_page1",
    "user_page2",
    "user_page3",
  ]);
  assert.match(calls[1], /offset=2/);
});

test("repeated Clerk pages cannot loop forever", async () => {
  let calls = 0;
  const repeated = [clerkUser("user_repeat1"), clerkUser("user_repeat2")];
  await assert.rejects(
    () =>
      fetchAllClerkUsers(
        async () => {
          calls += 1;
          return okProviderResponse(repeated);
        },
        { secretKey: "sk_test_safe", pageSize: 2, maxPages: 5 },
      ),
    (error) =>
      error instanceof AdminUsersFailure &&
      error.code === "ADMIN_USERS_RESPONSE_INVALID",
  );
  assert.equal(calls, 2);
});

test("provider unauthorized is a safe failure, never success", async () => {
  await assert.rejects(
    () =>
      fetchAllClerkUsers(
        async () => okProviderResponse({}, 401),
        { secretKey: "sk_test_safe" },
      ),
    (error) =>
      error.code === "ADMIN_USERS_PROVIDER_UNAUTHORIZED" &&
      error.status === 502,
  );
});

test("provider rate limiting has a stable code and retry information", async () => {
  await assert.rejects(
    () =>
      fetchAllClerkUsers(
        async () => okProviderResponse({}, 429, { "retry-after": "17" }),
        { secretKey: "sk_test_safe" },
      ),
    (error) =>
      error.code === "ADMIN_USERS_RATE_LIMITED" &&
      error.status === 429 &&
      error.retryAfter === 17,
  );
});

test("Supabase profile query failure is not returned as success", async () => {
  const query = {
    select() {
      return this;
    },
    order() {
      return this;
    },
    async range() {
      return { data: null, error: { code: "safe-test-error" } };
    },
  };
  await assert.rejects(
    () => fetchAllProfiles({ from: () => query }),
    (error) => error.code === "ADMIN_USERS_LOOKUP_FAILED",
  );
});

test("malformed provider data receives a safe failure", async () => {
  await assert.rejects(
    () =>
      fetchAllClerkUsers(
        async () => okProviderResponse([null]),
        { secretKey: "sk_test_safe" },
      ),
    (error) => error.code === "ADMIN_USERS_RESPONSE_INVALID",
  );
});

test("client distinguishes 401, 403, 429, malformed, 5xx, and network", async () => {
  const clientResponse = (status, payload, type = "application/json") => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => type },
    json: async () => payload,
  });
  for (const [status, message] of [
    [401, ADMIN_USERS_CLIENT_MESSAGES.unauthorized],
    [403, ADMIN_USERS_CLIENT_MESSAGES.forbidden],
    [429, ADMIN_USERS_CLIENT_MESSAGES.rateLimited],
    [503, ADMIN_USERS_CLIENT_MESSAGES.unavailable],
  ]) {
    await assert.rejects(
      () => parseAdminUsersResponse(clientResponse(status, {})),
      (error) => error.message === message,
    );
  }
  await assert.rejects(
    () => parseAdminUsersResponse(clientResponse(200, "<html>", "text/html")),
    (error) => error.message === ADMIN_USERS_CLIENT_MESSAGES.invalid,
  );
  await assert.rejects(
    () => parseAdminUsersResponse(clientResponse(200, { success: true })),
    (error) => error.message === ADMIN_USERS_CLIENT_MESSAGES.invalid,
  );
  assert.equal(ADMIN_USERS_CLIENT_MESSAGES.unavailable, "Users could not be refreshed right now.");
});

test("initial failure uses the full failure card and refresh failure preserves confirmed data", async () => {
  const admin = await readFile(rootFile("src/pages/Admin.tsx"), "utf8");
  assert.match(admin, /adminUsersError && !hasConfirmedAdminUsers/);
  assert.match(admin, /Admin users could not be loaded/);
  assert.match(admin, /adminUsersError && hasConfirmedAdminUsers/);
  assert.match(admin, /Showing the last confirmed user list/);
  const fetchBlock = admin.slice(
    admin.indexOf("const fetchAdminUsers"),
    admin.indexOf("// Financial Dashboard States"),
  );
  assert.doesNotMatch(fetchBlock, /setAllUsers\(\[\]\)|setAdmins\(\[\]\)/);
});

test("retry starts one request and concurrent triggers cannot overlap", () => {
  const gate = createAdminUsersRequestGate();
  const first = gate.begin();
  assert.ok(first);
  assert.equal(gate.begin(), null);
  gate.finish(first.id);
  const retry = gate.begin();
  assert.ok(retry);
  assert.notEqual(retry.id, first.id);
});

test("an older response cannot replace a newer response", () => {
  const gate = createAdminUsersRequestGate();
  const oldRequest = gate.begin();
  gate.invalidate();
  const newRequest = gate.begin();
  assert.equal(gate.isCurrent(oldRequest.id), false);
  assert.equal(gate.isCurrent(newRequest.id), true);
});

test("the users tab no longer polls Clerk every 30 seconds", async () => {
  const admin = await readFile(rootFile("src/pages/Admin.tsx"), "utf8");
  const effect = admin.slice(
    admin.indexOf('if (activeTab !== "users"'),
    admin.indexOf("// Financial Dashboard States"),
  );
  assert.doesNotMatch(effect, /30_000|setInterval|window\.addEventListener\("focus"/);
  assert.doesNotMatch(effect, /postgres_changes/);
  assert.match(effect, /void fetchAdminUsers\(\)/);
});

test("logs and browser JSON exclude secrets and raw metadata", async () => {
  const messages = [];
  const originalError = console.error;
  console.error = (...args) => messages.push(args);
  try {
    const res = responseRecorder();
    await handleListUsers(
      request(),
      res,
      successfulDependencies({
        fetchClerkUsers: async () => {
          throw new AdminUsersFailure(
            "ADMIN_USERS_PROVIDER_UNAUTHORIZED",
            502,
            { providerStatus: 401 },
          );
        },
      }),
    );
    assert.equal(res.body.code, "ADMIN_USERS_PROVIDER_UNAUTHORIZED");
    const serialized = JSON.stringify({ messages, body: res.body });
    assert.doesNotMatch(serialized, /sk_test|service.role|private_metadata|unsafe_metadata|authorization/i);
  } finally {
    console.error = originalError;
  }
});
