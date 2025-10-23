// routes/userRoutes.js

import express from 'express';
import User from '../models/userModal.js';
import Room from '../models/RoomSchema.js';
const router = express.Router();

// POST route to register a new user
router.post('/register', (req,res)=>{
    res.status(200).json({message:"its working"})
});


router.get('/users/:userId', async (req, res) => {
    console.log("hhhh");
    
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('-refreshToken -googleId -expoPushToken');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get user's posts
router.get('/users/:userId/posts', async (req, res) => {
  try {
    const { userId } = req.params;

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Fetch user's active posts (not deleted, not blocked)
    const posts = await Room.find({
      createdBy: userId,
      isDeleted: false,
      isBlocked: false,
      isActive: true
    })
      .select('title description images thumbnail monthlyRent priceRange location category views createdAt')
      .sort({ createdAt: -1 }); // Most recent first

    res.status(200).json({
      success: true,
      posts,
      count: posts.length
    });
  } catch (error) {
    console.error('Error fetching user posts:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});


export default router;
