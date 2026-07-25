export type SupportChatMessageRow = {
  id?: string | null;
  chat_id?: string | null;
  [key: string]: unknown;
};

export type SupportChatMessageLike = {
  id?: string | null;
  chat_id?: string | null;
  chatId?: string | null;
  event?: string | null;
  order_id?: string | null;
  orderId?: string | null;
  content?: string | null;
  message?: string | null;
  created_at?: string | number | null;
  createdAt?: string | number | null;
  sender_role?: string | null;
  senderRole?: string | null;
  is_bot?: boolean | null;
  isBot?: boolean | null;
  [key: string]: unknown;
};

export const filterSupportChatRows = <T extends SupportChatMessageRow>(
  rows: T[],
  chatId: string,
): T[] => rows.filter((row) => row.chat_id === chatId);

const messageValue = (message: SupportChatMessageLike, ...keys: string[]) => {
  for (const key of keys) {
    const value = message[key];
    if (value !== undefined && value !== null) return String(value);
  }
  return "";
};

const messageTimestamp = (message: SupportChatMessageLike) => {
  const value = message.createdAt ?? message.created_at;
  if (typeof value === "number") return value;
  const parsed = value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

const isSystemOrBot = (message: SupportChatMessageLike) => {
  const role = messageValue(message, "senderRole", "sender_role").toLowerCase();
  return (
    role === "system" ||
    role === "bot" ||
    message.isBot === true ||
    message.is_bot === true
  );
};

const systemIdentity = (message: SupportChatMessageLike) =>
  [
    messageValue(message, "chatId", "chat_id"),
    messageValue(message, "event"),
    messageValue(message, "orderId", "order_id"),
    messageValue(message, "message", "content"),
  ].join("\u0000");

export const mergeSupportChatMessages = <
  T extends SupportChatMessageLike,
>(
  ...messageGroups: T[][]
): T[] => {
  const sorted = messageGroups
    .flat()
    .sort((a, b) => messageTimestamp(a) - messageTimestamp(b));
  const seenIds = new Set<string>();
  const retainedSystemMessages: T[] = [];
  const merged: T[] = [];

  for (const message of sorted) {
    const id = message.id || "";
    if (id && seenIds.has(id)) continue;
    if (id) seenIds.add(id);

    if (isSystemOrBot(message)) {
      const identity = systemIdentity(message);
      const timestamp = messageTimestamp(message);
      const duplicate = retainedSystemMessages.some(
        (retained) =>
          systemIdentity(retained) === identity &&
          Math.abs(timestamp - messageTimestamp(retained)) <= 10_000,
      );
      if (duplicate) continue;
      retainedSystemMessages.push(message);
    }

    merged.push(message);
  }

  return merged;
};

export const markMessageFailed = <
  T extends { id?: string | null; status?: "pending" | "sent" | "failed" },
>(
  messages: T[],
  messageId: string,
): T[] =>
  messages.map((message) =>
    message.id === messageId ? { ...message, status: "failed" } : message,
  );

export const markMessageSent = <
  T extends { id?: string | null; status?: "pending" | "sent" | "failed" },
>(
  messages: T[],
  temporaryId: string,
  insertedId: string,
): T[] =>
  messages.map((message) =>
    message.id === temporaryId
      ? { ...message, id: insertedId, status: "sent" }
      : message,
  );
