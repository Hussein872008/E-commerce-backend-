const Product = require("../models/product.model");
const checkProductStock = require('../utils/stockChecker');
const Order = require("../models/order.model");
const fs = require("fs");
const fsp = require("fs").promises;
const path = require("path");
const Review = require('../models/review.model');
const asyncHandler = require("express-async-handler");
const crypto = require('crypto');
const { deleteFromCloudinary } = require("../utils/cloudinary");
const { sendSuccess, sendError } = require('../utils/response');

function ensureUploadsDir() {
  const dir = path.join(__dirname, '../uploads');
  if (!require("fs").existsSync(dir)) {
    require("fs").mkdirSync(dir, { recursive: true });
  }
}

exports.createProduct = async (req, res) => {
  try {
    const requiredFields = ["title", "description", "price", "category"];
    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      return sendError(res, `Missing required fields: ${missingFields.join(", ")}`, 400, { error: `Missing required fields: ${missingFields.join(", ")}` });
    }

    if (!req.files?.image?.[0]) {
      return sendError(res, "Main product image is required", 400, { error: "Main product image is required" });
    }

    const imageUrl = req.files.image[0].path;
    const extraImages =
      req.files.extraImages?.map((file) => file.path) || [];

    const productData = {
      title: req.body.title,
      name: req.body.title,
      description: req.body.description,
      price: parseFloat(req.body.price),
      discountPercentage:
        typeof req.body.discountPercentage !== "undefined" &&
        req.body.discountPercentage !== ""
          ? parseFloat(req.body.discountPercentage)
          : 0,
      quantity: parseInt(req.body.quantity) || 1,
      category: req.body.category,
      image: imageUrl,
      extraImages,
      seller: req.user._id,
      meta: {
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    };

    if (req.body.brand) productData.brand = req.body.brand;
    if (req.body.sku) productData.sku = req.body.sku;
    if (req.body.weight) productData.weight = parseFloat(req.body.weight);
    if (req.body.dimensions) {
      try {
        productData.dimensions = JSON.parse(req.body.dimensions);
      } catch {}
    }
    if (req.body.warrantyInformation)
      productData.warrantyInformation = req.body.warrantyInformation;
    if (req.body.shippingInformation)
      productData.shippingInformation = req.body.shippingInformation;
    if (req.body.availabilityStatus)
      productData.availabilityStatus = req.body.availabilityStatus;
    if (req.body.returnPolicy)
      productData.returnPolicy = req.body.returnPolicy;
    if (req.body.minimumOrderQuantity)
      productData.minimumOrderQuantity = parseInt(req.body.minimumOrderQuantity);
    if (req.body.tags)
      productData.tags = req.body.tags.split(",").map((tag) => tag.trim());

    if (!productData.sku) {
      const slug = (productData.title || 'prd')
        .toString()
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 20);

      let attempt = 0;
      let sku;
      do {
        const rand = Math.floor(1000 + Math.random() * 9000);
        sku = `${slug}-${Date.now().toString().slice(-5)}-${rand}`;

        const exists = await Product.findOne({ sku }).select('_id');
        if (!exists) break;
        attempt += 1;
      } while (attempt < 5);

      productData.sku = sku;
    }

    const product = new Product(productData);
    await product.save();

    return sendSuccess(res, { message: "Product created successfully", data: product }, 201);
  } catch (err) {
    console.error("Create product error:", err);
    return sendError(res, "Failed to create product", 500, { error: "Failed to create product", message: err.message });
  }
};


exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
  const product = await Product.findById(id);
  if (!product) return sendError(res, "Product not found", 404, { error: "Product not found" });

    if (
      product.seller.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return sendError(res, "Not authorized", 403, { error: "Not authorized" });
    }

    const {
      title,
      description,
      price,
      quantity,
      category,
      discountPercentage,
      minimumOrderQuantity,
      weight,
      dimensions
    } = req.body;

  const prevQuantity = product.quantity;

  if (title) product.title = title;
  if (description) product.description = description;

  if (typeof price !== 'undefined') {
    if (price === '') {
      return sendError(res, 'Invalid price', 400, { error: 'Invalid price' });
    }
    const parsedPrice = parseFloat(price);
    if (Number.isNaN(parsedPrice)) {
      return sendError(res, 'Invalid price', 400, { error: 'Invalid price' });
    }
    product.price = parsedPrice;
  }

  if (typeof discountPercentage !== 'undefined' && discountPercentage !== '') {
    const dp = parseFloat(discountPercentage);
    if (Number.isNaN(dp)) return sendError(res, 'Invalid discountPercentage', 400, { error: 'Invalid discountPercentage' });
    product.discountPercentage = dp;
  }

  if (typeof quantity !== 'undefined') {
    const q = parseInt(quantity, 10);
    if (Number.isNaN(q)) return sendError(res, 'Invalid quantity', 400, { error: 'Invalid quantity' });
    product.quantity = q;
  }

  if (typeof minimumOrderQuantity !== 'undefined') {
    const minQ = parseInt(minimumOrderQuantity, 10);
    if (Number.isNaN(minQ)) return sendError(res, 'Invalid minimumOrderQuantity', 400, { error: 'Invalid minimumOrderQuantity' });
    product.minimumOrderQuantity = minQ;
  }

  if (typeof weight !== 'undefined' && weight !== '') {
    const w = parseFloat(weight);
    if (!Number.isNaN(w)) product.weight = w;
  }

  if (typeof dimensions !== 'undefined' && dimensions) {
    try {
      product.dimensions = JSON.parse(dimensions);
    } catch (e) {
    }
  }

  if (category) product.category = category;

    if (req.files?.image?.[0]) {
      product.image = req.files.image[0].path;
    }
    if (req.files?.extraImages?.length > 0) {
      product.extraImages.push(
        ...req.files.extraImages.map((file) => file.path)
      );
    }

    await product.save();

    try {
      if (typeof quantity !== 'undefined' && prevQuantity !== product.quantity) {
        await checkProductStock(product);
      }
    } catch (e) {
      console.error('Error running stockChecker after product update:', e);
    }
    return sendSuccess(res, { message: "Product updated successfully.", product });
  } catch (err) {
    console.error(`[Product] Error updating product: ${req.params.id}`, err);
    return sendError(res, "Error updating product.", 500, { error: "Error updating product.", details: err.message });
  }
};



exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findById(id);
    if (!product) {
      return sendError(res, "Product not found", 404, { error: "Product not found" });
    }

    if (
      product.seller.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return sendError(res, "Not authorized", 403, { error: "Not authorized" });
    }

    if (product.image) {
      await deleteFromCloudinary(product.image);
    }
    if (product.extraImages?.length > 0) {
      await Promise.allSettled(product.extraImages.map(img => deleteFromCloudinary(img)));
    }

  await Product.findByIdAndDelete(id);

  return sendSuccess(res, { message: "Product deleted successfully" });
  } catch (err) {
    console.error("Error in deleteProduct:", err.message);
    return sendError(res, "Failed to delete product", 500, { error: "Failed to delete product", details: err.message });
  }
};



exports.deleteProductImage = async (req, res) => {
  try {
    const { id } = req.params;
    const { imagePath } = req.body;

    const product = await Product.findById(id);
    if (!product) {
      return sendError(res, "Product not found", 404, { error: "Product not found" });
    }

    if (
      product.seller.toString() !== req.user._id.toString() &&
      req.user.role !== "admin"
    ) {
      return sendError(res, "Not authorized", 403, { error: "Not authorized" });
    }

    let toDeleteUrl = null;
    if (typeof imagePath === 'string' && imagePath.startsWith('http')) {
      toDeleteUrl = imagePath;
    } else if (typeof imagePath === 'string') {
      const filename = imagePath.split('/').pop();
      const match = (product.extraImages || []).find(img => img && img.includes(filename));
      if (match) toDeleteUrl = match;
    }

    if (toDeleteUrl) {
      await deleteFromCloudinary(toDeleteUrl);
    } else {
      console.warn('[Product] deleteProductImage: no matching stored image URL found for', imagePath);
    }

    const filenameToRemove = (imagePath && String(imagePath).split('/').pop()) || null;
    product.extraImages = (product.extraImages || []).filter((img) => {
      if (!img) return false;
      if (img === imagePath) return false;
      if (toDeleteUrl && img === toDeleteUrl) return false;
      if (filenameToRemove && img.split('/').pop() === filenameToRemove) return false;
      return true;
    });
    await product.save();

    return sendSuccess(res, { message: "Image deleted successfully", product });
  } catch (err) {
    console.error("Error deleting image:", err);
    return sendError(res, "Failed to delete image", 500, { error: "Failed to delete image", details: err.message });
  }
};


exports.getAllProducts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '12', 10), 200));
    const sort = req.query.sort || '-createdAt';
    const fieldsRaw = req.query.fields ? String(req.query.fields) : null;
    const projection = fieldsRaw ? fieldsRaw.split(',').map(f => f.trim()).filter(Boolean).join(' ') : null;

    const explicitAll = String(req.query.all || 'false') === 'true';
    const MAX_ALL_LIMIT = 1000;

    let query = Product.find();
    if (projection) query = query.select(projection);
    query = query.populate('seller', 'name email _id').sort(sort);

    if (explicitAll) {
      const effectiveLimit = Math.min(parseInt(req.query.limit || String(MAX_ALL_LIMIT), 10), MAX_ALL_LIMIT);
      query = query.limit(effectiveLimit);
      query = query.lean();
      const products = await query.exec();

      const productIds = products.map(p => p._id);
      let ratings = [];
      if (productIds.length > 0) {
        ratings = await Review.aggregate([
          { $match: { product: { $in: productIds } } },
          { $group: { _id: "$product", averageRating: { $avg: "$rating" }, reviewsCount: { $sum: 1 } } }
        ]);
      }
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

      try {
        const latestUpdated = productsWithRatings.reduce((mx, p) => {
          const t = p && p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
          return Math.max(mx, t);
        }, 0);
        const etagRaw = `${latestUpdated}:${productsWithRatings.length}`;
        const etag = `W/"${crypto.createHash('md5').update(String(etagRaw)).digest('hex')}"`;
        const lastModified = latestUpdated ? new Date(latestUpdated).toUTCString() : new Date().toUTCString();
        const maxAge = 30;

        if (req.headers['if-none-match'] === etag || (req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']).getTime() === latestUpdated)) {
          res.status(304).end();
          return;
        }

        res.set('Cache-Control', `public, max-age=${maxAge}`);
        res.set('ETag', etag);
        res.set('Last-Modified', lastModified);
      } catch (e) {
        console.warn('Failed to compute product list cache headers:', e && e.message);
      }

      return sendSuccess(res, { count: productsWithRatings.length, products: productsWithRatings });
    }

    const skip = (page - 1) * limit;
    query = query.skip(skip).limit(limit).lean();

    const [products, total] = await Promise.all([
      query.exec(),
      Product.countDocuments()
    ]);

    const productIds = products.map(p => p._id);
    let ratings = [];
    if (productIds.length > 0) {
      ratings = await Review.aggregate([
        { $match: { product: { $in: productIds } } },
        { $group: { _id: "$product", averageRating: { $avg: "$rating" }, reviewsCount: { $sum: 1 } } }
      ]);
    }
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

      try {
      const latestUpdated = productsWithRatings.reduce((mx, p) => {
        const t = p && p.updatedAt ? new Date(p.updatedAt).getTime() : 0;
        return Math.max(mx, t);
      }, 0);
      const etagRaw = `${latestUpdated}:${productsWithRatings.length}:${page}:${limit}`;
      const etag = `W/"${crypto.createHash('md5').update(String(etagRaw)).digest('hex')}"`;
      const lastModified = latestUpdated ? new Date(latestUpdated).toUTCString() : new Date().toUTCString();
      const maxAge = 15; 

      if (req.headers['if-none-match'] === etag || (req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']).getTime() === latestUpdated)) {
        res.status(304).end();
        return;
      }

      res.set('Cache-Control', `public, max-age=${maxAge}`);
      res.set('ETag', etag);
      res.set('Last-Modified', lastModified);
    } catch (e) {
      console.warn('Failed to compute paginated product list cache headers:', e && e.message);
    }

    return sendSuccess(res, { count: productsWithRatings.length, total, page, pages: Math.ceil(total / limit), products: productsWithRatings });
  } catch (error) {
    console.error("Error in getAllProducts:", error);
    return sendError(res, "Failed to fetch products", 500, { error: "Failed to fetch products", details: error && error.message });
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
  const fieldsRaw = req.query.fields ? String(req.query.fields) : null;
  const projection = fieldsRaw ? fieldsRaw.split(',').map(f => f.trim()).filter(Boolean).join(' ') : null;
  const hasLimit = typeof req.query.limit !== 'undefined';
  const hasPage = typeof req.query.page !== 'undefined';

  const explicitAll = String(req.query.all || 'false') === 'true';
  const hasFilters = Boolean(search) || Boolean(req.query.tags) || Boolean(req.query.brand) || Boolean(minPrice) || Boolean(maxPrice) || Boolean(req.query.availability) || Boolean(minRating) || Boolean(exclude) || Boolean(category);
  const wantAll = explicitAll || hasFilters;
  const MAX_ALL_LIMIT = 1000;

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

  const usePlainSearch = search && typeof search === 'string' && search.trim().length > 0;

  if (req.query.tags) {
    const tags = String(req.query.tags).split(',').map(t => t.trim()).filter(Boolean);
    if (tags.length > 0) {
      filter.tags = { $in: tags };
    }
  }

  if (req.query.brand) {
    const brand = String(req.query.brand).trim();
    if (brand) filter.brand = brand;
  }

  if (req.query.availability) {
    const av = String(req.query.availability);
    if (av === 'inStock') filter.quantity = { $gt: 5 };
    else if (av === 'lowStock') filter.quantity = { $gt: 0, $lte: 5 };
    else if (av === 'outOfStock') filter.quantity = 0;
  }

  const skip = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));

  function escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  try {
    if (usePlainSearch) {
      const s = escapeRegex(search.trim());
      filter.$or = [
        { title: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
        { sku: { $regex: s, $options: 'i' } },
        { brand: { $regex: s, $options: 'i' } }
      ];
    }

    let productsQuery = Product.find(filter).populate("seller", "name email _id");
    if (projection) productsQuery = productsQuery.select(projection);

    productsQuery = productsQuery.sort(sort);

    if (wantAll && !hasPage && !hasLimit && !explicitAll) {
      productsQuery = productsQuery.limit(MAX_ALL_LIMIT);
    } else {
      productsQuery = productsQuery.skip(skip).limit(Math.max(1, parseInt(limit)));
    }

    productsQuery = productsQuery.lean();

    const [products, total] = await Promise.all([
      productsQuery,
      Product.countDocuments(filter)
    ]);

    const needRatings = !fieldsRaw || fieldsRaw.includes('averageRating') || fieldsRaw.includes('reviewsCount') || minRating;
    let productsWithRatings = products;
    if (needRatings) {
      const productIds = products.map(p => p._id);
      let ratings = [];
      if (productIds.length > 0) {
        ratings = await Review.aggregate([
          { $match: { product: { $in: productIds } } },
          { $group: { _id: "$product", averageRating: { $avg: "$rating" }, reviewsCount: { $sum: 1 } } }
        ]);
      }
      const ratingsMap = {};
      ratings.forEach(r => {
        ratingsMap[r._id.toString()] = {
          averageRating: r.averageRating ? parseFloat(r.averageRating.toFixed(1)) : 0,
          reviewsCount: r.reviewsCount || 0
        };
      });
      productsWithRatings = products.map(p => ({
        ...p,
        averageRating: ratingsMap[p._id.toString()]?.averageRating || 0,
        reviewsCount: ratingsMap[p._id.toString()]?.reviewsCount || 0
      }));
    }

    if (wantAll) {
      return sendSuccess(res, { count: productsWithRatings.length, total, products: productsWithRatings });
    }

    return sendSuccess(res, { count: productsWithRatings.length, total, page: parseInt(page), pages: Math.ceil(total / limit), products: productsWithRatings });

  } catch (err) {
    console.error("Error in getFilteredProducts:", err);
    return sendError(res, "Failed to fetch filtered products", 500, { error: "Failed to fetch filtered products", message: err.message });
  }
});


exports.getProductById = async (req, res) => {
  try {
    const fieldsRaw = req.query.fields ? String(req.query.fields) : null;
    const projection = fieldsRaw ? fieldsRaw.split(',').map(f => f.trim()).filter(Boolean).join(' ') : null;

    let productQuery = Product.findById(req.params.id);
    if (projection) {
      productQuery = productQuery.select(projection);
      if (!projection.includes('seller')) productQuery = productQuery.populate('seller', 'name _id');
      const product = await productQuery.lean();
      if (!product) return sendError(res, "Product not found", 404, { error: "Product not found" });
      try {
        const latestUpdated = product.updatedAt ? new Date(product.updatedAt).getTime() : Date.now();
        const etag = `W/"${crypto.createHash('md5').update(String(product._id) + ':' + String(latestUpdated)).digest('hex')}"`;
        const lastModified = new Date(latestUpdated).toUTCString();
        const maxAge = 60; 
        if (req.headers['if-none-match'] === etag || (req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']).getTime() === latestUpdated)) {
          res.status(304).end();
          return;
        }

        res.set('Cache-Control', `public, max-age=${maxAge}`);
        res.set('ETag', etag);
        res.set('Last-Modified', lastModified);
      } catch (e) {
        console.warn('Failed to compute product cache headers:', e && e.message);
      }

      return sendSuccess(res, { product });
    }

    const product = await productQuery
      .populate("seller", "name email _id")
      .populate({
        path: "reviews",
        populate: {
          path: "user",
          select: "name email _id"
        }
      });

    if (!product) return sendError(res, "Product not found", 404, { error: "Product not found" });
    try {
      const latestUpdated = product.updatedAt ? new Date(product.updatedAt).getTime() : Date.now();
      const etag = `W/"${crypto.createHash('md5').update(String(product._id) + ':' + String(latestUpdated)).digest('hex')}"`;
      const lastModified = new Date(latestUpdated).toUTCString();
      const maxAge = 60;

      if (req.headers['if-none-match'] === etag || (req.headers['if-modified-since'] && new Date(req.headers['if-modified-since']).getTime() === latestUpdated)) {
        res.status(304).end();
        return;
      }

      res.set('Cache-Control', `public, max-age=${maxAge}`);
      res.set('ETag', etag);
      res.set('Last-Modified', lastModified);
    } catch (e) {
      console.warn('Failed to compute product cache headers:', e && e.message);
    }

    return sendSuccess(res, { product });
  } catch (err) {
    return sendError(res, "Failed to fetch product", 500, { error: "Failed to fetch product", details: err.message });
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

    return sendSuccess(res, { products, total, page: pageNum, pages: Math.ceil(total / lim) });
  } catch (err) {
    return sendError(res, "Failed to fetch seller products", 500, { error: "Failed to fetch seller products", details: err.message });
  }
};

exports.getSellerDashboardStats = async (req, res) => {
  try {
    const sellerId = req.user._id;
  const cacheKey = `sellerDashboard:${sellerId}`;
  const cacheTtl = 30000; 
  const cacheUtil = require('../utils/cache');
  const cached = await cacheUtil.get(cacheKey);
  if (cached) return sendSuccess(res, cached);

    const products = await Product.find({ seller: sellerId }).sort("-createdAt");
    const productsCount = products.length;

    const productIds = products.map(p => p._id);
    const productIdSet = new Set(productIds.map(p => p.toString()));

    const recentOrders = await Order.find({ "items.product": { $in: productIds } })
      .sort("-createdAt")
      .limit(5);

    const ordersCount = await Order.countDocuments({ "items.product": { $in: productIds } });

          const salesAgg = await Order.aggregate([
        { $unwind: "$items" },
        { $lookup: {
            from: "products",
            localField: "items.product",
            foreignField: "_id",
            as: "product"
          }
        },
        { $unwind: "$product" },
          { $match: { "items.product": { $in: productIds }, status: "Delivered" } },
        { $group: { _id: "$items.product", qty: { $sum: "$items.quantity" }, revenue: { $sum: { $multiply: ["$items.quantity", "$product.price"] } } } },
        { $sort: { qty: -1 } },
        { $limit: 5 }
      ]);

      const totalAgg = await Order.aggregate([
        { $unwind: "$items" },
        { $match: { "items.product": { $in: productIds }, status: "Delivered" } },
        { $group: { _id: null, totalSales: { $sum: { $multiply: ["$items.quantity", "$items.price"] } } } }
      ]);

      const totalSales = (totalAgg && totalAgg[0] && totalAgg[0].totalSales) ? totalAgg[0].totalSales : 0;

      const productSalesMap = {};
      for (const s of salesAgg) {
        productSalesMap[String(s._id)] = s.qty;
      }

      const sortedProductIds = Object.keys(productSalesMap).slice(0, 5);
      const popularProducts = await Product.find({ _id: { $in: sortedProductIds } });

    const stockAlerts = products.filter(p => p.quantity <= 5);

    const result = { productsCount, ordersCount, totalSales, recentOrders, popularProducts, stockAlerts };
  await cacheUtil.set(cacheKey, result, cacheTtl);
    return sendSuccess(res, result);
  } catch (error) {
    console.error("Error in getSellerDashboardStats:", error);
    return sendError(res, "Error loading seller statistics", 500, { error: "Error loading seller statistics" });
  }
};
exports.getSellerSalesData = async (req, res) => {
  try {
    const sellerId = req.user._id;
  const cacheUtil = require('../utils/cache');
  const cacheKey = `sellerSales:${sellerId}`;
  const cached = await cacheUtil.get(cacheKey);
  if (cached) return sendSuccess(res, { ordersSales: cached });

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

  await cacheUtil.set(cacheKey, ordersSales, 30000);
    return sendSuccess(res, { ordersSales });
  } catch (err) {
    console.error("Error in getSellerSalesData:", err);
    return sendError(res, "Error loading sales data", 500, { error: "Error loading sales data" });
  }
};
exports.getPopularSellerProducts = async (req, res) => {
  try {
    const sellerId = req.user._id;
  const cacheUtil = require('../utils/cache');
  const cacheKey = `popularProducts:${sellerId}`;
  const cached = await cacheUtil.get(cacheKey);
  if (cached) return sendSuccess(res, { popularProducts: cached });

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
  await cacheUtil.set(cacheKey, popularProducts, 30000);
  return sendSuccess(res, { popularProducts });
  } catch (err) {
    console.error("Error in getPopularSellerProducts:", err);
    return sendError(res, "Error loading popular products", 500, { error: "Error loading popular products" });
  }
};

exports.getProductStatsBySeller = async (req, res) => {
  try {
    const sellerId = req.user._id;
  const cacheUtil = require('../utils/cache');
  const cacheKey = `productStats:${sellerId}`;
  const cached = await cacheUtil.get(cacheKey);
  if (cached) return sendSuccess(res, cached);

    const products = await Product.find({ seller: sellerId });

    const productsCount = products.length;
    const totalStock = products.reduce((sum, p) => sum + (p.quantity || 0), 0);
    const totalValue = products.reduce((sum, p) => sum + (p.quantity * p.price), 0);

    const result = { productsCount, totalStock, totalValue };
  await cacheUtil.set(cacheKey, result, 30000);
  return sendSuccess(res, result);
  } catch (err) {
    return sendError(res, "Failed to fetch stats", 500, { error: "Failed to fetch stats", details: err.message });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const categories = await Product.distinct("category");
    return sendSuccess(res, { categories: Array.isArray(categories) ? categories : [] });
  } catch (err) {
    console.error("Error fetching categories:", err);
    return sendError(res, "Failed to fetch categories", 500, { error: "Failed to fetch categories" });
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

    return sendSuccess(res, { counts: counts || {} });
  } catch (err) {
    console.error("Error getting category counts:", err);
    return sendError(res, "Failed to fetch category counts", 500, { error: "Failed to fetch category counts" });
  }
};

exports.getRecentProducts = async (req, res) => {
  try {
    const recentProducts = await Product.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('seller', 'name');

    return sendSuccess(res, { products: recentProducts });
  } catch (err) {
    return sendError(res, "Failed to fetch recent products", 500, { error: "Failed to fetch recent products", details: err.message });
  }
};