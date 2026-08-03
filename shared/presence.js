export function extractCanonicalClerkIds(presenceState) {
  const ids = new Set();
  Object.values(presenceState || {}).forEach((presences) => {
    (Array.isArray(presences) ? presences : []).forEach((presence) => {
      const clerkId = String(presence?.clerk_id || "").trim();
      if (/^user_[A-Za-z0-9_-]{3,}$/.test(clerkId)) ids.add(clerkId);
    });
  });
  return ids;
}
