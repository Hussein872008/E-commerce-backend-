const mongoose = require('mongoose');

const wishlistSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  required: true
  },
  products: [{
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

wishlistSchema.index({ user: 1 }, { unique: true });
wishlistSchema.index({ 'products.product': 1 });
wishlistSchema.index({ lastUpdated: -1 });

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

module.exports = Wishlist;
