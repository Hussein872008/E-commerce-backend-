const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const validate = require("../middleware/validate.middleware");
const { check } = require("express-validator");
const { validationResult } = require('express-validator');

router.post("/login", authController.login);
router.post("/register", authController.register);

router.get("/test", (req, res) => {
  const { sendSuccess } = require('../utils/response');
  return sendSuccess(res, { message: "Auth route working" });
});

const simpleValidate = async (req, res, next) => {
  console.log('Validation middleware - Request body:', req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log('Validation errors:', errors.array());
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  console.log('Validation passed');
  next();
};

router.post(
  '/forgot-password',
  [
    check('email', 'Please enter a valid email').isEmail()
  ],
  simpleValidate,
  authController.forgotPassword
);

router.patch(
  "/reset-password/:token",
  [
    check("password", "Password must be at least 8 characters").isLength({ min: 8 }),
    check("passwordConfirm", "Please confirm your password").not().isEmpty()
  ],
  authController.resetPassword
);

router.get("/verify-token", verifyToken, authController.verifyToken);

router.post("/refresh-token", authController.refreshToken);

module.exports = router;