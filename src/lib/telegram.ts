// Telegram credentials are server-only. Browser notification code must not
// proxy or call Telegram directly.
export async function sendTelegramAlert(_message: string): Promise<void> {
  return;
}
