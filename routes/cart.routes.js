const express = require('express');
const router = express.Router();
const cartController = require('../controllers/cart.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { validate } = require('../middleware/validate.middleware');
const { body, param } = require('express-validator');

router.use(authMiddleware.verifyToken);

const addToCartValidation = [
    body('productId').isMongoId().withMessage('Invalid product ID'),
    body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1')
];

const updateCartValidation = [
    body('quantity').isInt({ min: 1 }).withMessage('Quantity must be at least 1')
];

const removeCartValidation = [
    param('itemId').isMongoId().withMessage('Invalid item ID')
];

router.get('/', cartController.getCart);

router.post('/add', 
  validate(addToCartValidation), 
  cartController.addToCart
);

router.put('/update/:itemId', 
  validate(updateCartValidation), 
  cartController.updateCartItem
);

router.delete('/remove/:itemId', 
  validate(removeCartValidation),
  cartController.removeFromCart
);

router.delete('/clear', 
  cartController.clearCart
);

module.exports = router;