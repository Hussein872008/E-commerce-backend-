
const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/review.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { checkRole } = require('../middleware/role.middleware');
const jwt = require("jsonwebtoken");
const User = require("../models/user.model");

const optionalVerifyToken = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  } else if (req.cookies?.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const currentUser = await User.findById(decoded.id).select("_id name email role");

    if (currentUser) {
      req.user = currentUser;
    }
  } catch (err) {
    console.warn("Invalid token in optionalVerifyToken:", err.message);
    res.clearCookie("jwt");
  }

  next();
};

router.post("/", verifyToken, checkRole(['buyer']), reviewController.createReview);

router.get("/product/:productId", optionalVerifyToken, reviewController.getProductReviews);

router.get("/average/:productId", reviewController.getAverageRating);

router.put("/:id", verifyToken, checkRole(['buyer']), reviewController.updateReview);

router.delete("/:id", verifyToken, reviewController.deleteReview);

module.exports = router;