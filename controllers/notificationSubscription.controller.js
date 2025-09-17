const NotificationSubscription = require('../models/notificationSubscription.model');
const Product = require('../models/product.model');
const { createError } = require('../utils/errors');

exports.subscribe = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'buyer') {
      return res.status(403).json({ success: false, message: 'Only buyer accounts can subscribe to notifications' });
    }
    const userId = req.user._id;
    const { productId } = req.body;

    if (!productId) return next(createError(400, 'productId is required'));

    const product = await Product.findById(productId);
    if (!product) return next(createError(404, 'Product not found'));

    const sub = await NotificationSubscription.findOneAndUpdate(
      { user: userId, product: productId },
      { $setOnInsert: { user: userId, product: productId } },
      { upsert: true, new: true }
    );

    res.status(200).json({ success: true, subscription: sub });
  } catch (err) {
    next(err);
  }
};

exports.unsubscribe = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'buyer') {
      return res.status(403).json({ success: false, message: 'Only buyer accounts can unsubscribe from notifications' });
    }
    const userId = req.user._id;
    const { productId } = req.params;

    if (!productId) return next(createError(400, 'productId is required'));

    await NotificationSubscription.deleteOne({ user: userId, product: productId });

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
};

exports.listForUser = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== 'buyer') {
      return res.status(403).json({ success: false, message: 'Only buyer accounts can view subscriptions' });
    }
    const userId = req.user._id;
    const subs = await NotificationSubscription.find({ user: userId }).populate('product', 'title _id');
    res.status(200).json({ subscriptions: subs });
  } catch (err) {
    next(err);
  }
};
