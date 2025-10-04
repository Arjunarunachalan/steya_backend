import express from 'express';
import Favorite from '../models/Favorite.js';
import Room from '../models/RoomSchema.js'; // Your room model
import { authMiddleware } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ✅ ADD TO FAVORITES
router.post('/add', authMiddleware, async (req, res) => {
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
    const existingFavorite = await Favorite.findOne({
      user: userId,
      room: roomId
    });

    if (existingFavorite) {
      return res.status(400).json({ 
        success: false,
        message: 'Room already in favorites' 
      });
    }

    // Create new favorite
    const favorite = new Favorite({
      user: userId,
      room: roomId
    });

    await favorite.save();

    // Populate room details for response
    await favorite.populate({
      path: 'room',
      select: 'title thumbnail monthlyRent description location createdAt',
      populate: {
        path: 'owner',
        select: 'name picture'
      }
    });

    console.log(`✅ FAVORITE ADDED: ${favorite._id}`);

    res.status(201).json({
      success: true,
      message: 'Room added to favorites successfully',
      favorite: favorite
    });

  } catch (error) {
    console.error('❌ Error adding favorite:', error);
    
    if (error.code === 11000) {
      return res.status(400).json({ 
        success: false,
        message: 'Room already in favorites' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Failed to add favorite', 
      error: error.message 
    });
  }
});

// ✅ REMOVE FROM FAVORITES
router.delete('/remove', authMiddleware, async (req, res) => {
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

    const favorite = await Favorite.findOneAndDelete({
      user: userId,
      room: roomId
    });

    if (!favorite) {
      return res.status(404).json({ 
        success: false,
        message: 'Favorite not found' 
      });
    }

    console.log(`✅ FAVORITE REMOVED: ${favorite._id}`);

    res.json({
      success: true,
      message: 'Room removed from favorites successfully',
      roomId: roomId
    });

  } catch (error) {
    console.error('❌ Error removing favorite:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to remove favorite', 
      error: error.message 
    });
  }
});

// ✅ TOGGLE FAVORITE (Add/Remove in one endpoint)
router.post('/toggle', authMiddleware, async (req, res) => {
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

    // Check if already favorited
    const existingFavorite = await Favorite.findOne({
      user: userId,
      room: roomId
    });

    let action = '';
    let result;

    if (existingFavorite) {
      // Remove from favorites
      await Favorite.findByIdAndDelete(existingFavorite._id);
      action = 'removed';
      result = { isFavorited: false };
      console.log(`✅ FAVORITE REMOVED: ${existingFavorite._id}`);
    } else {
      // Add to favorites
      const newFavorite = new Favorite({
        user: userId,
        room: roomId
      });
      await newFavorite.save();
      
      // Populate the new favorite
  await newFavorite.populate({
  path: 'room',
  select: 'title thumbnail monthlyRent description location createdAt',
  populate: {
    path: 'createdBy', // ✅ matches Room schema
    select: 'name picture'
  }
 });

      
      action = 'added';
      result = { isFavorited: true, favorite: newFavorite };
      console.log(`✅ FAVORITE ADDED: ${newFavorite._id}`);
    }

    res.json({
      success: true,
      message: `Room ${action} from favorites successfully`,
      ...result
    });

  } catch (error) {
    console.error('❌ Error toggling favorite:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to toggle favorite', 
      error: error.message 
    });
  }
});


// ✅ GET USER'S FAVORITES
router.get('/my-favorites', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    console.log(`📚 GET FAVORITES: User ${userId} - Page ${page}`);

    const favorites = await Favorite.find({ user: userId })
      .populate({
        path: 'room',
        // 👇 Removed select so all fields are included
        populate: {
          path: 'createdBy',
          select: 'name picture'
        }
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Favorite.countDocuments({ user: userId });

    // Filter out favorites where room might be deleted
    const validFavorites = favorites.filter(fav => fav.room !== null);

    console.log(`✅ FAVORITES FETCHED: ${validFavorites} `);

    res.json({
      success: true,
      favorites: validFavorites,
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
});


// ✅ CHECK IF ROOM IS FAVORITED
router.get('/check/:roomId', authMiddleware, async (req, res) => {
  try {
    const { roomId } = req.params;
    const userId = req.user._id;

    console.log(`🔍 CHECK FAVORITE: User ${userId} → Room ${roomId}`);

    const favorite = await Favorite.findOne({
      user: userId,
      room: roomId
    });

    const isFavorited = !!favorite;

    console.log(`✅ FAVORITE STATUS: ${isFavorited}`);

    res.json({
      success: true,
      isFavorited,
      favorite: favorite || null
    });

  } catch (error) {
    console.error('❌ Error checking favorite:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to check favorite status', 
      error: error.message 
    });
  }
});

// ✅ GET FAVORITE COUNT FOR A ROOM
router.get('/count/:roomId', async (req, res) => {
  try {
    const { roomId } = req.params;

    const count = await Favorite.countDocuments({ room: roomId });

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
});

export default router;