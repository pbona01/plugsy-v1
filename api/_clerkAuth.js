import { ClerkExpressWithAuth, clerkClient } from "@clerk/clerk-sdk-node";

const splitList = (value) =>
  String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const normalizeIssuer = (value) =>
  String(value || "").trim().replace(/\/+$/, "");

function sendAuthError(res, status, code, message) {
  res.status(status).json({
    success: false,
    code,
    error: message,
  });
  return null;
}

function getAuthConfiguration() {
  const secretKey = String(process.env.CLERK_SECRET_KEY || "").trim();
  const issuer = normalizeIssuer(process.env.CLERK_JWT_ISSUER);
  const authorizedParties = splitList(
    process.env.CLERK_AUTHORIZED_PARTIES,
  );
  const audiences = splitList(process.env.CLERK_JWT_AUDIENCE);

  if (!secretKey || !issuer || authorizedParties.length === 0) {
    return null;
  }

  return {
    issuer,
    authorizedParties,
    audiences,
  };
}

function runClerkMiddleware(req, res, authorizedParties) {
  return new Promise((resolve, reject) => {
    ClerkExpressWithAuth({ authorizedParties })(
      req,
      res,
      (error) => {
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

function audienceMatches(actualAudience, expectedAudiences) {
  if (expectedAudiences.length === 0) return true;

  const actual = Array.isArray(actualAudience)
    ? actualAudience
    : actualAudience
      ? [actualAudience]
      : [];

  return expectedAudiences.some((expected) =>
    actual.includes(expected),
  );
}

export async function requireVerifiedClerkUser(req, res) {
  const config = getAuthConfiguration();

  if (!config) {
    console.error("[clerk-auth] required configuration is missing");
    return sendAuthError(
      res,
      503,
      "AUTH_CONFIG_REQUIRED",
      "Secure authentication is temporarily unavailable.",
    );
  }

  try {
    await runClerkMiddleware(
      req,
      res,
      config.authorizedParties,
    );
  } catch (error) {
    console.error(
      "[clerk-auth] token verification failed:",
      error?.message || error,
    );
    return sendAuthError(
      res,
      401,
      "AUTH_INVALID",
      "Your sign-in session is invalid or expired.",
    );
  }

  const userId = req.auth?.userId;
  const claims =
    req.auth?.sessionClaims ||
    req.auth?.claims ||
    {};

  if (!userId) {
    return sendAuthError(
      res,
      401,
      "AUTH_REQUIRED",
      "Sign-in is required.",
    );
  }

  if (
    normalizeIssuer(claims.iss) !== config.issuer ||
    !audienceMatches(claims.aud, config.audiences)
  ) {
    console.error("[clerk-auth] issuer or audience mismatch");
    return sendAuthError(
      res,
      401,
      "AUTH_INVALID",
      "Your sign-in session is invalid or expired.",
    );
  }

  try {
    const user = await clerkClient.users.getUser(userId);

    const email =
      user.emailAddresses?.find(
        (entry) => entry.id === user.primaryEmailAddressId,
      )?.emailAddress ||
      user.emailAddresses?.[0]?.emailAddress ||
      "";

    const fullName =
      [user.firstName, user.lastName]
        .filter(Boolean)
        .join(" ")
        .trim() ||
      user.username ||
      (email ? email.split("@")[0] : "");

    if (!email) {
      return sendAuthError(
        res,
        503,
        "AUTH_PROFILE_UNAVAILABLE",
        "Your verified account email is unavailable.",
      );
    }

    return {
      userId,
      email,
      fullName,
      clerkUser: user,
    };
  } catch (error) {
    console.error(
      "[clerk-auth] user lookup failed:",
      error?.message || error,
    );
    return sendAuthError(
      res,
      503,
      "AUTH_PROFILE_UNAVAILABLE",
      "Your verified account could not be loaded.",
    );
  }
}