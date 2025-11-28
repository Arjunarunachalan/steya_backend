import express from 'express';
import Room from '../models/RoomSchema.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import ChatRoom from '../models/RoomChatmodal.js';
const router = express.Router();

// ✅ GET user's posts with pagination and filtering
router.get('/my-posts', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status; // active, inactive, all
    const category = req.query.category; // shared, pg_hostel, flat_home

    console.log(`📝 Fetching posts for user: ${userId}, Status: ${status}, Category: ${category}`);

    // Build query - EXCLUDE DELETED POSTS
    let query = { 
      createdBy: userId,
      isDeleted: { $ne: true } // This excludes soft-deleted posts
    };
    
    // Filter by status
    if (status && status !== 'all') {
      if (status === 'active') {
        query.isActive = true;
      } else if (status === 'inactive') {
        query.isActive = false;
      }
    }

    // Filter by category
    if (category && category !== 'all') {
      query.category = category;
    }

    const posts = await Room.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Room.countDocuments(query);

    console.log(`✅ Found ${posts.length} posts for user ${userId}`);

    res.json({
      success: true,
      posts: posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('❌ Error fetching user posts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch your posts',
      error: error.message
    });
  }
});

// ✅ GET post statistics
router.get('/my-posts-stats', authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    const stats = await Room.aggregate([
      {
        $match: { createdBy: mongoose.Types.ObjectId(userId) }
      },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          totalViews: { $sum: '$views' },
          totalLikes: { $sum: { $size: '$likes' } },
          totalFavorites: { $sum: { $size: '$favorites' } }
        }
      }
    ]);

    const totalPosts = await Room.countDocuments({ createdBy: userId });
    const activePosts = await Room.countDocuments({ 
      createdBy: userId, 
      isActive: true 
    });
    const inactivePosts = await Room.countDocuments({ 
      createdBy: userId, 
      isActive: false 
    });

    // Calculate expiring soon (within 7 days)
    // ⚠️ EXCLUDE PG/HOSTEL CATEGORY - no expiry for pg_hostel
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

    const expiringSoon = await Room.countDocuments({
      createdBy: userId,
      isActive: true,
      category: { $ne: 'pg_hostel' }, // Exclude PG/Hostel from expiry
      expiryDate: {
        $lte: sevenDaysFromNow,
        $gte: new Date()
      }
    });

    res.json({
      success: true,
      stats: {
        total: totalPosts,
        active: activePosts,
        inactive: inactivePosts,
        expiringSoon: expiringSoon,
        byCategory: stats,
        summary: {
          totalViews: stats.reduce((sum, cat) => sum + cat.totalViews, 0),
          totalLikes: stats.reduce((sum, cat) => sum + cat.totalLikes, 0),
          totalFavorites: stats.reduce((sum, cat) => sum + cat.totalFavorites, 0)
        }
      }
    });

  } catch (error) {
    console.error('❌ Error fetching post stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch post statistics',
      error: error.message
    });
  }
});

// ✅ TOGGLE post active status
router.patch('/my-posts/:postId/toggle-status', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    const post = await Room.findOne({
      _id: postId,
      createdBy: userId
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or access denied'
      });
    }

    // Toggle status
    post.isActive = !post.isActive;
    await post.save();

    res.json({
      success: true,
      message: `Post ${post.isActive ? 'activated' : 'deactivated'} successfully`,
      post: {
        _id: post._id,
        isActive: post.isActive,
        title: post.title
      }
    });

  } catch (error) {
    console.error('❌ Error toggling post status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update post status',
      error: error.message
    });
  }
});


// ✅ RENEW post (extend expiry date)
// ⚠️ PG/HOSTEL CATEGORY cannot be renewed (no expiry)
router.patch('/my-posts/:postId/renew', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    const post = await Room.findOne({
      _id: postId,
      createdBy: userId
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or access denied'
      });
    }

    // ⚠️ PREVENT RENEWAL OF PG/HOSTEL POSTS
    if (post.category === 'pg_hostel') {
      return res.status(400).json({
        success: false,
        message: 'PG/Hostel posts do not have expiry and cannot be renewed'
      });
    }

    // Extend by 30 days from now
    const newExpiryDate = new Date();
    newExpiryDate.setDate(newExpiryDate.getDate() + 30);

    post.expiryDate = newExpiryDate;
    post.isActive = true; // Ensure it's active after renewal
    await post.save();

    res.json({
      success: true,
      message: 'Post renewed successfully for 30 days',
      post: {
        _id: post._id,
        expiryDate: post.expiryDate,
        isActive: post.isActive,
        title: post.title
      }
    });

  } catch (error) {
    console.error('❌ Error renewing post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to renew post',
      error: error.message
    });
  }
});


// ✅ DELETE user's post
router.delete('/my-posts/:postId', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    // Find the post first to verify ownership
    const post = await Room.findOne({
      _id: postId,
      createdBy: userId
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or access denied'
      });
    }

    // Instead of deleting, mark the post as deleted with expiry date
    const deletedPost = await Room.findByIdAndUpdate(
      postId,
      {
        isDeleted: true,
        deletedAt: new Date(),
        deleteExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) // 3 days from now
      },
      { new: true }
    );

    // Mark all associated chat rooms as deleted
    await ChatRoom.updateMany(
      { productId: postId },
      {
        isDeleted: true,
        deletedAt: new Date(),
        deleteExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
        status: 'expired' // Change status to expired
      }
    );

    res.json({
      success: true,
      message: 'Post marked as deleted. Associated chats will be removed in 3 days.',
      postId: postId,
      deletedAt: deletedPost.deletedAt
    });

  } catch (error) {
    console.error('❌ Error soft deleting post:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete post',
      error: error.message
    });
  }
});


// ✅ GET single post details (for editing)
router.get('/my-posts/:postId/details', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const userId = req.user._id;

    const post = await Room.findOne({
      _id: postId,
      createdBy: userId
    });

    if (!post) {
      return res.status(404).json({
        success: false,
        message: 'Post not found or access denied'
      });
    }

    res.json({
      success: true,
      post: post
    });

  } catch (error) {
    console.error('❌ Error fetching post details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch post details',
      error: error.message
    });
  }
});

export default router;