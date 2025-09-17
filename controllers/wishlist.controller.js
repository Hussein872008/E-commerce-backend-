const Wishlist = require('../models/wishlist.model');
const Product = require('../models/product.model');
const mongoose = require('mongoose');


exports.addToWishlist = async (req, res) => {
  try {
    if (!req.user || req.user.role !== 'buyer') {
      return res.status(403).json({ success: false, message: 'Only buyer accounts can manage wishlist' });
    }
    const { productId } = req.body;
    const userId = req.user?._id; 

    if (!userId) {
      return res.status(400).json({ 
        success: false,
        error: 'User ID is required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Invalid product ID' 
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ 
        success: false,
        error: 'Product not found' 
      });
    }

    let wishlist = await Wishlist.findOne({ user: userId });

    if (!wishlist) {
      wishlist = new Wishlist({
        user: userId,                
        products: [{ product: productId }]
      });
    } else {
      const existingProduct = wishlist.products.find(
        p => p.product.toString() === productId.toString()
      );
      if (existingProduct) {
        return res.status(400).json({ 
          success: false,
          error: 'Product already in wishlist' 
        });
      }
      wishlist.products.push({ product: productId });
    }

    await wishlist.save();
    await wishlist.populate({
      path: 'products.product',
      select: 'title price image originalPrice'
    });

    res.status(200).json({
      success: true,
      message: 'Product added to wishlist',
      wishlist: wishlist.products
    });

  } catch (error) {
    console.error('Error adding to wishlist:', error);
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to add to wishlist'
    });
  }
};


exports.removeFromWishlist = async (req, res) => {
    try {
    if (!req.user || req.user.role !== 'buyer') {
      return res.status(403).json({ success: false, message: 'Only buyer accounts can manage wishlist' });
    }
        const { productId } = req.params;
        const userId = req.user._id;

        const wishlist = await Wishlist.findOneAndUpdate(
            { user: userId },
            { $pull: { products: { product: productId } } },
            { new: true }
        ).populate({
            path: 'products.product',
            select: 'title price image originalPrice'
        });

        if (!wishlist) {
            return res.status(404).json({ 
                success: false,
                error: 'Wishlist not found' 
            });
        }

        res.status(200).json({
            success: true,
            message: 'Product removed from wishlist',
            wishlist: wishlist.products
        });
    } catch (error) {
        console.error('Error removing from wishlist:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to remove from wishlist' 
        });
    }
};


exports.getWishlist = async (req, res) => {
    try {
        const userId = req.user._id;

        const wishlist = await Wishlist.findOne({ user: userId })
            .populate({
                path: 'products.product',
                select: 'title price image originalPrice features'
            })
            .lean();

        const result = {
            products: wishlist ? [...wishlist.products].sort(
                (a, b) => new Date(b.addedAt) - new Date(a.addedAt)
            ) : []
        };

        res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error getting wishlist:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get wishlist' 
        });
    }
};



exports.getWishlistCount = async (req, res) => {
    try {
        const userId = req.user._id;

        const wishlist = await Wishlist.findOne({ user: userId }).lean();
        const count = wishlist ? wishlist.products.length : 0;

        res.status(200).json({ 
            success: true,
            count 
        });
    } catch (error) {
        console.error('Error getting wishlist count:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to get wishlist count' 
        });
    }
};

exports.checkWishlist = async (req, res) => {
    try {
        const { productId } = req.params;
        const userId = req.user._id;

        const wishlist = await Wishlist.findOne({
            user: userId,
            'products.product': productId
        });

        res.status(200).json({
            success: true,
            isInWishlist: !!wishlist
        });
    } catch (error) {
        console.error('Error checking wishlist:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to check wishlist' 
        });
    }
};
