import mongoose from 'mongoose';

const roomSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true, // To track who posted it
  },
  category: {
    type: String,
    enum: ['shared', 'pg_hostel', 'flat_home'],
    required: true,
  },
  title: String,
  description: String,
  images: [String], // URLs (Cloudinary etc.)

  // 📍 Structured Location
  location: {
    fullAddress: String,
    district: String,
    state: String,
    latitude: Number,
    longitude: Number,
  },

  // 📞 Contact
  contactPhone: String,
  showPhonePublic: {
    type: Boolean,
    default: false,
  },

  // 📦 Shared Room Specific
  monthlyRent: Number,
  roommatesWanted: Number,
  genderPreference: {
    type: String,
    enum: ['male', 'female', 'any'],
  },
  habitPreferences: [String], // ['non_smoker', 'non_alcoholic', 'fitness_freak']
  purpose: [String], // ['student', 'professional', 'living']

  // 🛏 PG/Hostel Specific
  priceRange: {
    min: Number,
    max: Number,
  },
  pgGenderCategory: {
    type: String,
    enum: ['gents', 'ladies', 'any'],
  },
  roomTypesAvailable: [String], // ['single', 'double', 'triple']
  mealsProvided: [String], // ['breakfast', 'lunch', 'dinner']
  amenities: [String], // ['wifi', 'ac', 'hot_water', 'laundry']
  rules: [String], // ['non_smoking', 'non_alcoholic', ...custom rules]

  // 🏡 Flat/Home Specific
  propertyType: {
    type: String,
    enum: ['flat', 'home', 'apartment'],
  },
  furnishedStatus: {
    type: String,
    enum: ['furnished', 'semi-furnished', 'unfurnished'],
  },
  securityDeposit: Number,
  squareFeet: Number,
  bedrooms: Number,
  bathrooms: Number,
  balconies: Number,
  floorNumber: Number,
  totalFloors: Number,
  tenantPreference: {
    type: String,
    enum: ['family', 'bachelors', 'any'],
  },
  parking: {
    type: String,
    enum: ['two_wheeler', 'four_wheeler', 'none'],
  },

  // 🔒 Status & Time
  status: {
    type: String,
    enum: ['active', 'inactive', 'sold', 'deleted'],
    default: 'active',
  },
  isApproved: {
    type: Boolean,
    default: true, // Optional: admin review
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Room  = mongoose.model('Room',roomSchema)
export default Room;