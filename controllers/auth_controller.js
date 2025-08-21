
import { token } from "morgan";
import jwt from 'jsonwebtoken';
import { generateAccessToken } from "../utils/authorisation";
import User from "../models/userModal"

export const LoginSuccess = (req, res) => {
  if (req.user) {
    const { token, user } = req.user;

    return res.status(200).json({
      success: true,
      message: "Login successful",
      user,
      token,
    });
  } else {
    return res.status(401).json({
      success: false,
      message: "Not authenticated",
    });
  }
};

export const LoginFailed = (req, res) => {
  return res.status(401).json({
    success: false,
    message: "Login failed",
  });
};

export const Logout = (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: "Logout error" });
    }
    res.redirect(process.env.CLIENT_URL || "/");
  });
};

export // Inside createAccessToken controller
const createAccessToken = async (req, res) => {
  const refreshToken = req.body.token;
  if (!refreshToken)
    return res.status(401).json({ success: false, message: "Refresh token not found" });

  // find user with this refresh token
  const user = await User.findOne({ refreshTokens: refreshToken });
  if (!user)
    return res.status(403).json({ success: false, message: "Invalid refresh token" });

  jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET, (err, decodedUser) => {
    if (err)
      return res.status(403).json({ success: false, message: "Token verification failed" });

    const accessToken = generateAccessToken({ name: decodedUser.name });
    res.status(200).json({ success: true, accessToken });
  });
};
