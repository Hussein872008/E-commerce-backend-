const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      trim: true,
      required: true,
      minlength: [10, "Comment must be at least 10 characters long"],
    },
  },
  { 
    timestamps: true,
    toJSON: { 
      virtuals: true,
      transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      }
    },
    toObject: { virtuals: true }
  }
);

reviewSchema.index({ user: 1, product: 1 }, { unique: true });

reviewSchema.virtual('userData', {
  ref: 'User',
  localField: 'user',
  foreignField: '_id',
  justOne: true,
  options: { select: 'name email username _id' }
});

const Review = mongoose.model("Review", reviewSchema);

module.exports = Review;