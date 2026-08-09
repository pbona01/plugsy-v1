export const CHAT_MESSAGE_PAGE_SIZE = 50;

export interface ChatMessageCursor {
  created_at: string;
  id: string;
}

export interface ChatMessageLike extends ChatMessageCursor {
  sender_id?: string;
  message_type?: string;
  content?: unknown;
}

export const getMessageCursor = (message: ChatMessageLike): ChatMessageCursor => ({
  created_at: message.created_at,
  id: message.id,
});

export const compareMessageCursor = (a: ChatMessageCursor, b: ChatMessageCursor) => {
  const timeComparison = a.created_at.localeCompare(b.created_at);
  return timeComparison || a.id.localeCompare(b.id);
};

export const mergeMessagesById = <T extends ChatMessageLike>(messages: T[]): T[] => {
  const byId = new Map<string, T>();
  messages.forEach((message) => {
    if (message?.id) byId.set(message.id, message);
  });
  return [...byId.values()].sort(compareMessageCursor);
};

export const mergeIncomingMessage = <T extends ChatMessageLike>(current: T[], incoming: T): T[] => {
  const optimisticIndex = current.findIndex((message) =>
    message.id.startsWith("temp_") &&
    message.sender_id === incoming.sender_id &&
    message.message_type === incoming.message_type &&
    message.content === incoming.content &&
    Math.abs(new Date(message.created_at).getTime() - new Date(incoming.created_at).getTime()) < 15000,
  );
  const next = optimisticIndex >= 0
    ? current.map((message, index) => index === optimisticIndex ? incoming : message)
    : [...current, incoming];
  return mergeMessagesById(next);
};

export const prependOlderMessages = <T extends ChatMessageLike>(older: T[], current: T[]): T[] =>
  mergeMessagesById([...older, ...current]);

export const getNextMessageCursor = (messages: ChatMessageLike[]): ChatMessageCursor | null => {
  if (!messages.length) return null;
  return getMessageCursor(messages[0]);
};

export const shouldApplyChatResponse = (generation: number, currentGeneration: number) =>
  generation === currentGeneration;

export interface TypingUserEntry {
  name?: string | null;
  timestamp?: number | string | null;
}

export const deriveActiveTypingUsers = (
  typingUsers: Record<string, TypingUserEntry> | null | undefined,
  currentUserId: string | null | undefined,
  now = Date.now(),
  timeoutMs = 4000,
): Map<string, string> => {
  const active = new Map<string, string>();
  Object.entries(typingUsers || {}).forEach(([userId, entry]) => {
    const timestamp = typeof entry?.timestamp === "string"
      ? Number(entry.timestamp)
      : entry?.timestamp;
    if (!userId || userId === currentUserId || !Number.isFinite(timestamp) || now - Number(timestamp) >= timeoutMs) return;
    active.set(userId, entry?.name || "Someone");
  });
  return active;
};

export const getNextTypingExpiry = (
  typingUsers: Record<string, TypingUserEntry> | null | undefined,
  currentUserId: string | null | undefined,
  now = Date.now(),
  timeoutMs = 4000,
): number | null => {
  const expiries = Object.entries(typingUsers || {})
    .filter(([userId]) => userId !== currentUserId)
    .map(([, entry]) => {
      const timestamp = typeof entry?.timestamp === "string" ? Number(entry.timestamp) : entry?.timestamp;
      return Number.isFinite(timestamp) ? Number(timestamp) + timeoutMs : null;
    })
    .filter((expiry): expiry is number => expiry !== null && expiry > now);
  return expiries.length ? Math.min(...expiries) : null;
};

export interface ChatRequestOwner {
  generation: number;
  chatId: string;
}

export const ownsChatRequest = (
  owner: ChatRequestOwner,
  current: { generation: number; chatId: string | null },
) => owner.generation === current.generation && owner.chatId === current.chatId;

export const shouldScheduleChatHubRefresh = (
  event: "new_unread" | "chat_members" | "messages" | "chats",
  currentUserId: string,
  payload: { new?: { user_id?: string }; old?: { user_id?: string }} = {},
) => {
  if (event === "new_unread") return true;
  if (event !== "chat_members") return false;
  return [payload.new?.user_id, payload.old?.user_id].includes(currentUserId);
};

export const createRefreshCoordinator = (delayMs = 150) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let pending = false;
  let disposed = false;
  let latestRun: (() => Promise<void> | void) | null = null;

  const execute = async () => {
    if (disposed || inFlight) return;
    inFlight = true;
    try {
      await latestRun?.();
    } catch {
      // The caller owns logging/error UI; coordinator must remain usable.
    } finally {
      inFlight = false;
      if (!disposed && pending) {
        pending = false;
        timer = setTimeout(() => {
          timer = null;
          void execute();
        }, delayMs);
      }
    }
  };

  const schedule = (run: () => Promise<void> | void) => {
    if (disposed) return;
    latestRun = run;
    if (inFlight) {
      pending = true;
      return;
    }
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      void execute();
    }, delayMs);
  };

  return {
    schedule,
    dispose: () => {
      disposed = true;
      pending = false;
      latestRun = null;
      if (timer) clearTimeout(timer);
      timer = null;
    },
    getState: () => ({ inFlight, pending, timer }),
  };
};

export const coalesceChatRefresh = (schedule: (run: () => void) => void, run: () => void) =>
  schedule(run);

export const createRequestGate = () => {
  let active = false;
  return {
    get active() { return active; },
    async run<T>(operation: () => Promise<T>): Promise<T | undefined> {
      if (active) return undefined;
      active = true;
      try { return await operation(); } finally { active = false; }
    },
  };
};
