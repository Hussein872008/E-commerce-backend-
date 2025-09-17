const express = require('express');
const router = express.Router();
const wishlistController = require('../controllers/wishlist.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { checkRole } = require('../middleware/role.middleware');


router.post('/', verifyToken, checkRole(['buyer']), wishlistController.addToWishlist);
router.delete('/:productId', verifyToken, checkRole(['buyer']), wishlistController.removeFromWishlist);
router.get('/', verifyToken, wishlistController.getWishlist);
router.get('/count', verifyToken, wishlistController.getWishlistCount);
router.get('/check/:productId', verifyToken, wishlistController.checkWishlist);

module.exports = router;