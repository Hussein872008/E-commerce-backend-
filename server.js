require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');
const path = require('path');
const { errorHandler } = require('./middleware/error.middleware');

const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/products.routes');
const orderRoutes = require('./routes/order.routes');
const userRoutes = require('./routes/user.routes');
const cartRoutes = require('./routes/cart.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const reviewRoutes = require('./routes/reviews.routes');
const notificationRoutes = require('./routes/notification.routes');

const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
  cors: {
    origin: [
      "https://husseinstorefullstack.vercel.app",
      "https://e-commerce-frontend-git-master-husseins-projects-2008.vercel.app",
      "https://e-commerce-backend-production-7ac6.up.railway.app",
      "https://e-commerce-frontend-mu-woad.vercel.app",
      "http://localhost:5173"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const connectedUsers = new Map();

io.on('connection', (socket) => {
  console.log('A user connected');
  
  socket.on('join', async (userId) => {
    if (userId) {
      console.log('User joined room:', userId);
      socket.join(userId);
      connectedUsers.set(socket.id, userId);
      
      try {
        const Notification = require('./models/notification.model');
        const [count, notifications] = await Promise.all([
          Notification.countDocuments({ recipient: userId, read: false }),
          Notification.find({ recipient: userId })
            .sort({ createdAt: -1 })
            .limit(50)
        ]);

        socket.emit('unreadCount', count);
        socket.emit('initialNotifications', notifications);
      } catch (err) {
        console.error('Error getting initial notification data:', err);
      }
    }
  });

  socket.on('highlightOrder', (orderId) => {
    const userId = connectedUsers.get(socket.id);
    if (userId) {
      socket.to(userId).emit('highlightOrder', orderId);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
    connectedUsers.delete(socket.id);
  });
});

global.io = io;
global.connectedUsers = connectedUsers;

connectDB();

const allowedOrigins = [
  "https://husseinstorefullstack.vercel.app",
  "https://e-commerce-frontend-git-master-husseins-projects-2008.vercel.app",
  "https://e-commerce-backend-production-7ac6.up.railway.app",
  "https://e-commerce-frontend-mu-woad.vercel.app",
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


app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(errorHandler);

const PORT = process.env.PORT;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
