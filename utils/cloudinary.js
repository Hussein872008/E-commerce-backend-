const cloudinary = require("../config/cloudinary");

function getPublicIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    if (!url.includes('res.cloudinary.com') && !url.includes('cloudinary.com')) return null;

    const cleanUrl = url.split('?')[0];

    const uploadIndex = cleanUrl.indexOf('/upload/');
    if (uploadIndex === -1) {
      const altIndex = cleanUrl.indexOf('/image/upload/');
      if (altIndex !== -1) {
        const after = cleanUrl.substring(altIndex + '/image/upload/'.length);
        const withoutExt = after.replace(/\.[^/.]+$/, '');
        return withoutExt.replace(/^v\d+\//, '');
      }
      return null;
    }

    const after = cleanUrl.substring(uploadIndex + '/upload/'.length);
    let publicId = after.replace(/\.[^/.]+$/, '');
    publicId = publicId.replace(/^v\d+\//, '');
    return publicId;
  } catch (e) {
    return null;
  }
}

async function deleteFromCloudinary(url) {
  const publicId = getPublicIdFromUrl(url);
  if (!publicId) {
    return;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
    if (result && (result.result === 'ok' || result.result === 'not found' || result.result === 'deleted')) {
      console.log(`Deleted/handled: ${publicId} -> ${result.result}`);
    } else {
      console.log(`destroy result for ${publicId}:`, result);
    }
  } catch (err) {
    console.error('Failed to delete:', err && err.message ? err.message : err);
  }
}

module.exports = { deleteFromCloudinary };
