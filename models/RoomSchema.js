import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  // Category
  category: {
    type: String,
    enum: ["shared", "pg_hostel", "flat_home"],
    required: true,
  },

  // Common fields
  title: { type: String, required: true },
  
  description: { type: String, required: true },
  images: [String],

  // Location (GeoJSON Point)
  location: {
    type: {
      type: String,
      enum: ["Point"],
      default: "Point",
    },
    coordinates: {
      type: [Number], // [lng, lat]
      required: true,
    },
    fullAddress: String,
  },
  district: { type: String, required: true },
  state: { type: String, required: true },

  // Contact
  contactPhone: String,
  showPhonePublic: { type: Boolean, default: false },

  // Financial / category-specific
  monthlyRent: Number,
  priceRange: {
    min: Number,
    max: Number,
  },
  securityDeposit: Number,

  // Shared Room specific
  roommatesWanted: Number,
  genderPreference: { type: String, enum: ["male", "female", "any"] },
  habitPreferences: [String],
  purpose: [String],

  // PG/Hostel specific
  availableSpace: Number,
  pgGenderCategory: { type: String, enum: ["gents", "ladies", "any"] },
  roomTypesAvailable: [String],
  mealsProvided: [String],
  amenities: [String],
  rules: [String],

  // Flat/Home specific
  propertyType: String,
  furnishedStatus: { type: String, enum: ["furnished", "semi", "unfurnished"] },
  squareFeet: Number,
  bedrooms: Number,
  bathrooms: Number,
  balconies: Number,
  floorNumber: Number,
  totalFloors: Number,
  tenantPreference: String,
  parking: String,

  // Engagement
  views: { type: Number, default: 0 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  // Reports
  reports: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],

  // Post control
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiryDate: { type: Date, default: () => Date.now() + 30*24*60*60*1000 }, // 30 days
  isBlocked: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

}, { timestamps: true });

// Geospatial index
roomSchema.index({ location: "2dsphere" });

const Room = mongoose.model("Room", roomSchema);
export default Room;
