const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const sendEmail = require('../utils/sendEmail');
const { BadRequestError, UnauthorizedError } = require('../middleware/error.middleware');
const { ConflictError } = require('../middleware/error.middleware');
const { sendSuccess, sendError } = require('../utils/response');

const generateAccessToken = (userPayload) => {
  const roleToUse = userPayload.role;
  return jwt.sign(
    { id: userPayload.id || userPayload._id, role: roleToUse },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '1d' }
  );
};

const generateRefreshToken = (userPayload) => {
  const roleToUse2 = userPayload.role;
  return jwt.sign(
    { id: userPayload.id || userPayload._id, role: roleToUse2 },
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
      console.error(`Missing login data. email: ${email}`);
      return sendError(res, 'Please provide email and password.', 400, { details: 'Please provide email and password.' });
    }

    console.log('Finding user with email:', email);
    const user = await User.findOne({ email }).select('+password');

    if (!user) {
      console.error(`Failed login attempt. email: ${email}`);
      return sendError(res, 'Incorrect email or password.', 401, { details: 'Incorrect email or password.' });
    }

    console.log('Comparing passwords...');
    const isPasswordValid = await user.comparePassword(password, user.password);

    if (!isPasswordValid) {
      console.error(`Incorrect password. email: ${email}`);
      return sendError(res, 'Incorrect email or password.', 401, { details: 'Incorrect email or password.' });
    }

    console.log('Password is valid, generating token...');
  const mappedRole = user.activeRole || (Array.isArray(user.roles) && user.roles.length ? user.roles[0] : user.role);
  const accessToken = generateAccessToken({ id: user._id, role: mappedRole });
  const refreshToken = generateRefreshToken({ id: user._id, role: mappedRole });

    try {
      res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());
    } catch (e) {
      console.warn('Could not set refresh token cookie:', e.message || e);
    }

    user.password = undefined;

    console.log(`[Auth] Successful login for user: ${user._id}`);
    return sendSuccess(res, {
      message: 'Login successful.',
      token: accessToken,
      refreshToken,
      user: { _id: user._id, id: user._id, name: user.name, email: user.email, role: mappedRole }
    }, 200);
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
    let { name, email, password, passwordConfirm, role } = req.body;
    if (typeof email === 'string') email = email.trim().toLowerCase();

    if (!name || !email || !password || !passwordConfirm) {
      console.error(`Missing registration data. email: ${email}`);
      return sendError(res, 'All fields are required.', 400, { details: 'All fields are required.' });
    }

    if (password !== passwordConfirm) {
      console.error(`Passwords do not match. email: ${email}`);
      return sendError(res, 'Passwords do not match.', 400, { details: 'Passwords do not match.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      console.error(`Email already registered. email: ${email}`);
      return sendError(res, 'Email is already registered.', 409, { details: 'Email is already registered.' });
    }

    const newUser = await User.create({
      name,
      email,
      password,
      passwordConfirm,
      role: role || 'buyer'
    });

    newUser.password = undefined;

  const mappedRoleNew = newUser.activeRole || (Array.isArray(newUser.roles) && newUser.roles.length ? newUser.roles[0] : newUser.role);
  const accessToken = generateAccessToken({ id: newUser._id, role: mappedRoleNew });
  const refreshToken = generateRefreshToken({ id: newUser._id, role: mappedRoleNew });

    try {
      res.cookie('refreshToken', refreshToken, getRefreshCookieOptions());
    } catch (e) {
      console.warn('Could not set refresh token cookie:', e.message || e);
    }


    console.log(`New user registered: ${newUser._id}`);
    return sendSuccess(res, {
      message: 'Account created successfully.',
      token: accessToken,
      refreshToken,
      user: { _id: newUser._id, id: newUser._id, name: newUser.name, email: newUser.email, role: mappedRoleNew }
    }, 201);
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

  return sendSuccess(res, { user: { _id: user._id, id: user._id, name: user.name, email: user.email, role: user.role } }, 200);
  } catch (err) {
    console.error('Controller error:', err);
    next(err);
  }
};

exports.forgotPassword = async (req, res) => {
  console.log('--- forgotPassword called ---');

  try {
    let { email } = req.body || {};
    if (typeof email === 'string') email = email.trim().toLowerCase();
    console.log('Received email for reset:', email);

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

    const frontendBase = process.env.FRONTEND_URL || (process.env.NODE_ENV !== 'production' ? `http://${req.headers.host || 'localhost:5173'}` : null);
    if (!frontendBase) {
      console.error('FRONTEND_URL not defined and no safe fallback available');
      return res.status(500).json({
        success: false,
        message: 'Server configuration error: FRONTEND_URL not set',
      });
    }

    const resetURL = `${frontendBase.replace(/\/$/, '')}/reset-password/${resetToken}`;
    console.log('Password reset URL (can be used to test in dev):', resetURL);
    const message = `You requested a password reset. Click the link below to reset your password:\n\n${resetURL}\n\nThis link will expire in 10 minutes.`;

    console.log('Sending email...');
    try {
      await Promise.race([
        sendEmail(user.email, 'Your password reset link (valid for 10 minutes)', message),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Email send timeout')), 10000))
      ]);
      console.log('Email send attempt completed (may be fake in dev).');
    } catch (emailErr) {
      console.error('Failed to send email:', emailErr && emailErr.message ? emailErr.message : emailErr);
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({
        success: false,
        message: 'Failed to send password reset email',
        error: emailErr && emailErr.message ? emailErr.message : String(emailErr)
      });
    }

    const baseResponse = { success: true, message: 'Password reset link sent to your email.' };
    if (process.env.NODE_ENV !== 'production') {
      baseResponse.resetURL = resetURL;
    }

    res.status(200).json(baseResponse);

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
  const mappedRole2 = user.activeRole || (Array.isArray(user.roles) && user.roles.length ? user.roles[0] : user.role);
  const accessToken = generateAccessToken({ id: user._id, role: mappedRole2 });
  const refreshToken = generateRefreshToken({ id: user._id, role: mappedRole2 });
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
        _id: user._id,
        id: user._id,
        name: user.name,
        email: user.email,
        role: mappedRole2
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
    const incomingRefreshToken = (req.cookies && req.cookies.refreshToken) || req.body.refreshToken;

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
        const currentUser = await User.findById(decoded.id).select('_id name email activeRole roles');
        if (!currentUser) {
          return res.status(401).json({
            success: false,
            message: 'User for this token no longer exists'
          });
        }

        const mapped = currentUser.activeRole || (Array.isArray(currentUser.roles) && currentUser.roles.length ? currentUser.roles[0] : undefined);
        const newAccessToken = generateAccessToken({ id: currentUser._id, role: mapped });
        const newRefreshToken = generateRefreshToken({ id: currentUser._id, role: mapped });

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
