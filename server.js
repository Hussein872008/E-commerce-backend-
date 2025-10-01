require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
const { errorHandler } = require('./middleware/error.middleware');
const requestLogger = require('./middleware/requestLogger.middleware');
const logger = require('./middleware/logger');
const helmet = require('helmet');
const util = require('util');
const hpp = require('hpp');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const inspectOpts = { depth: 2, maxArrayLength: 50, breakLength: 120 };
console.log = (...args) => {
  const out = args.map(a =>
    a instanceof Error
      ? (a.stack || a.message)
      : (typeof a === 'object'
        ? util.inspect(a, inspectOpts)
        : a)
  ).join(' ');
  logger.info(out);
};
console.info = (...args) => logger.info(util.format(...args));
console.warn = (...args) => logger.warn(util.format(...args));
console.error = (...args) => {
  const out = args.map(a =>
    a instanceof Error
      ? (a.stack || a.message)
      : (typeof a === 'object'
        ? util.inspect(a, inspectOpts)
        : a)
  ).join(' ');
  logger.error(out);
};

const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/products.routes');
const orderRoutes = require('./routes/order.routes');
const userRoutes = require('./routes/user.routes');
const cartRoutes = require('./routes/cart.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const reviewRoutes = require('./routes/reviews.routes');
const notificationRoutes = require('./routes/notification.routes');
const notificationSubscriptionRoutes = require('./routes/notificationSubscription.routes');
const debugRoutes = require('./routes/debug.routes');
const rateLimiter = require('./middleware/rateLimiter');

const app = express();

app.set('trust proxy', (process.env.TRUST_PROXY === 'true'));
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: [
      "https://ecommerce-hussein.vercel.app",
      "http://localhost:5173"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

let Notification;
try {
  Notification = require('./models/notification.model');
} catch (e) {
  console.warn('Notification model not available at startup:', e.message);
  Notification = null;
}
const { sanitizeNotification } = require('./utils/sanitizers');

const connectedUsers = new Map();
const userSockets = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('unauthorized'));
  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err) {
      logger.warn('Socket auth failed', err.message);
      return next(new Error('unauthorized'));
    }
    socket.userId = payload.id || payload._id;
    return next();
  });
});

io.on('connection', (socket) => {
  logger.info('A user connected (socket)', socket.id, socket.userId);

  if (socket.userId) {
    socket.join(socket.userId);
    connectedUsers.set(socket.id, socket.userId);
    const set = userSockets.get(socket.userId) || new Set();
    set.add(socket.id);
    userSockets.set(socket.userId, set);

    (async () => {
      try {
        if (!Notification) Notification = require('./models/notification.model');
        const [count, notifications] = await Promise.all([
          Notification.countDocuments({ recipient: socket.userId, read: false }),
          Notification.find({ recipient: socket.userId })
            .sort({ createdAt: -1 })
            .limit(50)
        ]);

        socket.emit('unreadCount', count);
        try {
          const safe = notifications.map(sanitizeNotification);
          socket.emit('initialNotifications', safe);
        } catch (e) {
          socket.emit('initialNotifications', []);
        }
      } catch (err) {
        logger.error('Error getting initial notification data:', err);
      }
    })();
  }

  socket.on('join', (maybeUserId) => {
    if (maybeUserId && maybeUserId === socket.userId) {
      socket.join(maybeUserId);
    } else {
      logger.warn('Socket join denied - userId mismatch', {
        socketId: socket.id,
        maybeUserId,
        userId: socket.userId
      });
    }
  });

  socket.on('highlightOrder', (orderId) => {
    const userId = connectedUsers.get(socket.id);
    if (userId) {
      socket.to(userId).emit('highlightOrder', orderId);
    }
  });

  socket.on('disconnect', () => {
    logger.info('User disconnected (socket)', socket.id);
    const uid = connectedUsers.get(socket.id);
    connectedUsers.delete(socket.id);
    if (uid) {
      const set = userSockets.get(uid);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) userSockets.delete(uid);
      }
    }
  });
});

global.io = io;
global.connectedUsers = connectedUsers;

const allowedOrigins = (() => {
  if (process.env.ALLOWED_ORIGINS) return process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim());
  return [
    "https://ecommerce-hussein.vercel.app",
    "http://localhost:5173"
  ];
})();

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

const BODY_LIMIT = process.env.BODY_LIMIT || '100kb';
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: BODY_LIMIT }));
app.use(requestLogger);
app.use(helmet());

const sanitizeString = (s) => {
  if (typeof s !== 'string') return s;
  let out = s.replace(/<[^>]*>/g, '');
  out = out.replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return out;
};

const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return;
  Object.keys(obj).forEach((key) => {
    if (key.startsWith('$') || key.indexOf('.') !== -1) {
      delete obj[key];
    } else {
      const val = obj[key];
      if (typeof val === 'string') {
        obj[key] = sanitizeString(val);
      } else if (typeof val === 'object') {
        sanitizeObject(val);
      }
    }
  });
};
app.use((req, res, next) => {
  try {
    sanitizeObject(req.body);
    sanitizeObject(req.query);
    sanitizeObject(req.params);
  } catch (e) {
    logger.warn('Sanitizer middleware failed', e.message);
  }
  next();
});

app.use(hpp());
app.use(compression());

app.use('/api/auth', rateLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notifications/subscriptions', notificationSubscriptionRoutes);
app.use('/api/debug', rateLimiter, debugRoutes);

app.get('/healthz', (req, res) => {
  const mongooseReady = (typeof mongoose !== 'undefined' && mongoose.connection) ? mongoose.connection.readyState : null;
  res.json({
    ok: true,
    env: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    mongoState: mongooseReady
  });
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: 31536000000,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

app.use(errorHandler);

const MAX_RETRIES = parseInt(process.env.DB_MAX_RETRIES || '5', 10);
const RETRY_DELAY = parseInt(process.env.DB_RETRY_DELAY || '3000', 10);

async function connectWithRetry(retries = MAX_RETRIES) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await connectDB();
      logger.info("✅ Database connected successfully");
      return true;
    } catch (err) {
      logger.error(`❌ Database connection failed (Attempt ${attempt}/${retries})`, err.message);

      if (attempt < retries) {
        logger.info(`🔄 Retrying in ${RETRY_DELAY / 1000} seconds...`);
        await new Promise((res) => setTimeout(res, RETRY_DELAY));
      } else {
        logger.error("❌ All attempts to connect to the database failed. Exiting...");
        process.exit(1);
      }
    }
  }
}

async function startServer() {
  try {
    const validateEnv = require('./config/validateEnv');
    validateEnv();
  } catch (e) {
    logger.warn('Environment validation skipped or failed:', e.message || e);
  }

  await connectWithRetry();
  const PORT = process.env.PORT || 5000;
  server.listen(PORT, () => logger.info(`🚀 Server running on port ${PORT}`));
  server.keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT || '5000', 10);
}

if (require.main === module) {
  startServer().catch(err => {
    logger.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, server, io, connectWithRetry };

const shutdown = async () => {
  logger.info('Shutdown initiated');
  server.close(() => logger.info('HTTP server closed'));
  try {
    if (io) {
      io.close(() => logger.info('Socket.IO server closed'));
    }
  } catch (e) {
    logger.warn('Socket.IO close failed', e && e.message ? e.message : e);
  }
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      await mongoose.disconnect();
      logger.info('MongoDB connection closed');
    }
  } catch (e) {
    logger.warn('DB close failed', e);
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
