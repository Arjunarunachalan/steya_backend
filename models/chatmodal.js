// models/chatmodal.js - SIMPLE VERSION (sent/seen only)
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
      messageType: {
        type: String,
        enum: ['option', 'freetext'],
        default: 'option'
      },
      text: {
        type: String,
        default: null
      },
      attachments: [{
        type: {
          type: String,
          enum: ['image', 'document', 'audio']
        },
        url: String,
        filename: String
      }],
      // ✅ SIMPLE STATUS: only 'sent' or 'seen'
      status: {
        type: String,
        enum: ['sent', 'seen'],
        default: 'sent'
      },
      createdAt: {
        type: Date,
        default: Date.now,
        index: true
      }
    }
  ],
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

chatSchema.index({ 'messages.createdAt': -1 });

export default mongoose.models.Chat || mongoose.model('Chat', chatSchema);