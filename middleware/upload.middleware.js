const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "ecommerce_uploads", 
    allowed_formats: ["jpg", "png", "gif", "webp"],
  },
});

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only JPEG, PNG, GIF, and WEBP allowed."), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, 
    files: 6,
    fields: 50,
  },
  fileFilter
});

const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message = "File upload error occurred";

    if (err.code === "LIMIT_FILE_SIZE") {
      message = "File too large. Max size is 5MB";
    } else if (err.code === "LIMIT_FILE_COUNT") {
      message = "Too many files uploaded. Max allowed is 6";
    } else if (err.code === "LIMIT_UNEXPECTED_FILE") {
      message = "Unexpected file field";
    }

    return res.status(400).json({
      success: false,
      message,
    });
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message || "An error occurred during file upload",
    });
  }

  next();
};

const validateFiles = (requiredFields = []) => {
  return (req, res, next) => {
    try {
      const files = req.files || {};

      for (const field of requiredFields) {
        const f = files[field];
        if (!f || !Array.isArray(f) || f.length === 0) {
          return res.status(400).json({
            success: false,
            message: `Missing required file field: ${field}`,
          });
        }
      }

      next();
    } catch (err) {
      return res.status(500).json({ success: false, message: 'Error validating files' });
    }
  };
};

module.exports = {
  upload,
  fileFilter,
  handleUploadErrors,
  validateFiles,
};
