const fs = require('fs');
let code = fs.readFileSync('api/notifications.js', 'utf8');

// 1. Add sendToUserViaOneSignal
const sendToUserFn = `
const sendToUserViaOneSignal = async (supabase, userId, title, body, url, tag) => {
  const appId = process.env.ONESIGNAL_APP_ID;
  const restKey = process.env.ONESIGNAL_REST_API_KEY;

  if (!appId || !restKey) {
    console.error("[onesignal-send] missing app id or rest key");
    return { error: "OneSignal not configured" };
  }

  console.log("[onesignal-send] targeting userId:", userId);

  const primaryPayload = {
    app_id: appId,
    include_external_user_ids: [userId],
    channel_for_external_user_ids: "push",
    headings: { en: title },
    contents: { en: body },
    url: "https://www.plugsy.ng" + (url || "/dashboard"),
    chrome_web_icon: "https://res.cloudinary.com/doit6oaze/image/upload/v1783666216/icon-192_gxuh39.png",
    web_push_topic: tag || "plugsy",
    priority: 10
  };

  console.log("[onesignal-send] trying external_user_id method");

  const primaryRes = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Basic " + restKey
    },
    body: JSON.stringify(primaryPayload)
  });

  const primaryData = await primaryRes.json();
  console.log("[onesignal-send] external_id result:", JSON.stringify(primaryData));

  const primaryRecipients = primaryData.recipients || 0;

  if (primaryRecipients > 0) {
    console.log("[onesignal-send] ✅ delivered via external_id to", primaryRecipients);
    return { success: true, method: "external_id", recipients: primaryRecipients };
  }

  console.log("[onesignal-send] external_id found 0 recipients, trying fallback player_id");

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("onesignal_player_id")
    .eq("user_id", userId)
    .not("onesignal_player_id", "is", null);

  const playerIds = (subs || []).map(s => s.onesignal_player_id).filter(Boolean);

  if (playerIds.length === 0) {
    console.warn("[onesignal-send] ⚠️ no player IDs found either, cannot deliver");
    return { success: false, recipients: 0, reason: "no_subscription_found" };
  }

  const fallbackPayload = {
    app_id: appId,
    include_player_ids: playerIds,
    headings: { en: title },
    contents: { en: body },
    url: "https://www.plugsy.ng" + (url || "/dashboard"),
    chrome_web_icon: "https://res.cloudinary.com/doit6oaze/image/upload/v1783666216/icon-192_gxuh39.png",
    web_push_topic: tag || "plugsy",
    priority: 10
  };

  const fallbackRes = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Basic " + restKey
    },
    body: JSON.stringify(fallbackPayload)
  });

  const fallbackData = await fallbackRes.json();
  console.log("[onesignal-send] player_id fallback result:", JSON.stringify(fallbackData));

  return {
    success: (fallbackData.recipients || 0) > 0,
    method: "player_id_fallback",
    recipients: fallbackData.recipients || 0
  };
};
`;

if (!code.includes('sendToUserViaOneSignal')) {
  code = code.replace('const getPlayerIds =', sendToUserFn + '\nconst getPlayerIds =');
}

// 2. Replace the "send" action handler block
const newSendHandler = `
  if ((action || actionFromBody) === "send") {
    const { userId, title, body, url, tag } = parsedBody;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" })
    }

    const result = await sendToUserViaOneSignal(supabase, userId, title, body, url, tag)
    console.log("[send] final result:", JSON.stringify(result))

    return res.status(200).json({
      success: result.success !== false,
      playerIds: result.recipients || 0,
      method: result.method,
      detail: result
    })
  }
`;

code = code.replace(/  if \(\(action \|\| actionFromBody\) === "send"\) \{[\s\S]*?  if \(\(action \|\| actionFromBody\) === "debug-check"\) \{/, newSendHandler + '\n  if ((action || actionFromBody) === "debug-check") {');

fs.writeFileSync('api/notifications.js', code);
