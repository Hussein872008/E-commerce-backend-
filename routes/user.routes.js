const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { verifyToken, restrictTo } = require("../middleware/auth.middleware");
const { check } = require('express-validator');

router.get("/", verifyToken, restrictTo('admin'), userController.getAllUsers);
router.delete("/:id", verifyToken, restrictTo('admin'), userController.deleteUser);
router.put("/:id/role", verifyToken, restrictTo('admin'), userController.updateUserRole);
router.patch(
  "/:id",
  verifyToken,
  [
    check("name", "Name is required").not().isEmpty(),
    check("newPassword", "Password must be at least 8 characters")
      .optional()
      .isLength({ min: 8 }),
  ],
  userController.updateUserProfile
);
router.get("/stats", verifyToken, restrictTo('admin'), userController.getAdminStats);

module.exports = router;
