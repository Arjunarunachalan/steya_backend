// server.js

import app from './app.js'; // Importing the app from app.js
import connectDB from './config/db.js';
import dotenv from 'dotenv';
import userRoutes from "./routes/userRoutes.js"
import googleAuth from "./routes/authRoute.js"
import roomRoute from "./routes/roomRoutes.js"
// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();


app.use('/api',userRoutes)
app.use('/api/auth',googleAuth)
app.use('/api/rooms',roomRoute)
// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
