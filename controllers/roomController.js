import B2 from "backblaze-b2";
import sharp from "sharp";
import fs from "fs";
import path from "path";
import Room from '../models/RoomSchema.js';
import { v4 as uuidv4 } from 'uuid';
import dotenv from 'dotenv';
dotenv.config();

// 🔍 DEBUG: Check all B2 environment variables
console.log("🔍 B2 Environment Variables Check:", {
  B2_APP_KEY_ID: process.env.B2_APP_KEY_ID || "❌ NOT SET",
  B2_APP_KEY: process.env.B2_APP_KEY || "❌ NOT SET", 
  B2_BUCKET_ID: process.env.B2_BUCKET_ID || "❌ NOT SET",
  B2_BUCKET_NAME: process.env.B2_BUCKET_NAME || "❌ NOT SET",
  CDN_URL: process.env.CDN_URL || "❌ NOT SET"
});


// Initialize B2 client
const b2 = new B2({
  applicationKeyId: process.env.B2_APP_KEY_ID,
  applicationKey: process.env.B2_APP_KEY,
});

const BUCKET_ID = process.env.B2_BUCKET_ID;
const BUCKET_NAME = process.env.B2_BUCKET_NAME;
const CDN_URL = process.env.CDN_URL; // Your Cloudflare Worker URL

// Validate required environment variables
if (!BUCKET_ID) {
  throw new Error("B2_BUCKET_ID environment variable is not set!");
}
if (!BUCKET_NAME) {
  throw new Error("B2_BUCKET_NAME environment variable is not set!");
}
if (!process.env.B2_APP_KEY_ID) {
  throw new Error("B2_APP_KEY_ID environment variable is not set!");
}
if (!process.env.B2_APP_KEY) {
  throw new Error("B2_APP_KEY environment variable is not set!");
}
if (!CDN_URL) {
  throw new Error("CDN_URL environment variable is not set!");
}

const watermarkPath = path.join(process.cwd(), "assets/watermark.png");

// 🔐 B2 Authorization Helper (reuse token for 24 hours)
let b2AuthToken = null;
let b2UploadUrl = null;
let b2AuthExpiry = null;

async function getB2Auth() {
  // Reuse token if still valid (expires after 24 hours)
  if (b2AuthToken && b2UploadUrl && b2AuthExpiry && Date.now() < b2AuthExpiry) {
    return { authToken: b2AuthToken, uploadUrl: b2UploadUrl };
  }

  // Get new authorization
  await b2.authorize();
  
  const uploadUrlResponse = await b2.getUploadUrl({
    bucketId: BUCKET_ID,
  });

  b2AuthToken = uploadUrlResponse.data.authorizationToken;
  b2UploadUrl = uploadUrlResponse.data.uploadUrl;
  b2AuthExpiry = Date.now() + (23 * 60 * 60 * 1000); // 23 hours (be safe)

  return { authToken: b2AuthToken, uploadUrl: b2UploadUrl };
}

// 📤 Upload to B2 Helper
async function uploadToB2(buffer, fileName, contentType = "image/jpeg") {
  const { authToken, uploadUrl } = await getB2Auth();

  const response = await b2.uploadFile({
    uploadUrl: uploadUrl,
    uploadAuthToken: authToken,
    fileName: fileName,
    data: buffer,
    mime: contentType,
  });

  // Return CDN URL instead of B2 direct URL
  return `${CDN_URL}/${fileName}`;
}

// 🗑️ Delete from B2 Helper (for updates)
async function deleteFromB2(fileUrl) {
  try {
    // ⚠️ SAFETY: Skip S3 URLs (legacy data)
    if (fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.')) {
      console.log(`⚠️ Skipping S3 URL (legacy data): ${fileUrl}`);
      return;
    }

    // ⚠️ SAFETY: Only delete if it's a B2/CDN URL
    if (!fileUrl.includes(CDN_URL)) {
      console.log(`⚠️ Skipping non-B2 URL: ${fileUrl}`);
      return;
    }

    // Extract filename from URL
    const fileName = fileUrl.replace(`${CDN_URL}/`, '').split('?')[0];
    
    await b2.authorize();
    
    // Get file info
    const fileList = await b2.listFileNames({
      bucketId: BUCKET_ID,
      maxFileCount: 1,
      prefix: fileName,
    });

    if (fileList.data.files.length > 0) {
      const fileId = fileList.data.files[0].fileId;
      await b2.deleteFileVersion({
        fileId: fileId,
        fileName: fileName,
      });
      console.log(`✅ Deleted from B2: ${fileName}`);
    }
  } catch (error) {
    console.error(`❌ Error deleting from B2:`, error.message);
  }
}

// 🗑️ Safe batch delete (used in updateRoom)
async function safelyDeleteImagesFromB2(imagesToDelete, roomId) {
  console.log(`🗑️ Deleting ${imagesToDelete.length} images from B2 for room ${roomId}`);
  
  for (const img of imagesToDelete) {
    if (img.originalUrl) {
      await deleteFromB2(img.originalUrl);
    }
  }
}

export const uploadRooms = async (req, res) => {
  try {
    let images = [];
    let thumbnail = null;

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

      // ✅ BETTER QUALITY - Resize + watermark main image
   let mainBuffer = await sharp(file.buffer)
  .resize({ 
    width: 1280, 
    withoutEnlargement: true,
    fit: 'inside'  // ← ADD THIS - keeps aspect ratio, no cropping
  })
  .jpeg({ quality: 85 })
  .toBuffer();

      if (fs.existsSync(watermarkPath)) {
        const watermarkBuffer = await sharp(watermarkPath).resize(200).png().toBuffer();
        mainBuffer = await sharp(mainBuffer)
          .composite([{ input: watermarkBuffer, gravity: "southeast", blend: "overlay" }])
          .toBuffer();
      }

      // 📤 Upload main image to B2
      const mainKey = `properties/${uuidv4()}-${Date.now()}-main.jpg`;
      const mainUrl = await uploadToB2(mainBuffer, mainKey, "image/jpeg");

      // ✅ FIRST IMAGE = HIGH QUALITY THUMBNAIL
   if (i === 0) {
  const thumbBuffer = await sharp(file.buffer)
    .resize({ 
      width: 800, 
      withoutEnlargement: true,
      fit: 'inside'  // ← ADD THIS
    })
    .jpeg({ quality: 90 })
    .toBuffer();

        const thumbKey = `properties/thumbs/${uuidv4()}-${Date.now()}-thumb.jpg`;
        const thumbUrl = await uploadToB2(thumbBuffer, thumbKey, "image/jpeg");

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

    // ✅ AUTO-SET EXPIRY DATE (30 days from now)
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);

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
      expiryDate: getValue("expiryDate") || expiryDate,
      createdBy: req.user.id,
    };

    const room = new Room(roomData);
    console.log('====================================');
    console.log(roomData, "Room Data");
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
    console.log('🔍 COMPLETE REQUEST DEBUG:');
    console.log('1. req.files:', req.files);
    console.log('2. req.body keys:', Object.keys(req.body));
    console.log('3. req.body existingImages:', req.body.existingImages);
    
    const { roomId } = req.params;
    const userId = req.user.id;

    console.log(`🔄 UPDATE ROOM: User ${userId} → Room ${roomId}`);

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

    const existingImagesToKeep = req.body.existingImages ? JSON.parse(req.body.existingImages) : [];
    
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

    const imagesToDelete = existingRoom.images.filter(existingImg => 
      !existingImagesToKeep.includes(existingImg.originalUrl)
    );

    console.log('🗑️ Images to delete from B2:', imagesToDelete.length);

    if (imagesToDelete.length > 0) {
      await safelyDeleteImagesFromB2(imagesToDelete, roomId);
    }

    let images = [];
    let thumbnail = null;

    existingImagesToKeep.forEach(url => {
      images.push({ originalUrl: url });
    });

    if (imageFiles.length > 0) {
      console.log('📤 Processing new images:', imageFiles.length);

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];

        if (!file.buffer || file.buffer.length === 0) continue;

        // ✅ BETTER QUALITY - Resize + watermark main image
      let mainBuffer = await sharp(file.buffer)
  .resize({ 
    width: 1280, 
    withoutEnlargement: true,
    fit: 'inside'  // ← ADD THIS - keeps aspect ratio, no cropping
  })
  .jpeg({ quality: 85 })
  .toBuffer();

        if (fs.existsSync(watermarkPath)) {
          const watermarkBuffer = await sharp(watermarkPath).resize(200).png().toBuffer();
          mainBuffer = await sharp(mainBuffer)
            .composite([{ input: watermarkBuffer, gravity: "southeast", blend: "overlay" }])
            .toBuffer();
        }

        const mainKey = `properties/${uuidv4()}-${Date.now()}-${i}-main.jpg`;
        const mainUrl = await uploadToB2(mainBuffer, mainKey, "image/jpeg");

        // ✅ HIGH QUALITY THUMBNAIL
        if (i === 0 && images.length === 0) {
          const thumbBuffer = await sharp(file.buffer)
            .resize({ width: 800, withoutEnlargement: true })
            .jpeg({ quality: 90 })
            .toBuffer();

          const thumbKey = `properties/thumbs/${uuidv4()}-${Date.now()}-thumb.jpg`;
          const thumbUrl = await uploadToB2(thumbBuffer, thumbKey, "image/jpeg");

          thumbnail = { url: thumbUrl };
        }

        images.push({ originalUrl: mainUrl });
      }
    }

    // ✅ Process separate thumbnail upload
    if (req.files && req.files.thumbnail && !thumbnail) {
      const thumbFile = Array.isArray(req.files.thumbnail) ? req.files.thumbnail[0] : req.files.thumbnail;
      
      const thumbBuffer = await sharp(thumbFile.buffer)
        .resize({ width: 800, withoutEnlargement: true })
        .jpeg({ quality: 90 })
        .toBuffer();

      const thumbKey = `properties/thumbs/${uuidv4()}-${Date.now()}-thumb.jpg`;
      const thumbUrl = await uploadToB2(thumbBuffer, thumbKey, "image/jpeg");

      thumbnail = { url: thumbUrl };
    }

    if (images.length > 0 && !thumbnail) {
      if (existingImagesToKeep.length > 0) {
        thumbnail = { url: existingImagesToKeep[0] };
      } else if (images.length > 0) {
        thumbnail = { url: images[0].originalUrl };
      }
    }

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

    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

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
          .map(opt => opt.value); // ✅ Use 'value' instead of 'label'
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
      // ✅ SIMPLE FIX: Just check if property's price range overlaps with filter
      return {
        'priceRange.min': { $lte: filter.currentMax || filter.max },
        'priceRange.max': { $gte: filter.currentMin || filter.min }
      };
      
    case 'pgGenderCategory':
    case 'roomTypesAvailable':
    case 'mealsProvided':
    case 'amenities':
    case 'rules':
      if (filter.options && Array.isArray(filter.options)) {
        const selectedOptions = filter.options
          .filter(opt => opt.selected)
          .map(opt => opt.value); // ✅ Use 'value' instead of 'label'
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
    case 'tenantPreference': // ✅ FIXED: Changed from 'preferredTenant'
    case 'parking':
      if (filter.options && Array.isArray(filter.options)) {
        const selectedOptions = filter.options
          .filter(opt => opt.selected)
          .map(opt => opt.value); // ✅ Use 'value' instead of 'label'
        return selectedOptions.length > 0 ? { $in: selectedOptions } : null;
      }
      return null;
    default:
      return null;
  }
}


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

    // Build base match stage with location AND exclusion filters
    const baseMatchStage = {
      $and: [
        {
          $or: [
            { location: { $exists: true, $ne: null } },
            { 'location.coordinates': { $exists: true, $ne: null } }
          ]
        },
        // Exclude deleted rooms
        { 
          $or: [
            { isDeleted: { $exists: false } },
            { isDeleted: false }
          ]
        },
        // Exclude blocked rooms
        { 
          $or: [
            { isBlocked: { $exists: false } },
            { isBlocked: false }
          ]
        },
        // Only include active rooms
        { 
          $or: [
            { isActive: { $exists: false } },
            { isActive: true }
          ]
        },
        // Exclude expired rooms
        {
          $or: [
            { expiryDate: { $exists: false } },
            { expiryDate: { $gt: new Date() } }
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