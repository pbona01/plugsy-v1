import imageCompression from "browser-image-compression";
import { chooseOneLinkWallpaperTextMode } from "../../shared/onelink.js";

export type OneLinkImageKind = "avatar" | "wallpaper";
export type OneLinkTextMode = "light" | "dark";

export interface OneLinkUploadResult {
  secureUrl: string;
  publicId: string;
  detectedTextMode?: OneLinkTextMode;
  contrastDetectionFailed?: boolean;
}

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;

const parseCloudinaryResponse = (value: unknown): unknown => {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const getCloudinaryUploadErrorMessage = (value: unknown) => {
  const data = parseCloudinaryResponse(value);
  let providerMessage = "";
  if (data && typeof data === "object" && "error" in data) {
    const error = (data as { error?: unknown }).error;
    if (typeof error === "string") {
      providerMessage = error;
    } else if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") providerMessage = message;
    }
  }

  const normalized = providerMessage.toLowerCase();
  if (normalized.includes("signature")) {
    return "Secure image upload authentication failed.";
  }
  if (normalized.includes("upload preset") || normalized.includes("preset")) {
    return "The One Link upload preset is unavailable.";
  }
  if (
    normalized.includes("api key") ||
    normalized.includes("api_key") ||
    normalized.includes("cloud name") ||
    normalized.includes("cloud_name") ||
    normalized.includes("unknown cloud") ||
    normalized.includes("invalid cloud")
  ) {
    return "The One Link media configuration is invalid.";
  }
  if (
    normalized.includes("file size") ||
    normalized.includes("too large") ||
    normalized.includes("maximum file") ||
    normalized.includes("max file")
  ) {
    return "Choose an image no larger than 10 MB.";
  }
  if (
    normalized.includes("format") ||
    normalized.includes("unsupported") ||
    normalized.includes("invalid image") ||
    normalized.includes("image file")
  ) {
    return "Choose a valid JPEG, PNG, WebP, or AVIF image.";
  }
  return "Image upload failed.";
};

const hasExpectedSignature = async (file: File) => {
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (file.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (file.type === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    );
  }
  if (file.type === "image/webp") {
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  }
  if (file.type === "image/avif") {
    const brand = String.fromCharCode(...bytes.slice(8, 12));
    return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp" &&
      (brand === "avif" || brand === "avis");
  }
  return false;
};

export const getOneLinkImageDeliveryUrl = (
  value: string | null | undefined,
  kind: OneLinkImageKind,
) => {
  const url = String(value || "").trim();
  const marker = "/image/upload/";
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0 || !url.startsWith("https://res.cloudinary.com/")) {
    return url;
  }
  const transformation =
    kind === "avatar"
      ? "f_auto,q_auto,c_fill,g_auto,w_320,h_320/"
      : "f_auto,q_auto,c_fill,g_auto,w_1600,h_2000/";
  return `${url.slice(0, markerIndex + marker.length)}${transformation}${url.slice(
    markerIndex + marker.length,
  )}`;
};

export async function detectWallpaperTextMode(
  wallpaperUrl: string,
): Promise<{
  textMode: OneLinkTextMode;
  detectionFailed: boolean;
  luminance: number | null;
}> {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("Wallpaper could not be sampled"));
    });
    image.src = getOneLinkImageDeliveryUrl(wallpaperUrl, "wallpaper");
    await loaded;

    const canvas = document.createElement("canvas");
    canvas.width = 36;
    canvas.height = 48;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas is unavailable");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let weightedLuminance = 0;
    let totalWeight = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        const red = pixels[offset] / 255;
        const green = pixels[offset + 1] / 255;
        const blue = pixels[offset + 2] / 255;
        const linear = (channel: number) =>
          channel <= 0.04045
            ? channel / 12.92
            : Math.pow((channel + 0.055) / 1.055, 2.4);
        const luminance =
          0.2126 * linear(red) +
          0.7152 * linear(green) +
          0.0722 * linear(blue);
        const central =
          x >= canvas.width * 0.15 &&
          x <= canvas.width * 0.85 &&
          y >= canvas.height * 0.12 &&
          y <= canvas.height * 0.88;
        const weight = central ? 2 : 1;
        weightedLuminance += luminance * weight;
        totalWeight += weight;
      }
    }
    const luminance = weightedLuminance / Math.max(totalWeight, 1);
    return {
      textMode: chooseOneLinkWallpaperTextMode(luminance),
      detectionFailed: false,
      luminance,
    };
  } catch {
    return { textMode: "light", detectionFailed: true, luminance: null };
  }
}

const uploadWithProgress = (
  url: string,
  body: FormData,
  onProgress?: (status: string) => void,
) =>
  new Promise<any>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
      onProgress?.(`Uploading ${percent}%`);
    };
    request.onerror = () => reject(new Error("Image upload failed."));
    request.onload = () => {
      const data = parseCloudinaryResponse(request.response) as {
        error?: unknown;
      } | null;
      if (request.status < 200 || request.status >= 300 || data?.error) {
        reject(new Error(getCloudinaryUploadErrorMessage(data)));
        return;
      }
      resolve(data);
    };
    request.send(body);
  });

export async function uploadOneLinkImage({
  file,
  kind,
  getToken,
  onProgress,
}: {
  file: File;
  kind: OneLinkImageKind;
  getToken: () => Promise<string>;
  onProgress?: (status: string) => void;
}): Promise<OneLinkUploadResult> {
  if (!ALLOWED_IMAGE_TYPES.has(file.type) || !(await hasExpectedSignature(file))) {
    throw new Error("Choose a valid JPEG, PNG, WebP, or AVIF image.");
  }
  if (file.size <= 0 || file.size > MAX_ORIGINAL_BYTES) {
    throw new Error("Choose an image no larger than 10 MB.");
  }

  onProgress?.("Optimizing image…");
  let compressed;
  try {
    compressed = await imageCompression(file, {
      maxSizeMB: kind === "avatar" ? 1 : 2,
      maxWidthOrHeight: kind === "avatar" ? 1024 : 2560,
      useWebWorker: true,
      fileType: "image/webp",
      initialQuality: kind === "avatar" ? 0.86 : 0.84,
    });
  } catch {
    throw new Error("This image could not be processed safely.");
  }

  const token = await getToken();
  const signatureResponse = await fetch(
    "/api/onelink?action=upload-signature",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kind }),
    },
  );
  const signatureData = await signatureResponse.json().catch(() => null);
  if (!signatureResponse.ok || !signatureData?.success) {
    throw new Error("Secure image upload is temporarily unavailable.");
  }

  const form = new FormData();
  form.append("file", compressed, `${kind}.webp`);
  form.append("api_key", signatureData.apiKey);
  form.append("timestamp", String(signatureData.timestamp));
  form.append("public_id", signatureData.publicId);
  form.append("upload_preset", signatureData.uploadPreset);
  form.append("overwrite", "false");
  form.append("signature", signatureData.signature);

  const result = await uploadWithProgress(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(
      signatureData.cloudName,
    )}/image/upload`,
    form,
    onProgress,
  );
  if (
    typeof result?.secure_url !== "string" ||
    typeof result?.public_id !== "string" ||
    result.public_id !== signatureData.publicId ||
    result.resource_type !== "image"
  ) {
    throw new Error("The uploaded image could not be verified.");
  }

  const uploaded: OneLinkUploadResult = {
    secureUrl: result.secure_url,
    publicId: result.public_id,
  };
  if (kind === "wallpaper") {
    onProgress?.("Checking text contrast…");
    const detection = await detectWallpaperTextMode(result.secure_url);
    uploaded.detectedTextMode = detection.textMode;
    uploaded.contrastDetectionFailed = detection.detectionFailed;
  }
  onProgress?.("Upload ready");
  return uploaded;
}
