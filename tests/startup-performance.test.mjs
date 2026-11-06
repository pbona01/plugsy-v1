import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("startup avoids fixed splash delays and eagerly loaded optional tools", () => {
  const app = read("src/App.tsx");
  assert.doesNotMatch(app, /<SplashScreen\s*\/>/);
  assert.match(app, /lazyWithDeploymentRecovery\(\(\) => import\("\.\/components\/chat\/ChatWidget"\)\)/);
  assert.match(app, /lazyWithDeploymentRecovery\(\(\) => import\("\.\/components\/NotificationBell"\)\)/);
  assert.match(app, /mode="sync"/);
});

test("video calling and stale deployment recovery stay off the critical path", () => {
  const calls = read("src/contexts/CallContext.tsx");
  const main = read("src/main.tsx");
  const vite = read("vite.config.ts");
  assert.match(calls, /lazy\(\(\) => import\("@\/components\/calls\/ActiveCallScreen"\)\)/);
  assert.match(main, /recoverStaleDeployment\("preload"\)/);
  assert.match(vite, /navigateFallback: null/);
  assert.doesNotMatch(vite, /cacheName: "plugsy-app-assets"/);
});

test("retired manual delivery queue is absent from admin", () => {
  const admin = read("src/pages/Admin.tsx");
  assert.doesNotMatch(admin, /id: 'pending'.*Pending Queue/);
  assert.doesNotMatch(admin, /Awaiting Fulfillment \(logins delivery\)/);
  assert.doesNotMatch(admin, /handleSendLogins/);
});
