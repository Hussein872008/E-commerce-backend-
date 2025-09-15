const { createNotification } = require('./notification.controller');
const { createError } = require('../utils/errors');

exports.sendProductAvailable = async (req, res, next) => {
  try {
    const { recipientId, productId, quantity } = req.body;
    if (!recipientId || !productId) return next(createError(400, 'recipientId and productId are required'));

    const message = `Product is now available (${quantity || 'unknown'} in stock).`;

    const notification = await createNotification({
      recipient: recipientId,
      type: 'product-available',
      message,
      relatedId: productId
    });

    res.status(200).json({ success: true, notification });
  } catch (err) {
    next(err);
  }
};

exports.sendOrderDelivered = async (req, res, next) => {
  try {
    const { recipientId, orderId, message } = req.body;
    if (!recipientId || !orderId) return next(createError(400, 'recipientId and orderId are required'));

    const notifMessage = message || `Your order (#${orderId}) has been delivered.`;

    const notification = await createNotification({
      recipient: recipientId,
      type: 'order',
      message: notifMessage,
      relatedId: orderId
    });

    res.status(200).json({ success: true, notification });
  } catch (err) {
    next(err);
  }
};

exports.listRoomSockets = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) return next(createError(400, 'userId is required'));

    if (!global.io) return res.status(500).json({ success: false, message: 'Socket server not available' });

    try {
      const sockets = await global.io.in(String(userId)).fetchSockets();
      const ids = sockets.map(s => s.id);
      return res.status(200).json({ success: true, sockets: ids, count: ids.length });
    } catch (err) {
      console.warn('Failed to fetch sockets for room', userId, err.message || err);
      return res.status(500).json({ success: false, message: 'Failed to fetch sockets', error: err.message || err });
    }
  } catch (err) {
    next(err);
  }
};
