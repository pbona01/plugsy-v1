export const ADMIN_DEFAULT_PAGE_SIZE = 50;
export const ADMIN_MAX_PAGE_SIZE = 100;
export const ADMIN_MAX_SEARCH_LENGTH = 120;

export function normalizeAdminPage(value: unknown): number {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function normalizeAdminPageSize(value: unknown, fallback = ADMIN_DEFAULT_PAGE_SIZE): number {
  const pageSize = Number(value);
  const safeFallback = Math.min(ADMIN_MAX_PAGE_SIZE, Math.max(1, Math.trunc(Number(fallback)) || ADMIN_DEFAULT_PAGE_SIZE));
  if (!Number.isInteger(pageSize) || pageSize < 1) return safeFallback;
  return Math.min(ADMIN_MAX_PAGE_SIZE, pageSize);
}

export function normalizeAdminSearch(value: unknown): string {
  return String(value ?? "").trim().slice(0, ADMIN_MAX_SEARCH_LENGTH);
}

export function deriveAdminPagination(page: number, pageSize: number, total: number, rowCount: number) {
  const safePage = normalizeAdminPage(page);
  const safePageSize = normalizeAdminPageSize(pageSize);
  const safeTotal = Number.isFinite(total) && total >= 0 ? Math.trunc(total) : safePage * safePageSize;
  return {
    page: safePage,
    pageSize: safePageSize,
    total: safeTotal,
    hasMore: safePage * safePageSize < safeTotal || rowCount >= safePageSize,
  };
}

export function mergeAdminRowsById<T extends { id?: unknown }>(existing: T[], incoming: T[]): T[] {
  const merged = new Map<string, T>();
  for (const row of [...existing, ...incoming]) {
    const id = String(row?.id ?? "").trim();
    if (id) merged.set(id, row);
  }
  return [...merged.values()];
}

export function createAdminRequestCoordinator() {
  let generation = 0;
  let disposed = false;
  let active: { id: number; tab: string; controller: AbortController } | null = null;

  return {
    begin(tab: string) {
      if (disposed) return null;
      active?.controller.abort();
      const request = { id: ++generation, tab, controller: new AbortController() };
      active = request;
      return request;
    },
    owns(request: { id: number; tab: string }) {
      return !disposed && active?.id === request.id && active.tab === request.tab;
    },
    invalidate() {
      generation += 1;
      active?.controller.abort();
      active = null;
    },
    dispose() {
      disposed = true;
      generation += 1;
      active?.controller.abort();
      active = null;
    },
  };
}
