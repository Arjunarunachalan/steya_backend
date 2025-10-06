import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  reportedRoom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'spam',
      'inappropriate',
      'misinformation',
      'fake_listing',
      'already_rented',
      'wrong_info',
      'other'
    ]
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
    default: 'pending'
  },
  adminNotes: {
    type: String,
    maxlength: 1000,
    default: ''
  },
  reviewedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
reportSchema.index({ reportedRoom: 1, status: 1 });
reportSchema.index({ reporter: 1, createdAt: -1 });
reportSchema.index({ status: 1, createdAt: -1 });

// Virtual for readable reason
reportSchema.virtual('reasonText').get(function() {
  const reasonMap = {
    spam: 'Spam',
    inappropriate: 'Inappropriate Content',
    misinformation: 'Misinformation',
    fake_listing: 'Fake Listing',
    already_rented: 'Already Rented',
    wrong_info: 'Wrong Information',
    other: 'Other'
  };
  return reasonMap[this.reason] || this.reason;
});

export default mongoose.models.Report || mongoose.model('Report', reportSchema);
