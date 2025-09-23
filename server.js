// server.js

import app from './app.js'; // Importing the app from app.js
import connectDB from './config/db.js';
import dotenv from 'dotenv';
import  authRoutes from './routes/authRoute.js'
// Load environment variables
import  testRoutes from './routes/authRoute.js'
dotenv.config();

// Connect to MongoDB
connectDB();

app.use("/api/auth", testRoutes);
// app.use('/api',userRoutes)
app.use('/api/auth',authRoutes)    
app.use('/api/auth',authRoutes)
// app.use('/api/rooms',roomRoute)
// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
