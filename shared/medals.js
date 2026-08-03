export const MEDAL_CAPACITY = 160;

export const MEDAL_PLAN_CATEGORIES = Object.freeze([
  "medal_8k",
  "medal_15k",
  "medal_20k",
]);

/** @typedef {{ success: true, totalSold: number, capacity: 160, remaining: number, soldOut: boolean, updatedAt: string }} MedalSalesResponse */

/** @param {unknown} payload @returns {payload is MedalSalesResponse} */
export function validateMedalSalesResponse(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }
  if (
    payload.success !== true ||
    payload.capacity !== MEDAL_CAPACITY ||
    !Number.isSafeInteger(payload.totalSold) ||
    payload.totalSold < 0 ||
    !Number.isSafeInteger(payload.remaining) ||
    payload.remaining !== Math.max(0, MEDAL_CAPACITY - payload.totalSold) ||
    typeof payload.soldOut !== "boolean" ||
    payload.soldOut !== payload.totalSold >= MEDAL_CAPACITY ||
    typeof payload.updatedAt !== "string" ||
    !payload.updatedAt
  ) {
    return false;
  }
  return true;
}
