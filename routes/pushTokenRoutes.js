// routes/pushTokenRoutes.js
import express from 'express';
import User from '../models/userModal.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Register/Update push token
// routes/pushTokenRoutes.js - UPDATED
router.post('/register-token', authMiddleware, async (req, res) => {
  try {
    const { pushToken, device } = req.body;
    const userId = req.user._id;

    console.log('📱 Registering token for user:', userId);
    console.log('📱 Token received:', pushToken);

    if (!pushToken) {
      return res.status(400).json({ message: 'Push token is required' });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // ⭐ FIX: Use expoPushToken field
    user.expoPushToken = pushToken;
    
    // Optional: Keep your pushTokens array too
    const existingTokenIndex = user.pushTokens?.findIndex(t => t.token === pushToken);
    
    if (existingTokenIndex === -1 || !user.pushTokens) {
      if (!user.pushTokens) user.pushTokens = [];
      user.pushTokens.push({
        token: pushToken,
        device: device || 'unknown',
        addedAt: new Date()
      });
    } else {
      user.pushTokens[existingTokenIndex].addedAt = new Date();
    }

    await user.save();

    console.log(`✅ Push token saved to expoPushToken field: ${pushToken.substring(0, 30)}...`);
    
    res.json({ 
      message: 'Push token registered successfully',
      token: pushToken 
    });
  } catch (error) {
    console.error('❌ Error registering push token:', error);
    res.status(500).json({ 
      message: 'Failed to register push token', 
      error: error.message 
    });
  }
});

// Also update remove-token
router.delete('/remove-token', authMiddleware, async (req, res) => {
  try {
    const { pushToken } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Remove from both fields
    user.expoPushToken = null;  // ⭐ ADD THIS
    
    if (user.pushTokens) {
      user.pushTokens = user.pushTokens.filter(t => t.token !== pushToken);
    }

    await user.save();

    console.log(`✅ Push token removed for user ${userId}`);
    
    res.json({ message: 'Push token removed successfully' });
  } catch (error) {
    console.error('❌ Error removing push token:', error);
    res.status(500).json({ 
      message: 'Failed to remove push token', 
      error: error.message 
    });
  }
});

// Update notification settings
router.patch('/notification-settings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const settings = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { notificationSettings: settings } },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ 
      message: 'Notification settings updated',
      settings: user.notificationSettings 
    });
  } catch (error) {
    console.error('❌ Error updating settings:', error);
    res.status(500).json({ 
      message: 'Failed to update settings', 
      error: error.message 
    });
  }
});

// Get notification settings
router.get('/notification-settings', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId).select('notificationSettings');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ settings: user.notificationSettings });
  } catch (error) {
    console.error('❌ Error fetching settings:', error);
    res.status(500).json({ 
      message: 'Failed to fetch settings', 
      error: error.message 
    });
  }
});

export default router;