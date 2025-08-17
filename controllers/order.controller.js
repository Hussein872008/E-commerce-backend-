const mongoose = require("mongoose");
const Order = require("../models/order.model");
const Product = require("../models/product.model");
const Cart = require("../models/cart.model");


const getFullImageUrl = (image) => {
  if (!image || image === "undefined") {
    return `${process.env.BASE_URL}/placeholder-product.png`;
  }
  if (image.startsWith("http")) return image;
  const cleanImage = image.replace(/^\/+/, "").replace(/^uploads\//, "");
  return `${process.env.FRONTEND_URL}/uploads/${cleanImage}`;
};


exports.createOrder = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { items, shippingAddress, totalAmount, paymentMethod, cardNumber } = req.body;
    const userId = req.user._id;

    if (paymentMethod === "Card") {
      if (!cardNumber || !/^\d{13,19}$/.test(cardNumber)) {
        await session.abortTransaction();
        console.error(`[Order] Invalid card number for user: ${userId}`);
        return res.status(400).json({
          success: false,
          error: "Invalid card number. Must be 13-19 digits.",
          details: "Card number must be 13-19 digits"
        });
      }
    }

    const products = await Product.find({
      _id: { $in: items.map((i) => i.product) },
    }).session(session);

    if (products.length !== items.length) {
      await session.abortTransaction();
      console.error(`[Order] Some products not found for user: ${userId}`);
      return res.status(404).json({
        success: false,
        error: "Some products not found.",
        details: "Some products not found"
      });
    }

    let calculatedTotal = 0;
    const stockUpdates = [];

    for (const item of items) {
      const product = products.find((p) => p._id.equals(item.product));
      if (!product) {
        await session.abortTransaction();
        console.error(`[Order] Product ${item.product} not found for user: ${userId}`);
        return res.status(404).json({
          success: false,
          error: `Product not found (${item.product})`,
          details: `Product ${item.product} not found`
        });
      }
      if (product.quantity < item.quantity) {
        await session.abortTransaction();
        console.error(`[Order] Insufficient stock for product: ${product.title}, user: ${userId}`);
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for product: ${product.title}`,
          details: `Insufficient stock for ${product.title}`,
          productId: product._id,
          available: product.quantity,
        });
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
      console.error(`[Order] Total amount mismatch for user: ${userId}`);
      return res.status(400).json({
        success: false,
        error: "Total amount mismatch.",
        details: "Total amount mismatch",
        calculated: calculatedTotal,
        received: totalAmount,
      });
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
      paymentStatus: "Completed",
      status: "Processing",
    });

    await Product.bulkWrite(stockUpdates, { session });
    await order.save({ session });
    await Cart.findOneAndUpdate(
      { user: userId },
      { $set: { items: [], total: 0 } },
      { session }
    );

    await session.commitTransaction();
    console.log(`[Order] Order created successfully for user: ${userId}, orderId: ${order._id}`);
    res.status(201).json({
      success: true,
      message: "Order created successfully.",
      order,
    });
  } catch (err) {
    await session.abortTransaction();
    console.error(`[Order] Order creation error for user: ${req.user?._id}`, err);
    res.status(500).json({
      success: false,
      error: "Error creating order.",
      details: err.message,
    });
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
          : `${process.env.BASE_URL}/placeholder-product.png`;

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

      return {
        ...order.toObject(),
        items: fixedItems,
      };
    });

    res.json({
      success: true,
      orders: fixedOrders,
    });
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch orders.",
      details: err.message,
    });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ["Processing", "Shipped", "Delivered", "Cancelled"];

    if (!validStatuses.includes(status)) {
      console.error(`[Order] Invalid order status: ${status}, user: ${req.user?._id}`);
      return res.status(400).json({
        success: false,
        error: "Invalid order status.",
        details: "Invalid order status"
      });
    }

    const order = await Order.findById(req.params.id);
    if (!order) {
      console.error(`[Order] Order not found: ${req.params.id}, user: ${req.user?._id}`);
      return res.status(404).json({
        success: false,
        error: "Order not found.",
        details: "Order not found"
      });
    }

    if (req.user.role === "seller") {
      if (order.status !== "Processing" || status !== "Shipped") {
        console.error(`[Order] Seller not authorized to change status, user: ${req.user?._id}`);
        return res.status(403).json({
          success: false,
          error: "Seller can only change status from Processing to Shipped.",
          details: "Sellers can only mark Processing orders as Shipped."
        });
      }
    }
 
    if (req.user.role === "admin" || req.user.role === "seller") {
      if (status === "Cancelled" && order.status !== "Cancelled") {
        for (let item of order.items) {
          await Product.findByIdAndUpdate(
            item.product,
            { $inc: { quantity: item.quantity } }
          );
        }
      }
      order.status = status;
      await order.save();
      console.log(`[Order] Order status updated: ${order._id}, new status: ${status}, user: ${req.user?._id}`);
      return res.json({ 
        success: true,
        message: "Order status updated successfully.",
        order 
      });
    }
    console.error(`[Order] Not authorized to update order status, user: ${req.user?._id}`);
    return res.status(403).json({
      success: false,
      error: "Not authorized to update order status.",
      details: "Not authorized to update order status."
    });
  } catch (err) {
    console.error(`[Order] Error updating order status for order: ${req.params.id}, user: ${req.user?._id}`, err);
    res.status(500).json({ 
      success: false,
      error: "Error updating order status.",
      details: err.message 
    });
  }
};
exports.searchOrders = async (req, res) => {
  try {
  const { status, dateFrom, dateTo, page = 1 } = req.query;
  const query = {};

    if (req.user.role === 'buyer') {
      query.buyer = req.user._id;
    } else if (req.user.role === 'seller') {
      query['items.product'] = { 
        $in: await Product.find({ seller: req.user._id }).distinct('_id') 
      };
    }

    if (status) query.status = status;
    if (dateFrom && dateTo) {
      query.createdAt = { $gte: new Date(dateFrom), $lte: new Date(dateTo) };
    }

    const orders = await Order.find(query)
      .populate("items.product", "title price image")
      .sort("-createdAt");

    const total = orders.length;

    res.json({
      success: true,
      orders,
      total,
      page: parseInt(page)
    });
  } catch (err) {
    console.error(`[Order] Error searching orders, user: ${req.user?._id}`, err);
    res.status(500).json({
      success: false,
      error: "Error searching orders.",
      details: err.message
    });
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
      cancelled: orders.filter(o => o.status === "Cancelled").length
    };

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error("Error fetching order stats:", err);
    res.status(500).json({ 
      error: "Failed to fetch order statistics.",
      details: err.message 
    });
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
      return res.status(404).json({
        success: false,
        error: "Order not found or cannot be cancelled."
      });
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

    res.json({
      success: true,
      message: "Order cancelled successfully.",
      order
    });

  } catch (err) {
    await session.abortTransaction();
    res.status(500).json({
      success: false,
      error: "Failed to cancel order.",
      details: err.message
    });
  } finally {
    session.endSession();
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
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ error: "Failed to update payment status" });
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

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch seller stats" });
  }
};

exports.getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("buyer", "name email")
      .populate("items.product", "title price")
      .sort("-createdAt");

    res.json({
      success: true,
      orders
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch all orders" });
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

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch admin stats" });
  }
};

exports.adminUpdateOrder = async (req, res) => {
  try {
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    res.json({
      success: true,
      message: "Order updated successfully",
      order
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to update order" });
  }
};

exports.getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("buyer", "name email")
      .populate({
        path: "items.product",
        select: "title price image",
        transform: doc => {
          if (!doc) return null;
          return {
            _id: doc._id,
            title: doc.title,
            price: doc.price,
            image: doc.image?.startsWith('http') ? doc.image : `${process.env.FRONTEND_URL}${doc.image.startsWith('/') ? '' : '/'}${doc.image}`
          };
        }
      });

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (req.user.role === "buyer" && order.buyer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ error: "Not authorized" });
    }

    res.json({
      success: true,
      order: order.toObject()
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch order details" });
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

    res.json({
      success: true,
      message: "Tracking number added",
      order
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to add tracking number" });
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

    res.json({
      success: true,
      totalOrders: sellerOrders.length,
      completedOrders,
      totalSales
    });
  } catch (err) {
    console.error("Error fetching seller dashboard:", err);
    res.status(500).json({ 
      error: "Failed to fetch seller dashboard data",
      details: err.message 
    });
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
            image: `${process.env.FRONTEND_URL}/placeholder-product.png`
          };
          return {
            _id: doc._id,
            title: doc.title,
            price: doc.price,
            seller: doc.seller,
            image: doc.image?.startsWith('http') ? doc.image : `${process.env.FRONTEND_URL}${doc.image.startsWith('/') ? '' : '/'}${doc.image}`
          };
        }
      })
      .populate("buyer", "name email")
      .sort("-createdAt");

    const fixedOrders = orders.map(order => {
      let buyerObj = { name: "Unknown", email: "Unknown" };
      if (order.buyer && typeof order.buyer === "object") {
        buyerObj.name = order.buyer.name !== undefined ? order.buyer.name : "Unknown";
        buyerObj.email = order.buyer.email !== undefined ? order.buyer.email : "Unknown";
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
            image: `${process.env.FRONTEND_URL}/placeholder-product.png`
          }
        };
      });
      return {
        ...order.toObject(),
        buyer: buyerObj,
        trackingNumber: order.trackingNumber || "Unknown",
        items: cleanItems
      };
    });

    res.json({
      success: true,
      orders: fixedOrders
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch seller orders.",
      details: err.message
    });
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
          image: doc.image?.startsWith('http') ? doc.image : `${process.env.FRONTEND_URL}${doc.image.startsWith('/') ? '' : '/'}${doc.image}`
        } : null
      })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json({
      success: true,
      orders
    });
  } catch (err) {
    console.error("Error fetching recent orders:", err);
    res.status(500).json({
      error: "Failed to fetch recent orders",
      details: err.message
    });
  }
};
