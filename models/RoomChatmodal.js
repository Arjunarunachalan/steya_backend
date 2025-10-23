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
  lastMessageSender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  lastMessageAt: {
    type: Date,
    default: null
  },
  readBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  status: {
    type: String,
    enum: ['pending', 'active', 'cancelled', 'expired'], // ADD 'expired' here
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
  },

  // ===== ADD THESE 3 FIELDS FOR SOFT DELETE =====
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deleteExpiresAt: {
    type: Date,
    default: null
  }

}, { 
  timestamps: true 
});

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