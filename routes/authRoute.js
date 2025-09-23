import express from "express";
import { googleLogin, updateLocation } from "../controllers/auth_controller.js";
import { refreshAccessToken } from "../controllers/token_controller.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";

const router = express.Router();

router.post("/google-login", googleLogin);

router.get("/test", (req, res) => {
  res.json({ success: true, message: "Backend is working 🚀" });
});

router.put("/update-location",updateLocation );

router.post("/refresh",refreshAccessToken );

export default router;
