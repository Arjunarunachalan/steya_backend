import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  authType: { type: String, enum: ["google"], required: true },
  googleId: { type: String, unique: true },
  email: { type: String, required: true },
  name: String,
  picture: String,
  
  // ✅ NEW PROFILE FIELDS
  about: { 
    type: String, 
    maxlength: 200,
    default: "" 
  },
  userRole: { 
    type: String, 
    maxlength: 30,
    default: "" 
  },
  
  location: {
    lat: Number,
    lng: Number,
    name: String
  },
  refreshToken: String,

  expoPushToken: { type: String, default: null },
  notificationSettings: {
    chatMessages: { type: Boolean, default: true },
    sound: { type: Boolean, default: true },
    vibration: { type: Boolean, default: true }
  }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
export default User;