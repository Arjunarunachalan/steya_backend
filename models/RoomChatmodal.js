import mongoose from 'mongoose';

const chatRoomSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: true 
  },
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product',
    required: true,
    index: true
  },
  participants: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User',
    required: true 
  }],
  lastMessage: {
    type: String,
    default: null
  },
  // ADD THESE NEW FIELDS
  status: {
    type: String,
    enum: ['pending', 'active', 'cancelled'],
    default: 'pending' // Room starts as pending until first message
  },
  hasMessages: {
    type: Boolean,
    default: false // Track if any messages were sent
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  firstMessageAt: {
    type: Date,
    default: null // Set when first message is sent
  }
}, { 
  timestamps: true 
});

// Update compound index to include status
chatRoomSchema.index({ productId: 1, participants: 1 }, { 
  unique: true,
  partialFilterExpression: { status: { $ne: 'cancelled' } }
});

chatRoomSchema.index({ participants: 1, updatedAt: -1 });

export default mongoose.models.ChatRoom || mongoose.model('ChatRoom', chatRoomSchema);