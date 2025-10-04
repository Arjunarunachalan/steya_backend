import mongoose from 'mongoose';

const favoriteSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  room: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Room',
    required: true,
    index: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure unique user-room combination
favoriteSchema.index({ user: 1, room: 1 }, { unique: true });

// Virtual for created date
favoriteSchema.virtual('createdDate').get(function() {
  return this.createdAt.toLocaleDateString();
});

export default mongoose.models.Favorite || mongoose.model('Favorite', favoriteSchema);