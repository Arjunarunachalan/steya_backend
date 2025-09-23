// controllers/token_controller.js
import jwt from "jsonwebtoken";
import User from "../models/userModal.js";

export const refreshAccessToken = async (req, res) => {
  try {
    const { userId } = req.body; // sent by frontend

    const user = await User.findById(userId);

    if (!user || !user.refreshToken) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // verify refresh token
    jwt.verify(user.refreshToken, process.env.JWT_REFRESH_SECRET);

    // issue new access token
    const newAccessToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) {
    console.error(err);
    res.status(401).json({ success: false, message: "Invalid refresh token" });
  }
};
