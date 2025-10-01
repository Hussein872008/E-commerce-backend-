const mongoose = require("mongoose");
const Order = require("../models/order.model");
const Product = require("../models/product.model");
const Cart = require("../models/cart.model");
const { createNotification } = require("./notification.controller");
const { sendSuccess, sendError } = require('../utils/response');


const getFullImageUrl = (image) => {
  const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL;
  if (!image || image === "undefined") {
    return `${backendUrl}/placeholder-image.webp`;
  }
  if (image.startsWith("http")) return image;
  const cleanImage = image.replace(/^\/+/, "").replace(/^uploads\//, "");
  return `${backendUrl}/uploads/${cleanImage}`;
};

const sanitizeOrderForClient = (orderObj, options = {}) => {
  const { maskLast4 = true } = options;
  if (!orderObj) return orderObj;
  const o = typeof orderObj.toObject === 'function' ? orderObj.toObject() : { ...orderObj };
  if (o.paymentInfo) {
    const last4 = o.paymentInfo.last4 || undefined;
    o.paymentInfo = {
      brand: o.paymentInfo.brand || undefined,
      last4: last4 ? (maskLast4 ? `****${last4}` : `${last4}`) : undefined,
      expiry: o.paymentInfo.expiry || undefined,
    };
  }
  return o;
};


exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
  const { items, shippingAddress, totalAmount, paymentMethod, cardNumber, cardExpiry, cardBrand, paymentProviderId, cardLast4 } = req.body;
    const userId = req.user._id;

    if (paymentMethod && paymentMethod.toLowerCase().includes('card')) {
      if (cardNumber && !/^\d{13,19}$/.test(cardNumber)) {
        await session.abortTransaction();
        console.error(`Invalid card number for user: ${userId}`);
        return sendError(res, "Invalid card number. Must be 13-19 digits.", 400, { details: "Card number must be 13-19 digits", error: "Invalid card number. Must be 13-19 digits." });
      }
    }

    const products = await Product.find({
      _id: { $in: items.map((i) => i.product) },
    }).session(session);

    if (products.length !== items.length) {
      await session.abortTransaction();
      console.error(`Some products not found for user: ${userId}`);
      return sendError(res, "Some products not found.", 404, { details: "Some products not found", error: "Some products not found." });
    }

    let calculatedTotal = 0;
    const stockUpdates = [];

    for (const item of items) {
      const product = products.find((p) => p._id.equals(item.product));
      if (!product) {
        await session.abortTransaction();
        console.error(`Product ${item.product} not found for user: ${userId}`);
        return sendError(res, `Product not found (${item.product})`, 404, { details: `Product ${item.product} not found`, error: `Product not found (${item.product})` });
      }
      if (product.quantity < item.quantity) {
        await session.abortTransaction();
        console.error(`Insufficient stock for product: ${product.title}, user: ${userId}`);
        return sendError(res, `Insufficient stock for product: ${product.title}`, 400, { details: `Insufficient stock for ${product.title}`, productId: product._id, available: product.quantity, error: `Insufficient stock for product: ${product.title}` });
      }
      calculatedTotal += product.price * item.quantity;
      stockUpdates.push({
        updateOne: {
          filter: { _id: product._id },
          update: { $inc: { quantity: -item.quantity } },
        },
      });
    }

    if (Math.abs(calculatedTotal - totalAmount) > 0.01) {
      await session.abortTransaction();
      console.error(`Total amount mismatch for user: ${userId}`);
      return sendError(res, "Total amount mismatch.", 400, { details: "Total amount mismatch", calculated: calculatedTotal, received: totalAmount, error: "Total amount mismatch." });
    }

    const paymentInfo = {};
    if (paymentMethod && paymentMethod.toLowerCase().includes('card')) {
    if (cardLast4) paymentInfo.last4 = cardLast4.toString();
    else if (cardNumber) paymentInfo.last4 = cardNumber.toString().slice(-4);
      if (cardExpiry) paymentInfo.expiry = cardExpiry;
      if (cardBrand) paymentInfo.brand = cardBrand;
      if (paymentProviderId) paymentInfo.providerId = paymentProviderId;
      paymentInfo.method = 'card';
    }

    const order = new Order({
      buyer: userId,
      items: items.map((item) => ({
        product: item.product,
        quantity: item.quantity,
        price: products.find((p) => p._id.equals(item.product)).price,
      })),
      shippingAddress,
      totalAmount,
      paymentMethod: paymentMethod || "Cash on Delivery",
      paymentInfo: Object.keys(paymentInfo).length ? paymentInfo : undefined,
      paymentStatus: "Completed",
      status: "Processing",
    });
    order.statusHistory = [
      { status: order.status || 'Processing', changedAt: new Date(), changedBy: userId }
    ];

    await Product.bulkWrite(stockUpdates, { session });
    
    for (const item of items) {
      const product = products.find(p => p._id.equals(item.product));
      const newQuantity = product.quantity - item.quantity;
      
      if (newQuantity <= 5) {
        await createNotification({
          recipient: product.seller,
          type: 'product',
          message: `Product "${product.title}" is low in stock (${newQuantity} pieces remaining)`,
          relatedId: product._id
        });
      }
    }
    
    await order.save({ session });
    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { items: [], total: 0 } },
      { session }
    );

    const sellerIds = await Product.distinct('seller', {
      _id: { $in: items.map(item => item.product) }
    });

    await session.commitTransaction();

    try {
      try {
        await order.populate('buyer', 'name email');
      } catch (popErr) {
        console.error('Failed to populate buyer after create:', popErr);
      }

      const notificationPromises = sellerIds.map(async (sellerId) => {
        const notification = await createNotification({
          recipient: sellerId,
          type: 'order',
          message: `New Order: #${order._id?.toString()}`,
          relatedId: order._id,
          orderData: {
            orderId: order._id,
            items: order.items,
            totalAmount: order.totalAmount
          }
        });

        if (global.io) {
          const emitOrder = {
            _id: order._id,
            items: order.items,
            totalAmount: order.totalAmount,
            status: order.status,
            paymentInfo: sanitizeOrderForClient(order).paymentInfo
          };

          if (order.buyer && typeof order.buyer === 'object') {
            emitOrder.buyer = {
              _id: order.buyer._id,
              name: order.buyer.name || undefined,
              email: order.buyer.email || undefined
            };
            emitOrder.buyerName = order.buyer.name || undefined;
            emitOrder.buyerEmail = order.buyer.email || undefined;
          }

          global.io.to(sellerId.toString()).emit('newOrder', {
            notification,
            order: emitOrder
          });
        }

        return notification;
      });

      await Promise.all(notificationPromises);
    } catch (notificationError) {
      console.error('Error sending notifications:', notificationError);
    }
    console.log(`Order created successfully for user: ${userId}, orderId: ${order._id}`);
    return sendSuccess(res, { message: "Order created successfully.", order: sanitizeOrderForClient(order) }, 201);
  } catch (err) {
    await session.abortTransaction();
    console.error(`Order creation error for user: ${req.user?._id}`, err);
    return sendError(res, "Error creating order.", 500, { details: err.message, error: "Error creating order." });
  } finally {
    session.endSession();
  }
};


exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ buyer: req.user._id })
      .populate({
        path: "items.product",
        select: "title price image seller",
      })
      .sort("-createdAt");

  const fixedOrders = orders.map((order) => {
      const fixedItems = order.items.map((item) => {
        let imageUrl = item.product
          ? getFullImageUrl(item.product.image)
          : `${(process.env.BACKEND_URL || process.env.FRONTEND_URL)}/placeholder-image.webp`;

        return {
          ...item.toObject(),
          product: item.product
            ? {
                ...item.product.toObject(),
                image: imageUrl,
              }
            : { title: "Deleted Product", price: 0, image: imageUrl },
        };
      });

      const o = {
        ...order.toObject(),
        items: fixedItems,
      };
      return sanitizeOrderForClient(o);
    });

    return sendSuccess(res, { orders: fixedOrders });
  } catch (err) {
    console.error("Error fetching orders:", err);
    return sendError(res, "Failed to fetch orders.", 500, { details: err.message, error: "Failed to fetch orders." });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Processing", "Shipped", "Delivered", "Cancelled"];

    if (!validStatuses.includes(status)) {
      console.error(`Invalid order status: ${status}, user: ${req.user?._id}`);
      return sendError(res, "Invalid order status.", 400, { details: "Invalid order status", error: "Invalid order status." });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      console.error(`Order not found: ${req.params.id}, user: ${req.user?._id}`);
      return sendError(res, "Order not found.", 404, { details: "Order not found", error: "Order not found." });
    }

    if (req.user.role === "buyer") {
      return sendError(res, "Buyers are not allowed to update order status.", 403, { error: "Buyers are not allowed to update order status." });
    }

    if (req.user.role === "seller") {
      if (!(order.status === "Processing" && status === "Shipped")) {
        console.error(`Seller not authorized to change status, user: ${req.user?._id}`);
        return sendError(res, "Seller can only change status from Processing to Shipped.", 403, { details: "Sellers can only mark Processing orders as Shipped.", error: "Seller can only change status from Processing to Shipped." });
      }
    }

    if (req.user.role === "admin") {
      if (status === "Cancelled" && order.status !== "Cancelled") {
        for (let item of order.items) {
          await Product.findByIdAndUpdate(
            item.product,
            { $inc: { quantity: item.quantity } }
          );
        }
      }
    }

    order.status = status;
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({ status, changedAt: new Date(), changedBy: req.user._id });
    await order.save();

    try {
      const buyerNotification = await createNotification({
        recipient: order.buyer,
        type: 'order',
        message: `Your order (#${order._id}) status has been updated to ${status}`,
        relatedId: order._id
      });
      console.log('Sent order-status notification to buyer', { orderId: String(order._id), buyer: String(order.buyer), status, notificationId: buyerNotification?._id });
    } catch (notifErr) {
      console.error('Failed to create/emit buyer notification for order status update', { orderId: String(order._id), buyer: String(order.buyer), status, error: notifErr });
    }

    if (status === 'Processing' || status === 'Delivered') {
      const sellerIds = await Product.distinct('seller', {
        _id: { $in: order.items.map(item => item.product) }
      });

      for (const sellerId of sellerIds) {
        try {
          const sellerNotification = await createNotification({
            recipient: sellerId,
            type: 'order',
            message: `Order (#${order._id}) has been ${status.toLowerCase()}`,
            relatedId: order._id
          });
          console.log('Sent order-status notification to seller', { orderId: String(order._id), seller: String(sellerId), status, notificationId: sellerNotification?._id });
        } catch (notifErr) {
          console.error('Failed to create/emit seller notification for order status update', { orderId: String(order._id), seller: String(sellerId), status, error: notifErr });
        }
      }
    }

    console.log(`Order status updated: ${order._id}, new status: ${status}, user: ${req.user?._id}`);
    return sendSuccess(res, { message: "Order status updated successfully.", order: sanitizeOrderForClient(order) });

  } catch (err) {
    console.error(`Error updating order status for order: ${req.params.id}, user: ${req.user?._id}`, err);
    return sendError(res, "Error updating order status.", 500, { details: err.message, error: "Error updating order status." });
  }
};


exports.cancelOrder = async (req, res) => {
  console.log('Cancelling order:', req.params.id);
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const order = await Order.findOne({
      _id: req.params.id,
      status: { $in: ['Processing', 'Shipped'] }
    }).session(session);

    if (!order) {
      await session.abortTransaction();
      return sendError(res, "Order not found or cannot be cancelled.", 404, { error: "Order not found or cannot be cancelled." });
    }

    if (req.user.role === "buyer" && order.buyer.toString() !== req.user._id.toString()) {
  await session.abortTransaction();
  return sendError(res, "Not authorized to cancel this order", 403, { error: "Not authorized to cancel this order" });
    }

    if (req.user.role === "seller") {
      const sellerProductIds = await Product.find({ seller: req.user._id }).distinct('_id');
      const owns = order.items.some(item => sellerProductIds.includes(item.product.toString()));
      if (!owns) {
        await session.abortTransaction();
        return sendError(res, "Not authorized to cancel this order", 403, { error: "Not authorized to cancel this order" });
      }
    }


    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.product._id || item.product,
        { $inc: { quantity: item.quantity } },
        { session }
      );
    }

    order.status = "Cancelled";
    order.statusHistory.push({
      status: "Cancelled",
      changedAt: new Date(),
      changedBy: req.user._id
    });

    await order.save({ session });
    await session.commitTransaction();

    return sendSuccess(res, { message: "Order cancelled successfully.", order: sanitizeOrderForClient(order) });

  } catch (err) {
    await session.abortTransaction();
    return sendError(res, "Failed to cancel order.", 500, { details: err.message, error: "Failed to cancel order." });
  } finally {
    session.endSession();
  }
};

exports.searchOrders = async (req, res) => {
  try {
  const { status, dateFrom, dateTo } = req.query;
  const includeShipped = req.query.includeShipped === 'true' || req.query.includeShipped === '1';
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 10;
  const query = {};

    if (req.user.role === 'buyer') {
      query.buyer = req.user._id;
    } else if (req.user.role === 'seller') {
      query['items.product'] = { 
        $in: await Product.find({ seller: req.user._id }).distinct('_id') 
      };
    }


      if (status) {
        if (status === 'Processing' && includeShipped) {
          query.$or = [ { status: 'Processing' }, { status: 'Shipped' } ];
        } else {
          query.status = status;
        }
      }

      if (dateFrom || dateTo) {
        query.createdAt = {};
        if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
        if (dateTo) query.createdAt.$lte = new Date(dateTo);
      }

      const total = await Order.countDocuments(query);
      const pages = Math.max(1, Math.ceil(total / limit));

      const orders = await Order.find(query)
        .populate({
          path: "items.product",
          select: "title price image seller",
          transform: doc => doc ? {
            _id: doc._id,
            title: doc.title,
            price: doc.price,
            seller: doc.seller,
            image: doc.image?.startsWith('http') ? doc.image : `${(process.env.BACKEND_URL || process.env.FRONTEND_URL)}${doc.image.startsWith('/') ? '' : '/'}${doc.image}`
          } : null
        })
        .populate("buyer", "name email")
        .sort("-createdAt")
        .skip((page - 1) * limit)
        .limit(limit);

      const sanitized = orders.map(o => {
        const obj = typeof o.toObject === 'function' ? o.toObject() : { ...o };
        const base = sanitizeOrderForClient(obj);

  let buyerObj = { name: 'Unknown', email: 'Unknown' };
        if (obj.buyer && typeof obj.buyer === 'object') {
          buyerObj.name = obj.buyer.name ? obj.buyer.name : 'Unknown';
          buyerObj.email = obj.buyer.email ? obj.buyer.email : 'Unknown';
        }

        return {
          ...base,
          buyer: buyerObj,
          buyerName: buyerObj.name,
          buyerEmail: buyerObj.email
        };
      });

      return sendSuccess(res, { orders: sanitized, total, page, pages, limit });
  } catch (err) {
    console.error(`Error searching orders, user: ${req.user?._id}`, err);
    return sendError(res, "Error searching orders.", 500, { details: err.message, error: "Error searching orders." });
  }
};
exports.getOrderStats = async (req, res) => {
  try {
            const userId = req.user._id;
    
    const orders = await Order.find({ buyer: userId });
    
    const stats = {
      total: orders.length,
      completed: orders.filter(o => o.status === "Delivered").length,
      pending: orders.filter(o => o.status === "Processing").length,
      shipped: orders.filter(o => o.status === "Shipped").length,
      cancelled: orders.filter(o => o.status === "Cancelled").length
    };

    return sendSuccess(res, { stats });
  } catch (err) {
    console.error("Error fetching order stats:", err);
    return sendError(res, "Failed to fetch order statistics.", 500, { details: err.message, error: "Failed to fetch order statistics." });
  }
};







exports.updatePaymentStatus = async (req, res) => {
  try {
    const { paymentIntentId, status } = req.body;
    const order = await Order.findOneAndUpdate(
      { paymentIntentId },
      { paymentStatus: status },
      { new: true }
    );
  return sendSuccess(res, { order: sanitizeOrderForClient(order) });
  } catch (err) {
    return sendError(res, "Failed to update payment status", 500, { error: "Failed to update payment status" });
  }
};

exports.getSellerStats = async (req, res) => {
  try {
    const stats = await Order.aggregate([
      { $unwind: "$items" },
      { $lookup: {
          from: "products",
          localField: "items.product",
          foreignField: "_id",
          as: "product"
        }
      },
      { $unwind: "$product" },
      { $match: { "product.seller": req.user._id } },
      { $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalSales: { $sum: { $multiply: ["$items.quantity", "$product.price"] } }
        }
      }
    ]);

    return sendSuccess(res, { stats });
  } catch (err) {
    return sendError(res, "Failed to fetch seller stats", 500, { error: "Failed to fetch seller stats" });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
  const orders = await Order.find()
      .populate("buyer", "name email")
      .populate("items.product", "title price")
      .sort("-createdAt");

    const sanitized = orders.map(o => sanitizeOrderForClient(o));
    return sendSuccess(res, { orders: sanitized });
  } catch (err) {
    return sendError(res, "Failed to fetch all orders", 500, { error: "Failed to fetch all orders" });
  }
};

exports.getAdminStats = async (req, res) => {
  try {
    const stats = await Order.aggregate([
      { $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" }
        }
      }
    ]);

    return sendSuccess(res, { stats });
  } catch (err) {
    return sendError(res, "Failed to fetch admin stats", 500, { error: "Failed to fetch admin stats" });
  }
};

exports.adminUpdateOrder = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) {
    return sendError(res, "Order not found", 404, { error: "Order not found" });
    }

    const status = req.body.status;

    if (status === 'Cancelled' && order.status !== 'Cancelled') {
      for (let item of order.items) {
        try {
          await Product.findByIdAndUpdate(
            item.product._id || item.product,
            { $inc: { quantity: item.quantity } }
          );
        } catch (err) {
          console.error('Failed to restore stock for product', item.product, err);
        }
      }
    }

    order.status = status;
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({ status, changedAt: new Date(), changedBy: req.user._id });
    await order.save();

    try {
      const buyerNotification = await createNotification({
        recipient: order.buyer,
        type: 'order',
        message: `Your order (#${order._id}) status has been updated to ${status}`,
        relatedId: order._id
      });
      console.log('Sent order-status notification to buyer', { orderId: String(order._id), buyer: String(order.buyer), status, notificationId: buyerNotification?._id });
    } catch (notifErr) {
      console.error('Failed to create/emit buyer notification for order status update', { orderId: String(order._id), buyer: String(order.buyer), status, error: notifErr });
    }

    if (status === 'Processing' || status === 'Delivered') {
      const sellerIds = await Product.distinct('seller', {
        _id: { $in: order.items.map(item => item.product) }
      });

      for (const sellerId of sellerIds) {
        try {
          const sellerNotification = await createNotification({
            recipient: sellerId,
            type: 'order',
            message: `Order (#${order._id}) has been ${status.toLowerCase()}`,
            relatedId: order._id
          });
          console.log('Sent order-status notification to seller', { orderId: String(order._id), seller: String(sellerId), status, notificationId: sellerNotification?._id });
        } catch (notifErr) {
          console.error('Failed to create/emit seller notification for order status update', { orderId: String(order._id), seller: String(sellerId), status, error: notifErr });
        }
      }
    }

    return sendSuccess(res, { message: "Order updated successfully", order: sanitizeOrderForClient(order) });
  } catch (err) {
    return sendError(res, "Failed to update order", 500, { error: "Failed to update order" });
  }
};

exports.getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("buyer", "name email")
      .populate({
        path: "items.product",
        select: "title price image seller",
        transform: doc => {
          if (!doc) return null;
          const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL;
          return {
            _id: doc._id,
            title: doc.title,
            price: doc.price,
            seller: doc.seller,
            image: doc.image?.startsWith('http') ? doc.image : `${backendUrl}${doc.image.startsWith('/') ? '' : '/'}${doc.image}`
          };
        }
      });

    if (!order) {
      return sendError(res, "Order not found", 404, { error: "Order not found" });
    }

    if (req.user.role === "buyer" && order.buyer._id.toString() !== req.user._id.toString()) {
      return sendError(res, "Not authorized", 403, { error: "Not authorized" });
    }

    if (req.user.role === 'seller') {
      const owns = order.items.some(item => item.product && String(item.product.seller) === String(req.user._id));
      if (!owns) return sendError(res, "Not authorized", 403, { error: 'Not authorized' });
    }

    return sendSuccess(res, { order: sanitizeOrderForClient(order) });
  } catch (err) {
    return sendError(res, "Failed to fetch order details", 500, { error: "Failed to fetch order details" });
  }
};

exports.addTrackingNumber = async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { trackingNumber: req.body.trackingNumber },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    return sendSuccess(res, { message: "Tracking number added", order: sanitizeOrderForClient(order) });
  } catch (err) {
    return sendError(res, "Failed to add tracking number", 500, { error: "Failed to add tracking number" });
  }
};
exports.getSellerDashboard = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const orders = await Order.find({ status: { $ne: "Cancelled" } })
      .populate({
        path: "items.product",
        match: { seller: sellerId },
        select: "title price seller"
      });

    let sellerOrders = orders.filter(order => 
      order.items.some(item => item.product && item.product.seller.toString() === sellerId)
    );

    const totalSales = sellerOrders.reduce((sum, order) => {
      const orderItems = order.items.filter(item => 
        item.product && item.product.seller.toString() === sellerId
      );
      return sum + orderItems.reduce((s, item) => s + (item.product.price * item.quantity), 0);
    }, 0);

    const completedOrders = sellerOrders.filter(order => order.status === "Delivered").length;

    return sendSuccess(res, { totalOrders: sellerOrders.length, completedOrders, totalSales });
  } catch (err) {
    console.error("Error fetching seller dashboard:", err);
    return sendError(res, "Failed to fetch seller dashboard data", 500, { details: err.message, error: "Failed to fetch seller dashboard data" });
  }
};


exports.getSellerOrders = async (req, res) => {
  try {
    const sellerProductIds = await Product.find({ seller: req.user._id }).distinct('_id');

    const orders = await Order.find({
      status: { $ne: "Cancelled" },
      'items.product': { $in: sellerProductIds }
    })
      .populate({
        path: "items.product",
        select: "title price image seller",
        transform: doc => {
          if (!doc) return {
            _id: null,
            title: "Deleted Product",
            price: 0,
            seller: null,
            image: `${(process.env.BACKEND_URL || process.env.FRONTEND_URL)}/placeholder-image.webp`
          };
          return {
            _id: doc._id,
            title: doc.title,
            price: doc.price,
            seller: doc.seller,
            image: doc.image?.startsWith('http') ? doc.image : `${(process.env.BACKEND_URL || process.env.FRONTEND_URL)}${doc.image.startsWith('/') ? '' : '/'}${doc.image}`
          };
        }
      })
      .populate("buyer", "name email")
      .sort("-createdAt");

    const fixedOrders = orders.map(order => {
      let buyerObj = { name: "Unknown", email: "Unknown" };
      if (order.buyer && typeof order.buyer === "object") {
        buyerObj.name = order.buyer.name ? order.buyer.name : "Unknown";
        buyerObj.email = order.buyer.email ? order.buyer.email : "Unknown";
      }
      const cleanItems = order.items.map(item => {
        const obj = item.toObject ? item.toObject() : item;
        return {
          quantity: obj.quantity,
          price: obj.price,
          product: obj.product ? obj.product : {
            _id: null,
            title: "Deleted Product",
            price: 0,
            seller: null,
            image: `${(process.env.BACKEND_URL || process.env.FRONTEND_URL)}/placeholder-image.webp`
          }
        };
      });
      const o = {
        ...order.toObject(),
        buyer: buyerObj,
        buyerName: buyerObj.name,
        buyerEmail: buyerObj.email,
        trackingNumber: order.trackingNumber || "Unknown",
        items: cleanItems
      };
      if (o.paymentInfo) {
        o.paymentInfo = {
          brand: o.paymentInfo.brand || undefined,
          last4: o.paymentInfo.last4 ? (`****${o.paymentInfo.last4}`) : undefined,
          expiry: o.paymentInfo.expiry || undefined,
        };
      }
      return o;
    });

    return sendSuccess(res, { orders: fixedOrders });
  } catch (err) {
    return sendError(res, "Failed to fetch seller orders.", 500, { details: err.message, error: "Failed to fetch seller orders." });
  }
};
exports.getRecentOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("buyer", "name email")
      .populate({
        path: "items.product",
        select: "title price image",
        transform: doc => doc ? {
          _id: doc._id,
          title: doc.title,
          price: doc.price,
          image: doc.image?.startsWith('http') ? doc.image : `${(process.env.BACKEND_URL || process.env.FRONTEND_URL)}${doc.image.startsWith('/') ? '' : '/'}${doc.image}`
        } : null
      })
      .sort({ createdAt: -1 })
      .limit(10);

    const sanitized = orders.map(o => sanitizeOrderForClient(o));
    return sendSuccess(res, { orders: sanitized });
  } catch (err) {
    console.error("Error fetching recent orders:", err);
    return sendError(res, "Failed to fetch recent orders", 500, { details: err.message, error: "Failed to fetch recent orders" });
  }
};
