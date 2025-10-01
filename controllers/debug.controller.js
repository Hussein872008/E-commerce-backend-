const { createNotification } = require('./notification.controller');
const { BadRequestError } = require('../utils/errors');

exports.sendProductAvailable = async (req, res, next) => {
  try {
    const { recipientId, productId, quantity } = req.body;
  if (!recipientId || !productId) return next(new BadRequestError('recipientId and productId are required'));

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
    let { recipientId, orderId, message } = req.body;
    let originalOrderId = orderId;
    try {
      const mongoose = require('mongoose');
      if (recipientId && typeof recipientId === 'string' && /^[0-9a-fA-F]{24}$/.test(recipientId)) {
        recipientId = mongoose.Types.ObjectId(recipientId);
      }
      if (orderId && typeof orderId === 'string' && /^[0-9a-fA-F]{24}$/.test(orderId)) {
        orderId = mongoose.Types.ObjectId(orderId);
      }
    } catch (e) {
    }
  if (!recipientId || !orderId) return next(new BadRequestError('recipientId and orderId are required'));

  const notifMessage = message || `Your order (${originalOrderId || orderId}) has been delivered.`;

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
  if (!userId) return next(new BadRequestError('userId is required'));

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

exports.sendNotification = async (req, res, next) => {
  try {
    const { recipientId, type, message, relatedId, priority } = req.body;
    if (!recipientId || !type || !message) return next(new BadRequestError('recipientId, type and message are required'));

    const notification = await createNotification({
      recipient: recipientId,
      type,
      message,
      relatedId: relatedId || null,
      priority: priority || 'normal'
    });

    res.status(200).json({ success: true, notification });
  } catch (err) {
    next(err);
  }
};
