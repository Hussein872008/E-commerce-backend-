const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { sendProductAvailable } = require('../controllers/debug.controller');
const { sendOrderDelivered } = require('../controllers/debug.controller');
const { listRoomSockets } = require('../controllers/debug.controller');

router.post('/product-available', verifyToken, sendProductAvailable);
router.post('/order-delivered', verifyToken, sendOrderDelivered);
router.get('/room/:userId/sockets', verifyToken, listRoomSockets);

module.exports = router;
