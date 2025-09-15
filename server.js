require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
const { errorHandler } = require('./middleware/error.middleware');
const requestLogger = require('./middleware/requestLogger.middleware');
const logger = require('./middleware/logger');
const helmet = require('helmet');



const hpp = require('hpp');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

console.log = (...args) => logger.info(args.map(a => (a instanceof Error ? a.stack || a.message : (typeof a === 'object' ? JSON.stringify(a) : a))).join(' '));
console.info = (...args) => logger.info(args.join(' '));
console.warn = (...args) => logger.warn(args.join(' '));
console.error = (...args) => logger.error(args.map(a => (a instanceof Error ? a.stack || a.message : (typeof a === 'object' ? JSON.stringify(a) : a))).join(' '));

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

const app = express();
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

const connectedUsers = new Map();
const userSockets = new Map();

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('unauthorized'));
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = payload.id || payload._id;
    return next();
  } catch (err) {
    logger.warn('Socket auth failed', err.message);
    return next(new Error('unauthorized'));
  }
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
        const Notification = require('./models/notification.model');
        const [count, notifications] = await Promise.all([
          Notification.countDocuments({ recipient: socket.userId, read: false }),
          Notification.find({ recipient: socket.userId })
            .sort({ createdAt: -1 })
            .limit(50)
        ]);

        socket.emit('unreadCount', count);
        socket.emit('initialNotifications', notifications);
      } catch (err) {
        logger.error('Error getting initial notification data:', err);
      }
    })();
  }

  socket.on('join', (maybeUserId) => {
    if (maybeUserId && maybeUserId === socket.userId) {
      socket.join(maybeUserId);
    } else {
      logger.warn('Socket join denied - userId mismatch', { socketId: socket.id, maybeUserId, userId: socket.userId });
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

connectDB();

const allowedOrigins = [
  "https://ecommerce-hussein.vercel.app",
  "http://localhost:5173"
];

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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
    sanitizeObject(req.params);
  } catch (e) {
    logger.warn('Sanitizer middleware failed', e.message);
  }
  next();
});
app.use(hpp());
app.use(compression());



app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/notifications/subscriptions', notificationSubscriptionRoutes);
app.use('/api/debug', debugRoutes);

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: 31536000000,
  setHeaders: (res, filePath) => {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }
}));

app.use(errorHandler);

(async () => {
  try {
    await connectDB();
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => logger.info(`Server running on port ${PORT}`));
  } catch (err) {
    logger.error('Failed to start server', err);
    process.exit(1);
  }
})();

const shutdown = async () => {
  logger.info('Shutdown initiated');
  server.close(() => logger.info('HTTP server closed'));
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
