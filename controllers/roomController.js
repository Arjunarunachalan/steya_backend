

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
      const mainResult = await s3.upload({
        Bucket: BUCKET_NAME,
        Key: mainKey,
        Body: mainBuffer,
        ContentType: "image/jpeg",
      }).promise();

      const mainUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${mainKey}`;

      // First file → generate thumbnail
      if (i === 0) {
        const thumbBuffer = await sharp(file.buffer)
          .resize({ width: 300, withoutEnlargement: true })
          .jpeg({ quality: 70 })
          .toBuffer();

        const thumbKey = `properties/thumbs/${uuidv4()}-${Date.now()}-thumb.jpg`;
        const thumbResult = await s3.upload({
          Bucket: BUCKET_NAME,
          Key: thumbKey,
          Body: thumbBuffer,
          ContentType: "image/jpeg",
        }).promise();

        const thumbUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${thumbKey}`;
        thumbnail = { url: thumbUrl };
      }

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

    // Fix for mealsProvided
    const parseMealsProvided = () => {
      const value = req.body.mealsProvided;
      if (!value) return [];
      if (Array.isArray(value)) {
        // Could be ["breakfast","lunch"] or ["[\"breakfast\",\"lunch\"]"]
        return value.flatMap(v => {
          try {
            return typeof v === "string" ? JSON.parse(v) : v;
          } catch {
            return v;
          }
        });
      } else if (typeof value === "string") {
        try {
          return JSON.parse(value);
        } catch {
          return [value];
        }
      }
      return [];
    };

    // Create room doc
  const roomData = {
  category: getValue("category") || null,
  title: getValue("title") || "",
  description: getValue("description") || "",
  images,
  thumbnail, 
  location: parsedLocation || null,
  contactPhone: getValue("contactPhone") || "",
  showPhonePublic: getValue("showPhonePublic") === "true",
  monthlyRent: getValue("monthlyRent") || null,
  priceRange: parseJSON("priceRange") || {},
  securityDeposit: getValue("securityDeposit") || null,
  roommatesWanted: getValue("roommatesWanted") || null,
  genderPreference: getValue("genderPreference") || null,
  habitPreferences: parseJSON("habitPreferences") || [],
  purpose: parseJSON("purpose") || [],
  availableSpace: getValue("availableSpace") || null,
  pgGenderCategory: getValue("pgGenderCategory") || null,
  roomTypesAvailable: parseJSON("roomTypesAvailable") || [],
  mealsProvided: parseJSON("mealsProvided") || [],
  amenities: parseJSON("amenities") || [],
  rules: parseJSON("rules") || [],
  propertyType: getValue("propertyType") || null,
  furnishedStatus: getValue("furnishedStatus") || null,
  squareFeet: getValue("squareFeet") || null,
  bedrooms: getValue("bedrooms") || null,
  bathrooms: getValue("bathrooms") || null,
  balconies: getValue("balconies") || null,
  floorNumber: getValue("floorNumber") || null,
  totalFloors: getValue("totalFloors") || null,
  tenantPreference: getValue("tenantPreference") || null,
  parking: getValue("parking") || null,
  expiryDate: getValue("expiryDate") || null,
  createdBy: req.user.id,
};

    const room = new Room(roomData);
     console.log('====================================');
    console.log(roomData, "ddddddddddddddd");
    console.log('====================================');
   
   
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



export const updateRoom = async (req, res) => {
  try {
    // ✅ ADD COMPLETE DEBUGGING
    console.log('🔍 COMPLETE REQUEST DEBUG:');
    console.log('1. req.files:', req.files);
    console.log('2. req.body keys:', Object.keys(req.body));
    console.log('3. req.body existingImages:', req.body.existingImages);
    
    const { roomId } = req.params;
    const userId = req.user.id;

    console.log(`🔄 UPDATE ROOM: User ${userId} → Room ${roomId}`);

    // Check if room exists and user owns it
    const existingRoom = await Room.findOne({ 
      _id: roomId, 
      createdBy: userId 
    });

    if (!existingRoom) {
      return res.status(404).json({ 
        success: false, 
        message: 'Room not found or you do not have permission to edit this room' 
      });
    }

    // ✅ Get existing images that should be KEPT from frontend
    const existingImagesToKeep = req.body.existingImages ? JSON.parse(req.body.existingImages) : [];
    
    // ✅ FIXED: Properly count files from req.files object
    const imageFiles = req.files && req.files.images ? 
      (Array.isArray(req.files.images) ? req.files.images : [req.files.images]) : [];
    const totalNewFiles = imageFiles.length + (req.files && req.files.thumbnail ? 1 : 0);

    console.log('📸 Image Update Info:', {
      currentImages: existingRoom.images.length,
      imagesToKeep: existingImagesToKeep.length,
      newFiles: totalNewFiles,
      imageFiles: imageFiles.length,
      hasThumbnail: !!(req.files && req.files.thumbnail)
    });

    // ✅ Identify images to DELETE (only those NOT being kept)
    const imagesToDelete = existingRoom.images.filter(existingImg => 
      !existingImagesToKeep.includes(existingImg.originalUrl)
    );

    console.log('🗑️ Images to delete from S3:', imagesToDelete.length);

    // ✅ SAFELY delete only images that are NOT used by other rooms
    if (imagesToDelete.length > 0) {
      await safelyDeleteImagesFromS3(imagesToDelete, roomId);
    }

    let images = [];
    let thumbnail = null;

    // ✅ Add kept existing images
    existingImagesToKeep.forEach(url => {
      images.push({ originalUrl: url });
    });

    // ✅ Process NEW uploaded images
    if (imageFiles.length > 0) {
      console.log('📤 Processing new images:', imageFiles.length);

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];

        if (!file.buffer || file.buffer.length === 0) continue;

        // Resize + watermark main image
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

        // Upload main image
        const mainKey = `properties/${uuidv4()}-${Date.now()}-${i}-main.jpg`;
        const mainResult = await s3.upload({
          Bucket: BUCKET_NAME,
          Key: mainKey,
          Body: mainBuffer,
          ContentType: "image/jpeg",
        }).promise();

        const mainUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${mainKey}`;

        // ✅ FIRST IMAGE = THUMBNAIL (only for first new image if no existing images)
        if (i === 0 && images.length === 0) {
          const thumbBuffer = await sharp(file.buffer)
            .resize({ width: 300, withoutEnlargement: true })
            .jpeg({ quality: 70 })
            .toBuffer();

          const thumbKey = `properties/thumbs/${uuidv4()}-${Date.now()}-thumb.jpg`;
          const thumbResult = await s3.upload({
            Bucket: BUCKET_NAME,
            Key: thumbKey,
            Body: thumbBuffer,
            ContentType: "image/jpeg",
          }).promise();

          thumbnail = { url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${thumbKey}` };
        }

        images.push({ originalUrl: mainUrl });
      }
    }

    // ✅ Process thumbnail if sent separately
    if (req.files && req.files.thumbnail && !thumbnail) {
      const thumbFile = Array.isArray(req.files.thumbnail) ? req.files.thumbnail[0] : req.files.thumbnail;
      
      const thumbBuffer = await sharp(thumbFile.buffer)
        .resize({ width: 300, withoutEnlargement: true })
        .jpeg({ quality: 70 })
        .toBuffer();

      const thumbKey = `properties/thumbs/${uuidv4()}-${Date.now()}-thumb.jpg`;
      const thumbResult = await s3.upload({
        Bucket: BUCKET_NAME,
        Key: thumbKey,
        Body: thumbBuffer,
        ContentType: "image/jpeg",
      }).promise();

      thumbnail = { url: `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${thumbKey}` };
    }

    // ✅ THUMBNAIL LOGIC: First image always becomes thumbnail
    if (images.length > 0 && !thumbnail) {
      // If we have existing images, use first one as thumbnail
      if (existingImagesToKeep.length > 0) {
        thumbnail = { url: existingImagesToKeep[0] };
      }
      // If we have new images and no thumbnail yet, use first new image
      else if (images.length > 0) {
        thumbnail = { url: images[0].originalUrl };
      }
    }

    // Helper functions
    const parseJSON = (field) => {
      if (!req.body[field]) return undefined;
      try {
        let value = Array.isArray(req.body[field]) 
          ? req.body[field][req.body[field].length - 1] 
          : req.body[field];
        return JSON.parse(value);
      } catch {
        return Array.isArray(req.body[field]) 
          ? req.body[field][req.body[field].length - 1] 
          : req.body[field];
      }
    };

    const getValue = (field) => {
      const value = req.body[field];
      return Array.isArray(value) ? value[value.length - 1] : value;
    };

    // Parse location
    let parsedLocation = existingRoom.location;
    if (req.body.location) {
      try {
        let locationValue = Array.isArray(req.body.location)
          ? req.body.location[req.body.location.length - 1]
          : req.body.location;
        parsedLocation = typeof locationValue === "string" 
          ? JSON.parse(locationValue) 
          : locationValue;
      } catch (error) {
        console.log('Location parse error, keeping existing:', error);
      }
    }

    // Prepare update data
    const updateData = {
      category: getValue("category") || existingRoom.category,
      title: getValue("title") || existingRoom.title,
      description: getValue("description") || existingRoom.description,
      images: images.length > 0 ? images : existingRoom.images,
      thumbnail: thumbnail || existingRoom.thumbnail,
      location: parsedLocation,
      contactPhone: getValue("contactPhone") || existingRoom.contactPhone,
      showPhonePublic: getValue("showPhonePublic") === "true" || existingRoom.showPhonePublic,
      monthlyRent: getValue("monthlyRent") || existingRoom.monthlyRent,
      priceRange: parseJSON("priceRange") || existingRoom.priceRange,
      securityDeposit: getValue("securityDeposit") || existingRoom.securityDeposit,
      roommatesWanted: getValue("roommatesWanted") || existingRoom.roommatesWanted,
      genderPreference: getValue("genderPreference") || existingRoom.genderPreference,
      habitPreferences: parseJSON("habitPreferences") || existingRoom.habitPreferences,
      purpose: parseJSON("purpose") || existingRoom.purpose,
      availableSpace: getValue("availableSpace") || existingRoom.availableSpace,
      pgGenderCategory: getValue("pgGenderCategory") || existingRoom.pgGenderCategory,
      roomTypesAvailable: parseJSON("roomTypesAvailable") || existingRoom.roomTypesAvailable,
    mealsProvided: parseJSON("mealsProvided") || existingRoom.mealsProvided,
      amenities: parseJSON("amenities") || existingRoom.amenities,
      rules: parseJSON("rules") || existingRoom.rules,
      propertyType: getValue("propertyType") || existingRoom.propertyType,
      furnishedStatus: getValue("furnishedStatus") || existingRoom.furnishedStatus,
      squareFeet: getValue("squareFeet") || existingRoom.squareFeet,
      bedrooms: getValue("bedrooms") || existingRoom.bedrooms,
      bathrooms: getValue("bathrooms") || existingRoom.bathrooms,
      balconies: getValue("balconies") || existingRoom.balconies,
      floorNumber: getValue("floorNumber") || existingRoom.floorNumber,
      totalFloors: getValue("totalFloors") || existingRoom.totalFloors,
      tenantPreference: getValue("tenantPreference") || existingRoom.tenantPreference,
      parking: getValue("parking") || existingRoom.parking,
      updatedAt: new Date()
    };

    // Remove undefined fields
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    // Update room
    const updatedRoom = await Room.findByIdAndUpdate(
      roomId,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name picture');

    console.log(`✅ ROOM UPDATED: ${roomId} with ${images.length} images`);

    res.json({
      success: true,
      message: 'Room updated successfully',
      room: {
        ...updatedRoom.toObject(),
        imageCount: updatedRoom.images.length,
        hasThumbnail: !!updatedRoom.thumbnail,
      },
    });

  } catch (error) {
    console.error("❌ Update Room Error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update room",
      error: error.message,
    });
  }
};

// ✅ SAFE DELETE FUNCTION
const safelyDeleteImagesFromS3 = async (imagesToDelete, roomId) => {
  try {
    for (const image of imagesToDelete) {
      const imageUrl = image.originalUrl;
      
      // Check if any other room is using this image
      const otherRoomsUsingImage = await Room.countDocuments({
        'images.originalUrl': imageUrl,
        _id: { $ne: roomId }
      });

      // Only delete if NO other rooms are using this image
      if (otherRoomsUsingImage === 0) {
        console.log(`🗑️ Deleting unused image: ${imageUrl}`);
        try {
          await deleteImageFromS3ByUrl(imageUrl);
          console.log(`✅ Successfully deleted: ${imageUrl}`);
        } catch (deleteError) {
          console.error(`❌ Failed to delete ${imageUrl}:`, deleteError.message);
          continue;
        }
      } else {
        console.log(`🔒 Keeping image (used by ${otherRoomsUsingImage} other rooms): ${imageUrl}`);
      }
    }
  } catch (error) {
    console.error('Error in safe image deletion:', error);
  }
};

// Helper to delete image from S3 by URL
const deleteImageFromS3ByUrl = async (imageUrl) => {
  try {
    const key = imageUrl.split('.amazonaws.com/')[1];
    await s3.deleteObject({
      Bucket: BUCKET_NAME,
      Key: key
    }).promise();
    console.log(`✅ Deleted from S3: ${key}`);
  } catch (error) {
    console.error('❌ Failed to delete from S3:', imageUrl, error);
  }
};



// controllers/roomController.js


// controllers/roomController.js
export const getRooms = async (req, res) => {
  try {
    const { 
      category, 
      lat, 
      lng, 
      limit = 15, 
      skip = 0,
      filters 
    } = req.query;

    if (!lat || !lng) {
      return res.status(400).json({ success: false, message: "lat & lng required" });
    }

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);

    // Build base match stage with location
    const baseMatchStage = {
      $and: [
        {
          $or: [
            { location: { $exists: true, $ne: null } },
            { 'location.coordinates': { $exists: true, $ne: null } }
          ]
        }
      ]
    };

    // Add category to base match if provided
    if (category && category !== 'all') {
      baseMatchStage.$and.push({ category });
    }

    // Parse and apply filters if provided
    let filterMatchStage = {};
    if (filters && filters !== '{}') {
      try {
        const filterData = JSON.parse(filters);
        const filterQuery = buildFilterQuery(filterData, category);
        
        // Only add filter query if it has valid conditions
        if (Object.keys(filterQuery).length > 0) {
          Object.assign(filterMatchStage, filterQuery);
        }
      } catch (parseError) {
        console.error("Filter parsing error:", parseError);
        return res.status(400).json({ success: false, message: "Invalid filter format" });
      }
    }

    // Combine base match with filter match
    const finalMatchStage = { ...baseMatchStage };
    if (Object.keys(filterMatchStage).length > 0) {
      finalMatchStage.$and.push(filterMatchStage);
    }

    // If no $and conditions remain, remove $and
    if (finalMatchStage.$and && finalMatchStage.$and.length === 0) {
      delete finalMatchStage.$and;
    }

    const aggregationPipeline = [
      {
        $geoNear: {
          near: { type: "Point", coordinates: [lngNum, latNum] },
          distanceField: "distance",
          spherical: true,
          distanceMultiplier: 0.001, // Convert to kilometers
          query: finalMatchStage.$and && finalMatchStage.$and.length > 0 ? finalMatchStage : {},
          maxDistance: 45000, // 45 km max search radius
        }
      },
      { 
        $sort: { 
          distance: 1, // Nearest first
          createdAt: -1 // Then by latest posts
        } 
      },
      { $skip: parseInt(skip) },
      { $limit: parseInt(limit) },
    ];

    console.log('Final aggregation pipeline:', JSON.stringify(aggregationPipeline, null, 2));
    const rooms = await Room.aggregate(aggregationPipeline);
    
    // Add distance info to each room
    const roomsWithDistanceInfo = rooms.map(room => {
      const straightLineDistance = room.distance; // in km
      
      // Calculate approximate road distance (straight-line * 1.4)
      const approximateRoadDistanceKm = straightLineDistance * 1.4;
      
      let individualDistance;
      let approximateRoadDistance;
      
      // If less than 1 km, show in meters
      if (approximateRoadDistanceKm < 1) {
        approximateRoadDistance = Math.round(approximateRoadDistanceKm * 1000); // Convert to meters
        individualDistance = `${approximateRoadDistance} m`;
      } else {
        approximateRoadDistance = Math.round(approximateRoadDistanceKm);
        individualDistance = `${approximateRoadDistance} km`;
      }
      
      return {
        ...room,
        approximateRoadDistance: approximateRoadDistance,
        individualDistance: individualDistance,
        distanceLabel: `${individualDistance} away`
      };
    });
    
    res.json({ 
      success: true, 
      rooms: roomsWithDistanceInfo,
      message: `Found ${rooms.length} rooms`,
      hasMore: rooms.length === parseInt(limit)
    });
  } catch (err) {
    console.error("Get Rooms Error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch rooms" });
  }
};

// Helper function to build filter queries based on category
function buildFilterQuery(filterData, category) {
  const query = {};
  
  Object.keys(filterData).forEach(key => {
    const filter = filterData[key];
    
    // Skip if filter is not selected or has no value
    if (!filter.selected) return;
    
    let filterQuery = null;

    if (category === 'shared') {
      filterQuery = buildSharedFilter(key, filter);
    } else if (category === 'pg_hostel') {
      filterQuery = buildPgFilter(key, filter);
    } else if (category === 'flat_home') {
      filterQuery = buildRentalFilter(key, filter);
    }

    if (filterQuery) {
      query[key] = filterQuery;
    }
  });
  
  console.log('Built filter query:', query);
  return query;
}

function buildSharedFilter(key, filter) {
  switch (key) {
    case 'monthlyRent':
    case 'roommatesWanted':
      return { 
        $gte: filter.currentMin || filter.min, 
        $lte: filter.currentMax || filter.max 
      };
    case 'genderPreference':
    case 'habitPreferences':
    case 'purpose':
      if (filter.options && Array.isArray(filter.options)) {
        const selectedOptions = filter.options
          .filter(opt => opt.selected)
          .map(opt => opt.label);
        return selectedOptions.length > 0 ? { $in: selectedOptions } : null;
      }
      return null;
    case 'showPhonePublic':
      return filter.value === true;
    default:
      return null;
  }
}

function buildPgFilter(key, filter) {
  switch (key) {
    case 'priceRange':
      return { 
        $gte: filter.currentMin || filter.min, 
        $lte: filter.currentMax || filter.max 
      };
    case 'pgGenderCategory':
    case 'roomTypesAvailable':
    case 'mealsProvided':
    case 'rules':
      if (filter.options && Array.isArray(filter.options)) {
        const selectedOptions = filter.options
          .filter(opt => opt.selected)
          .map(opt => opt.label);
        return selectedOptions.length > 0 ? { $in: selectedOptions } : null;
      }
      return null;
    default:
      return null;
  }
}

function buildRentalFilter(key, filter) {
  switch (key) {
    case 'monthlyRent':
    case 'securityDeposit':
    case 'squareFeet':
    case 'bedrooms':
    case 'bathrooms':
      return { 
        $gte: filter.currentMin || filter.min, 
        $lte: filter.currentMax || filter.max 
      };
    case 'propertyType':
    case 'furnishedStatus':
    case 'preferredTenant':
      if (filter.options && Array.isArray(filter.options)) {
        const selectedOptions = filter.options
          .filter(opt => opt.selected)
          .map(opt => opt.label);
        return selectedOptions.length > 0 ? { $in: selectedOptions } : null;
      }
      return null;
    default:
      return null;
  }
}

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


export const incrementRoomView = async (req, res) => {
  console.log("Increment Room View Controller Hit");
  
  try {
    const { roomId } = req.params; // roomId from URL params
    const { userId } = req.body;   // userId from request body
   
    const room = await Room.findById(roomId);

    if (!room) {
      return res.status(404).json({ success: false, message: "Room not found" });
    }

    // ✅ Only increment if user hasn't viewed before
    if (userId && !room.viewedBy.includes(userId)) {
      room.views += 1;
      room.viewedBy.push(userId);
      await room.save();
    }

    // ✅ If user is not logged in, you can still increment view (optional)
    if (!userId) {
      room.views += 1;
      await room.save();
    }

    res.status(200).json({
      success: true,
      message: "View count updated",
      views: room.views,
    });
  } catch (error) {
    console.error("❌ Error incrementing room view:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const addFavorite = async (req, res) => {
  try {
    const { roomId } = req.body;
    const userId = req.user._id;

    console.log(`❤️ ADD FAVORITE: User ${userId} → Room ${roomId}`);

    // Validation
    if (!roomId) {
      return res.status(400).json({ 
        success: false,
        message: 'Room ID is required' 
      });
    }

    // Check if room exists
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ 
        success: false,
        message: 'Room not found' 
      });
    }

    // Check if already favorited
    if (room.favorites.includes(userId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Room already in favorites' 
      });
    }

    // Add user to favorites array
    room.favorites.push(userId);
    await room.save();

    console.log(`✅ FAVORITE ADDED to room: ${roomId}`);

    res.status(201).json({
      success: true,
      message: 'Room added to favorites successfully',
      roomId: roomId,
      isFavorited: true
    });

  } catch (error) {
    console.error('❌ Error adding favorite:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to add favorite', 
      error: error.message 
    });
  }
};

// ✅ REMOVE FROM FAVORITES
export const removeFavorite = async (req, res) => {
  try {
    const { roomId } = req.body;
    const userId = req.user._id;

    console.log(`🗑️ REMOVE FAVORITE: User ${userId} → Room ${roomId}`);

    // Validation
    if (!roomId) {
      return res.status(400).json({ 
        success: false,
        message: 'Room ID is required' 
      });
    }

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ 
        success: false,
        message: 'Room not found' 
      });
    }

    // Check if actually favorited
    if (!room.favorites.includes(userId)) {
      return res.status(404).json({ 
        success: false,
        message: 'Room not in favorites' 
      });
    }

    // Remove user from favorites array
    room.favorites = room.favorites.filter(favId => !favId.equals(userId));
    await room.save();

    console.log(`✅ FAVORITE REMOVED from room: ${roomId}`);

    res.json({
      success: true,
      message: 'Room removed from favorites successfully',
      roomId: roomId,
      isFavorited: false
    });

  } catch (error) {
    console.error('❌ Error removing favorite:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to remove favorite', 
      error: error.message 
    });
  }
};

// ✅ TOGGLE FAVORITE (Add/Remove in one endpoint)
export const toggleFavorite = async (req, res) => {
  try {
    const { roomId } = req.body;
    const userId = req.user._id;

    console.log(`🔄 TOGGLE FAVORITE: User ${userId} → Room ${roomId}`);

    if (!roomId) {
      return res.status(400).json({ 
        success: false,
        message: 'Room ID is required' 
      });
    }

    // Check if room exists
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ 
        success: false,
        message: 'Room not found' 
      });
    }

    const isCurrentlyFavorited = room.favorites.includes(userId);
    let action = '';

    if (isCurrentlyFavorited) {
      // Remove from favorites
      room.favorites = room.favorites.filter(favId => !favId.equals(userId));
      action = 'removed';
      console.log(`✅ FAVORITE REMOVED: ${roomId}`);
    } else {
      // Add to favorites
      room.favorites.push(userId);
      action = 'added';
      console.log(`✅ FAVORITE ADDED: ${roomId}`);
    }

    await room.save();

    res.json({
      success: true,
      message: `Room ${action} from favorites successfully`,
      isFavorited: !isCurrentlyFavorited,
      roomId: roomId
    });

  } catch (error) {
    console.error('❌ Error toggling favorite:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to toggle favorite', 
      error: error.message 
    });
  }
};

// ✅ GET USER'S FAVORITES
export const getMyFavorites = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    console.log(`📚 GET FAVORITES: User ${userId} - Page ${page}`);

    // Find rooms where user ID is in favorites array
    const favoriteRooms = await Room.find({ 
      favorites: userId,
      isActive: true,
      isBlocked: false 
    })
      .populate('createdBy', 'name picture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Room.countDocuments({ 
      favorites: userId,
      isActive: true,
      isBlocked: false 
    });

    console.log(`✅ FAVORITES FETCHED: ${favoriteRooms.length} rooms`);

    res.json({
      success: true,
      favorites: favoriteRooms,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching favorites:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch favorites', 
      error: error.message 
    });
  }
};

// ✅ CHECK IF ROOM IS FAVORITED
export const checkFavorite = async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    console.log(`🔍 CHECK FAVORITE: User ${userId} → Room ${roomId}`);

    const room = await Room.findOne({
      _id: roomId,
      favorites: userId
    });

    const isFavorited = !!room;

    console.log(`✅ FAVORITE STATUS: ${isFavorited}`);

    res.json({
      success: true,
      isFavorited
    });

  } catch (error) {
    console.error('❌ Error checking favorite:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to check favorite status', 
      error: error.message 
    });
  }
};

// ✅ GET FAVORITE COUNT FOR A ROOM
export const getFavoriteCount = async (req, res) => {
  try {
    const { roomId } = req.params;

    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ 
        success: false,
        message: 'Room not found' 
      });
    }

    const count = room.favorites.length;

    res.json({
      success: true,
      count,
      roomId
    });

  } catch (error) {
    console.error('❌ Error counting favorites:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to get favorite count', 
      error: error.message 
    });
  }
};