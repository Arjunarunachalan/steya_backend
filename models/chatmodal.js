// models/chatmodal.js - FINAL VERSION
import mongoose from 'mongoose';

const chatSchema = new mongoose.Schema({
  roomId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'ChatRoom', 
    required: true,
    index: true // Add index for faster queries
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
        required: true 
      },
      option: { 
        type: String, 
        required: true 
      },
      nextState: { 
        type: String, 
        required: true 
      },
      senderRole: { 
        type: String, 
        enum: ['inquirer', 'owner'], 
        required: true 
      },
      createdAt: { 
        type: Date, 
        default: Date.now,
        index: true 
      }
    }
  ]
}, { 
  timestamps: true 
});

// Index for faster room lookups
chatSchema.index({ roomId: 1 });

// Only create model if it doesn't exist (prevents overwrite error)
export default mongoose.models.Chat || mongoose.model('Chat', chatSchema);