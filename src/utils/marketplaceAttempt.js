export function marketplaceAttempt(storage, actorId, listingId, createKey = () => crypto.randomUUID()) {
  const storageKey = `plugsy:marketplace:attempt:${actorId}:${listingId}`;
  const existing = storage.getItem(storageKey);
  if (existing && /^[a-f0-9-]{36}$/i.test(existing)) return existing;
  const key = createKey();
  // Fail closed if persistence is unavailable; never charge with an untracked retry.
  storage.setItem(storageKey, key);
  return key;
}
export function clearMarketplaceAttempt(storage, actorId, listingId) {
  storage.removeItem(`plugsy:marketplace:attempt:${actorId}:${listingId}`);
}
