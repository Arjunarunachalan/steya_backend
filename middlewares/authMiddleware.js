// middlewares/authMiddleware.js
import jwt from "jsonwebtoken";
import User from "../models/userModal.js";

export const authMiddleware = async (req, res, next) => {
  console.log("llllll");
  
  try {
    const authHeader = req.headers["authorization"];
    if (!authHeader) return res.status(401).json({ success: false, message: "No token" });

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-refreshToken");
    if (!user) return res.status(401).json({ success :false, message: "User not found" });

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};
