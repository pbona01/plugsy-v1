export type SupportChatMessageRow = {
  id?: string | null;
  chat_id?: string | null;
  user_id?: string | null;
  sender_role?: string | null;
  [key: string]: unknown;
};

export type SupportChatLike = {
  id?: string | null;
  user_id?: string | null;
  userId?: string | null;
  chat_type?: string | null;
  chatType?: string | null;
  last_message_at?: string | number | null;
  lastMessageAt?: string | number | null;
  updated_at?: string | number | null;
  updatedAt?: string | number | null;
  created_at?: string | number | null;
  createdAt?: string | number | null;
  [key: string]: unknown;
};

export const LEGACY_SUPPORT_MESSAGE_ROLES = [
  "admin",
  "system",
  "bot",
  "assistant",
] as const;

const timestampValue = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = value ? new Date(String(value)).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
};

export const isSupportChat = (chat: SupportChatLike) =>
  !["dm", "group", "channel"].includes(
    String(chat.chatType ?? chat.chat_type ?? "").toLowerCase(),
  );

export const compareSupportChatsByActivity = (
  left: SupportChatLike,
  right: SupportChatLike,
) =>
  timestampValue(right.lastMessageAt ?? right.last_message_at) -
    timestampValue(left.lastMessageAt ?? left.last_message_at) ||
  timestampValue(right.updatedAt ?? right.updated_at) -
    timestampValue(left.updatedAt ?? left.updated_at) ||
  timestampValue(right.createdAt ?? right.created_at) -
    timestampValue(left.createdAt ?? left.created_at) ||
  String(left.id || "").localeCompare(String(right.id || ""));

export const selectSupportChatsForUser = <
  T extends SupportChatLike,
>(
  chats: T[],
  ownerUserId: string,
): T[] =>
  [...chats]
    .filter(
      (chat) =>
        isSupportChat(chat) &&
        String(chat.userId ?? chat.user_id ?? "") === ownerUserId,
    )
    .sort(compareSupportChatsByActivity);

export const selectCanonicalSupportChat = <
  T extends SupportChatLike,
>(
  chats: T[],
): T | null =>
  [...chats].filter(isSupportChat).sort(compareSupportChatsByActivity)[0] ||
  null;

export const dedupeSupportChatsByUserId = <
  T extends SupportChatLike,
>(
  chats: T[],
): T[] => {
  const selectedByUserId = new Map<string, T>();
  const nonSupportChats: T[] = [];

  for (const chat of chats) {
    if (!isSupportChat(chat)) {
      nonSupportChats.push(chat);
      continue;
    }

    const ownerUserId = String(chat.userId ?? chat.user_id ?? "");
    if (!ownerUserId.startsWith("user_")) {
      nonSupportChats.push(chat);
      continue;
    }

    const current = selectedByUserId.get(ownerUserId);
    if (
      !current ||
      compareSupportChatsByActivity(chat, current) < 0
    ) {
      selectedByUserId.set(ownerUserId, chat);
    }
  }

  return [...nonSupportChats, ...selectedByUserId.values()].sort(
    compareSupportChatsByActivity,
  );
};

const isLegacySupportRow = (
  row: SupportChatMessageRow,
  ownerUserId: string,
) =>
  row.chat_id == null &&
  row.user_id === ownerUserId &&
  LEGACY_SUPPORT_MESSAGE_ROLES.includes(
    String(row.sender_role || "").toLowerCase() as
      (typeof LEGACY_SUPPORT_MESSAGE_ROLES)[number],
  );

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
  chatId: string | string[],
  ownerUserId = "",
): T[] => {
  const chatIds = new Set(Array.isArray(chatId) ? chatId : [chatId]);
  return rows.filter(
    (row) =>
      (row.chat_id != null && chatIds.has(row.chat_id)) ||
      isLegacySupportRow(row, ownerUserId),
  );
};

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
