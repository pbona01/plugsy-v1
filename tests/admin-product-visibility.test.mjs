import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin product cards provide explicit remove and restore controls", () => {
  const editor = read("src/components/PlanEditor.tsx");
  const admin = read("src/pages/Admin.tsx");

  assert.match(editor, /Remove from site/);
  assert.match(editor, /Restore to site/);
  assert.match(editor, /Removed from site/);
  assert.match(admin, /data: \{ is_active: false \}/);
  assert.match(admin, /data: \{ is_active: true \}/);
  assert.match(admin, /past orders remain safe/);
});

test("removed products stay hidden from listings and direct checkout", () => {
  const products = read("src/pages/Products.tsx");
  const checkout = read("src/pages/CheckoutConfirm.tsx");
  const server = read("src/server/server.ts");

  assert.match(products, /\.eq\("is_active", true\)/);
  assert.match(checkout, /\.eq\("id", planId\)[\s\S]*?\.eq\("is_active", true\)/);
  assert.match(server, /\.eq\("id", planId\)[\s\S]*?\.eq\("is_active", true\)/);
  assert.match(checkout, /This product is no longer available\./);
});

test("editing a removed product does not silently publish it again", () => {
  const admin = read("src/pages/Admin.tsx");

  assert.match(admin, /existingPlan\?\.is_active !== false/);
  assert.match(admin, /is_active: isActive/);
});
