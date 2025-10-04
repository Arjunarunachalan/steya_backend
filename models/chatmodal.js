// models/chatmodal.js - HYBRID VERSION
import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  roomId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatRoom',
    required: true,
    index: true
  },
  messages: [
    {
      sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      // For option-based messages
      optionId: {
        type: String,
        default: null
      },
      option: {
        type: String,
        default: null
      },
      nextState: {
        type: String,
        default: null
      },
      senderRole: {
        type: String,
        enum: ['inquirer', 'owner'],
        required: true
      },
      // For free-text messages
      messageType: {
        type: String,
        enum: ['option', 'freetext'],
        default: 'option'
      },
      text: {
        type: String,
        default: null
      },
      // Optional: For media attachments
      attachments: [{
        type: {
          type: String,
          enum: ['image', 'document', 'audio']
        },
        url: String,
        filename: String
      }],
      // Message status
      status: {
        type: String,
        enum: ['sent', 'delivered', 'read'],
        default: 'sent'
      },
      createdAt: {
        type: Date,
        default: Date.now,
        index: true
      }
    }
  ],
  // Track conversation mode
  conversationMode: {
    type: String,
    enum: ['guided', 'freetext', 'hybrid'],
    default: 'hybrid'
  },
  currentState: {
    type: String,
    default: 'START'
  }
}, {
  timestamps: true
});

// Indexes for performance
chatSchema.index({ roomId: 1 });
chatSchema.index({ 'messages.createdAt': -1 });

export default mongoose.models.Chat || mongoose.model('Chat', chatSchema);