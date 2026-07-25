type MessageSendContractOptions<T> = {
  insert: () => Promise<T>;
  getInsertedId: (inserted: T) => string | null | undefined;
  runPostInsertSideEffects: (inserted: T, insertedId: string) => Promise<void>;
  logPostInsertError?: (
    message: string,
    error: unknown,
  ) => void;
};

export const executeMessageSendContract = async <T>({
  insert,
  getInsertedId,
  runPostInsertSideEffects,
  logPostInsertError = console.error,
}: MessageSendContractOptions<T>): Promise<string> => {
  const inserted = await insert();
  const insertedId = getInsertedId(inserted);

  if (!insertedId) {
    throw new Error("Message insert did not return a message ID");
  }

  try {
    await runPostInsertSideEffects(inserted, insertedId);
  } catch (error) {
    logPostInsertError(
      `[chatService.sendMessage] post-insert side effect failed for message ${insertedId}:`,
      error,
    );
  }

  return insertedId;
};
