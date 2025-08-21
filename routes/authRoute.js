import express from "express";
import passport from "passport";
import jwt from "jsonwebtoken";
// import auth_Controller from "../controllers/auth_controller";
import { LoginSuccess, LoginFailed, Logout } from "../controllers/auth_controller.js";

import dotenv from "dotenv";
dotenv.config(); // If you need to load .env variables

const router = express.Router();

const { CLIENT_URL, JWT_SECRET_KEY } = process.env;

// Google OAuth Login
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["email", "profile"],
    prompt: "select_account",
  })
);

router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/auth/loginfailed" }),
  (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Authentication failed" });
    }

    const { token, user } = req.user;
    console.log(token, "token");
    console.log(user, "user");

    res.redirect(
      `${CLIENT_URL}/login-success?token=${token}&user=${encodeURIComponent(JSON.stringify(user))}`
    );
  }
);

// Login success route
router.get("/loginsuccess", LoginSuccess);

// Login failed route
router.get("/loginfailed", LoginFailed);
router.post('/token',createAccessToken)

export default router;
