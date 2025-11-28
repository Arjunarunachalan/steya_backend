// services/autoCleanupService.js
import mongoose from 'mongoose';
import Room from '../models/RoomSchema.js';
import ChatRoom from '../models/RoomChatmodal.js';
import Chat from '../models/chatmodal.js';
import B2 from 'backblaze-b2';

// ✅ FIXED: Use correct environment variable names
const b2 = new B2({
  applicationKeyId: process.env.B2_APP_KEY_ID,
  applicationKey: process.env.B2_APP_KEY,
});

const BUCKET_ID = process.env.B2_BUCKET_ID;
const CDN_URL = process.env.CDN_URL;

// Validate environment variables
if (!process.env.B2_APP_KEY_ID || !process.env.B2_APP_KEY || !BUCKET_ID || !CDN_URL) {
  console.error('❌ Missing B2 environment variables!');
  console.error({
    B2_APP_KEY_ID: process.env.B2_APP_KEY_ID ? '✅' : '❌',
    B2_APP_KEY: process.env.B2_APP_KEY ? '✅' : '❌',
    B2_BUCKET_ID: BUCKET_ID ? '✅' : '❌',
    CDN_URL: CDN_URL ? '✅' : '❌'
  });
}

// 🗑️ Delete single file from B2
async function deleteFromB2(fileUrl) {
  try {
    // ⚠️ SAFETY: Skip S3 URLs (legacy data)
    if (fileUrl.includes('s3.amazonaws.com') || fileUrl.includes('.s3.')) {
      console.log(`⚠️ Skipping S3 URL (legacy data): ${fileUrl}`);
      return true; // Return true so it doesn't count as failure
    }

    // ⚠️ SAFETY: Only delete if it's a B2/CDN URL
    if (!fileUrl.includes(CDN_URL)) {
      console.log(`⚠️ Skipping non-B2 URL: ${fileUrl}`);
      return true; // Return true so it doesn't count as failure
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
      return true;
    } else {
      console.log(`⚠️ File not found in B2: ${fileName}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error deleting from B2:`, error.message);
    return false;
  }
}

// 🗑️ Batch delete images from B2
async function safelyDeleteImagesFromB2(imagesToDelete, roomId) {
  console.log(`🗑️ Deleting ${imagesToDelete.length} images from B2 for room ${roomId}`);
  
  let successCount = 0;
  let failCount = 0;

  for (const img of imagesToDelete) {
    if (img.originalUrl) {
      const success = await deleteFromB2(img.originalUrl);
      if (success) successCount++;
      else failCount++;
    }
  }

  console.log(`✅ Deleted ${successCount}/${imagesToDelete.length} images (${failCount} failed)`);
  return { successCount, failCount };
}

export class AutoCleanupService {
  // Clean up all expired and deleted data
  async cleanupExpiredData() {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      console.log('🕒 Starting auto-cleanup...', {
        now: now.toISOString(),
        thirtyDaysAgo: thirtyDaysAgo.toISOString()
      });

      // ✅ SCENARIO 1 & 2: Find posts that need to be deleted
      // ⚠️ SKIP PG/HOSTEL CATEGORY - no expiry for pg_hostel
      const postsToDelete = await Room.find({
        $or: [
          // SCENARIO 1: Posts that expired naturally and user didn't renew within 30 days
          // EXCLUDE pg_hostel category from expiry
          {
            expiryDate: { $lt: thirtyDaysAgo },
            isDeleted: false,
            category: { $ne: 'pg_hostel' }
          },
          // SCENARIO 2: Posts manually deleted by user (soft delete) - delete after 3 days
          {
            isDeleted: true,
            deleteExpiresAt: { $lte: now }
          }
        ]
      }).session(session);

      console.log(`📝 Found ${postsToDelete.length} posts to delete permanently`);

      let totalDeletedChatRooms = 0;
      let totalDeletedMessages = 0;
      let deletedPostsCount = 0;
      let deletedImagesCount = 0;
      let failedImagesCount = 0;

      // Process each post and its associated data
      for (const post of postsToDelete) {
        try {
          const postId = post._id;
          
          console.log(`🔄 Processing post ${postId} (${post.isDeleted ? 'SCENARIO 2: Manually deleted' : 'SCENARIO 1: Expired naturally'})`);

          // 🖼️ DELETE ALL IMAGES FROM BACKBLAZE B2
          if (post.images && post.images.length > 0) {
            const imageDeleteResult = await safelyDeleteImagesFromB2(post.images, postId);
            deletedImagesCount += imageDeleteResult.successCount;
            failedImagesCount += imageDeleteResult.failCount;
          }

          // Delete thumbnail if exists
          if (post.thumbnail?.url) {
            try {
              const success = await deleteFromB2(post.thumbnail.url);
              if (success) deletedImagesCount++;
              else failedImagesCount++;
            } catch (imgError) {
              console.error(`❌ Failed to delete thumbnail:`, imgError);
              failedImagesCount++;
            }
          }

          // Get all chat rooms associated with this post
          const chatRooms = await ChatRoom.find({ 
            productId: postId 
          }).session(session);
          
          const chatRoomIds = chatRooms.map(room => room._id);

          // Delete all messages in those chat rooms
          if (chatRoomIds.length > 0) {
            const messageResult = await Chat.deleteMany({ 
              roomId: { $in: chatRoomIds } 
            }).session(session);
            totalDeletedMessages += messageResult.deletedCount;
            console.log(`  💬 Deleted ${messageResult.deletedCount} messages`);
          }

          // Delete all chat rooms
          const chatRoomResult = await ChatRoom.deleteMany({ 
            productId: postId 
          }).session(session);
          totalDeletedChatRooms += chatRoomResult.deletedCount;
          console.log(`  🗨️ Deleted ${chatRoomResult.deletedCount} chat rooms`);

          // Finally delete the post from database
          await Room.findByIdAndDelete(postId).session(session);
          deletedPostsCount++;

          console.log(`✅ Successfully cleaned up post ${postId}`);

        } catch (postError) {
          console.error(`❌ Error cleaning up post ${post._id}:`, postError);
          // Continue with other posts even if one fails
        }
      }

      // Clean up orphaned chat rooms
      const orphanedChatRooms = await ChatRoom.find({
        isDeleted: true,
        deleteExpiresAt: { $lte: now }
      }).session(session);

      console.log(`💬 Found ${orphanedChatRooms.length} orphaned chat rooms to delete`);

      let deletedOrphanedChats = 0;
      let deletedOrphanedMessages = 0;

      for (const chatRoom of orphanedChatRooms) {
        try {
          const messageResult = await Chat.deleteMany({ 
            roomId: chatRoom._id 
          }).session(session);
          deletedOrphanedMessages += messageResult.deletedCount;

          await ChatRoom.findByIdAndDelete(chatRoom._id).session(session);
          deletedOrphanedChats++;

        } catch (chatError) {
          console.error(`❌ Error cleaning up chat room ${chatRoom._id}:`, chatError);
        }
      }

      await session.commitTransaction();
      
      const finalStats = {
        deletedPosts: deletedPostsCount,
        deletedChatRooms: totalDeletedChatRooms + deletedOrphanedChats,
        deletedMessages: totalDeletedMessages + deletedOrphanedMessages,
        deletedImages: deletedImagesCount,
        failedImages: failedImagesCount,
        deletedOrphanedChats: deletedOrphanedChats,
        deletedOrphanedMessages: deletedOrphanedMessages,
        timestamp: new Date().toISOString()
      };

      console.log('🎉 Auto-cleanup completed:', finalStats);

      return finalStats;

    } catch (error) {
      await session.abortTransaction();
      console.error('❌ Error in auto-cleanup service:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }

  // Get cleanup statistics
  async getCleanupStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const expiredPostsNaturally = await Room.countDocuments({
      expiryDate: { $lt: thirtyDaysAgo },
      isDeleted: false,
      category: { $ne: 'pg_hostel' } // Exclude PG/Hostel from expiry
    });

    const deletedPostsReady = await Room.countDocuments({
      isDeleted: true,
      deleteExpiresAt: { $lte: now }
    });

    const readyForDeletionChats = await ChatRoom.countDocuments({
      isDeleted: true,
      deleteExpiresAt: { $lte: now }
    });

    const expiringSoon = await Room.countDocuments({
      expiryDate: {
        $gte: now,
        $lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
      },
      isDeleted: false,
      isActive: true,
      category: { $ne: 'pg_hostel' } // Exclude PG/Hostel from expiry
    });

    const inGracePeriod = await Room.countDocuments({
      expiryDate: {
        $lt: now,
        $gte: thirtyDaysAgo
      },
      isDeleted: false,
      category: { $ne: 'pg_hostel' } // Exclude PG/Hostel from expiry
    });

    return {
      scenario1_expiredNaturally: expiredPostsNaturally,
      scenario2_manuallyDeleted: deletedPostsReady,
      totalPostsToDelete: expiredPostsNaturally + deletedPostsReady,
      readyForDeletionChats,
      expiringSoon,
      inGracePeriod,
      checkDate: now.toISOString()
    };
  }

  // Manual cleanup trigger (for testing or admin use)
  async forceCleanupPost(postId) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const post = await Room.findById(postId).session(session);
      
      if (!post) {
        throw new Error('Post not found');
      }

      console.log(`🔧 Force cleanup for post ${postId}`);

      // Delete images from B2
      let deletedImages = 0;
      if (post.images && post.images.length > 0) {
        const result = await safelyDeleteImagesFromB2(post.images, postId);
        deletedImages = result.successCount;
      }

      if (post.thumbnail?.url) {
        const success = await deleteFromB2(post.thumbnail.url);
        if (success) deletedImages++;
      }

      // Delete chats
      const chatRooms = await ChatRoom.find({ productId: postId }).session(session);
      const chatRoomIds = chatRooms.map(room => room._id);

      await Chat.deleteMany({ roomId: { $in: chatRoomIds } }).session(session);
      await ChatRoom.deleteMany({ productId: postId }).session(session);
      await Room.findByIdAndDelete(postId).session(session);

      await session.commitTransaction();
      
      return {
        success: true,
        deletedImages,
        deletedChats: chatRoomIds.length
      };

    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}

export default new AutoCleanupService();    