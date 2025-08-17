const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const ensureUploadsDir = () => {
  const uploadDir = path.join(__dirname, "../uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log("Uploads directory created successfully");
  }
};

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    ensureUploadsDir();
    cb(null, path.join(__dirname, "../uploads"));
  },
  filename: function (req, file, cb) {
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
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
    cb(
      new Error(
        "Invalid file type. Only JPEG, PNG, GIF, and WEBP image files are allowed."
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 6,
    fields: 50, 
  },
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
    if (!req.files) {
      return res.status(400).json({
        success: false,
        message: "No files were uploaded",
      });
    }

    for (const field of requiredFields) {
      if (!req.files[field]) {
        return res.status(400).json({
          success: false,
          message: `File field '${field}' is required`,
        });
      }
    }

    next();
  };
};

const cleanupUploads = (req, res, next) => {
  res.on("finish", () => {
    if (res.statusCode >= 400 && req.files) {
      for (const field in req.files) {
        req.files[field].forEach((file) => {
          const filePath = path.join(__dirname, "../uploads", file.filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        });
      }
    }
  });

  next();
};

module.exports = {
  upload,
  handleUploadErrors,
  validateFiles,
  cleanupUploads,
};