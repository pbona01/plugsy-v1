
export async function sendTelegramAlert(message: string) {
  try {
    // Try calling the server-side notification endpoint first as it is secure,
    // avoids CORS, and works with server-side environment variables.
    const response = await fetch("/api/notifications?action=telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    
    if (response.ok) {
      console.log("[telegram] Alert sent via server-side proxy successfully");
      return;
    }
  } catch (error) {
    console.warn("[telegram] Failed to send via server-side proxy, falling back to direct send:", error);
  }

  // Fallback to direct telegram API call from browser
  try {
    // Determine environment variables based on platform
    let token: string | undefined;
    let chatId: string | undefined;

    // Check process.env (Node)
    if (typeof process !== 'undefined' && process.env) {
      token = process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
      chatId = process.env.VITE_TELEGRAM_ADMIN_CHAT_ID || process.env.VITE_TELEGRAM_ADMIN_GROUP_ID || process.env.TELEGRAM_CHAT_ID;
    } 
    
    // Fallback to import.meta.env (Vite/Browser) if token/chatId still empty
    if (!token || !chatId) {
      try {
        // @ts-ignore - Handle Vite specific globals
        const viteEnv = (import.meta as any).env;
        if (viteEnv) {
          token = token || viteEnv.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN || viteEnv.TELEGRAM_BOT_TOKEN;
          chatId = chatId || viteEnv.VITE_TELEGRAM_ADMIN_CHAT_ID || viteEnv.VITE_TELEGRAM_ADMIN_GROUP_ID || viteEnv.TELEGRAM_CHAT_ID;
        }
      } catch (e) {
        // import.meta.env might not exist in all environments
      }
    }
    
    // Auto-detect swapped credentials
    if (token && chatId && chatId.includes(':') && !token.includes(':')) {
      console.log("[telegram] Swapped credentials detected, auto-correcting...");
      const temp = token;
      token = chatId;
      chatId = temp;
    }

    if (!token || !chatId) {
        console.error("Telegram token or group ID missing");
        return;
    }

    // Ensure chatId has the -100 prefix for supergroups if needed
    if (chatId) {
        // If it starts with just -, make it -100
        if (chatId.startsWith('-') && !chatId.startsWith('-100')) {
            chatId = '-100' + chatId.slice(1);
        } 
        // If it's just numbers, prepend -100
        else if (!chatId.startsWith('-')) {
            chatId = '-100' + chatId;
        }
    }
    
    // Ensure fetch is available
    const fetchFn = typeof fetch !== 'undefined' ? fetch : (global as any).fetch;
    
    if (!fetchFn) {
        console.error("fetch is not defined in this environment");
        return;
    }

    await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ 
            chat_id: chatId, 
            text: message,
            parse_mode: 'HTML' // For better formatting
        })
    });
  } catch (error) {
    console.error("Telegram notification failed", error);
    // Suppress failed to fetch errors commonly caused by ad-blockers
    // Telegram errors should not break the app flow
  }
}
