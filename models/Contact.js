import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  userEmail: {
    type: String,
    default: 'anonymous@steya.com'
  },
  userName: {
    type: String,
    default: 'Anonymous User'
  },
  status: {
    type: String,
    enum: ['pending', 'replied', 'resolved'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Contact = mongoose.model('Contact', contactSchema);
export default Contact; 
