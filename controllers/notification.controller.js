const Notification = require('../models/notification.model');
const { createError } = require('../utils/errors');

exports.getNotifications = async (req, res, next) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      recipient: req.user._id,
      read: false
    });

    res.status(200).json({ notifications, unreadCount });
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
  relatedId = null
}) => {
  try {
    const notification = new Notification({
      recipient,
      type,
      message,
      relatedId
    });
    
    await notification.save();
    
    const fullNotification = await Notification.findById(notification._id);
    
    if (global.io) {
      const [allNotifications, unreadCount] = await Promise.all([
        Notification.find({ recipient })
          .sort({ createdAt: -1 })
          .limit(50),
        Notification.countDocuments({
          recipient,
          read: false
        })
      ]);

      global.io.to(recipient.toString()).emit('notificationUpdate', {
        newNotification: fullNotification,
        allNotifications,
        unreadCount,
        highlightId: relatedId
      });
    }
    
    return fullNotification;
  } catch (err) {
    console.error('Error creating notification:', err);
    throw err;
  }
};