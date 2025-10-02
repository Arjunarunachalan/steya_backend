import express from 'express';
import ChatRoom from '../models/RoomChatmodal.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Get only ACTIVE chatrooms (with messages)
// Get ONLY ACTIVE chatrooms (with messages)
router.get('/chatrooms', authMiddleware, async (req, res) => {
  try {
    console.log("User ID from authMiddleware:", req.user._id);
    
    const userId = req.user._id;
    
    // ✅ ONLY active rooms with messages
    const chatrooms = await ChatRoom.find({ 
      participants: userId,
      status: 'active', // ONLY active
      hasMessages: true // ONLY rooms with messages
    })
      .populate('participants', 'name email picture')
      .populate('productId', 'title images price')
      .sort({ updatedAt: -1 });
    
    console.log(`📱 Fetched ${chatrooms.length} ACTIVE chatrooms for user ${userId}`);
    
    res.json(chatrooms);
  } catch (error) {
    console.error('Error fetching chatrooms:', error);
    res.status(500).json({ message: 'Failed to fetch chatrooms', error: error.message });
  }
});

// Check if room exists (without creating)
router.get('/check-room', authMiddleware, async (req, res) => {
  try {
    const { productId } = req.query;
    const inquirerId = req.user._id;

    if (!productId) {
      return res.status(400).json({ message: 'Missing productId' });
    }

    // Check for existing room (both pending and active)
    const chatRoom = await ChatRoom.findOne({
      productId,
      participants: inquirerId,
      status: { $ne: 'cancelled' }
    }).populate('participants', 'name email picture');

    if (chatRoom) {
      return res.json({ 
        exists: true, 
        roomId: chatRoom._id,
        status: chatRoom.status,
        hasMessages: chatRoom.hasMessages
      });
    }

    res.json({ 
      exists: false 
    });

  } catch (error) {
    console.error('Error checking room:', error);
    res.status(500).json({ message: 'Failed to check room', error: error.message });
  }
});

// Create PENDING room (no messages yet)
// Create PENDING room (no messages yet) - FIXED VERSION
router.post('/create-room', authMiddleware, async (req, res) => {
  console.log("Create room request body:", req.body);
  try {
    const { productId, productTitle, ownerId } = req.body;
    const inquirerId = req.user._id;

    // Validation
    if (!productId || !ownerId) {
      return res.status(400).json({ message: 'Missing productId or ownerId' });
    }

    // Prevent owner from chatting with themselves
    if (inquirerId.toString() === ownerId.toString()) {
      return res.status(400).json({ message: 'You cannot chat with yourself' });
    }

    // ✅ UPDATED: Check using new fields
    let chatRoom = await ChatRoom.findOne({
      productId,
      ownerId,
      inquirerId,
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

    // ✅ UPDATED: Create room with NEW REQUIRED FIELDS
    chatRoom = new ChatRoom({
      name: productTitle || 'Product Inquiry',
      productId,
      participants: [inquirerId, ownerId],
      ownerId: ownerId,                    // ✅ ADD THIS
      inquirerId: inquirerId,              // ✅ ADD THIS
      lastMessage: null,
      status: 'pending',
      hasMessages: false
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
    console.error('Error creating chatroom:', error);
    
    // 🚨 ENHANCED DUPLICATE HANDLING FOR NEW INDEX
    if (error.code === 11000 || error.code === 11001) {
      console.log('🔄 Duplicate room detected, finding existing room...');
      
      // ✅ UPDATED: Find using new fields
      const existingRoom = await ChatRoom.findOne({
        productId: req.body.productId,
        ownerId: req.body.ownerId,
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
// Activate room when first message is sent (call this from socket)
router.patch('/activate-room/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;

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
    console.error('Error activating room:', error);
    res.status(500).json({ message: 'Failed to activate room', error: error.message });
  }
});

// Get chatroom details by ID (allow both pending and active)
router.get('/room/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    const chatRoom = await ChatRoom.findById(roomId)
      .populate('participants', 'name email picture');

    if (!chatRoom) {
      return res.status(404).json({ message: 'Chat room not found' });
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
    console.error('Error fetching chatroom:', error);
    res.status(500).json({ message: 'Failed to fetch chatroom', error: error.message });
  }
});



const cleanupPendingRooms = async () => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    const pendingRooms = await ChatRoom.find({
      status: 'pending',
      hasMessages: false,
      createdAt: { $lt: twentyFourHoursAgo }
    });
    
    for (const room of pendingRooms) {
      await ChatRoom.deleteOne({ _id: room._id });
      console.log(`🧹 Deleted unused pending room: ${room._id}`);
    }
    
    console.log(`🧹 Cleaned up ${pendingRooms.length} unused pending rooms`);
  } catch (error) {
    console.error('Error cleaning up pending rooms:', error);
  }
};

// Run cleanup every 6 hours (6 * 60 * 60 * 1000 ms)
const CLEANUP_INTERVAL = 6 * 60 * 60 * 1000;
setInterval(cleanupPendingRooms, CLEANUP_INTERVAL);

// Also, run once on startup (optional)
cleanupPendingRooms();



export default router;