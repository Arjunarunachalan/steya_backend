import Room from '../models/RoomSchema.js';

// Create a new room
export const createRoom = async (req, res) => {
  try {
    const {
      category,
      title,
      description,
      images,

      // Location
      location,

      // Contact
      contactPhone,
      showPhonePublic,

      // Financial
      monthlyRent,
      priceRange,
      securityDeposit,

      // Shared room
      roommatesWanted,
      genderPreference,
      habitPreferences,
      purpose,

      // PG/Hostel
      availableSpace,
      pgGenderCategory,
      roomTypesAvailable,
      mealsProvided,
      amenities,
      rules,

      // Flat/Home
      propertyType,
      furnishedStatus,
      squareFeet,
      bedrooms,
      bathrooms,
      balconies,
      floorNumber,
      totalFloors,
      tenantPreference,
      parking,

      // Post Control
      expiryDate,
    } = req.body;

    const room = new Room({
      category,
      title,
      description,
      images,
      location,
      contactPhone,
      showPhonePublic,
      monthlyRent,
      priceRange,
      securityDeposit,
      roommatesWanted,
      genderPreference,
      habitPreferences,
      purpose,
      availableSpace,
      pgGenderCategory,
      roomTypesAvailable,
      mealsProvided,
      amenities,
      rules,
      propertyType,
      furnishedStatus,
      squareFeet,
      bedrooms,
      bathrooms,
      balconies,
      floorNumber,
      totalFloors,
      tenantPreference,
      parking,
      expiryDate,
      createdBy: req.user.id,
    });

    await room.save();
    res.status(201).json({ success: true, room });
  } catch (err) {
    console.error("Create Room Error:", err);
    res.status(400).json({ success: false, message: "Failed to create room" });
  }
};


// Get all rooms
export const getAllRooms = async (req, res) => {
  try {
    const rooms = await Room.find({status:"active"});
    if(!rooms || rooms.length === 0){
      res.status(404).json({message:"No active rooms found "})
    }
    res.status(200).json({roomData:rooms})
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get room by ID
export const getRoomById = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id).populate("createdBy", "name picture");
    if (!room) return res.status(404).json({ success: false, message: "Room not found" });

    // count view
    room.views += 1;
    if (req.user) {
      if (!room.viewedBy.includes(req.user.id)) {
        room.viewedBy.push(req.user.id);
      }
    }
    await room.save();

    res.json({ success: true, room });
  } catch (err) {
    console.error("Get Room Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch room" });
  }
};
// Update room by ID

export const updateRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ success: false, message: "Room not found" });
    if (room.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    Object.assign(room, req.body); // update only passed fields
    await room.save();

    res.json({ success: true, room });
  } catch (err) {
    console.error("Update Room Error:", err);
    res.status(500).json({ success: false, message: "Failed to update room" });
  }
};


// Delete room by ID
export const deleteRoom = async (req, res) => {
  try {
    const room = await Room.findById(req.params.id);

    if (!room) return res.status(404).json({ success: false, message: "Room not found" });
    if (room.createdBy.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    await room.deleteOne();
    res.json({ success: true, message: "Room deleted successfully" });
  } catch (err) {
    console.error("Delete Room Error:", err);
    res.status(500).json({ success: false, message: "Failed to delete room" });
  }
};
