// controllers/token_controller.js
import jwt from "jsonwebtoken";
import User from "../models/userModal.js";

export const refreshAccessToken = async (req, res) => {
  try {
    const { userId } = req.body; // sent by frontend
    console.log("Refresh request userId:", userId);

    const user = await User.findById(userId);
    if (!user) return res.status(401).json({ success: false, message: "User not found" });
    console.log("User found:", user._id, "Refresh token:", user.refreshToken);

    if (!user.refreshToken) return res.status(401).json({ success: false, message: "No refresh token" });

    // verify refresh token
    const decodedRefresh = jwt.verify(user.refreshToken, process.env.JWT_REFRESH_SECRET);
    console.log("Decoded refresh token:", decodedRefresh);

    // issue new access token
    const newAccessToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );
    console.log("New access token:", newAccessToken);

    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) {
    console.error("Refresh token error:", err);
    res.status(401).json({ success: false, message: "Invalid refresh token" });
  }
};
