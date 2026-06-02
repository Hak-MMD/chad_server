const cloudinary = require("../config/cloudinary");

const MAX_BASE64_LENGTH = 7 * 1024 * 1024; // ~5 MB of actual image data encoded as base64

function normalizeBase64(input) {
  let base64 = input.trim();

  // If already a valid data URI → return as-is
  if (base64.startsWith("data:image")) {
    return base64.replace(/\s/g, "");
  }

  // Otherwise, assume raw base64 and wrap it
  return `data:image/png;base64,${base64.replace(/\s/g, "")}`;
}

async function uploadImageBase64(base64, options = {}) {
  if (base64.length > MAX_BASE64_LENGTH) {
    throw new Error("Image too large. Maximum size is approximately 5 MB.");
  }

  const dataUri = normalizeBase64(base64);

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: options.folder || "chat-images",
    resource_type: "image",
    overwrite: false,
  });

  return {
    url: result.secure_url,
    width: result.width,
    height: result.height,
    mimeType: result.format,
    publicId: result.public_id,
  };
}

module.exports = { uploadImageBase64 };
