const express = require("express");
const router = express.Router();
const {
  upload,
  handleUploadErrors,
  validateFiles,
  cleanupUploads
} = require("../middleware/upload.middleware");
const { verifyToken } = require("../middleware/auth.middleware");
const { checkRole } = require("../middleware/role.middleware");
const productController = require("../controllers/product.controller");
const orderController = require("../controllers/order.controller");

const productUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "extraImages", maxCount: 5 }
]);

router.get("/", 
  (req, res, next) => {
    next();
  },
  productController.getAllProducts
);
router.get("/filtered", productController.getFilteredProducts);
router.get("/categories", productController.getCategories);
router.get("/category-counts", productController.getCategoryCounts);
router.get("/recent", productController.getRecentProducts);
router.get("/:id", productController.getProductById);
router.post(
  "/",
  verifyToken,
  checkRole(["seller", "admin"]),
  productUpload,
  validateFiles(['image']),
  cleanupUploads,
  handleUploadErrors,
  productController.createProduct
);

router.put(
  "/:id",
  verifyToken,
  productUpload,
  cleanupUploads,
  handleUploadErrors,
  productController.updateProduct
);

router.delete(
  "/:id",
  verifyToken,
  productController.deleteProduct
);

router.put(
  "/:id/delete-image",
  verifyToken,
  productController.deleteProductImage
);

router.get(
  "/seller/my-products",
  verifyToken,
  productController.getSellerProducts
);

router.get(
  "/seller/dashboard",
  verifyToken,
  productController.getSellerDashboardStats
);

router.get(
  "/seller/sales-data",
  verifyToken,
  productController.getSellerSalesData
);

router.get(
  "/seller/popular",
  verifyToken,
  productController.getPopularSellerProducts
);


module.exports = router;