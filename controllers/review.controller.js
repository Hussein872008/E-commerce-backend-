const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const Review = require("../models/review.model");
const Product = require("../models/product.model");
const { sendSuccess, sendError } = require('../utils/response');

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
    if (!req.user || req.user.role !== 'buyer') {
      return sendError(res, 'Only buyer accounts can create reviews', 403, { message: 'Only buyer accounts can create reviews' });
    }
    const { productId, rating, comment } = req.body;
    const userId = req.user._id;

    if (!productId) {
      return sendError(res, "Product ID is required", 400, { field: "productId" });
    }
    if (!rating) {
      return sendError(res, "Rating is required", 400, { field: "rating" });
    }
    if (!comment) {
      return sendError(res, "Comment is required", 400, { field: "comment" });
    }
    if (rating < 1 || rating > 5) {
  return sendError(res, "Rating must be between 1 and 5 stars", 400, { field: "rating" });
    }
    if (comment.trim().length < 10) {
      return sendError(res, "Comment must be at least 10 characters long", 400, { field: "comment", minLength: 10, currentLength: comment.trim().length });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return sendError(res, "Product not found", 404, { productId });
    }

    const existingReview = await Review.findOne({ user: userId, product: productId });
    if (existingReview) {
      return sendError(res, "You have already reviewed this product", 409, { reviewId: existingReview._id, action: "edit" });
    }

    const review = new Review({ user: userId, product: productId, rating, comment: comment.trim() });
    const savedReview = await review.save();

    await Product.findByIdAndUpdate(productId, { $push: { reviews: savedReview._id } });

    const populatedReview = await Review.findById(savedReview._id)
      .populate("user", "name email _id")
      .select("_id rating comment user product createdAt");

  return sendSuccess(res, { message: "Review added successfully", review: populatedReview }, 201);

  } catch (error) {
    console.error("Error creating review:", error.message);
    return sendError(res, "An unexpected error occurred while creating your review", 500, { errorCode: "REVIEW_CREATION_FAILED" });
  }
};

exports.updateReview = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'buyer') {
      return sendError(res, 'Only buyer accounts can update reviews', 403, { message: 'Only buyer accounts can update reviews' });
    }
    const { id } = req.params;
    const { rating, comment } = req.body;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return sendError(res, "Invalid review ID format", 400, { error: "INVALID_ID_FORMAT" });
    }
    if (!rating && !comment) {
  return sendError(res, "At least one field (rating or comment) is required for update", 400, {});
    }
    if (rating && (rating < 1 || rating > 5)) {
  return sendError(res, "Rating must be between 1 and 5 stars", 400, { field: "rating" });
    }
    if (comment && comment.trim().length < 10) {
      return sendError(res, "Comment must be at least 10 characters long", 400, { field: "comment", minLength: 10, currentLength: comment.trim().length });
    }

    const review = await Review.findById(id);
    if (!review) {
      return sendError(res, "Review not found", 404, { reviewId: id });
    }
    if (review.user.toString() !== userId.toString()) {
      return sendError(res, "You are not authorized to update this review", 403, {});
    }

    if (rating) review.rating = rating;
    if (comment) review.comment = comment.trim();
    const updatedReview = await review.save();

  return sendSuccess(res, { message: "Review updated successfully", review: updatedReview });

  } catch (error) {
    console.error("Error updating review:", error.message);
    return sendError(res, "An unexpected error occurred while updating your review", 500, { errorCode: "REVIEW_UPDATE_FAILED" });
  }
};


exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const currentUserId = req.user?._id || getCurrentUserIdFromToken(req);

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return sendError(res, "Invalid product ID", 400, { error: "INVALID_ID" });
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

    return sendSuccess(res, { message: "Reviews retrieved successfully", count: formattedReviews.length, reviews: formattedReviews, currentUserId: currentUserId || null });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return sendError(res, "Failed to fetch reviews", 500, { error: "SERVER_ERROR" });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const review = await Review.findById(id);
    if (!review) {
      return sendError(res, "Review not found", 404, { error: "REVIEW_NOT_FOUND" });
    }

    const isAdmin = req.user.role === "admin";
    const isOwner = review.user.toString() === userId.toString();
    if (!isOwner && !isAdmin) {
  return sendError(res, "Not authorized to delete this review", 403, { error: "UNAUTHORIZED" });
    }

    await Product.findByIdAndUpdate(review.product, { $pull: { reviews: review._id } });
    await Review.findByIdAndDelete(id);

  return sendSuccess(res, { message: "Review deleted successfully" });

  } catch (error) {
    console.error("Error deleting review:", error);
    return sendError(res, "Failed to delete review", 500, { error: "SERVER_ERROR" });
  }
};

exports.getAverageRating = async (req, res) => {
  try {
    const { productId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return sendError(res, "Invalid product ID", 400, { error: "INVALID_ID" });
    }

    const result = await Review.aggregate([
      { $match: { product: new mongoose.Types.ObjectId(productId) } },
      { $group: { _id: null, averageRating: { $avg: "$rating" }, count: { $sum: 1 }, ratings: { $push: "$rating" } } }
    ]);

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    if (result.length > 0) {
      result[0].ratings.forEach(rating => { distribution[rating]++; });
    }

    return sendSuccess(res, { message: "Average rating calculated successfully", averageRating: result.length > 0 ? parseFloat(result[0].averageRating.toFixed(1)) : 0, count: result.length > 0 ? result[0].count : 0, ratingDistribution: distribution });
  } catch (error) {
    console.error("Error calculating average rating:", error);
    return sendError(res, "Failed to calculate average rating", 500, { error: "SERVER_ERROR" });
  }
};
