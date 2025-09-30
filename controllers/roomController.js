

// Create a new room
// export const createRoom = async (req, res) => {
//   try {
//     const {
//       category,
//       title,
//       description,
//       images,

//       // Location
//       location,

//       // Contact
//       contactPhone,
//       showPhonePublic,

//       // Financial
//       monthlyRent,
//       priceRange,
//       securityDeposit,

//       // Shared room
//       roommatesWanted,
//       genderPreference,
//       habitPreferences,
//       purpose,

//       // PG/Hostel
//       availableSpace,
//       pgGenderCategory,
//       roomTypesAvailable,
//       mealsProvided,
//       amenities,
//       rules,

//       // Flat/Home
//       propertyType,
//       furnishedStatus,
//       squareFeet,
//       bedrooms,
//       bathrooms,
//       balconies,
//       floorNumber,
//       totalFloors,
//       tenantPreference,
//       parking,

//       // Post Control
//       expiryDate,
//     } = req.body;

//     const room = new Room({
//       category,
//       title,
//       description,
//       images,
//       location,
//       contactPhone,
//       showPhonePublic,
//       monthlyRent,
//       priceRange,
//       securityDeposit,
//       roommatesWanted,
//       genderPreference,
//       habitPreferences,
//       purpose,
//       availableSpace,
//       pgGenderCategory,
//       roomTypesAvailable,
//       mealsProvided,
//       amenities,
//       rules,
//       propertyType,
//       furnishedStatus,
//       squareFeet,
//       bedrooms,
//       bathrooms,
//       balconies,
//       floorNumber,
//       totalFloors,
//       tenantPreference,
//       parking,
//       expiryDate,
//       createdBy: req.user.id,
//     });

//     await room.save();
//     res.status(201).json({ success: true, room });
//   } catch (err) {
//     console.error("Create Room Error:", err);
//     res.status(400).json({ success: false, message: "Failed to create room" });
//   }
// };
// controllers/roomsController.js
import AWS from "aws-sdk";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import Room from '../models/RoomSchema.js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();
// 🔍 DEBUG: Check all AWS environment variables first
console.log("AWS Environment Variables Check:", {
  AWS_ACCESS: process.env.AWS_ACCESS ? "✅ SET" : "❌ NOT SET",
  AWS_SECRET: process.env.AWS_SECRET ? "✅ SET" : "❌ NOT SET", 
  AWS_REGION: process.env.AWS_REGION ? `✅ ${process.env.AWS_REGION}` : "❌ NOT SET",
  AWS_BUCKET: process.env.AWS_BUCKET ? `✅ ${process.env.AWS_BUCKET}` : "❌ NOT SET"
});

const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS,
  secretAccessKey: process.env.AWS_SECRET,
  region: process.env.AWS_REGION,
});

const BUCKET_NAME = process.env.AWS_BUCKET;

// Validate required environment variables
if (!BUCKET_NAME) {
  throw new Error("AWS_BUCKET environment variable is not set!");
}
if (!process.env.AWS_ACCESS) {
  throw new Error("AWS_ACCESS environment variable is not set!");
}
if (!process.env.AWS_SECRET) {
  throw new Error("AWS_SECRET environment variable is not set!");
}
if (!process.env.AWS_REGION) {
  throw new Error("AWS_REGION environment variable is not set!");
}
const watermarkPath = path.join(process.cwd(), "assets/watermark.png");

export const uploadRooms = async (req, res) => {
  try {
    let images = [];
    let thumbnail = null; // only first image will have this

    // Collect files
    let allFiles = [];
    if (req.files) {
      if (req.files.images && Array.isArray(req.files.images)) {
        allFiles = [...allFiles, ...req.files.images];
      }
      if (Array.isArray(req.files)) {
        allFiles = req.files;
      }
      if (allFiles.length === 0) {
        for (const [key, value] of Object.entries(req.files)) {
          if (Array.isArray(value)) {
            allFiles = [...allFiles, ...value];
          }
        }
      }
    }

    if (allFiles.length === 0) {
      return res.status(400).json({ success: false, message: "No files uploaded" });
    }

    // Loop through files
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];

      // Skip invalid
      if (!file.buffer || file.buffer.length === 0) continue;

      // Resize + watermark
      let mainBuffer = await sharp(file.buffer)
        .resize({ width: 1280, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();

      if (fs.existsSync(watermarkPath)) {
        const watermarkBuffer = await sharp(watermarkPath).resize(200).png().toBuffer();
        mainBuffer = await sharp(mainBuffer)
          .composite([{ input: watermarkBuffer, gravity: "southeast", blend: "overlay" }])
          .toBuffer();
      }

      // Upload main
      const mainKey = `properties/${uuidv4()}-${Date.now()}-main.jpg`;
      const mainResult = await s3
        .upload({
          Bucket: BUCKET_NAME,
          Key: mainKey,
          Body: mainBuffer,
          ContentType: "image/jpeg",
        })
        .promise();

      const mainUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${mainKey}`;

      // If it's the first file → generate + upload thumbnail
      if (i === 0) {
        const thumbBuffer = await sharp(file.buffer)
          .resize({ width: 300, withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();

        const thumbKey = `properties/thumbs/${uuidv4()}-${Date.now()}-thumb.jpg`;
        const thumbResult = await s3
          .upload({
            Bucket: BUCKET_NAME,
            Key: thumbKey,
            Body: thumbBuffer,
            ContentType: "image/jpeg",
          })
          .promise();

        const thumbUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${thumbKey}`;

        thumbnail = { url: thumbUrl }; // save only once
      }

      // Push only main URL to images
      images.push({ originalUrl: mainUrl });
    }

    if (images.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No images processed successfully",
      });
    }

    // Parse location
    let parsedLocation;
    if (req.body.location) {
      try {
        let locationValue = Array.isArray(req.body.location)
          ? req.body.location[req.body.location.length - 1]
          : req.body.location;
        parsedLocation = typeof locationValue === "string" ? JSON.parse(locationValue) : locationValue;
      } catch {
        parsedLocation = null;
      }
    }

    // Helpers
    const parseJSON = (field) => {
      if (!req.body[field]) return undefined;
      try {
        let value = Array.isArray(req.body[field]) ? req.body[field][req.body[field].length - 1] : req.body[field];
        return JSON.parse(value);
      } catch {
        return Array.isArray(req.body[field]) ? req.body[field][req.body[field].length - 1] : req.body[field];
      }
    };

    const getValue = (field) => {
      const value = req.body[field];
      return Array.isArray(value) ? value[value.length - 1] : value;
    };

    // Create room doc
    const roomData = {
      category: getValue("category"),
      title: getValue("title"),
      description: getValue("description"),
      images,
      thumbnail, // only one thumbnail
      location: parsedLocation,
      contactPhone: getValue("contactPhone"),
      showPhonePublic: getValue("showPhonePublic") === "true",
      monthlyRent: getValue("monthlyRent"),
      priceRange: parseJSON("priceRange"),
      securityDeposit: getValue("securityDeposit"),
      roommatesWanted: getValue("roommatesWanted"),
      genderPreference: getValue("genderPreference"),
      habitPreferences: parseJSON("habitPreferences"),
      purpose: parseJSON("purpose"),
      availableSpace: getValue("availableSpace"),
      pgGenderCategory: getValue("pgGenderCategory"),
      roomTypesAvailable: parseJSON("roomTypesAvailable"),
      mealsProvided: getValue("mealsProvided"),
      amenities: parseJSON("amenities"),
      rules: parseJSON("rules"),
      propertyType: getValue("propertyType"),
      furnishedStatus: getValue("furnishedStatus"),
      squareFeet: getValue("squareFeet"),
      bedrooms: getValue("bedrooms"),
      bathrooms: getValue("bathrooms"),
      balconies: getValue("balconies"),
      floorNumber: getValue("floorNumber"),
      totalFloors: getValue("totalFloors"),
      tenantPreference: getValue("tenantPreference"),
      parking: getValue("parking"),
      expiryDate: getValue("expiryDate"),
      createdBy: req.user.id,
    };

     
      
    const room = new Room(roomData);
    await room.save();


    
       


    res.status(201).json({
      success: true,
      room: {
        ...room.toObject(),
        imageCount: room.images.length,
        hasThumbnail: !!room.thumbnail,
      },
    });
  } catch (err) {
    console.error("❌ Create Room Error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to create room",
      error: err.message,
    });
  }
};





export const getRooms = async (req, res) => {
  try {
    const { category, lat, lng, limit = 15, min = 0, max = 5000 } = req.query; // meters

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: "lat & lng required" });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    const matchStage = {};
    if (category) matchStage.category = category;

    const rooms = await Room.aggregate([
      {
      $geoNear: {
  near: { type: "Point", coordinates: [lngNum, latNum] },
  distanceField: "distance",
  spherical: true,
  minDistance: parseInt(min) || 0,
  maxDistance: parseInt(max),
}
      },
      { $match: matchStage },
      { $sort: { distance: 1 } },
      { $limit: parseInt(limit) },
    ]);

    res.json({ success: true, rooms });
  } catch (err) {
    console.error("Get Rooms Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch rooms" });
  }
};


//single room controller

// GET /api/rooms/:id
export const getRoomById = async (req, res) => {
  console.log("inside single room controller");
  
  try {
    const { id } = req.params;
    const room = await Room.findById(id).populate("createdBy", "name picture");

   
    if (!room) {
      return res.status(404).json({ success: false, message: "Room not found" });
    }
    console.log(room,"roomdata");
    
    res.json({ success: true, room });
  } catch (err) {
    console.error("Get Room Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch room" });
  }
};


// Get all rooms
// export const getAllRooms = async (req, res) => {
//   try {
//     const rooms = await Room.find({status:"active"});
//     if(!rooms || rooms.length === 0){
//       res.status(404).json({message:"No active rooms found "})
//     }
//     res.status(200).json({roomData:rooms})
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// Get room by ID
// export const getRoomById = async (req, res) => {
//   try {
//     const room = await Room.findById(req.params.id).populate("createdBy", "name picture");
//     if (!room) return res.status(404).json({ success: false, message: "Room not found" });

//     // count view
//     room.views += 1;
//     if (req.user) {
//       if (!room.viewedBy.includes(req.user.id)) {
//         room.viewedBy.push(req.user.id);
//       }
//     }
//     await room.save();

//     res.json({ success: true, room });
//   } catch (err) {
//     console.error("Get Room Error:", err);
//     res.status(500).json({ success: false, message: "Failed to fetch room" });
//   }
// };
// Update room by ID

// export const updateRoom = async (req, res) => {
//   try {
//     const room = await Room.findById(req.params.id);

//     if (!room) return res.status(404).json({ success: false, message: "Room not found" });
//     if (room.createdBy.toString() !== req.user.id) {
//       return res.status(403).json({ success: false, message: "Not authorized" });
//     }

//     Object.assign(room, req.body); // update only passed fields
//     await room.save();

//     res.json({ success: true, room });
//   } catch (err) {
//     console.error("Update Room Error:", err);
//     res.status(500).json({ success: false, message: "Failed to update room" });
//   }
// };


// Delete room by ID
// export const deleteRoom = async (req, res) => {
//   try {
//     const room = await Room.findById(req.params.id);

//     if (!room) return res.status(404).json({ success: false, message: "Room not found" });
//     if (room.createdBy.toString() !== req.user.id) {
//       return res.status(403).json({ success: false, message: "Not authorized" });
//     }

//     await room.deleteOne();
//     res.json({ success: true, message: "Room deleted successfully" });
//   } catch (err) {
//     console.error("Delete Room Error:", err);
//     res.status(500).json({ success: false, message: "Failed to delete room" });
//   }
// };
