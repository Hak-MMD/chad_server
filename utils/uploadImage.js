const cloudinary = require("../config/cloudinary");

async function uploadImageBase64(base64, options = {}) {
  console.log("Uploading image to Cloudinary...");
  const result = await cloudinary.uploader.upload(base64, {
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
