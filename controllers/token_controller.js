// controllers/token_controller.js
import jwt from "jsonwebtoken";
import User from "../models/userModal.js";

export const refreshAccessToken = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, message: "userId required" });
    }

    const user = await User.findById(userId);
    if (!user || !user.refreshToken) {
      return res.status(401).json({ success: false, message: "Invalid session" });
    }

    // Verify refresh token
    let decodedRefresh;
    try {
      decodedRefresh = jwt.verify(user.refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (jwtErr) {
      // Refresh token expired or invalid - clear it
      user.refreshToken = null;
      await user.save();
      return res.status(401).json({ success: false, message: "Refresh token expired" });
    }

    // Issue new access token
    const newAccessToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ success: true, accessToken: newAccessToken });

  } catch (err) {
    console.error("Refresh error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};