import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB Connected Successfully 🚀');
  } catch (error) {
    console.error('MongoDB Connection Failed ❌');
    console.error(error);
    process.exit(1); // Exit with failure
  }
};

export default connectDB;
