import Room from '../models/RoomSchema.js';

// Create a new room
export const createRoom = async (req, res) => {
  try {
    const {
      user,
      category,
      title,
      description,
      location,
      contactPhone,
      showPhonePublic = false,

      // Shared room
      monthlyRent,
      roommatesWanted,
      genderPreference,
      habitPreferences,
      purpose,

      // PG/Hostel
      priceRange,
      pgGenderCategory,
      roomTypesAvailable,
      mealsProvided,
      amenities,
      rules,

      // Flat/Home
      propertyType,
      furnishedStatus,
      securityDeposit,
      squareFeet,
      bedrooms,
      bathrooms,
      balconies,
      floorNumber,
      totalFloors,
      tenantPreference,
      parking,
    } = req.body;
    console.log(req.body);
    
const imageUrls = req.files.map((file)=>file.path)
    // Basic required field checks
    // if (!user || !category || !title || !location || !location.district || !location.state) {
    //   return res.status(400).json({ error: 'Missing required fields' });
    // }

    // Construct data template safely
    const newRoomData = {
      user,
      category,
      title,
      description,
      images: imageUrls,
      location: {
        fullAddress: location?.fullAddress || '',
        district: location?.district,
        state: location?.state,
        latitude: location?.latitude || null,
        longitude: location?.longitude || null,
      },
      contactPhone,
      showPhonePublic,

      // Conditional properties
      monthlyRent,
      roommatesWanted,
      genderPreference,
      habitPreferences,
      purpose,

      priceRange,
      pgGenderCategory,
      roomTypesAvailable,
      mealsProvided,
      amenities,
      rules,

      propertyType,
      furnishedStatus,
      securityDeposit,
      squareFeet,
      bedrooms,
      bathrooms,
      balconies,
      floorNumber,
      totalFloors,
      tenantPreference,
      parking,
    };

    // Save to DB
    const newRoom = new Room(newRoomData);
    const savedRoom = await newRoom.save();

    res.status(201).json(savedRoom);
  } catch (error) {
    console.error('Room creation error:', error.message);
    res.status(500).json({ error: 'Server error while creating room' });
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
    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: 'Room not found' });
    res.status(200).json({roomData:room});
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update room by ID
export const updateRoomById = async (req, res) => {
  try {
    const updatedRoom = await Room.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedRoom) return res.status(404).json({ message: 'Room not found' });
    res.json(updatedRoom);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete room by ID
export const deleteRoomById = async (req, res) => {
  try {
    const deletedRoom = await Room.findByIdAndDelete(req.params.id);
    if (!deletedRoom) return res.status(404).json({ message: 'Room not found' });
    res.json({ message: 'Room deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
