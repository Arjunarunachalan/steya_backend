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
import userupdate from './routes/userupdate.js';

// Middleware
app.use(cors());
app.use(express.json());

// 🔒 General API rate limiter
// const apiLimiter = rateLimit({
//   windowMs: 1 * 60 * 1000, // 1 minute
//   max: 60, // 60 requests per minute
//   message: 'Too many requests, please slow down.',
//   standardHeaders: true,
//   legacyHeaders: false,
// });

// // 🔒 Chat rate limiter (stricter to prevent spam)
// const chatLimiter = rateLimit({
//   windowMs: 1 * 60 * 1000, // 1 minute
//   max: 30, // 30 messages per minute
//   message: 'Slow down with the messages!',
// });

// Routes
app.use('/api/auth', authRoute); // No limiter - Google handles it
app.use('/api', userRoutes);
app.use('/api', userupdate);
app.use('/api/payment', paymentRoutes);
app.use("/api",  roomRoutes);
app.use('/api/chat', chatRoomRoutes); // Stricter for chat
app.use('/api/push',  pushTokenRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/posts',  myPostsRoutes);
app.use('/api',  donationRoutes);
app.use('/api/bug', bugRoutes);

// Add this route to your existing Express server.js or app.js
// This is just ONE route - not a separate website!

// ✅ Just opens the app, no routing needed
app.get('/app', (req, res) => {
  const playStore = 'https://play.google.com/store/apps/details?id=com.ameen007.Steya';
  const intentUrl = `intent://open#Intent;scheme=steya;package=com.ameen007.Steya;S.browser_fallback_url=${encodeURIComponent(playStore)};end`;

  res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Opening Steya...</title>
  <style>
    body{font-family:Arial;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:linear-gradient(135deg,#7A5AF8,#9B7DF7);color:#fff;text-align:center;margin:0;padding:20px}
    .spinner{width:50px;height:50px;border:4px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;margin-bottom:20px}
    @keyframes spin{to{transform:rotate(360deg)}}
    h1{font-size:24px;margin-bottom:10px}
    p{opacity:.9;margin-bottom:30px}
    .btn{display:inline-block;padding:15px 35px;background:#fff;color:#7A5AF8;text-decoration:none;border-radius:10px;font-weight:700}
  </style>
</head>
<body>
  <div class="spinner"></div>
  <h1>🏠 Opening Steya</h1>
  <p>Redirecting to app...</p>
  <a href="${playStore}" class="btn">Get it on Play Store</a>
  <script>
    if(/Android|iPhone|iPad/i.test(navigator.userAgent)){
      window.location.href = "${intentUrl}";
    }
  </script>
</body>
</html>`);
});

// That's it! Just add this one route to your existing backend

export default app;