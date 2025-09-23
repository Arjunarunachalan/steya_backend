import { OAuth2Client } from "google-auth-library";
import User from "../models/userModal.js";
import jwt from "jsonwebtoken";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const { sub, email, name, picture } = ticket.getPayload();

    let user = await User.findOne({ googleId: sub });

    if (!user) {
      user = await User.create({
        authType: "google",
        googleId: sub,
        email,
        name,
        picture,
        location: null,
      });
    }

    // Generate tokens
    const accessToken = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    const refreshToken = jwt.sign(
      { id: user._id },
      process.env.JWT_REFRESH_SECRET
    );

    // Store refresh token server-side
    user.refreshToken = refreshToken;
    await user.save();

    res.json({ success: true, accessToken, user }); // only send accessToken to frontend
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Google login failed" });
  }
};

export const updateLocation = async (req, res) => {
  console.log("lkkkkkk");
  
  try {
  
     
    const { userId, location } = req.body;
console.log(userId,"userid");
console.log(location,"location");


    const user = await User.findByIdAndUpdate(
      userId,
      { location },
      { new: true }
    );

    res.json({ success: true, user });
  } catch (err) {
    console.error(err);
    res.status(400).json({ success: false, message: "Location update failed" });
  }
};
