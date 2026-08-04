export async function sendTelegramAlert(message: string): Promise<void> {
  const token = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
  const chatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();
  if (!token || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: String(message || "").slice(0, 4000), parse_mode: "HTML" }),
    });
  } catch {
    console.error("[telegram] operational alert failed safely");
  }
}
