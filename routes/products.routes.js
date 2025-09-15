const express = require("express");
const router = express.Router();
const {
  upload,
  handleUploadErrors,
  validateFiles
} = require("../middleware/upload.middleware");
const { verifyToken } = require("../middleware/auth.middleware");
const { checkRole } = require("../middleware/role.middleware");
const productController = require("../controllers/product.controller");

const productUpload = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "extraImages", maxCount: 5 }
]);

router.get("/", productController.getAllProducts);
router.get("/filtered", productController.getFilteredProducts);
router.get("/categories", productController.getCategories);
router.get("/category-counts", productController.getCategoryCounts);
router.get("/recent", productController.getRecentProducts);

router.post(
  "/",
  verifyToken,
  checkRole(["seller", "admin"]),
  productUpload,
  validateFiles(["image"]),
  handleUploadErrors,
  productController.createProduct
);

router.put(
  "/:id",
  verifyToken,
  productUpload,
  handleUploadErrors,
  productController.updateProduct
);

router.delete("/:id", verifyToken, productController.deleteProduct);

router.put("/:id/delete-image", verifyToken, productController.deleteProductImage);

router.get("/seller/my-products", verifyToken, checkRole(['seller','admin']), productController.getSellerProducts);
router.get("/seller/dashboard", verifyToken, checkRole(['seller','admin']), productController.getSellerDashboardStats);
router.get("/seller/sales-data", verifyToken, checkRole(['seller','admin']), productController.getSellerSalesData);
router.get("/seller/popular", verifyToken, checkRole(['seller','admin']), productController.getPopularSellerProducts);

router.get("/:id", productController.getProductById);

module.exports = router;
