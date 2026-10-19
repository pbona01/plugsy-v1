import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveNativeApiUrl } from "../src/lib/nativeApiFetch";

describe("Capacitor hosted API routing", () => {
  it("routes local Android API paths to the configured HTTPS host", () => {
    assert.equal(
      resolveNativeApiUrl("/api/wallet?action=balance", "https://localhost"),
      "https://www.plugsy.ng/api/wallet?action=balance",
    );
  });

  it("routes iOS Capacitor-origin requests while preserving query strings", () => {
    assert.equal(
      resolveNativeApiUrl("capacitor://localhost/api/marketplace?action=listings&page=2", "capacitor://localhost"),
      "https://www.plugsy.ng/api/marketplace?action=listings&page=2",
    );
  });

  it("does not rewrite external requests or non-API app routes", () => {
    assert.equal(resolveNativeApiUrl("https://storage.example/file", "https://localhost"), null);
    assert.equal(resolveNativeApiUrl("/dashboard", "https://localhost"), null);
    assert.equal(resolveNativeApiUrl("/apiculture", "https://localhost"), null);
  });

  it("refuses an insecure API base URL", () => {
    assert.equal(resolveNativeApiUrl("/api/account", "https://localhost", "http://www.plugsy.ng"), null);
    assert.equal(resolveNativeApiUrl("/api/account", "https://localhost", "https://api.example"), null);
  });

  it("declares camera and microphone permissions with user-facing reasons", () => {
    const android = readFileSync("android/app/src/main/AndroidManifest.xml", "utf8");
    const ios = readFileSync("ios/App/App/Info.plist", "utf8");
    const auth = readFileSync("api/_clerkAuth.js", "utf8");
    assert.match(android, /android\.permission\.CAMERA/);
    assert.match(android, /android\.permission\.RECORD_AUDIO/);
    assert.match(ios, /<key>NSCameraUsageDescription<\/key>/);
    assert.match(ios, /<key>NSMicrophoneUsageDescription<\/key>/);
    assert.match(auth, /"https:\/\/localhost", "capacitor:\/\/localhost"/);
  });
});
