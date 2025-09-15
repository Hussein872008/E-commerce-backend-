const mongoose = require('mongoose');

const notificationSubscriptionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  createdAt: { type: Date, default: Date.now }
});

notificationSubscriptionSchema.index({ user: 1, product: 1 }, { unique: true });

const NotificationSubscription = mongoose.model('NotificationSubscription', notificationSubscriptionSchema);
module.exports = NotificationSubscription;
