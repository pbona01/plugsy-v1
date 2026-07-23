const fs = require('fs');
let code = fs.readFileSync('api/notifications.js', 'utf8');

const debugBlock = `
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
}`;

code = code.replace(/  return res\.status\(404\)\.json\(\{ error: "Unknown action: " \+ action \}\)\n\}/, debugBlock);

fs.writeFileSync('api/notifications.js', code);
