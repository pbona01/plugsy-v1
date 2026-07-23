export const sendOrderToTelegram = async (orderData: { userName: string, productName: string, price: number, receiptUrl: string }) => {
    const token = import.meta.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN;
    let chatId = import.meta.env.VITE_TELEGRAM_ADMIN_GROUP_ID;

    if (!token || !chatId) {
        console.error("Telegram notification config missing.");
        return;
    }

    if (!chatId.startsWith('-100')) {
        chatId = '-100' + chatId.replace(/^-/, '');
    }

    const caption = `🔥 NEW ORDER RECEIVED
------------------------
👤 User: ${orderData.userName}
📦 Product: ${orderData.productName}
💰 Amount: ₦${orderData.price.toLocaleString()}
------------------------
🔗 [Open Admin Panel to Verify](https://plugsy.ng/admin)`;

    try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                chat_id: chatId,
                photo: orderData.receiptUrl,
                caption: caption,
                parse_mode: 'HTML'
            })
        });
        if (!response.ok) {
            const t = await response.text();
            console.warn("Telegram API Error:", t);
        } else {
            console.log("Telegram API Response: OK");
        }
    } catch (err) {
        // Suppress failed to fetch errors commonly caused by ad-blockers
    }
};
