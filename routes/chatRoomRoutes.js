// routes/chatRoutes.js - UPDATED FOR YOUR MODEL
import express from 'express';
import rateLimit from 'express-rate-limit';
import ChatRoom from '../models/RoomChatmodal.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Rate limiting configuration
const createRoomLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 room creation requests per windowMs
  message: {
    message: 'Too many chat rooms created from this IP, please try again after 15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // Limit each IP to 60 requests per minute
  message: {
    message: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input sanitization helper
const sanitizeInput = (input) => {
  if (typeof input === 'string') {
    return input.trim().replace(/[<>]/g, '');
  }
  return input;
};

// Enhanced error logging
const logError = (operation, error, additionalData = {}) => {
  console.error(`❌ ${operation} failed:`, {
    error: error.message,
    stack: error.stack,
    ...additionalData,
    timestamp: new Date().toISOString()
  });
};

// Get chatrooms with pagination - COMPATIBLE WITH YOUR MODEL
router.get('/chatrooms', authMiddleware, generalLimiter, async (req, res) => {
  try {
    console.log("User ID from authMiddleware:", req.user._id);
    
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    
    // ✅ COMPATIBLE: Using your model fields exactly
    const chatrooms = await ChatRoom.find({ 
      participants: userId,
      status: { $ne: 'cancelled' } // Exclude cancelled rooms
    })
      .populate('participants', 'name email picture')
      .populate('productId', 'title images price') // Matches your Room model
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);
    
    const total = await ChatRoom.countDocuments({
      participants: userId,
      status: { $ne: 'cancelled' }
    });

    console.log(`📱 Fetched ${chatrooms.length} chatrooms for user ${userId} (page ${page})`);
    
    res.json({
      chatrooms,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    logError('Fetch chatrooms', error, { userId: req.user._id });
    res.status(500).json({ message: 'Failed to fetch chatrooms', error: error.message });
  }
});

// Check if room exists (without creating) - COMPATIBLE
router.get('/check-room', authMiddleware, generalLimiter, async (req, res) => {
  try {
    const { productId } = req.query;
    const inquirerId = req.user._id;

    // Sanitize input
    const sanitizedProductId = sanitizeInput(productId);

    if (!sanitizedProductId) {
      return res.status(400).json({ message: 'Missing productId' });
    }

    // ✅ COMPATIBLE: Using your model's unique index fields
    const chatRoom = await ChatRoom.findOne({
      productId: sanitizedProductId,
      inquirerId: inquirerId,
      status: { $ne: 'cancelled' }
    }).populate('participants', 'name email picture');

    if (chatRoom) {
      return res.json({ 
        exists: true, 
        roomId: chatRoom._id,
        status: chatRoom.status,
        hasMessages: chatRoom.hasMessages,
        participants: chatRoom.participants
      });
    }

    res.json({ 
      exists: false 
    });

  } catch (error) {
    logError('Check room', error, { 
      userId: req.user._id, 
      productId: req.query.productId 
    });
    res.status(500).json({ message: 'Failed to check room', error: error.message });
  }
});

// Create PENDING room - PERFECTLY COMPATIBLE WITH YOUR MODEL
router.post('/create-room', authMiddleware, createRoomLimiter, async (req, res) => {
  console.log("Create room request body:", req.body);
  try {
    const { productId, productTitle, ownerId } = req.body;
    const inquirerId = req.user._id;

    // Sanitize inputs
    const sanitizedProductTitle = sanitizeInput(productTitle);
    const sanitizedProductId = sanitizeInput(productId);
    const sanitizedOwnerId = sanitizeInput(ownerId);

    // Validation
    if (!sanitizedProductId || !sanitizedOwnerId) {
      return res.status(400).json({ message: 'Missing productId or ownerId' });
    }

    // Prevent owner from chatting with themselves
    if (inquirerId.toString() === sanitizedOwnerId.toString()) {
      return res.status(400).json({ message: 'You cannot chat with yourself' });
    }

    // ✅ COMPATIBLE: Using your model's unique index
    let chatRoom = await ChatRoom.findOne({
      productId: sanitizedProductId,
      ownerId: sanitizedOwnerId,
      inquirerId: inquirerId,
      status: { $ne: 'cancelled' }
    });

    if (chatRoom) {
      console.log('✅ Existing chatroom found:', chatRoom._id);
      return res.json({ 
        roomId: chatRoom._id, 
        isNew: false,
        status: chatRoom.status,
        hasMessages: chatRoom.hasMessages
      });
    }

    // ✅ COMPATIBLE: Creating with EXACT model fields
    chatRoom = new ChatRoom({
      name: sanitizedProductTitle || 'Room Inquiry',
      productId: sanitizedProductId,
      participants: [inquirerId, sanitizedOwnerId],
      ownerId: sanitizedOwnerId,
      inquirerId: inquirerId,
      lastMessage: null,
      status: 'pending',
      hasMessages: false
      // createdAt is automatic from your model
    });

    await chatRoom.save();
    console.log('✅ New PENDING chatroom created:', chatRoom._id);

    res.status(201).json({ 
      roomId: chatRoom._id, 
      isNew: true,
      status: 'pending',
      hasMessages: false,
      message: 'Chat room created successfully' 
    });

  } catch (error) {
    logError('Create room', error, { 
      userId: req.user._id, 
      productId: req.body.productId 
    });
    
    // 🚨 ENHANCED DUPLICATE HANDLING FOR YOUR UNIQUE INDEX
    if (error.code === 11000 || error.code === 11001) {
      console.log('🔄 Duplicate room detected, finding existing room...');
      
      // ✅ COMPATIBLE: Find using your unique index fields
      const existingRoom = await ChatRoom.findOne({
        productId: sanitizeInput(req.body.productId),
        ownerId: sanitizeInput(req.body.ownerId),
        inquirerId: req.user._id
      });
      
      if (existingRoom) {
        console.log('✅ Found existing room after duplicate error:', existingRoom._id);
        return res.json({ 
          roomId: existingRoom._id, 
          isNew: false,
          status: existingRoom.status,
          hasMessages: existingRoom.hasMessages,
          message: 'Chat room already exists' 
        });
      }
    }
    
    res.status(500).json({ message: 'Failed to create chatroom', error: error.message });
  }
});

// Activate room when first message is sent - COMPATIBLE
router.patch('/activate-room/:roomId', authMiddleware, generalLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    // Verify user has access to this room
    const existingRoom = await ChatRoom.findOne({
      _id: roomId,
      participants: userId
    });

    if (!existingRoom) {
      return res.status(404).json({ message: 'Chat room not found or access denied' });
    }

    const chatRoom = await ChatRoom.findByIdAndUpdate(
      roomId,
      { 
        status: 'active',
        hasMessages: true,
        firstMessageAt: new Date()
      },
      { new: true }
    );

    if (!chatRoom) {
      return res.status(404).json({ message: 'Chat room not found' });
    }

    console.log('✅ Room activated:', roomId);
    res.json({ message: 'Room activated successfully', room: chatRoom });

  } catch (error) {
    logError('Activate room', error, { 
      userId: req.user._id, 
      roomId: req.params.roomId 
    });
    res.status(500).json({ message: 'Failed to activate room', error: error.message });
  }
});

// Get chatroom details by ID - COMPATIBLE
router.get('/room/:roomId', authMiddleware, generalLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    // ✅ COMPATIBLE: Using your model's status field
    const chatRoom = await ChatRoom.findOne({
      _id: roomId,
      status: { $ne: 'cancelled' }
    }).populate('participants', 'name email picture')
      .populate('productId', 'title images price'); // Matches your Room model

    if (!chatRoom) {
      return res.status(404).json({ message: 'Chat room not found or unavailable' });
    }

    // Check if user is a participant
    const isParticipant = chatRoom.participants.some(
      p => p._id.toString() === userId.toString()
    );

    if (!isParticipant) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(chatRoom);
  } catch (error) {
    logError('Fetch room details', error, { 
      userId: req.user._id, 
      roomId: req.params.roomId 
    });
    res.status(500).json({ message: 'Failed to fetch chatroom', error: error.message });
  }
});

// Get room statistics - COMPATIBLE WITH YOUR MODEL
router.get('/stats', authMiddleware, generalLimiter, async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = await ChatRoom.aggregate([
      {
        $match: {
          participants: userId,
          status: { $ne: 'cancelled' }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          latestRoom: { $max: '$updatedAt' }
        }
      }
    ]);

    const totalRooms = await ChatRoom.countDocuments({
      participants: userId,
      status: { $ne: 'cancelled' }
    });

    const activeConversations = await ChatRoom.countDocuments({
      participants: userId,
      status: 'active',
      updatedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
    });

    res.json({
      totalRooms,
      activeConversations,
      byStatus: stats,
      summary: {
        total: totalRooms,
        active: activeConversations,
        recentActivity: activeConversations > 0
      }
    });

  } catch (error) {
    logError('Fetch room stats', error, { userId: req.user._id });
    res.status(500).json({ message: 'Failed to fetch room statistics', error: error.message });
  }
});

// Cancel a room - COMPATIBLE
router.patch('/room/:roomId/cancel', authMiddleware, generalLimiter, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    // Verify user has access to this room
    const existingRoom = await ChatRoom.findOne({
      _id: roomId,
      participants: userId
    });

    if (!existingRoom) {
      return res.status(404).json({ message: 'Chat room not found or access denied' });
    }

    const chatRoom = await ChatRoom.findByIdAndUpdate(
      roomId,
      { 
        status: 'cancelled'
        // Note: Your model doesn't have cancelledAt or cancelledBy fields
      },
      { new: true }
    );

    console.log('✅ Room cancelled:', roomId);
    res.json({ message: 'Room cancelled successfully', room: chatRoom });

  } catch (error) {
    logError('Cancel room', error, { 
      userId: req.user._id, 
      roomId: req.params.roomId 
    });
    res.status(500).json({ message: 'Failed to cancel room', error: error.message });
  }
});

// Enhanced cleanup service - COMPATIBLE WITH YOUR MODEL
const cleanupPendingRooms = async () => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const result = await ChatRoom.deleteMany({
      status: 'pending',
      hasMessages: false,
      createdAt: { $lt: twentyFourHoursAgo }
    });
    
    if (result.deletedCount > 0) {
      console.log(`🧹 Cleaned up ${result.deletedCount} unused pending rooms`);
    } else {
      console.log('✅ No pending rooms to clean up');
    }
    
    return result.deletedCount;
  } catch (error) {
    console.error('❌ Error cleaning up pending rooms:', error);
    return 0;
  }
};

// Cleanup configuration
const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

// Add startup delay for cleanup
setTimeout(() => {
  console.log('🚀 Starting chat room cleanup service...');
  cleanupPendingRooms();
  setInterval(cleanupPendingRooms, CLEANUP_INTERVAL);
}, 10000); // Wait 10 seconds after startup

// Manual cleanup trigger
router.post('/admin/cleanup', authMiddleware, async (req, res) => {
  try {
    // Basic admin check
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const cleanedCount = await cleanupPendingRooms();
    
    res.json({
      message: 'Cleanup completed successfully',
      cleanedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logError('Manual cleanup', error, { userId: req.user._id });
    res.status(500).json({ message: 'Cleanup failed', error: error.message });
  }
});

// Health check endpoint
router.get('/health', generalLimiter, async (req, res) => {
  try {
    // Test database connection
    const roomCount = await ChatRoom.countDocuments();
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      database: 'connected',
      roomCount,
      model: 'RoomChatmodal (compatible)',
      services: {
        cleanup: 'active',
        rateLimiting: 'active',
        authentication: 'active'
      }
    });
  } catch (error) {
    logError('Health check', error);
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

export default router;