const jwt = require("jsonwebtoken");
const User = require("../models/user.model");
const Order = require("../models/order.model"); 
exports.verifyToken = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies?.accessToken) {

    token = req.cookies.accessToken;
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'You are not logged in! Please log in to get access'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

  const currentUser = await User.findById(decoded.id).select('_id name email activeRole roles');
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token does no longer exist'
      });
    }

    const mappedRole = currentUser.activeRole || (Array.isArray(currentUser.roles) && currentUser.roles.length ? currentUser.roles[0] : undefined);

    req.user = {
      _id: currentUser._id,
      name: currentUser.name,
      email: currentUser.email,
      role: mappedRole
    };
    res.locals.user = req.user;

    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid token or session expired'
    });
  }
};


exports.isAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'You do not have permission to perform this action'
    });
  }
  next();
};

exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

exports.checkCancelPermission = async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate({
      path: 'items.product',
      select: 'seller'
    });

    if (!order) {
      return res.status(404).json({ success: false, error: "Order not found" });
    }

    const isBuyer = req.user.role === 'buyer' && order.buyer.toString() === req.user._id.toString();
    const isAdmin = req.user.role === 'admin';
    const isSeller = req.user.role === 'seller' && order.items.some(item =>
      item.product?.seller?.toString() === req.user._id.toString()
    );

  if (!isBuyer && !isAdmin && !isSeller) {
      return res.status(403).json({
        success: false,
        error: "You do not have permission to cancel this order"
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: "Server error",
      details: err.message
    });
  }
};