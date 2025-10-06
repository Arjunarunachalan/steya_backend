import mongoose from "mongoose";

const roomSchema = new mongoose.Schema({
  // ===== Category =====
  category: {
    type: String,
    enum: ["shared", "pg_hostel", "flat_home"],
    required: true,
  },

  // ===== Common fields =====
  title: { type: String, required: true },
  description: { type: String, required: true },
 images: [
    {
      originalUrl: { type: String, required: true }, // all uploaded images
    }
  ],
  thumbnail: {
    url: { type: String }, // only the FIRST image’s thumbnail
  },

  // ===== Location (GeoJSON Point) =====
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
    fullAddress: { type: String, default: "" },
  },
 

  // ===== Contact =====
  contactPhone: { type: String, default: "" },
  showPhonePublic: { type: Boolean, default: false },

  // ===== Financial / Common =====
  monthlyRent: { type: Number },
  priceRange: {
    min: { type: Number },
    max: { type: Number },
  },
  securityDeposit: { type: Number },

  // ===== Shared Room Specific =====
  roommatesWanted: { type: Number },
  genderPreference: { type: String, enum: ["male", "female", "any"] },
  habitPreferences: { type: [String], default: [] },
  purpose: { type: [String], default: [] },

  // ===== PG/Hostel Specific =====
  availableSpace: { type: Number },
  pgGenderCategory: { type: String, enum: ["gents", "ladies", "coed"] },
  roomTypesAvailable: { type: [String], default: [] },
  mealsProvided: { type: [String], default: [] },
  amenities: { type: [String], default: [] },
  rules: { type: [String], default: [] },

  // ===== Flat/Home Specific =====
  propertyType: { type: String },
  furnishedStatus: { type: String, enum: ["furnished", "semi_furnished", "unfurnished"] },
  squareFeet: { type: Number },
  bedrooms: { type: Number },
  bathrooms: { type: Number },
  balconies: { type: Number },
  floorNumber: { type: Number },
  totalFloors: { type: Number },
  tenantPreference: { type: String },
  parking: { type: String },

  // ===== Engagement =====
  views: { type: Number, default: 0 },
viewedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

  // ===== Reports =====
  reports: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      reason: { type: String },
      createdAt: { type: Date, default: Date.now },
    },
  ],

  // ===== Post Control =====
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  expiryDate: { type: Date, default: () => Date.now() + 30 * 24 * 60 * 60 * 1000 }, // 30 days
  isBlocked: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },

}, { timestamps: true });

// ===== Geospatial index =====
roomSchema.index({ location: "2dsphere" });

// ===== Optional: Category-specific validation =====
roomSchema.pre("validate", function(next) {
  if (this.category === "shared") {
    if (!this.roommatesWanted) this.invalidate("roommatesWanted", "Required for shared room");
  } else if (this.category === "pg_hostel") {
    if (!this.availableSpace) this.invalidate("availableSpace", "Required for PG/Hostel");
  } else if (this.category === "flat_home") {
    if (!this.propertyType) this.invalidate("propertyType", "Required for Flat/Home");
  }
  next();
});

const Room = mongoose.model("Room", roomSchema);
export default Room;
    