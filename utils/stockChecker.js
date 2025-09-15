const LOW_STOCK_THRESHOLD = 5;
const NotificationSubscription = require('../models/notificationSubscription.model');
const { createNotification } = require('../controllers/notification.controller');

async function checkProductStock(product, session) {
  if (product.quantity <= LOW_STOCK_THRESHOLD) {
    await createNotification({
      recipient: product.seller,
      type: 'product',
      message: `Product "${product.title}" is low in stock (only ${product.quantity} left)`,
      relatedId: product._id
    });
  }

  if (product.quantity > 0) {
    try {
      const subs = await NotificationSubscription.find({ product: product._id }).lean();
      console.log('[StockChecker] Found', subs.length, 'subscribers for product', String(product._id));
      for (const s of subs) {
        console.log('[StockChecker] Notifying subscriber', String(s.user), 'about product', String(product._id));
        await createNotification({
          recipient: s.user,
          type: 'product-available',
          message: `Product "${product.title}" is now available (${product.quantity} in stock).`,
          relatedId: product._id
        });
      }
    } catch (err) {
      console.error('Error notifying subscribers:', err);
    }
  }
}

module.exports = checkProductStock;
