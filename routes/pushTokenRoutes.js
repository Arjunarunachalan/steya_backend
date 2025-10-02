// routes/pushTokenRoutes.js
import express from 'express';
import User from '../models/userModal.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Register/Update push token
router.post('/register-token', authMiddleware, async (req, res) => {
  try {
    const { pushToken, device } = req.body;
    const userId = req.user._id;

    if (!pushToken) {
      return res.status(400).json({ message: 'Push token is required' });
    }

    // Check if token already exists for this user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update primary token
    user.pushToken = pushToken;

    // Add to tokens array if not exists
    const existingTokenIndex = user.pushTokens?.findIndex(t => t.token === pushToken);
    
    if (existingTokenIndex === -1 || !user.pushTokens) {
      if (!user.pushTokens) user.pushTokens = [];
      user.pushTokens.push({
        token: pushToken,
        device: device || 'unknown',
        addedAt: new Date()
      });
    } else {
      // Update existing token timestamp
      user.pushTokens[existingTokenIndex].addedAt = new Date();
    }

    await user.save();

    console.log(`✅ Push token registered for user ${userId}: ${pushToken}`);
    
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

// Remove push token (on logout)
router.delete('/remove-token', authMiddleware, async (req, res) => {
  try {
    const { pushToken } = req.body;
    const userId = req.user._id;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Remove from tokens array
    if (user.pushTokens) {
      user.pushTokens = user.pushTokens.filter(t => t.token !== pushToken);
    }

    // Clear primary token if it matches
    if (user.pushToken === pushToken) {
      user.pushToken = null;
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