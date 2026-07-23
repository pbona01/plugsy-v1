import imageCompression from "browser-image-compression";

export const compressAndUpload = async (
  file: File,
  onProgress?: (status: string) => void
): Promise<string> => {
  console.log("[cloudinary] starting upload:", file.name, file.type, file.size);
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  if (!cloudName) {
    console.error("Missing VITE_CLOUDINARY_CLOUD_NAME");
    throw new Error("Missing VITE_CLOUDINARY_CLOUD_NAME env var");
  }

  let fileToUpload = file;

  if (file.type.startsWith("image/")) {
    onProgress?.("Optimizing image...");
    try {
      const options = {
        maxSizeMB: 2,
        maxWidthOrHeight: 2560,
        useWebWorker: true,
        fileType: "image/webp" as const
      };
      const compressed = await imageCompression(file, options);
      fileToUpload = new File(
        [compressed],
        file.name.replace(/\.[^.]+$/, ".webp"),
        { type: "image/webp" }
      );
      console.log("[cloudinary] compressed:", 
        file.size, "→", fileToUpload.size);
    } catch (e) {
      console.error("[cloudinary] compression failed:", e);
    }
  }

  const form = new FormData();
  form.append("file", fileToUpload);
  
  if (file.type === "application/pdf") {
    form.append("upload_preset", 
      import.meta.env.VITE_CLOUDINARY_PDF_PRESET || import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
  } else {
    form.append("upload_preset", 
      import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET);
  }

  const type = file.type === "application/pdf" ? "raw" : (file.type.startsWith("video/") || file.type.startsWith("audio/")) ? "video" : "image";
  const url = "https://api.cloudinary.com/v1_1/" + 
    cloudName + "/" + type + "/upload";

  console.log("[cloudinary] uploading to:", url);
  onProgress?.("Uploading...");

  const res = await fetch(url, { method: "POST", body: form });
  const data = await res.json();

  console.log("[cloudinary] response:", data);

  if (data.error) {
    throw new Error("Cloudinary error: " + data.error.message);
  }
  if (!data.secure_url) {
    throw new Error("No URL returned from Cloudinary");
  }

  console.log("[cloudinary] success:", data.secure_url);
  onProgress?.("Done ✓");
  return data.secure_url;
};
