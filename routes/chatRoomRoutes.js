import express from 'express';
import ChatRoom from '../models/roommodal.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get all chatrooms for a user
router.get('/chatrooms', authMiddleware, async (req, res) => {
    console.log("User ID from authMiddleware:", req.user._id);
    
    const userId = req.user._id;
    const chatrooms = await ChatRoom.find({ participants: userId }).sort({ updatedAt: -1 });
    console.log(chatrooms, "Fetched chatrooms");
    
    res.json(chatrooms);
});

export default router;
