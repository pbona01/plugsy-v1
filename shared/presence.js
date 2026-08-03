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

export function presenceStatusForChannelEvent(event) {
  if (event === "SUBSCRIBED" || event === "SYNC") return "confirmed";
  if (event === "CHANNEL_ERROR" || event === "TIMED_OUT" || event === "CLOSED") return "unavailable";
  return "connecting";
}
