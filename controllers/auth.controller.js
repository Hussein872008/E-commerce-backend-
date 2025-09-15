const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const { BadRequestError, UnauthorizedError } = require('../middleware/error.middleware');
const { ConflictError } = require('../middleware/error.middleware');

const generateAccessToken = (userPayload) => {
  return jwt.sign(
    { id: userPayload.id || userPayload._id, role: userPayload.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
};

const generateRefreshToken = (userPayload) => {
  return jwt.sign(
    { id: userPayload.id || userPayload._id, role: userPayload.role },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );
};

const getRefreshCookieOptions = () => {
  const maxAgeDays = (() => {
    const raw = process.env.JWT_REFRESH_EXPIRES || '7d';
    if (raw.endsWith && raw.endsWith('d')) {
      const days = parseInt(raw.slice(0, -1), 10);
      if (!isNaN(days)) return days * 24 * 60 * 60 * 1000;
    }
    return 7 * 24 * 60 * 60 * 1000;
  })();

  return {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  maxAge: maxAgeDays
  };
};

exports.login = async (req, res, next) => {
  try {
    let { email, password } = req.body;
    if (typeof email === 'string') email = email.trim().toLowerCase();

    if (!email || !password) {
      console.error(`[Auth] Missing login data. email: ${email}`);
      return res.status(400).json({
        success: false,
        error: 'Please provide email and password.',
        details: 'Please provide email and password.'
      });
    }

    console.log('Finding user with email:', email);
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      console.error(`[Auth] Failed login attempt. email: ${email}`);
      return res.status(401).json({
        success: false,
        error: 'Incorrect email or password.',
        details: 'Incorrect email or password.'
      });
    }

    console.log('Comparing passwords...');
    const isPasswordValid = await user.comparePassword(password, user.password);

    if (!isPasswordValid) {
      console.error(`[Auth] Incorrect password. email: ${email}`);
      return res.status(401).json({
        success: false,
        error: 'Incorrect email or password.',
        details: 'Incorrect email or password.'
      });
    }

    console.log('Password is valid, generating token...');
    const accessToken = generateAccessToken({ id: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user._id, role: user.role });

    try {
      res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());
    } catch (e) {
      console.warn('Could not set refresh token cookie:', e.message || e);
    }

    user.password = undefined;

    console.log(`[Auth] Successful login for user: ${user._id}`);
    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    console.error('Error stack:', err.stack);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: err.message
    });
  }
};

exports.register = async (req, res, next) => {
  try {
    const { name, email, password, passwordConfirm, role } = req.body;

    if (!name || !email || !password || !passwordConfirm) {
      console.error(`[Auth] Missing registration data. email: ${email}`);
      return res.status(400).json({
        success: false,
        error: 'All fields are required.',
        details: 'All fields are required.'
      });
    }

    if (password !== passwordConfirm) {
      console.error(`[Auth] Passwords do not match. email: ${email}`);
      return res.status(400).json({
        success: false,
        error: 'Passwords do not match.',
        details: 'Passwords do not match.'
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.error(`[Auth] Email already registered. email: ${email}`);
      return res.status(409).json({
        success: false,
        error: 'Email is already registered.',
        details: 'Email is already registered.'
      });
    }

    const newUser = await User.create({
      name,
      email,
      password,
      passwordConfirm,
      role: role || 'buyer'
    });

    newUser.password = undefined;

    const accessToken = generateAccessToken({ id: newUser._id, role: newUser.role });
    const refreshToken = generateRefreshToken({ id: newUser._id, role: newUser.role });

    try {
      res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());
    } catch (e) {
      console.warn('Could not set refresh token cookie:', e.message || e);
    }


    console.log(`[Auth] New user registered: ${newUser._id}`);
    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token: accessToken,
      refreshToken,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (err) {
    console.error('Register error:', err);
    console.error('Error stack:', err.stack);
    next(err);
  }
};

exports.verifyToken = async (req, res, next) => {
  try {

    if (!req.user?._id) {
      return res.status(400).json({ success: false, message: 'User data missing' });
    }

    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Controller error:', err);
    next(err);
  }
};

exports.forgotPassword = async (req, res) => {
  console.log('--- forgotPassword called ---');

  try {
    const { email } = req.body;
    console.log('Received email:', email);

    const user = await User.findOne({ email });
    console.log('User found:', !!user);

    if (!user) {
      console.log('No user found, sending generic response');
      return res.status(200).json({
        success: true,
        message: 'If your email is registered, you will receive a password reset link.',
      });
    }

    console.log('Generating reset token...');
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    console.log('Reset token saved:', resetToken);

    if (!process.env.FRONTEND_URL) {
      console.error('FRONTEND_URL not defined');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: FRONTEND_URL not set',
      });
    }

    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;
    const message = `You requested a password reset. Click the link below to reset your password:\n\n${resetURL}\n\nThis link will expire in 10 minutes.`;

    console.log('Sending email...');
    try {
      await Promise.race([
        sendEmail(user.email, 'Your password reset link (valid for 10 minutes)', message),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Email send timeout')), 10000))
      ]);
      console.log('Email sent successfully');
    } catch (emailErr) {
      console.error('Failed to send email:', emailErr.message);
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email',
        error: emailErr.message
      });
    }

    res.status(200).json({
      success: true,
      message: 'Password reset link sent to your email.'
    });

  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Error processing your request'
    });
  }
};


exports.resetPassword = async (req, res, next) => {
  console.log('--- resetPassword called ---');
  console.log('Request params:', req.params);
  console.log('Request body:', req.body);

  try {
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');
    console.log('Hashed token:', hashedToken);

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    console.log('User found for token:', !!user);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token is invalid or has expired.'
      });
    }

    if (req.body.password !== req.body.passwordConfirm) {
      return res.status(400).json({
        success: false,
        message: 'Passwords do not match.'
      });
    }

    console.log('Updating user password...');
    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    console.log('Password updated');

    console.log('Generating tokens...');
    const accessToken = generateAccessToken({ id: user._id, role: user.role });
    const refreshToken = generateRefreshToken({ id: user._id, role: user.role });
    console.log('Tokens generated');

    try {
      res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());
      console.log('Refresh token cookie set');
    } catch (e) {
      console.warn('Could not set refresh token cookie:', e.message || e);
    }

    user.password = undefined;
    res.status(200).json({
      success: true,
      message: 'Your password has been reset successfully.',
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
    console.log('Response sent: Password reset successful');

  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    });
  }
};


exports.refreshToken = async (req, res, next) => {
  try {
    const incomingRefreshToken = req.body.refreshToken || (req.cookies && req.cookies.refreshToken);

    if (!incomingRefreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token required'
      });
    }

    jwt.verify(incomingRefreshToken, process.env.JWT_REFRESH_SECRET, async (err, decoded) => {
      if (err) {
        console.error('Refresh token verification failed:', err);
        return res.status(403).json({
          success: false,
          message: 'Invalid or expired refresh token'
        });
      }

      try {
        const currentUser = await User.findById(decoded.id).select('_id name email role');
        if (!currentUser) {
          return res.status(401).json({
            success: false,
            message: 'User for this token no longer exists'
          });
        }

        const newAccessToken = generateAccessToken({ id: currentUser._id, role: currentUser.role });
        const newRefreshToken = generateRefreshToken({ id: currentUser._id, role: currentUser.role });

        try {
          res.cookie('refreshToken', newRefreshToken, getRefreshCookieOptions());
        } catch (e) {
          console.warn('Could not set refresh token cookie (rotation):', e.message || e);
        }

        return res.status(200).json({
          success: true,
          token: newAccessToken,
          refreshToken: newRefreshToken
        });
      } catch (dbErr) {
        console.error('Error while refreshing token:', dbErr);
        return res.status(500).json({
          success: false,
          message: 'Server error'
        });
      }
    });
  } catch (err) {
    console.error('refreshToken handler error:', err);
    return res.status(500).json({
      success: false,
      message: 'Server error',
      error: err.message
    });
  }
};
