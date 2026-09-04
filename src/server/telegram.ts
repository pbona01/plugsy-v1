export async function sendTelegramAlert(message: string): Promise<void> {
  const token = String(
    process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN || "",
  ).trim();
  const chatId = String(
    process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_ADMIN_GROUP_ID || "",
  ).trim();
  if (!token || !chatId) return;
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: String(message || "").slice(0, 4000), parse_mode: "HTML" }),
    });
    if (!response.ok) {
      console.error("[telegram] delivery failed", response.status, await response.text());
    }
  } catch (error) {
    console.error("[telegram] operational alert failed safely", error);
  }
}
