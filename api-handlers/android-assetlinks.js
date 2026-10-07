const PACKAGE_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/;
const FINGERPRINT_PATTERN = /^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/;

export default function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json([]);
  }

  const packageName = String(process.env.ANDROID_APP_PACKAGE || "ng.plugsy.app").trim();
  const fingerprint = String(process.env.ANDROID_APP_SHA256_CERT_FINGERPRINT || "").trim().toUpperCase();
  if (!PACKAGE_PATTERN.test(packageName) || !FINGERPRINT_PATTERN.test(fingerprint)) {
    return res.status(503).json([]);
  }

  return res.status(200).json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: [fingerprint],
    },
  }]);
}
