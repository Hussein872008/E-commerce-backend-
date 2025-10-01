const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth.middleware');
const { sendProductAvailable } = require('../controllers/debug.controller');
const { sendOrderDelivered } = require('../controllers/debug.controller');
const { listRoomSockets } = require('../controllers/debug.controller');

const devOnly = (req, res, next) => {
	const allow = process.env.NODE_ENV !== 'production' || process.env.ALLOW_DEBUG_ROUTES === 'true';
	if (!allow) return res.status(404).json({ success: false, message: 'Not found' });

	if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEBUG_ROUTES === 'true') {
		const secret = process.env.DEBUG_ROUTE_SECRET;
		const provided = (req.headers['x-debug-token'] || '').toString();
		if (!secret || !provided || provided !== secret) {
			return res.status(403).json({ success: false, message: 'Forbidden' });
		}
	}

		if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEBUG_ROUTES === 'true' && process.env.DEBUG_ALLOWED_IPS) {
			const raw = process.env.DEBUG_ALLOWED_IPS.split(',').map(s => s.trim()).filter(Boolean);
			const forwarded = (req.headers['x-forwarded-for'] || '').toString().split(',').map(s => s.trim()).filter(Boolean)[0];
			const ip = forwarded || req.ip || req.connection?.remoteAddress || '';
			const normIp = ip === '::1' ? '127.0.0.1' : ip.replace(/^::ffff:/, '');
			if (!raw.includes(normIp) && !raw.includes('*')) {
				return res.status(403).json({ success: false, message: 'Forbidden - IP not allowed' });
			}
		}

	next();
};

router.use(devOnly);

router.post('/product-available', verifyToken, sendProductAvailable);
router.post('/order-delivered', verifyToken, sendOrderDelivered);
router.post('/send-notification', verifyToken, require('../controllers/debug.controller').sendNotification);
router.get('/room/:userId/sockets', verifyToken, listRoomSockets);

module.exports = router;
