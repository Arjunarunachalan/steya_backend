import express from 'express';
import cors from 'cors';

const app = express(); // ✅ create the app instance

import userRoutes from './routes/userRoutes.js';
import authRoute from './routes/authRoute.js';
import roomRoutes from './routes/roomRoutes.js';
import chatRoomRoutes from './routes/chatRoomRoutes.js';
import pushTokenRoutes from './routes/pushTokenRoutes.js';

import reportRoutes from './routes/reportRoutes.js';
import myPostsRoutes from './routes/myPosts.js';

// Use the routes
// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoute);
app.use('/api/users', userRoutes);
app.use("/api", roomRoutes);
app.use('/api/chat', chatRoomRoutes);
app.use('/api/push', pushTokenRoutes);

app.use('/api/reports', reportRoutes);
app.use('/api/posts', myPostsRoutes);


export default app;
