import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

const app = express(); // ✅ create the app instance

import userRoutes from './routes/userRoutes.js';
import authRoute from './routes/authRoute.js';
import roomRoutes from './routes/roomRoutes.js';
import chatRoomRoutes from './routes/chatRoomRoutes.js';
import pushTokenRoutes from './routes/pushTokenRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import myPostsRoutes from './routes/myPosts.js';
import donationRoutes from './routes/donationRoutes.js';
import bugRoutes from './routes/bugRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
// Middleware
app.use(cors());
app.use(express.json());

// 🔒 General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
  message: 'Too many requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 🔒 Chat rate limiter (stricter to prevent spam)
const chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 messages per minute
  message: 'Slow down with the messages!',
});

// Routes
app.use('/api/auth', authRoute); // No limiter - Google handles it
app.use('/api', apiLimiter, userRoutes);
app.use('/api/payment', paymentRoutes);
app.use("/api", apiLimiter, roomRoutes);
app.use('/api/chat', chatLimiter, chatRoomRoutes); // Stricter for chat
app.use('/api/push', apiLimiter, pushTokenRoutes);
app.use('/api/reports', apiLimiter, reportRoutes);
app.use('/api/posts', apiLimiter, myPostsRoutes);
app.use('/api', apiLimiter, donationRoutes);
app.use('/api/bug', apiLimiter, bugRoutes);

export default app;