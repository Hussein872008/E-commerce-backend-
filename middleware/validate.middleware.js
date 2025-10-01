exports.validateOrder = (req, res, next) => {
  const { items, shippingAddress, totalAmount, paymentMethod } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Order must have at least one item." });
  }
  for (const item of items) {
    if (!item.product || !item.quantity) {
      return res.status(400).json({ message: "Each item must have product and quantity." });
    }
  }
  if (!shippingAddress || !shippingAddress.address || !shippingAddress.city || !shippingAddress.postalCode || !shippingAddress.phone) {
    return res.status(400).json({ message: "Shipping address must include address, city, postalCode, and phone." });
  }
  if (typeof totalAmount !== "number" || totalAmount <= 0) {
    return res.status(400).json({ message: "Total amount must be a positive number." });
  }
  if (!paymentMethod || typeof paymentMethod !== "string") {
    return res.status(400).json({ message: "Payment method is required." });
  }
  next();
};
const { validationResult } = require('express-validator');

const validate = (validations) => {
  return async (req, res, next) => {
      try {
        console.debug && console.debug('Validation middleware - running validations');
        for (const validation of validations) {
          await validation.run(req);
        }

      const errors = validationResult(req);
      if (errors.isEmpty()) {
        console.debug && console.debug('Validation passed');
        return next();
      }
        logger && logger.info && logger.info('Validation errors', { errors: errors.array() });
      return res.status(400).json({ 
        success: false,
        errors: errors.array() 
      });
    } catch (error) {
      console.error('Validation error:', error);
      return res.status(500).json({ 
        success: false,
        error: 'Validation error'
      });
    }
  };
};

exports.validate = validate;