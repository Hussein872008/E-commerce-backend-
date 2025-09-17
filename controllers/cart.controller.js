const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const mongoose = require('mongoose');

exports.getCart = async (req, res) => {
    try {
        const userId = req.user._id;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid user ID'
            });
        }

        let cart = await Cart.findOne({ user: userId })
            .populate({
                path: 'items.product',
                select: 'title price image quantity seller',
                transform: (doc) => {
                    if (!doc) return null;
                    return {
                        _id: doc._id,
                        title: doc.title,
                        price: doc.price,
                        image: doc.image?.startsWith('http') ? doc.image : `${(process.env.BACKEND_URL || process.env.FRONTEND_URL)}${doc.image.startsWith('/') ? '' : '/'}${doc.image}`,
                        quantity: doc.quantity,
                        seller: doc.seller
                    };
                }
            });
        if (!cart) {
            cart = new Cart({
                user: new mongoose.Types.ObjectId(userId),
                items: [],
                total: 0,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
            await cart.save();
            return res.status(200).json({
                success: true,
                items: [],
                total: 0
            });
        }

        const validItems = cart.items.filter(item => item.product && item.product.quantity > 0);
        if (validItems.length !== cart.items.length) {
            cart.items = validItems;
            await cart.save();
        }

        res.status(200).json({
            success: true,
            items: cart.items,
            total: cart.total
        });
    } catch (error) {
        console.error('Get cart error:', error);
        res.status(500).json({
            success: false,
            error: 'Server Error',
            details: error.message
        });
    }
};

exports.addToCart = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'buyer') {
            return res.status(403).json({ success: false, message: 'Only buyer accounts can modify the cart' });
        }
        const { productId, quantity = 1 } = req.body;
        const userId = req.user._id;

        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product not found'
            });
        }

        if (product.quantity < quantity) {
            return res.status(400).json({
                success: false,
                error: 'Insufficient stock',
                available: product.quantity
            });
        }

        let cart = await Cart.findOne({ user: userId });
        if (!cart) {
            cart = new Cart({
                user: userId,
                items: [],
                total: 0,
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
            });
        }

        const existingItemIndex = cart.items.findIndex(
            item => item.product.toString() === productId
        );

        if (existingItemIndex !== -1) {
            const newQuantity = cart.items[existingItemIndex].quantity + quantity;

            if (newQuantity > 10) {
                return res.status(400).json({
                    success: false,
                    error: 'Maximum quantity per item is 10'
                });
            }

            if (product.quantity < newQuantity) {
                return res.status(400).json({
                    success: false,
                    error: 'Insufficient stock for requested quantity',
                    available: product.quantity
                });
            }

            cart.items[existingItemIndex].quantity = newQuantity;
        } else {
            if (cart.items.length >= 20) {
                return res.status(400).json({
                    success: false,
                    error: 'Cart limit reached (20 items max)'
                });
            }

            cart.items.push({
                product: productId,
                quantity,
                price: product.price
            });
        }

        await cart.save();

        const populatedCart = await Cart.populate(cart, {
            path: 'items.product',
            select: 'title price image quantity'
        });

        res.status(200).json({
            success: true,
            message: 'Cart updated successfully',
            cart: populatedCart
        });

    } catch (error) {
        console.error('Add to cart error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update cart',
            details: error.message
        });
    }
};

exports.updateCartItem = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'buyer') {
            return res.status(403).json({ success: false, message: 'Only buyer accounts can modify the cart' });
        }
        const { itemId } = req.params;
        const { quantity } = req.body;
        const userId = req.user._id;

        if (!quantity || quantity < 1 || quantity > 10) {
            return res.status(400).json({
                success: false,
                error: 'Quantity must be between 1 and 10'
            });
        }

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                error: 'Cart not found'
            });
        }

        const itemIndex = cart.items.findIndex(item => 
            item._id.toString() === itemId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Item not found in cart'
            });
        }

        const item = cart.items[itemIndex];
        const product = await Product.findById(item.product);
        
        if (!product) {
            return res.status(404).json({
                success: false,
                error: 'Product no longer available'
            });
        }

        if (product.quantity < quantity) {
            return res.status(400).json({
                success: false,
                error: 'Not enough stock available',
                maxQuantity: product.quantity
            });
        }

        cart.items[itemIndex].quantity = quantity;
        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Cart updated',
            cart: await Cart.populate(cart, {
                path: 'items.product',
                select: 'title price image quantity'
            })
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to update cart',
            details: error.message
        });
    }
};

exports.removeFromCart = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'buyer') {
            return res.status(403).json({ success: false, message: 'Only buyer accounts can modify the cart' });
        }
        const { itemId } = req.params;
        const userId = req.user._id;

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                error: 'Cart not found'
            });
        }

        const itemIndex = cart.items.findIndex(item => 
            item._id.toString() === itemId
        );

        if (itemIndex === -1) {
            return res.status(404).json({
                success: false,
                error: 'Item not found in cart'
            });
        }

        cart.items.splice(itemIndex, 1);
        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Item removed from cart',
            cart: await Cart.populate(cart, {
                path: 'items.product',
                select: 'title price image quantity'
            })
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to remove from cart',
            details: error.message
        });
    }
};

exports.clearCart = async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'buyer') {
            return res.status(403).json({ success: false, message: 'Only buyer accounts can modify the cart' });
        }
        const userId = req.user._id;

        const cart = await Cart.findOne({ user: userId });
        if (!cart) {
            return res.status(404).json({
                success: false,
                error: 'Cart not found'
            });
        }

        cart.items = [];
        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Cart cleared'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Failed to clear cart',
            details: error.message
        });
    }
};