const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Product title is required'],
    trim: true,
    minlength: [3, 'Product title is too short'],
    maxlength: [100, 'Product title is too long']
  },
  description: {
    type: String,
    required: [true, 'Product description is required'],
    trim: true,
    minlength: [10, 'Product description is too short']
  },
  price: {
    type: Number,
    required: [true, 'Product price is required'],
    min: [0, 'Price cannot be negative']
  },
  discountPercentage: {
    type: Number,
    min: [0, 'Discount cannot be negative'],
    max: [100, 'Discount cannot exceed 100%'],
    default: 0
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: [0, 'Quantity cannot be negative'],
    default: 0
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true
  },
  sku: {
    type: String,
    trim: true,
    required: [true, 'SKU is required'],
    unique: true
  },
  image: {
    type: String,
    required: [true, 'Product image is required']
  },
  extraImages: [{ type: String }],
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  reviews: [{ type: mongoose.Schema.Types.ObjectId, ref: "Review" }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

productSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.discountPercentage && (this.discountPercentage < 0 || this.discountPercentage > 100)) {
    return next(new Error('Discount percentage must be between 0 and 100'));
  }
  next();
});

productSchema.virtual('discountedPrice').get(function() {
  return this.price;
});

productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model("Product", productSchema);