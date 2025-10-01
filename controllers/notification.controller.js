const Notification = require('../models/notification.model');
const { createError } = require('../utils/errors');
const { sanitizeNotification } = require('../utils/sanitizers');

exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, read: false });

    const sanitized = notifications.map(sanitizeNotification);
    res.status(200).json({ notifications: sanitized, unreadCount });
  } catch (err) {
    next(err);
  }
};

exports.markAsRead = async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      _id: req.params.id,
      recipient: req.user._id
    });

    if (!notification) {
      return next(createError(404, 'Notification not found'));
    }

    notification.read = true;
    await notification.save();

    res.status(200).json({ message: 'Notification marked as read' });
  } catch (err) {
    next(err);
  }
};

exports.markAllAsRead = async (req, res, next) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, read: false },
      { read: true }
    );

    res.status(200).json({ message: 'All notifications marked as read' });
  } catch (err) {
    next(err);
  }
};

exports.createNotification = async ({
  recipient,
  type,
  message,
  relatedId = null,
  priority = 'normal',
  channels = null,
  status = null,
  ttl = null
}) => {
  try {
    const mongoose = require('mongoose');
    const doc = { recipient, type, message };
    if (relatedId) {
      if (typeof relatedId === 'string' && /^[0-9a-fA-F]{24}$/.test(relatedId)) {
        doc.relatedId = mongoose.Types.ObjectId(relatedId);
      } else if (relatedId && typeof relatedId === 'object' && relatedId._bsontype === 'ObjectID') {
        doc.relatedId = relatedId;
      } else if (typeof relatedId === 'string') {
        doc.meta = { originalRelatedId: relatedId };
      }
    }

    if (priority) doc.priority = priority;
    if (Array.isArray(channels)) doc.channels = channels;
    if (typeof status === 'string') doc.status = status;
    if (ttl) {
      try {
        doc.ttl = (ttl instanceof Date) ? ttl : new Date(ttl);
      } catch (e) {}
    }

    if (doc.status === 'read') doc.read = true;
    const notification = new Notification(doc);

    await notification.save();

    const fullNotification = await Notification.findById(notification._id);
    console.log('[Notification] Created notification', { id: fullNotification._id, recipient: String(recipient), type: fullNotification.type });

    if (global.io) {
      try {
        const unreadCount = await Notification.countDocuments({ recipient, read: false });
        let safeNotif = sanitizeNotification(fullNotification);
        safeNotif = Object.assign({}, safeNotif, {
          status: safeNotif.read ? 'read' : 'unread',
          channels: Array.isArray(safeNotif.channels) && safeNotif.channels.length ? safeNotif.channels : ['socket']
        });
        global.io.to(recipient.toString()).emit('newNotification', safeNotif);
        global.io.to(recipient.toString()).emit('unreadCount', unreadCount);

        try {
          global.io.to(recipient.toString()).emit('notification.created', safeNotif);
          global.io.to(recipient.toString()).emit('notification.unreadCount', unreadCount);
        } catch (e) {
          console.warn('[Notification] emitting standardized events failed', e && e.message ? e.message : e);
        }
        console.log('[Notification] Emitted newNotification + unreadCount to room', String(recipient), { unreadCount, notificationId: String(fullNotification._id) });
      } catch (emitErr) {
        console.warn('[Notification] emit failed', emitErr && emitErr.message ? emitErr.message : emitErr);
      }
    }

    return sanitizeNotification(fullNotification);
  } catch (err) {
    console.error('Error creating notification:', err);
    throw err;
  }
};