const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Review = require("../models/review.model");
const Product = require("../models/product.model");

const getCurrentUserIdFromToken = (req) => {
  let currentUserId = null;
  if (req.headers.authorization?.startsWith("Bearer")) {
    try {
      const token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      currentUserId = decoded.id;
    } catch (err) {
    }
  }
  return currentUserId;
};

exports.createReview = async (req, res) => {
  try {
    const { productId, rating, comment } = req.body;
    const userId = req.user._id;

    if (!productId) {
      return res.status(400).json({ success: false, message: "Product ID is required", field: "productId" });
    }
    if (!rating) {
      return res.status(400).json({ success: false, message: "Rating is required", field: "rating" });
    }
    if (!comment) {
      return res.status(400).json({ success: false, message: "Comment is required", field: "comment" });
    }
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5 stars", field: "rating" });
    }
    if (comment.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Comment must be at least 10 characters long",
        field: "comment",
        minLength: 10,
        currentLength: comment.trim().length
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found", productId });
    }

    const existingReview = await Review.findOne({ user: userId, product: productId });
    if (existingReview) {
      return res.status(409).json({
        success: false,
        message: "You have already reviewed this product",
        reviewId: existingReview._id,
        action: "edit"
      });
    }

    const review = new Review({ user: userId, product: productId, rating, comment: comment.trim() });
    const savedReview = await review.save();

    await Product.findByIdAndUpdate(productId, { $push: { reviews: savedReview._id } });

    const populatedReview = await Review.findById(savedReview._id)
      .populate("user", "name email _id")
      .select("_id rating comment user product createdAt");

    res.status(201).json({ success: true, message: "Review added successfully", review: populatedReview });

  } catch (error) {
    console.error("Error creating review:", error.message);
    res.status(500).json({ success: false, message: "An unexpected error occurred while creating your review", errorCode: "REVIEW_CREATION_FAILED" });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: "Invalid review ID format", error: "INVALID_ID_FORMAT" });
    }
    if (!rating && !comment) {
      return res.status(400).json({ success: false, message: "At least one field (rating or comment) is required for update" });
    }
    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ success: false, message: "Rating must be between 1 and 5 stars", field: "rating" });
    }
    if (comment && comment.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: "Comment must be at least 10 characters long",
        field: "comment",
        minLength: 10,
        currentLength: comment.trim().length
      });
    }

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found", reviewId: id });
    }
    if (review.user.toString() !== userId.toString()) {
      return res.status(403).json({ success: false, message: "You are not authorized to update this review" });
    }

    if (rating) review.rating = rating;
    if (comment) review.comment = comment.trim();
    const updatedReview = await review.save();

    res.json({ success: true, message: "Review updated successfully", review: updatedReview });

  } catch (error) {
    console.error("Error updating review:", error.message);
    res.status(500).json({ success: false, message: "An unexpected error occurred while updating your review", errorCode: "REVIEW_UPDATE_FAILED" });
  }
};


exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const currentUserId = req.user?._id || getCurrentUserIdFromToken(req);

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID", error: "INVALID_ID" });
    }

    const reviews = await Review.find({ product: productId })
      .populate("user", "_id name")
      .select("_id rating comment user product createdAt updatedAt")
      .sort({ createdAt: -1 });

    const formattedReviews = reviews.map(review => {
      const reviewObj = review.toObject();


      const isOwner = !!(currentUserId && reviewObj.user?._id &&
        currentUserId.toString() === reviewObj.user._id.toString());

      return {
        ...reviewObj,
        isOwner: isOwner,
        canEdit: isOwner,
        canDelete: isOwner || (req.user?.role === "admin")
      };
    });

    res.json({
      success: true,
      message: "Reviews retrieved successfully",
      count: formattedReviews.length,
      reviews: formattedReviews,
      currentUserId: currentUserId || null
    });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ success: false, message: "Failed to fetch reviews", error: "SERVER_ERROR" });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const review = await Review.findById(id);
    if (!review) {
      return res.status(404).json({ success: false, message: "Review not found", error: "REVIEW_NOT_FOUND" });
    }

    const isAdmin = req.user.role === "admin";
    const isOwner = review.user.toString() === userId.toString();
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, message: "Not authorized to delete this review", error: "UNAUTHORIZED" });
    }

    await Product.findByIdAndUpdate(review.product, { $pull: { reviews: review._id } });
    await Review.findByIdAndDelete(id);

    res.json({ success: true, message: "Review deleted successfully" });

  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ success: false, message: "Failed to delete review", error: "SERVER_ERROR" });
  }
};

exports.getAverageRating = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ success: false, message: "Invalid product ID", error: "INVALID_ID" });
    }

    const result = await Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(productId) } },
      { $group: { _id: null, averageRating: { $avg: "$rating" }, count: { $sum: 1 }, ratings: { $push: "$rating" } } }
    ]);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (result.length > 0) {
      result[0].ratings.forEach(rating => { distribution[rating]++; });
    }

    res.json({
      success: true,
      message: "Average rating calculated successfully",
      averageRating: result.length > 0 ? parseFloat(result[0].averageRating.toFixed(1)) : 0,
      count: result.length > 0 ? result[0].count : 0,
      ratingDistribution: distribution
    });
  } catch (error) {
    console.error("Error calculating average rating:", error);
    res.status(500).json({ success: false, message: "Failed to calculate average rating", error: "SERVER_ERROR" });
  }
};
