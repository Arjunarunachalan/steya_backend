
import multer from "multer";
import { updateProfile, getUserProfile } from "../controllers/auth_controller.js";
import { authMiddleware } from "../middlewares/authMiddleware.js";
import express from 'express';
const router = express.Router();
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images allowed'), false);
    }
    cb(null, true);
  },
});

router.get("/user/profile", authMiddleware, getUserProfile);
router.put("/user/update-profile", authMiddleware, upload.single('profileImage'), updateProfile);

export default router;