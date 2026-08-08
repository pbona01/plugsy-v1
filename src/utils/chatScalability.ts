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
