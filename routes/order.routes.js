const express = require("express");
const router = express.Router();
const orderController = require("../controllers/order.controller");
const { validate, validateOrder } = require("../middleware/validate.middleware");
const { verifyToken, checkCancelPermission } = require("../middleware/auth.middleware");
const { body } = require("express-validator");
const createOrderValidation = [
  body('items').isArray({ min: 1 }).withMessage('Order must contain at least one item'),
  body('items.*.product').isMongoId().withMessage('Invalid product ID'),
  body('items.*.quantity').isInt({ min: 1 }).withMessage('Quantity must be a positive integer'),
  body('shippingAddress.address').notEmpty().withMessage('Address is required'),
  body('shippingAddress.city').notEmpty().withMessage('City is required'),
  body('shippingAddress.postalCode')
    .optional()
    .matches(/^\d{5,6}$/)
    .withMessage('Postal code must be 5 to 6 digits'),
  body('shippingAddress.phone').notEmpty().withMessage('Phone number is required'),

  body('paymentMethod').isIn(['Credit Card', 'Cash on Delivery']).withMessage('Invalid payment method'),

  body('cardNumber').if(body('paymentMethod').equals('Credit Card'))
];

const updateStatusValidation = [
  body('status').isIn(['Processing', 'Shipped', 'Delivered', 'Cancelled'])
];

router.post(
  "/create",
  verifyToken,
  validateOrder,
  validate(createOrderValidation),
  orderController.createOrder
);

router.get(
  "/my",
  verifyToken,
  orderController.getMyOrders
);

router.get(
  "/my/stats",
  verifyToken,
  orderController.getOrderStats
);

router.put(
  "/cancel/:id",
  verifyToken,
  checkCancelPermission,
  orderController.cancelOrder
);

router.get(
  "/search",
  verifyToken,
  orderController.searchOrders
);

router.get(
  "/seller",
  verifyToken,
  orderController.getSellerOrders
);

router.get(
  "/seller/stats",
  verifyToken,
  orderController.getSellerStats
);

router.put(
  "/seller/update/:id",
  verifyToken,
  validate(updateStatusValidation),
);

router.get(
  "/all",
  verifyToken,
  orderController.getAllOrders
);

router.get(
  "/admin/stats",
  verifyToken,
  orderController.getAdminStats
);

router.put(
  "/admin/update/:id",
  verifyToken,
  validate(updateStatusValidation),
  orderController.adminUpdateOrder
);

router.put(
  "/update-payment-status",
  verifyToken,
  body('paymentIntentId').notEmpty(),
  body('status').isIn(['Completed', 'Failed', 'Refunded']),
  orderController.updatePaymentStatus
);

router.get(
  "/recent",
  verifyToken,
  orderController.getRecentOrders
);

router.get(
  "/:id",
  verifyToken,
  orderController.getOrderDetails
);

router.post(
  "/:id/track",
  verifyToken,
  body('trackingNumber').notEmpty().withMessage('Tracking number is required'),
  orderController.addTrackingNumber
);

module.exports = router;
