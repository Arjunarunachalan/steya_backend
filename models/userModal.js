// models/userModal.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  authType: { type: String, enum: ["google"], required: true },
  googleId: { type: String, unique: true },
  email: { type: String, required: true },
  name: String,
  picture: String,
  location: {
    lat: Number,       // latitude
    lng: Number,       // longitude (rename from lon)
    name: String       // place name (instead of district)
  },
  refreshToken: String, // stored only on server
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
export default User;
