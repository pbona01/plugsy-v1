const normalizedOrigin = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    return url.protocol === "https:" || url.hostname === "localhost"
      ? url.origin
      : "";
  } catch {
    return "";
  }
};

const configuredOrigins = () => {
  const values = [
    "https://www.plugsy.ng",
    "https://plugsy.ng",
    process.env.SITE_URL,
    process.env.NEXT_PUBLIC_SITE_URL,
    ...(process.env.CORS_ALLOWED_ORIGINS || "").split(","),
  ];
  return new Set(values.map(normalizedOrigin).filter(Boolean));
};

export function applyApiSecurityHeaders(
  req,
  res,
  {
    methods = "GET, POST, OPTIONS",
    headers = "Authorization, Content-Type, Idempotency-Key",
    cacheControl = "private, no-store",
  } = {},
) {
  res.setHeader("Cache-Control", cacheControl);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", methods);
  res.setHeader("Access-Control-Allow-Headers", headers);

  const origin = normalizedOrigin(req.headers?.origin);
  if (!origin) return true;
  if (!configuredOrigins().has(origin)) return false;
  res.setHeader("Access-Control-Allow-Origin", origin);
  return true;
}

export function rejectDisallowedOrigin(req, res, options) {
  if (applyApiSecurityHeaders(req, res, options)) return false;
  res.status(403).json({
    success: false,
    code: "ORIGIN_NOT_ALLOWED",
    error: "This request origin is not allowed.",
  });
  return true;
}
