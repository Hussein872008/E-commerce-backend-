const express = require('express');
const router = express.Router();
const { subscribe, unsubscribe, listForUser } = require('../controllers/notificationSubscription.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');

router.post('/subscribe', verifyToken, checkRole(['buyer']), subscribe);
router.delete('/unsubscribe/:productId', verifyToken, checkRole(['buyer']), unsubscribe);
router.get('/my-subscriptions', verifyToken, checkRole(['buyer']), listForUser);

module.exports = router;
