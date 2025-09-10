const Product = require("../models/product.model");
const Order = require("../models/order.model");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const Review = require('../models/review.model');
const asyncHandler = require("express-async-handler");

function ensureUploadsDir() {
  const dir = path.join(__dirname, '../uploads');
  if (!require("fs").existsSync(dir)) {
    require("fs").mkdirSync(dir, { recursive: true });
  }
}

exports.createProduct = async (req, res) => {
  try {
    const requiredFields = ['title', 'description', 'price', 'category'];
    const missingFields = requiredFields.filter(field => !req.body[field]);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missingFields.join(', ')}`
      });
    }


    if (!req.files?.image?.[0]) {
      return res.status(400).json({
        success: false,
        error: "Main product image is required"
      });
    }

  const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL;
  const imagePath = `${backendUrl}/uploads/${req.files.image[0].filename}`;
  const extraImages = req.files.extraImages?.map(file => `${backendUrl}/uploads/${file.filename}`) || [];

    const productData = {
      title: req.body.title,
      name: req.body.title,
      description: req.body.description,
      price: parseFloat(req.body.price),
      discountPercentage: (typeof req.body.discountPercentage !== 'undefined' && req.body.discountPercentage !== '')
        ? parseFloat(req.body.discountPercentage)
        : 0,
      quantity: parseInt(req.body.quantity) || 1,
      category: req.body.category,
      image: imagePath,
      extraImages,
      seller: req.user._id,
      meta: {
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };

    if (typeof req.body.brand !== 'undefined' && req.body.brand !== '') productData.brand = req.body.brand;
    if (typeof req.body.sku !== 'undefined' && req.body.sku !== '') productData.sku = req.body.sku;
    if (typeof req.body.weight !== 'undefined' && req.body.weight !== '') productData.weight = parseFloat(req.body.weight);
    if (typeof req.body.dimensions !== 'undefined' && req.body.dimensions !== '') {
      try {
        productData.dimensions = JSON.parse(req.body.dimensions);
      } catch (parseErr) {
      }
    }
    if (typeof req.body.warrantyInformation !== 'undefined' && req.body.warrantyInformation !== '') productData.warrantyInformation = req.body.warrantyInformation;
    if (typeof req.body.shippingInformation !== 'undefined' && req.body.shippingInformation !== '') productData.shippingInformation = req.body.shippingInformation;
    if (typeof req.body.availabilityStatus !== 'undefined' && req.body.availabilityStatus !== '') productData.availabilityStatus = req.body.availabilityStatus;
    if (typeof req.body.returnPolicy !== 'undefined' && req.body.returnPolicy !== '') productData.returnPolicy = req.body.returnPolicy;
    if (typeof req.body.minimumOrderQuantity !== 'undefined' && req.body.minimumOrderQuantity !== '') productData.minimumOrderQuantity = parseInt(req.body.minimumOrderQuantity);
    if (typeof req.body.tags !== 'undefined' && req.body.tags !== '') productData.tags = req.body.tags.split(',').map(tag => tag.trim());


    const product = new Product(productData);
    await product.save();


    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: product
    });

  } catch (err) {
    console.error("Create product error:", err);

    try {
      if (req.files?.image?.[0]) {
        await fsp.unlink(path.join(__dirname, '../uploads', req.files.image[0].filename));
      }
      if (req.files?.extraImages) {
        await Promise.all(req.files.extraImages.map(file =>
          fsp.unlink(path.join(__dirname, '../uploads', file.filename))
        ));
      }
    } catch (cleanupErr) {
      console.error("Error cleaning up files:", cleanupErr);
    }

    return res.status(500).json({
      success: false,
      error: "Failed to create product",
      message: err.message,
      stack: err.stack
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: "Product not found" });

    if (product.seller.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not authorized" });
    }

    const { title, description, price, quantity, category } = req.body;
    product.title = title;
    product.description = description;
    product.price = price;
    product.quantity = quantity;
    product.category = category;

    if (req.files?.image?.[0]) {
      try {
        if (product.image) {
          const oldImagePath = path.join(__dirname, '..', product.image.replace(/^\/+/, ""));
          if (fs.existsSync(oldImagePath)) {
            await fsp.unlink(oldImagePath);
            console.log(`[Product] Deleted old image for product: ${product._id}`);
          }
        }
      } catch (imgErr) {
        console.error(`[Product] Error deleting old image for product: ${product._id}`, imgErr);
      }
  const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL;
  product.image = `${backendUrl}/uploads/${req.files.image[0].filename}`;
    }

    if (req.files?.extraImages?.length > 0) {
      const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL;
      product.extraImages.push(...req.files.extraImages.map((file) => `${backendUrl}/uploads/${file.filename}`));
    }

    await product.save();
    console.log(`[Product] Product updated: ${product._id}`);
    res.json({
      success: true,
      message: "Product updated successfully.",
      product
    });
  } catch (err) {
    console.error(`[Product] Error updating product: ${req.params.id}`, err);
    res.status(500).json({
      success: false,
      error: "Error updating product.",
      details: err.message
    });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (
      product.seller.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return res.status(403).json({ error: "Not authorized" });
    }

    if (product.image) {
      try {
        const imagePath = path.join(
          __dirname,
          "..",
          product.image.replace(/^\/+/, "")
        );
        if (require("fs").existsSync(imagePath)) {
          await fs.unlink(imagePath);
        }
      } catch (err) {
        console.error("Error deleting main image:", err.message);
      }
    }

    if (product.extraImages?.length > 0) {
      for (const imgPath of product.extraImages) {
        try {
          const fullPath = path.join(
            __dirname,
            "..",
            imgPath.replace(/^\/+/, "")
          );
          if (fs.existsSync(fullPath)) {
            await fsp.unlink(fullPath);
          }
        } catch (err) {
          console.error("Error deleting extra image:", err.message);
        }
      }
    }

    await Product.findByIdAndDelete(id);

    res.json({ success: true, message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error in deleteProduct:", err.message);
    res
      .status(500)
      .json({ error: "Failed to delete product", details: err.message });
  }
};


exports.deleteProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { imagePath } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (product.seller.toString() !== req.user._id.toString() && req.user.role !== "admin") {
      return res.status(403).json({ error: "Not authorized" });
    }

    const filename = path.basename(imagePath || '');
    if (!filename) {
      return res.status(400).json({ error: 'Invalid imagePath' });
    }

    const fullImagePath = path.join(__dirname, '..', 'uploads', filename);
    if (fs.existsSync(fullImagePath)) {
      try {
        await fsp.unlink(fullImagePath);
      } catch (unlinkErr) {
        console.error('Error unlinking file:', unlinkErr);
      }
    }

    product.extraImages = (product.extraImages || []).filter((img) => {
      try {
        return path.basename(img) !== filename;
      } catch (e) {
        return img !== imagePath;
      }
    });
    await product.save();

    res.json({
      success: true,
      message: "Image deleted successfully",
      product,
    });
  } catch (err) {
    console.error("Error deleting image:", err);
    res.status(500).json({
      success: false,
      error: "Failed to delete image",
      details: err.message,
    });
  }
};

exports.getAllProducts = async (req, res) => {
  try {
    let products = await Product.find()
      .populate("seller", "name email _id")
      .sort("-createdAt")
      .lean();

    const productIds = products.map(p => p._id);
    const ratings = await Review.aggregate([
      { $match: { product: { $in: productIds } } },
      { $group: { _id: "$product", averageRating: { $avg: "$rating" }, reviewsCount: { $sum: 1 } } }
    ]);
    const ratingsMap = {};
    ratings.forEach(r => {
      ratingsMap[r._id.toString()] = {
        averageRating: r.averageRating ? parseFloat(r.averageRating.toFixed(1)) : 0,
        reviewsCount: r.reviewsCount || 0
      };
    });
    products = products.map(p => ({
      ...p,
      averageRating: ratingsMap[p._id.toString()]?.averageRating || 0,
      reviewsCount: ratingsMap[p._id.toString()]?.reviewsCount || 0
    }));

    res.status(200).json({
      success: true,
      count: products.length,
      data: products
    });
  } catch (error) {
    console.error("Error in getAllProducts:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch products",
      message: error.message
    });
  }
};

exports.getFilteredProducts = asyncHandler(async (req, res) => {
  const {
    category,
    minPrice,
    maxPrice,
    search,
    page = 1,
    limit = 12,
    sort = '-createdAt',
    minRating,
    exclude 
  } = req.query;

  const filter = {};

  if (category && typeof category === 'string') {
    filter.category = category;
  }

  if (exclude && typeof exclude === 'string') {
    filter._id = { $ne: exclude };
  }

  if (minPrice || maxPrice) {
    filter.price = {};
    if (minPrice && !isNaN(minPrice)) filter.price.$gte = Number(minPrice);
    if (maxPrice && !isNaN(maxPrice)) filter.price.$lte = Number(maxPrice);
  }

  if (minRating && !isNaN(minRating)) {
    const ratedProducts = await Review.aggregate([
      {
        $group: {
          _id: "$product",
          averageRating: { $avg: "$rating" }
        }
      },
      {
        $match: {
          averageRating: { $gte: Number(minRating) }
        }
      }
    ]);

    if (!filter._id) filter._id = {};
    filter._id.$in = ratedProducts.map(p => p._id);
  }

  if (search && typeof search === 'string') {
    filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));

  try {
    const [products, total] = await Promise.all([
      Product.find(filter)
        .populate("seller", "name email _id")
        .sort(sort)
        .skip(skip)
        .limit(Math.max(1, parseInt(limit)))
        .lean(),
      Product.countDocuments(filter)
    ]);

    const productIds = products.map(p => p._id);
    const ratings = await Review.aggregate([
      { $match: { product: { $in: productIds } } },
      { $group: { _id: "$product", averageRating: { $avg: "$rating" }, reviewsCount: { $sum: 1 } } }
    ]);
    const ratingsMap = {};
    ratings.forEach(r => {
      ratingsMap[r._id.toString()] = {
        averageRating: r.averageRating ? parseFloat(r.averageRating.toFixed(1)) : 0,
        reviewsCount: r.reviewsCount || 0
      };
    });
    const productsWithRatings = products.map(p => ({
      ...p,
      averageRating: ratingsMap[p._id.toString()]?.averageRating || 0,
      reviewsCount: ratingsMap[p._id.toString()]?.reviewsCount || 0
    }));

    res.status(200).json({
      success: true,
      count: productsWithRatings.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      products: productsWithRatings
    });

  } catch (err) {
    console.error("Error in getFilteredProducts:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch filtered products",
      message: err.message
    });
  }
});


exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate("seller", "name email _id")
      .populate({
        path: "reviews",
        populate: {
          path: "user",
          select: "name email _id"
        }
      });

    if (!product) return res.status(404).json({ error: "Product not found" });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch product", details: err.message });
  }
};

exports.getSellerProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      category = "",
      sortBy = 'createdAt',
      sortOrder = 'desc',
      minPrice,
      maxPrice,
      stockFilter = 'all',
      statusFilter = 'all'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const lim = Math.max(1, parseInt(limit));
    const skip = (pageNum - 1) * lim;

    let query = { seller: req.user._id };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) {
      query.category = category;
    }

    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice && !isNaN(minPrice)) query.price.$gte = Number(minPrice);
      if (maxPrice && !isNaN(maxPrice)) query.price.$lte = Number(maxPrice);
    }

    const mapStockFilter = (val) => {
      if (!val || val === 'all') return null;
      if (val === 'inStock') return { quantity: { $gt: 5 } };
      if (val === 'lowStock') return { quantity: { $gt: 0, $lte: 5 } };
      if (val === 'outOfStock') return { quantity: 0 };
      return null;
    };

    const stockCond = mapStockFilter(stockFilter);
    const statusCond = mapStockFilter(statusFilter);

    if (stockCond) Object.assign(query, stockCond);
    else if (statusCond) Object.assign(query, statusCond);

    const allowedSortFields = ['createdAt', 'title', 'price', 'quantity'];
    const sortField = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const sortDir = sortOrder === 'asc' ? 1 : -1;
    const sortObj = { [sortField]: sortDir };

    const products = await Product.find(query)
      .skip(skip)
      .limit(lim)
      .sort(sortObj);

    const total = await Product.countDocuments(query);

    res.json({
      products,
      total,
      page: pageNum,
      pages: Math.ceil(total / lim)
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch seller products",
      details: err.message
    });
  }
};

exports.getSellerDashboardStats = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const products = await Product.find({ seller: sellerId }).sort("-createdAt");
    const productsCount = products.length;

    const productIds = products.map(p => p._id);

    const recentOrders = await Order.find({ "items.product": { $in: productIds } })
      .sort("-createdAt")
      .limit(5);

    const ordersCount = await Order.countDocuments({ "items.product": { $in: productIds } });

    const allOrders = await Order.find({ "items.product": { $in: productIds } });

    let totalSales = 0;
    const productSalesMap = {};

    for (const order of allOrders) {
      for (const item of order.items) {
        if (productIds.map(p => p.toString()).includes(item.product.toString())) {
          totalSales += item.quantity * item.price;

          const prodId = item.product.toString();
          if (!productSalesMap[prodId]) {
            productSalesMap[prodId] = 0;
          }
          productSalesMap[prodId] += item.quantity;
        }
      }
    }

    const sortedProductIds = Object.entries(productSalesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([productId]) => productId);

    const popularProducts = await Product.find({ _id: { $in: sortedProductIds } });

    const stockAlerts = products.filter(p => p.quantity <= 5);

    res.json({
      productsCount,
      ordersCount,
      totalSales,
      recentOrders,
      popularProducts,
      stockAlerts,
    });
  } catch (error) {
    console.error("Error in getSellerDashboardStats:", error);
    res.status(500).json({ message: "Error loading seller statistics" });
  }
};
exports.getSellerSalesData = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const products = await Product.find({ seller: sellerId });
    const productIds = products.map(p => p._id.toString());

    const orders = await Order.find({ "items.product": { $in: productIds } });


    const ordersSales = [];
    for (const order of orders) {
      let orderTotal = 0;
      for (const item of order.items) {
        if (productIds.includes(item.product.toString())) {
          orderTotal += item.quantity * item.price;
        }
      }
      if (orderTotal > 0) {
        ordersSales.push({ orderId: order._id, date: new Date(order.createdAt).toISOString().split('T')[0], total: orderTotal });
      }
    }


    res.json(ordersSales);
  } catch (err) {
    console.error("Error in getSellerSalesData:", err);
    res.status(500).json({ message: "Error loading sales data" });
  }
};
exports.getPopularSellerProducts = async (req, res) => {
  try {
    const sellerId = req.user._id;

    const products = await Product.find({ seller: sellerId });
    const productIds = products.map(p => p._id.toString());

    const orders = await Order.find({ "items.product": { $in: productIds } });


    const productSales = {};

    for (const order of orders) {
      for (const item of order.items) {
        const pid = item.product.toString();
        if (productIds.includes(pid)) {
          if (!productSales[pid]) productSales[pid] = 0;
          productSales[pid] += item.quantity;
        }
      }
    }

    const sortedProducts = Object.entries(productSales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([productId]) => productId);

    const popularProducts = await Product.find({ _id: { $in: sortedProducts } });


    res.json(popularProducts);
  } catch (err) {
    console.error("Error in getPopularSellerProducts:", err);
    res.status(500).json({ message: "Error loading popular products" });
  }
};

exports.getProductStatsBySeller = async (req, res) => {
  try {
    const products = await Product.find({ seller: req.user._id });

    const productsCount = products.length;
    const totalStock = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
    const totalValue = products.reduce((sum, p) => sum + (p.quantity * p.price), 0);

    res.json({
      productsCount,
      totalStock,
      totalValue,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats", details: err.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct("category");
    res.json(Array.isArray(categories) ? categories : []);
  } catch (err) {
    console.error("Error fetching categories:", err);
    res.json([]);
  }
};

exports.getCategoryCounts = async (req, res) => {
  try {
    const categories = await Product.distinct("category");
    const counts = {};

    const countsAggregate = await Product.aggregate([
      { $group: { _id: "$category", count: { $sum: 1 } } }
    ]);

    countsAggregate.forEach(item => {
      counts[item._id] = item.count;
    });

    categories.forEach(cat => {
      if (!counts[cat]) counts[cat] = 0;
    });

    res.json(counts || {});
  } catch (err) {
    console.error("Error getting category counts:", err);
    res.json({});
  }
};

exports.getRecentProducts = async (req, res) => {
  try {
    const recentProducts = await Product.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('seller', 'name');

    res.json({
      success: true,
      products: recentProducts
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch recent products",
      details: err.message
    });
  }
};