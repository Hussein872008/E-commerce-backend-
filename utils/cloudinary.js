const cloudinary = require("../config/cloudinary");

/**
 * Extract Cloudinary public_id from a URL
 */
function getPublicIdFromUrl(url) {
  if (!url) return null;
  try {
    const parts = url.split("/");
    const fileName = parts.pop().split(".")[0]; // abc123
    const folder = parts.slice(parts.indexOf("upload") + 1).join("/"); // ecommerce_uploads
    return `${folder}/${fileName}`;
  } catch {
    return null;
  }
}

async function deleteFromCloudinary(url) {
  const publicId = getPublicIdFromUrl(url);
  if (publicId) {
    try {
      await cloudinary.uploader.destroy(publicId);
      console.log(`[Cloudinary] Deleted: ${publicId}`);
    } catch (err) {
      console.error("[Cloudinary] Failed to delete:", err.message);
    }
  }
}

module.exports = { deleteFromCloudinary };
