// models/RoomChatmodal.js - UPDATED
import mongoose from 'mongoose';

const chatRoomSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Room',
    required: true,
    index: true
  },
  participants: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  }],
  // ADD THESE FIELDS FOR BETTER MANAGEMENT
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  inquirerId: {
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true,
    index: true
  },
  lastMessage: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'cancelled'],
    default: 'pending'
  },
  hasMessages: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  firstMessageAt: {
    type: Date,
    default: null
  }
}, { 
  timestamps: true 
});

// ✅ REMOVE THIS PROBLEMATIC INDEX:
// chatRoomSchema.index({ productId: 1, participants: 1 }, { 
//   unique: true,
//   partialFilterExpression: { status: { $ne: 'cancelled' } }
// });

// ✅ ADD THESE CORRECT INDEXES INSTEAD:
// Prevent duplicate rooms between same owner & inquirer for same product
chatRoomSchema.index({ 
  productId: 1, 
  ownerId: 1, 
  inquirerId: 1 
}, { 
  unique: true,
  partialFilterExpression: { status: { $ne: 'cancelled' } }
});

// Index for querying user's chat rooms
chatRoomSchema.index({ participants: 1, updatedAt: -1 });
chatRoomSchema.index({ ownerId: 1, updatedAt: -1 });
chatRoomSchema.index({ inquirerId: 1, updatedAt: -1 });
chatRoomSchema.index({ productId: 1, status: 1 });

export default mongoose.models.ChatRoom || mongoose.model('ChatRoom', chatRoomSchema);