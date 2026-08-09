import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
  deriveAdminPagination,
  createAdminRequestCoordinator,
  mergeAdminRowsById,
  normalizeAdminPage,
  normalizeAdminPageSize,
  normalizeAdminSearch,
} from "../src/utils/adminScalability";

const adminSource = await readFile(new URL("../src/pages/Admin.tsx", import.meta.url), "utf8");
const adminApi = await readFile(new URL("../api-handlers/admin.js", import.meta.url), "utf8");
const usersShared = await readFile(new URL("../shared/admin-users.js", import.meta.url), "utf8");

test("default page size is bounded", () => assert.equal(normalizeAdminPageSize(undefined), ADMIN_DEFAULT_PAGE_SIZE));
test("configured page size is retained", () => assert.equal(normalizeAdminPageSize(25), 25));
test("page size is capped", () => assert.equal(normalizeAdminPageSize(1000), ADMIN_MAX_PAGE_SIZE));
test("zero page size uses default", () => assert.equal(normalizeAdminPageSize(0), ADMIN_DEFAULT_PAGE_SIZE));
test("negative page size uses default", () => assert.equal(normalizeAdminPageSize(-5), ADMIN_DEFAULT_PAGE_SIZE));
test("fractional page size uses default", () => assert.equal(normalizeAdminPageSize(10.5), ADMIN_DEFAULT_PAGE_SIZE));
test("invalid page uses first page", () => assert.equal(normalizeAdminPage("bad"), 1));
test("zero page uses first page", () => assert.equal(normalizeAdminPage(0), 1));
test("positive page is retained", () => assert.equal(normalizeAdminPage(3), 3));
test("search trims whitespace", () => assert.equal(normalizeAdminSearch("  Ada  "), "Ada"));
test("missing search is empty", () => assert.equal(normalizeAdminSearch(undefined), ""));
test("search is bounded", () => assert.equal(normalizeAdminSearch("x".repeat(200)).length, 120));
test("pagination reports more rows", () => assert.equal(deriveAdminPagination(1, 50, 125, 50).hasMore, true));
test("pagination reports last page", () => assert.equal(deriveAdminPagination(3, 50, 125, 25).hasMore, false));
test("pagination reports empty result", () => assert.deepEqual(deriveAdminPagination(1, 50, 0, 0), { page: 1, pageSize: 50, total: 0, hasMore: false }));
test("pagination normalizes page", () => assert.equal(deriveAdminPagination(0, 50, 10, 0).page, 1));
test("pagination normalizes page size", () => assert.equal(deriveAdminPagination(1, 1000, 10, 10).pageSize, 100));
test("pagination preserves total", () => assert.equal(deriveAdminPagination(2, 25, 75, 25).total, 75));
test("merge deduplicates IDs", () => assert.deepEqual(mergeAdminRowsById([{ id: "a", value: 1 }], [{ id: "a", value: 2 }]), [{ id: "a", value: 2 }]));
test("merge preserves stable first-seen ordering", () => assert.deepEqual(mergeAdminRowsById([{ id: "a" }, { id: "b" }], [{ id: "c" }, { id: "b" }]).map(row => row.id), ["a", "b", "c"]));
test("merge allows new rows", () => assert.equal(mergeAdminRowsById([], [{ id: "new" }]).length, 1));
test("merge ignores rows without IDs", () => assert.deepEqual(mergeAdminRowsById([{ id: "a" }], [{ value: 2 }]), [{ id: "a" }]));
test("merge replaces duplicate with newest row", () => assert.equal(mergeAdminRowsById([{ id: "a", value: 1 }], [{ id: "a", value: 9 }])[0].value, 9));

test("coordinator permits an owned request", () => {
  const coordinator = createAdminRequestCoordinator();
  const request = coordinator.begin("orders")!;
  assert.equal(coordinator.owns(request), true);
});
test("coordinator prevents overlap by aborting prior request", () => {
  const coordinator = createAdminRequestCoordinator();
  const first = coordinator.begin("orders")!;
  const second = coordinator.begin("orders")!;
  assert.equal(first.controller.signal.aborted, true);
  assert.equal(coordinator.owns(second), true);
});
test("coordinator rejects stale success", () => {
  const coordinator = createAdminRequestCoordinator();
  const first = coordinator.begin("orders")!;
  coordinator.begin("users");
  assert.equal(coordinator.owns(first), false);
});
test("coordinator rejects stale failure", () => {
  const coordinator = createAdminRequestCoordinator();
  const first = coordinator.begin("orders")!;
  coordinator.invalidate();
  assert.equal(coordinator.owns(first), false);
});
test("tab switch invalidates ownership", () => {
  const coordinator = createAdminRequestCoordinator();
  const request = coordinator.begin("orders")!;
  coordinator.begin("withdrawals");
  assert.equal(coordinator.owns(request), false);
});
test("dispose prevents later state ownership", () => {
  const coordinator = createAdminRequestCoordinator();
  const request = coordinator.begin("orders")!;
  coordinator.dispose();
  assert.equal(request.controller.signal.aborted, true);
  assert.equal(coordinator.owns(request), false);
});
test("Admin loader is keyed by active tab", () => assert.match(adminSource, /switch \(activeTab\)/));
test("Admin loader uses a bounded page size", () => assert.match(adminSource, /pageSize=\$\{ADMIN_DEFAULT_PAGE_SIZE\}/));
test("users endpoint receives server search", () => assert.match(adminSource, /action=list-users&page=\$\{usersPage\}.*search=/));
test("One Link search is debounced", () => assert.match(adminSource, /setTimeout\(\(\) => \{[\s\S]*loadPublishedOneLinks\(\);[\s\S]*\}, 300\)/));
test("orders expose pagination controls", () => assert.match(adminSource, /page=\{ordersPage\}.*ordersHasMore/));
test("withdrawals expose pagination controls", () => assert.match(adminSource, /page=\{withdrawalsPage\}.*withdrawalsHasMore/));
test("Admin changed profile read is explicit", () => assert.match(adminSource, /from\('profiles'\)\.select\('id,clerk_id,email,full_name,username,role,profile_pic_url,image_url'/));
test("withdrawal read is explicit and ranged", () => assert.match(adminSource, /from\('withdrawals'\)[\s\S]*select\('id,user_id,user_email/));
test("orders API enforces a maximum page size", () => assert.match(adminApi, /const ADMIN_MAX_PAGE_SIZE = 100/));
test("orders API includes pagination metadata", () => assert.match(adminApi, /pagination: paginationPayload\(page, pageSize, count/));
test("users API supports bounded search", () => assert.match(adminApi, /const search = normalizeSearch/));
test("users shared parser preserves pagination compatibility", () => assert.match(usersShared, /pagination: payload\.pagination/));
test("orders API no longer uses select star", () => assert.doesNotMatch(adminApi, /from\("orders"\)\s*\.select\("\*"\)/));
test("withdrawal API path is not introduced", () => assert.doesNotMatch(adminApi, /from\("withdrawals"\)\s*\.select\("\*"\)/));
test("financial dashboard remains explicitly present", () => assert.match(adminApi, /financial-dashboard/));
test("no migration was added for Admin scalability", async () => {
  const migrations = await readFile(new URL("../supabase/migrations/", import.meta.url)).catch(() => "");
  assert.equal(migrations, "");
});
