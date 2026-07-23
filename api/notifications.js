import { createClient } from "@supabase/supabase-js"

const getSupabase = () => createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vnilkycbtxxcyoynakge.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

const sendViaOneSignal = async (playerIds, title, body, url, tag) => {
  const appId = process.env.ONESIGNAL_APP_ID
  const restKey = process.env.ONESIGNAL_REST_API_KEY

  console.log("[onesignal] app_id exists:", !!appId)
  console.log("[onesignal] rest_key exists:", !!restKey)
  console.log("[onesignal] player_ids:", playerIds?.length)

  if (!appId || !restKey) {
    console.error("[onesignal] MISSING ENV VARS")
    return { error: "Missing ONESIGNAL_APP_ID or ONESIGNAL_REST_API_KEY" }
  }

  if (!playerIds || playerIds.length === 0) {
    console.log("[onesignal] no player IDs to send to")
    return { sent: 0 }
  }

  const payload = {
    app_id: appId,
    include_player_ids: playerIds,
    include_subscription_ids: playerIds,
    headings: { en: title || "Plugsy" },
    contents: { en: body || "You have a notification" },
    url: "https://www.plugsy.ng" + (url || "/dashboard"),
    chrome_web_icon: "https://res.cloudinary.com/doit6oaze/image/upload/v1783666216/icon-192_gxuh39.png",
    firefox_icon: "https://res.cloudinary.com/doit6oaze/image/upload/v1783666216/icon-192_gxuh39.png",
    web_push_topic: tag || "plugsy",
    priority: 10
  }

  console.log("[onesignal] sending payload:", JSON.stringify(payload))

  const res = await fetch("https://onesignal.com/api/v1/notifications", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Basic " + restKey
    },
    body: JSON.stringify(payload)
  })

  const data = await res.json()
  console.log("[onesignal] API response:", JSON.stringify(data))
  return data
}


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

const getPlayerIds = async (supabase, userId) => {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("onesignal_player_id")
    .eq("user_id", userId)
    .not("onesignal_player_id", "is", null)
  
  console.log("[onesignal] player ids for", userId, ":", data?.length, error?.message)
  return (data || []).map(r => r.onesignal_player_id).filter(Boolean)
}

const getAdminPlayerIds = async (supabase) => {
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("onesignal_player_id")
    .eq("user_role", "admin")
    .not("onesignal_player_id", "is", null)
  
  console.log("[onesignal] admin player ids:", data?.length, error?.message)
  return (data || []).map(r => r.onesignal_player_id).filter(Boolean)
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
  if (req.method === "OPTIONS") return res.status(200).end()

  const urlObj = new URL(req.originalUrl || req.url || "/", `http://${req.headers?.host || 'localhost'}`);
  const action = (req.query && req.query.action) || urlObj.searchParams.get("action")
  
  let parsedBody = req.body;
  if (typeof parsedBody === 'string') {
    try {
      parsedBody = JSON.parse(parsedBody);
    } catch (err) {}
  }
  parsedBody = parsedBody || {};
  const actionFromBody = parsedBody.action;

  console.log("[notifications] action:", action || actionFromBody)

  const supabase = getSupabase()


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

  if ((action || actionFromBody) === "debug-check") {
    const { userId } = parsedBody;
    if (!userId) {
      return res.status(400).json({ error: "Missing userId" })
    }
    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", userId)

    return res.status(200).json({
      success: true,
      userId,
      subscriptionCount: subs?.length || 0,
      subscriptions: subs,
      error: error?.message
    })
  }

  if ((action || actionFromBody) === "notify-admins") {
    const { title, body, url, tag } = parsedBody;
    const ids = await getAdminPlayerIds(supabase)
    const result = await sendViaOneSignal(ids, title, body, url, tag)
    return res.status(200).json({ success: true, result, playerIds: ids.length })
  }

  if (action === "debug-all-subs") {
    try {
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("*")
      return res.status(200).json({ success: true, count: data?.length || 0, data, error: error?.message })
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "get-subscriber-counts") {
    try {
      const { data: allSubs, error } = await supabase
        .from("push_subscriptions")
        .select("user_role, onesignal_player_id, subscription")

      if (error) throw error;

      // Filter rows that have a valid ID either in the column or in the JSONB field
      const validSubs = (allSubs || []).filter(s => {
        const id = s.onesignal_player_id || s.subscription?.playerId || s.subscription?.id;
        return !!id;
      });

      const all = validSubs.length || 0
      const user = validSubs.filter(d => d.user_role === "user").length || 0
      const admin = validSubs.filter(d => d.user_role === "admin").length || 0

      return res.status(200).json({
        success: true,
        counts: { all, user, admin }
      })
    } catch (e) {
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "broadcast-all") {
    try {
      const { title, body, url, tag } = parsedBody;

      if (!title || !body) {
        return res.status(400).json({
          success: false,
          error: "Title and body are required"
        })
      }

      const appId = process.env.ONESIGNAL_APP_ID
      const restKey = process.env.ONESIGNAL_REST_API_KEY

      if (!appId || !restKey) {
        return res.status(500).json({
          success: false,
          error: "OneSignal not configured"
        })
      }

      // Use included_segments instead of include_player_ids
      // This targets ALL subscribed devices OneSignal knows
      // about, regardless of whether we saved their player
      // ID in our own database
      const payload = {
        app_id: appId,
        included_segments: ["Subscribed Users"],
        headings: { en: title },
        contents: { en: body },
        url: "https://www.plugsy.ng" + (url || "/dashboard"),
        chrome_web_icon: "https://res.cloudinary.com/doit6oaze/image/upload/v1783666216/icon-192_gxuh39.png",
        web_push_topic: tag || "broadcast",
        priority: 10
      }

      console.log("[broadcast] sending via OneSignal segment 'Subscribed Users'")
      console.log("[broadcast] payload:", JSON.stringify(payload))

      const res2 = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + restKey
        },
        body: JSON.stringify(payload)
      })

      const data = await res2.json()
      console.log("[broadcast] OneSignal response:", JSON.stringify(data))

      if (data.errors) {
        console.error("[broadcast] OneSignal errors:", data.errors)
        return res.status(400).json({
          success: false,
          error: Array.isArray(data.errors) ? data.errors.join(", ") : data.errors
        })
      }

      return res.status(200).json({
        success: true,
        recipientCount: data.recipients || 0,
        result: data
      })

    } catch (e) {
      console.error("[broadcast] crash:", e.message)
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "broadcast-segment") {
    try {
      const { title, body, url, tag, segment } = parsedBody;

      const appId = process.env.ONESIGNAL_APP_ID
      const restKey = process.env.ONESIGNAL_REST_API_KEY

      if (!appId || !restKey) {
        return res.status(500).json({
          success: false,
          error: "OneSignal not configured"
        })
      }

      const payload = {
        app_id: appId,
        filters: [
          { field: "tag", key: "user_role", relation: "=", value: segment }
        ],
        headings: { en: title },
        contents: { en: body },
        url: "https://www.plugsy.ng" + (url || "/dashboard"),
        chrome_web_icon: "https://res.cloudinary.com/doit6oaze/image/upload/v1783666216/icon-192_gxuh39.png",
        web_push_topic: tag || "broadcast",
        priority: 10
      }

      const res2 = await fetch("https://onesignal.com/api/v1/notifications", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Basic " + restKey
        },
        body: JSON.stringify(payload)
      })

      const data = await res2.json()
      console.log("[broadcast-segment] response:", JSON.stringify(data))

      if (data.errors) {
        return res.status(400).json({
          success: false,
          error: Array.isArray(data.errors) ? data.errors.join(", ") : data.errors
        })
      }

      return res.status(200).json({
        success: true,
        recipientCount: data.recipients || 0,
        result: data
      })

    } catch (e) {
      return res.status(500).json({ success: false, error: e.message })
    }
  }

  if (action === "debug-onesignal") {
    const appId = process.env.ONESIGNAL_APP_ID
    const restKey = process.env.ONESIGNAL_REST_API_KEY

    console.log("[debug] ONESIGNAL_APP_ID exists:", !!appId)
    console.log("[debug] ONESIGNAL_APP_ID value:", appId)
    console.log("[debug] ONESIGNAL_REST_API_KEY exists:", !!restKey)
    console.log("[debug] ONESIGNAL_REST_API_KEY length:", restKey?.length)
    console.log("[debug] ONESIGNAL_REST_API_KEY first 10 chars:", 
      restKey?.slice(0, 10))
    console.log("[debug] ONESIGNAL_REST_API_KEY last 5 chars:", 
      restKey?.slice(-5))

    // Test the actual auth header being sent
    const authHeader = "Basic " + restKey
    console.log("[debug] Authorization header being sent:", 
      authHeader.slice(0, 20) + "...")

    // Try a simple GET request to OneSignal to test the key
    // without sending any real notification
    try {
      const testRes = await fetch(
        "https://onesignal.com/api/v1/apps/" + appId,
        {
          headers: {
            "Authorization": authHeader
          }
        }
      )
      const testData = await testRes.json()
      console.log("[debug] OneSignal test response status:", testRes.status)
      console.log("[debug] OneSignal test response:", JSON.stringify(testData))

      return res.status(200).json({
        appIdExists: !!appId,
        appIdValue: appId,
        restKeyExists: !!restKey,
        restKeyLength: restKey?.length,
        restKeyPreview: restKey?.slice(0, 10) + "..." + restKey?.slice(-5),
        oneSignalTestStatus: testRes.status,
        oneSignalTestResponse: testData
      })
    } catch (e) {
      return res.status(200).json({
        appIdExists: !!appId,
        restKeyExists: !!restKey,
        testError: e.message
      })
    }
  }

  if (action === "telegram") {
    const { message } = req.body
    let token = process.env.TELEGRAM_BOT_TOKEN || process.env.VITE_TELEGRAM_ADMIN_TELEGRAM_BOT_TOKEN
    let chatId = process.env.TELEGRAM_CHAT_ID || process.env.VITE_TELEGRAM_ADMIN_CHAT_ID || process.env.VITE_TELEGRAM_ADMIN_GROUP_ID

    // Auto-detect and swap back if credentials are swapped
    if (token && chatId && chatId.includes(':') && !token.includes(':')) {
      const temp = token;
      token = chatId;
      chatId = temp;
    }

    if (chatId) {
      if (chatId.startsWith('-') && !chatId.startsWith('-100')) {
        chatId = '-100' + chatId.slice(1);
      } else if (!chatId.startsWith('-')) {
        chatId = '-100' + chatId;
      }
    }

    if (token && chatId) {
      await fetch(
        "https://api.telegram.org/bot" + token + "/sendMessage",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            chat_id: chatId, 
            text: message,
            parse_mode: 'HTML'
          })
        }
      ).catch(e => console.error("[telegram]", e.message))
    } else {
      console.error("[telegram] Missing token or chatId on server. token:", !!token, "chatId:", !!chatId)
    }
    return res.status(200).json({ success: true })
  }

  if (action === "test") {
    console.log("[notifications] test ping")
    return res.status(200).json({ 
      success: true, 
      message: "Notifications API is live",
      env: {
        onesignal_app_id: !!process.env.ONESIGNAL_APP_ID,
        onesignal_rest_key: !!process.env.ONESIGNAL_REST_API_KEY,
        supabase_url: !!process.env.SUPABASE_URL,
        service_role_key: !!process.env.SUPABASE_SERVICE_ROLE_KEY
      }
    })
  }


  if ((action || actionFromBody) === "debug-user-targeting") {
    try {
      const { userId } = parsedBody;
      const appId = process.env.ONESIGNAL_APP_ID;
      const restKey = process.env.ONESIGNAL_REST_API_KEY;

      const osRes = await fetch(
        "https://onesignal.com/api/v1/players?app_id=" + appId +
        "&filters=" + encodeURIComponent(JSON.stringify([
          { field: "external_id", relation: "=", value: userId }
        ])),
        { headers: { Authorization: "Basic " + restKey } }
      );
      const osData = await osRes.json();

      const supabase = getSupabase();
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("*")
        .eq("user_id", userId);

      return res.status(200).json({
        userId,
        oneSignalExternalIdMatch: osData,
        supabaseSubscriptions: subs
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(404).json({ error: "Unknown action: " + action })
}
