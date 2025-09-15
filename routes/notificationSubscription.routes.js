const express = require('express');
const router = express.Router();
const { subscribe, unsubscribe, listForUser } = require('../controllers/notificationSubscription.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.post('/subscribe', verifyToken, subscribe);
router.delete('/unsubscribe/:productId', verifyToken, unsubscribe);
router.get('/my-subscriptions', verifyToken, listForUser);

module.exports = router;
