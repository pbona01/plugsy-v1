const keyFor = (scope: string) =>
  `plugsy:idempotency:${scope}`;

export function getStableIdempotencyKey(scope: string): string {
  const storageKey = keyFor(scope);
  const existing = sessionStorage.getItem(storageKey);
  if (existing) return existing;

  const generated =
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}-${Math.random().toString(36).slice(2)}`;

  sessionStorage.setItem(storageKey, generated);
  return generated;
}

export function clearStableIdempotencyKey(scope: string): void {
  sessionStorage.removeItem(keyFor(scope));
}
