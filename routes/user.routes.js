const express = require("express");
const router = express.Router();
const userController = require("../controllers/user.controller");
const { verifyToken, restrictTo } = require("../middleware/auth.middleware");
const { check } = require('express-validator');

router.get("/", verifyToken, restrictTo('admin'), userController.getAllUsers);
// Self delete (account owner can delete their own account) - keep this before the dynamic '/:id' route
router.delete('/me', verifyToken, userController.deleteSelf);
router.get("/stats", verifyToken, restrictTo('admin'), userController.getAdminStats);

// Admin-only routes that operate on an arbitrary user id
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

module.exports = router;
