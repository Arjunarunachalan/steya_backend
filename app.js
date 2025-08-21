// app.js

import express from 'express';
import cors from 'cors';
import userRoutes from './routes/userRoutes.js';  // Ensure this path is correct
import authRoute from "./routes/authRoute.js"

// import { errorHandler } from './middleware/errorMiddleware.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth',authRoute)
app.use('/api/users', userRoutes);  // This should be working now
// app.use('/api/rooms', roomRoutes);
// app.use('/api/auth', authRoutes);

// Error Handler


export default app;
