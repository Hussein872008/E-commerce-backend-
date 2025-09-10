const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const {
  getNotifications,
  markAsRead,
  markAllAsRead
} = require('../controllers/notification.controller');

router.get('/', verifyToken, getNotifications);

router.patch('/:id/read', verifyToken, markAsRead);

router.patch('/mark-all-read', verifyToken, markAllAsRead);

module.exports = router;
