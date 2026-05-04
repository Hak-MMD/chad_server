const cloudinary = require("../config/cloudinary");

function normalizeBase64(input) {
  let base64 = input.trim();

  // If already a valid data URI → return as-is
  if (base64.startsWith("data:image")) {
    return base64.replace(/\s/g, ""); // remove whitespace
  }

  // Otherwise, assume raw base64 and wrap it
  return `data:image/png;base64,${base64.replace(/\s/g, "")}`;
}

async function uploadImageBase64(base64, options = {}) {
  console.log("Uploading image to Cloudinary...");

  const dataUri = normalizeBase64(base64);

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: options.folder || "chat-images",
    resource_type: "image",
    overwrite: false,
  });

  console.log("Image uploaded to Cloudinary: ", result);

  return {
    url: result.secure_url,
    width: result.width,
    height: result.height,
    mimeType: result.format,
    publicId: result.public_id,
  };
}

module.exports = { uploadImageBase64 };
