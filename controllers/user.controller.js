const User = require("../models/user.model");
const Order = require("../models/order.model");
const Product = require("../models/product.model");
const bcrypt = require("bcrypt");

const getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select("-password");
    res.status(200).json({
      success: true,
      users
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message 
    });
  }
};

const deleteSelf = async (req, res) => {
  try {
    const userToDelete = await User.findById(req.user._id);
    if (!userToDelete) {
      return res.status(404).json({
        success: false,
        error: "User not found.",
        details: "User not found"
      });
    }

    await userToDelete.deleteOne();
    console.log(`[User] Self-deleted: ${userToDelete._id}`);
    res.status(200).json({
      success: true,
      message: "Your account has been deleted successfully"
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { role } = req.body;
    const userToUpdate = await User.findById(req.params.id);
    if (!userToUpdate) {
      return res.status(404).json({ 
        success: false,
        error: "User not found.",
        details: "User not found"
      });
    }
  const userToUpdateRole = userToUpdate.activeRole || (userToUpdate.roles && userToUpdate.roles[0]) || null;
  if (userToUpdateRole === 'admin' && req.user.role !== 'admin') {
      console.error(`[User] Not authorized to change admin role. user: ${req.user?._id}`);
      return res.status(403).json({
        success: false,
        error: "Not authorized to change admin role.",
        details: "Cannot change admin role unless you are admin"
      });
    }
  userToUpdate.role = role;
    await userToUpdate.save();
    console.log(`[User] User role updated: ${userToUpdate._id} to ${role} by ${req.user?._id}`);
    res.status(200).json({ 
      success: true,
      message: "User role updated successfully.", 
      user: userToUpdate 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message 
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userToDelete = await User.findById(req.params.id);
    if (!userToDelete) {
      return res.status(404).json({ 
        success: false,
        error: "User not found.",
        details: "User not found"
      });
    }
  const userToDeleteRole = userToDelete.activeRole || (userToDelete.roles && userToDelete.roles[0]) || null;
  if (userToDeleteRole === 'admin' && req.user.role !== 'admin') {
      console.error(`[User] Not authorized to delete admin. user: ${req.user?._id}`);
      return res.status(403).json({
        success: false,
        error: "Not authorized to delete admin.",
        details: "Cannot delete admin unless you are admin"
      });
    }
    await userToDelete.deleteOne();
    console.log(`[User] User deleted: ${userToDelete._id} by ${req.user?._id}`);
    res.status(200).json({ 
      success: true,
      message: "User deleted successfully." 
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message 
    });
  }
};

const getAdminStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalOrders = await Order.countDocuments();
    const totalProducts = await Product.countDocuments();
    
    const totalSalesAgg = await Order.aggregate([
      { $match: { status: 'Delivered' } },
      { $group: { _id: null, total: { $sum: "$totalAmount" } } }
    ]);
    const totalSales = totalSalesAgg[0]?.total || 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const salesData = await Order.aggregate([
      { $match: { 
        status: 'Delivered',
        createdAt: { $gte: sevenDaysAgo }
      }},
      { $group: { 
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        total: { $sum: "$totalAmount" }
      }},
      { $sort: { _id: 1 } }
    ]);

    const userRoles = {
      buyer: await User.countDocuments({ role: 'buyer' }),
      seller: await User.countDocuments({ role: 'seller' }),
      admin: await User.countDocuments({ role: 'admin' })
    };

    const orderStatus = {
      Processing: await Order.countDocuments({ status: 'Processing' }),
      Shipped: await Order.countDocuments({ status: 'Shipped' }),
      Delivered: await Order.countDocuments({ status: 'Delivered' }),
      Cancelled: await Order.countDocuments({ status: 'Cancelled' })
    };

    res.status(200).json({
      totalUsers,
      totalOrders,
      totalProducts,
      totalSales,
      salesData,
      userRoles,
      orderStatus
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message
    });
  }
};
const updateUserProfile = async (req, res) => {
  try {
  const { name, currentPassword, newPassword } = req.body;
    const user = await User.findById(req.params.id).select('+password');

    if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized to update this profile' });
    }

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: "User not found" 
      });
    }

    if (currentPassword && newPassword) {
      const isPasswordValid = await user.comparePassword(currentPassword, user.password);
      if (!isPasswordValid) {
        return res.status(401).json({
          success: false,
          message: "Current password is incorrect"
        });
      }
      user.password = newPassword;
    }

  user.name = name;
    await user.save();

    user.password = undefined;
    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user
    });
  } catch (err) {
    res.status(500).json({ 
      success: false,
      message: "Server error", 
      error: err.message 
    });
  }
};


  const switchRole = async (userId, newRole) => {
    if (!['buyer', 'seller', 'admin'].includes(newRole)) {
      throw new Error('Invalid role');
    }

    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    const previous = user.activeRole || (user.roles && user.roles[0]) || null;

    if (!Array.isArray(user.roles)) user.roles = [];
    if (!user.roles.includes(newRole)) user.roles.push(newRole);

    user.activeRole = newRole;
    await user.save();

    if (previous === 'seller' && newRole === 'buyer') {
      await Product.updateMany({ seller: user._id, isActive: true }, { $set: { isActive: false } });
    }


    return user;
  };

  const switchRoleHandler = async (req, res) => {
    try {
      const { id } = req.params;
      const { newRole } = req.body;

      if (req.user._id.toString() !== id && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Not authorized to switch role for this user' });
      }

      if (newRole === 'admin' && req.user.role !== 'admin') {
        return res.status(403).json({ success: false, message: 'Cannot promote to admin' });
      }

      const updatedUser = await switchRole(id, newRole);
      updatedUser.password = undefined;
      res.status(200).json({ success: true, message: 'Role switched successfully', user: updatedUser });
    } catch (err) {
      console.error('switchRole error:', err);
      res.status(400).json({ success: false, message: err.message || 'Failed to switch role' });
    }
  };

module.exports = {
  getAllUsers,
  updateUserRole,
  updateUserProfile,
  deleteUser,
  deleteSelf,
  getAdminStats
    , switchRole,
    switchRoleHandler
};