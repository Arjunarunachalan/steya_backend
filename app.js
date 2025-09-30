import express from 'express';
import cors from 'cors';
import userRoutes from './routes/userRoutes.js';
import authRoute from "./routes/authRoute.js";
import roomRoutes from './routes/roomRoutes.js';
import chatRoomRoutes from './routes/chatRoomRoutes.js';
import { authMiddleware } from './middlewares/authMiddleware.js';
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoute);
app.use('/api/users', userRoutes);
app.use('/api', roomRoutes);
app.use('/api/chat', chatRoomRoutes);

export default app;
