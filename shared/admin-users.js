export const ADMIN_USERS_CLIENT_MESSAGES = Object.freeze({
  unauthorized: "Admin session expired. Sign in again.",
  forbidden: "This account does not have admin access.",
  rateLimited:
    "User synchronization is temporarily rate limited. Retry shortly.",
  invalid: "The admin user service returned an invalid response.",
  unavailable: "Users could not be refreshed right now.",
});

export const isAdminUsersSuccessPayload = (value) =>
  Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.success === true &&
      Array.isArray(value.users) &&
      Array.isArray(value.admins) &&
      Object.keys(value).length === 3 &&
      Object.keys(value).every((key) =>
        ["success", "users", "admins"].includes(key),
      ),
  );

export const getAdminUsersFailureMessage = (status, invalid = false) => {
  if (invalid) return ADMIN_USERS_CLIENT_MESSAGES.invalid;
  if (status === 401) return ADMIN_USERS_CLIENT_MESSAGES.unauthorized;
  if (status === 403) return ADMIN_USERS_CLIENT_MESSAGES.forbidden;
  if (status === 429) return ADMIN_USERS_CLIENT_MESSAGES.rateLimited;
  return ADMIN_USERS_CLIENT_MESSAGES.unavailable;
};

export async function parseAdminUsersResponse(response) {
  const contentType = String(
    response?.headers?.get?.("content-type") || "",
  ).toLowerCase();
  if (!contentType.includes("application/json")) {
    throw new Error(getAdminUsersFailureMessage(response?.status, true));
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(getAdminUsersFailureMessage(response.status));
  }
  if (!isAdminUsersSuccessPayload(payload)) {
    throw new Error(getAdminUsersFailureMessage(response.status, true));
  }
  return { users: payload.users, admins: payload.admins };
}

export function createAdminUsersRequestGate() {
  let generation = 0;
  let active = null;
  let disposed = false;

  return {
    begin() {
      if (disposed || active) return null;
      const request = {
        id: ++generation,
        controller: new AbortController(),
      };
      active = request;
      return request;
    },
    isCurrent(id) {
      return !disposed && active?.id === id && generation === id;
    },
    finish(id) {
      if (active?.id === id) active = null;
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
