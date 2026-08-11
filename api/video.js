import { google } from "googleapis";
import { requireVerifiedClerkUser } from "./_clerkAuth.js";

export const config = {
  api: {
    bodyParser: true,
    responseLimit: "10mb",
  },
};

async function handleVideoUpload(req, res) {
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, error: "Method not allowed" });
  }

  try {
    const actor = await requireVerifiedClerkUser(req, res);
    if (!actor) return;
    let bodyData = req.body;
    if (typeof bodyData === "string") {
      try {
        bodyData = JSON.parse(bodyData);
      } catch (e) {}
    } else if (Buffer.isBuffer(bodyData) || !bodyData) {
      // Fallback or read stream manually if bodyParser didn't catch it
      let chunks = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const rawBody = Buffer.concat(chunks).toString("utf8");
      if (rawBody) bodyData = JSON.parse(rawBody);
      else bodyData = {};
    }

    const { title, description, mimeType } = bodyData || {};
    const safeTitle = String(title || "Uploaded Portfolio Video").trim().slice(0, 100);
    const safeDescription = String(description || "").trim().slice(0, 5000);
    const safeMimeType = ["video/mp4", "video/webm", "video/quicktime"].includes(String(mimeType))
      ? String(mimeType)
      : "video/mp4";
    console.log("[video-upload] creating resumable session for authenticated user", actor.userId);

    if (
      !process.env.YOUTUBE_CLIENT_ID ||
      !process.env.YOUTUBE_CLIENT_SECRET ||
      !process.env.YOUTUBE_REFRESH_TOKEN
    ) {
      return res
        .status(500)
        .json({ success: false, error: "Video service not configured" });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.YOUTUBE_CLIENT_ID,
      process.env.YOUTUBE_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground",
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
    });

    // Get fresh access token
    const { token } = await oauth2Client.getAccessToken();
    console.log("[video-upload] got access token");

    // Create resumable upload session directly via YouTube API
    const initResponse = await fetch(
      "https://www.googleapis.com/upload/youtube/v3/videos" +
        "?uploadType=resumable&part=snippet,status",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
          "X-Upload-Content-Type": safeMimeType,
        },
        body: JSON.stringify({
          snippet: {
            title: safeTitle,
            description: safeDescription,
            categoryId: "22",
            tags: ["portfolio", "plugsy"],
          },
          status: {
            privacyStatus: "unlisted",
            selfDeclaredMadeForKids: false,
          },
        }),
      },
    );

    if (!initResponse.ok) {
      const errText = await initResponse.text();
      console.error("[video-upload] session init failed:", errText);
      return res.status(500).json({
        success: false,
        error: "Failed to create upload session",
      });
    }

    // The upload URL is in the Location header
    const uploadUrl = initResponse.headers.get("location");
    console.log("[video-upload] resumable URL created");

    if (!uploadUrl) {
      return res.status(500).json({
        success: false,
        error: "No upload URL returned",
      });
    }

    return res.status(200).json({
      success: true,
      uploadUrl,
    });
  } catch (e) {
    console.error("[video-upload] crash:", e.message);
    return res.status(500).json({
      success: false,
      error: e.message,
    });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();

  const urlObj = new URL(req.originalUrl || req.url, `http://${req.headers?.host || 'localhost'}`);
  let action =
    req.query?.action ||
    urlObj.searchParams.get("action") ||
    req.url.split("/").pop()?.split("?")[0];

  if (action === "status") {
    try {
      const actor = await requireVerifiedClerkUser(req, res);
      if (!actor) return;
      const videoId = urlObj.searchParams.get("videoId") || req.query?.videoId;
      if (!videoId || !/^[A-Za-z0-9_-]{11}$/.test(String(videoId))) return res.status(400).json({ error: "Invalid video ID" });
      const oauth2Client = new google.auth.OAuth2(
        process.env.YOUTUBE_CLIENT_ID,
        process.env.YOUTUBE_CLIENT_SECRET,
        "https://developers.google.com/oauthplayground",
      );
      oauth2Client.setCredentials({
        refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
      });
      const youtube = google.youtube({ version: "v3", auth: oauth2Client });
      const ytRes = await youtube.videos.list({
        part: ["status"],
        id: [videoId],
      });
      const items = ytRes.data.items;
      if (!items || items.length === 0)
        return res.status(404).json({ error: "Video not found", ready: false });
      const uploadStatus = items[0].status?.uploadStatus;
      return res
        .status(200)
        .json({ ready: uploadStatus === "processed", status: uploadStatus });
    } catch (err) {
      return res.status(500).json({ ready: false, error: err.message });
    }
  }

  if (action === "upload") return await handleVideoUpload(req, res);
  // Handle empty or missing action gracefully because we might receive direct /api/video endpoint from frontend code not fully updated.
  if (!action || req.headers["content-type"]?.includes("multipart/form-data"))
    return await handleVideoUpload(req, res);

  return res.status(404).json({ error: "Unknown action" });
}
