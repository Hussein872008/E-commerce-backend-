const Product = require("../models/product.model");
const Order = require("../models/order.model");
const fs = require("fs").promises;
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

    const imagePath = `${process.env.FRONTEND_URL}/uploads/${req.files.image[0].filename}`;
    const extraImages = req.files.extraImages?.map(file => `${process.env.FRONTEND_URL}/uploads/${file.filename}`) || [];

    const productData = {
      title: req.body.title,
      name: req.body.title, 
      description: req.body.description,
      price: parseFloat(req.body.price),
      discountPercentage: req.body.discountPercentage ? parseFloat(req.body.discountPercentage) : 0,
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

    if (req.body.brand) productData.brand = req.body.brand;
    if (req.body.sku) productData.sku = req.body.sku;
    if (req.body.weight) productData.weight = parseFloat(req.body.weight);
    if (req.body.dimensions) productData.dimensions = JSON.parse(req.body.dimensions);
    if (req.body.warrantyInformation) productData.warrantyInformation = req.body.warrantyInformation;
    if (req.body.shippingInformation) productData.shippingInformation = req.body.shippingInformation;
    if (req.body.availabilityStatus) productData.availabilityStatus = req.body.availabilityStatus;
    if (req.body.returnPolicy) productData.returnPolicy = req.body.returnPolicy;
    if (req.body.minimumOrderQuantity) productData.minimumOrderQuantity = parseInt(req.body.minimumOrderQuantity);
    if (req.body.tags) productData.tags = req.body.tags.split(',').map(tag => tag.trim());

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
        await fs.unlink(path.join(__dirname, '../uploads', req.files.image[0].filename));
      }
      if (req.files?.extraImages) {
        await Promise.all(req.files.extraImages.map(file =>
          fs.unlink(path.join(__dirname, '../uploads', file.filename))
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
          if (require("fs").existsSync(oldImagePath)) {
            await fs.unlink(oldImagePath);
            console.log(`[Product] Deleted old image for product: ${product._id}`);
          }
        }
      } catch (imgErr) {
        console.error(`[Product] Error deleting old image for product: ${product._id}`, imgErr);
      }
      product.image = `${process.env.FRONTEND_URL}/uploads/${req.files.image[0].filename}`;
    }

    if (req.files?.extraImages?.length > 0) {
      product.extraImages.push(...req.files.extraImages.map((file) => `${process.env.FRONTEND_URL}/uploads/${file.filename}`));
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
          if (require("fs").existsSync(fullPath)) {
            await fs.unlink(fullPath);
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

    const fullImagePath = path.join(__dirname, '..', imagePath);
    if (fs.existsSync(fullImagePath)) {
      fs.unlinkSync(fullImagePath);
    }

    product.extraImages = product.extraImages.filter((img) => img !== imagePath);
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
    const products = await Product.find()
      .populate("seller", "name email _id")
      .sort("-createdAt")
      .lean();

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

    res.status(200).json({
      success: true,
      count: products.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      products 
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
    const { page = 1, limit = 10, search = "", category = "" } = req.query;
    const skip = (page - 1) * limit;

    let query = { seller: req.user._id };

    if (search) {
      query.title = { $regex: search, $options: 'i' };
    }

    if (category) {
      query.category = category;
    }

    const products = await Product.find(query)
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Product.countDocuments(query);

    res.json({
      products,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
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

    const orders = await Order.find({ "items.product": { $in: productIds } })
      .sort("-createdAt")
      .limit(5);

    const ordersCount = await Order.countDocuments({ "items.product": { $in: productIds } });

    let totalSales = 0;
    const productSalesMap = {};

    for (const order of orders) {
      for (const item of order.items) {
        if (productIds.includes(item.product.toString())) {
          totalSales += item.quantity * item.price;

          if (!productSalesMap[item.product]) {
            productSalesMap[item.product] = 0;
          }
          productSalesMap[item.product] += item.quantity;
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
      recentOrders: orders,
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

    const salesByDate = {};

    for (const order of orders) {
      const date = new Date(order.createdAt).toISOString().split("T")[0];

      for (const item of order.items) {
        if (productIds.includes(item.product.toString())) {
          if (!salesByDate[date]) salesByDate[date] = 0;
          salesByDate[date] += item.quantity * item.price;
        }
      }
    }

    const salesData = Object.entries(salesByDate).map(([date, total]) => ({
      date,
      total,
    }));

    res.json(salesData);
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