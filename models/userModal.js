const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  googleId: {
    type: String,
    required: true,
    unique: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  fullName: String,
  surname: String,
  username: {
    type: String,
    unique: true,
    sparse: true,
  },
  refreshTokens: [String],
  profilePic: String,

  // 📍 Location (Structured + GeoJSON)
  location: {
    fullAddress: String,
    district: String,
    state: String,
    geoLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point',
      },
      coordinates: {
        type: [Number], // [longitude, latitude]
        required: true,
      },
    },
  },

  isDeleted: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

// 🧭 Create a geospatial index
userSchema.index({ 'location.geoLocation': '2dsphere' });

module.exports = mongoose.model('User', userSchema);