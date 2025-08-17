const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlist.controller');
const { verifyToken } = require('../middleware/auth.middleware');


router.post('/', verifyToken, wishlistController.addToWishlist);
router.delete('/:productId', verifyToken, wishlistController.removeFromWishlist);
router.get('/', verifyToken, wishlistController.getWishlist);
router.get('/count', verifyToken, wishlistController.getWishlistCount);
router.get('/check/:productId', verifyToken, wishlistController.checkWishlist);

module.exports = router;