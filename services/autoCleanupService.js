import mongoose from 'mongoose';
import Room from '../models/RoomSchema.js'; // Adjust path as needed
import ChatRoom from '../models/RoomChatmodal.js';
import Chat from '../models/chatmodal.js';

export class AutoCleanupService {
  // Clean up all expired and deleted data
  async cleanupExpiredData() {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      console.log('🕒 Starting auto-cleanup...', {
        now: now.toISOString(),
        thirtyDaysAgo: thirtyDaysAgo.toISOString(),
        threeDaysAgo: threeDaysAgo.toISOString()
      });

      // 1. Find posts that need to be deleted
      const postsToDelete = await Room.find({
        $or: [
          // Posts expired more than 30 days ago (natural expiry)
          { 
            expiryDate: { $lt: thirtyDaysAgo },
            isDeleted: false 
          },
          // Posts marked as deleted more than 3 days ago (manual deletion expiry)
          { 
            isDeleted: true,
            deleteExpiresAt: { $lt: now }
          }
        ]
      }).session(session);

      console.log(`📝 Found ${postsToDelete.length} posts to delete`);

      let totalDeletedChatRooms = 0;
      let totalDeletedMessages = 0;
      let deletedPostsCount = 0;

      // 2. Process each post and its associated chats
      for (const post of postsToDelete) {
        try {
          const postId = post._id;

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
          }

          // Delete all chat rooms
          const chatRoomResult = await ChatRoom.deleteMany({ 
            productId: postId 
          }).session(session);
          totalDeletedChatRooms += chatRoomResult.deletedCount;

          // Finally delete the post
          await Room.findByIdAndDelete(postId).session(session);
          deletedPostsCount++;

          console.log(`✅ Cleaned up post ${postId} with ${chatRoomIds.length} chat rooms`);

        } catch (postError) {
          console.error(`❌ Error cleaning up post ${post._id}:`, postError);
          // Continue with other posts even if one fails
        }
      }

      // 3. Clean up orphaned chat rooms (chats marked as deleted more than 3 days ago)
      const orphanedChatRooms = await ChatRoom.find({
        isDeleted: true,
        deleteExpiresAt: { $lt: now }
      }).session(session);

      console.log(`💬 Found ${orphanedChatRooms.length} orphaned chat rooms to delete`);

      let deletedOrphanedChats = 0;
      let deletedOrphanedMessages = 0;

      for (const chatRoom of orphanedChatRooms) {
        try {
          // Delete all messages in this chat room
          const messageResult = await Chat.deleteMany({ 
            roomId: chatRoom._id 
          }).session(session);
          deletedOrphanedMessages += messageResult.deletedCount;

          // Delete the chat room
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
        deletedOrphanedChats: deletedOrphanedChats,
        deletedOrphanedMessages: deletedOrphanedMessages
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
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    // Posts that expired naturally (older than 30 days)
    const expiredPosts = await Room.countDocuments({
      expiryDate: { $lt: thirtyDaysAgo },
      isDeleted: false
    });

    // Posts marked as deleted and ready for permanent removal
    const readyForDeletionPosts = await Room.countDocuments({
      isDeleted: true,
      deleteExpiresAt: { $lt: now }
    });

    // Chat rooms marked as deleted and ready for permanent removal
    const readyForDeletionChats = await ChatRoom.countDocuments({
      isDeleted: true,
      deleteExpiresAt: { $lt: now }
    });

    // Posts that will expire in next 24 hours
    const expiringSoonPosts = await Room.countDocuments({
      expiryDate: { 
        $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000),
        $lt: thirtyDaysAgo 
      },
      isDeleted: false
    });

    return {
      expiredPosts,
      readyForDeletionPosts,
      readyForDeletionChats,
      expiringSoonPosts,
      checkDate: now.toISOString()
    };
  }
}

export default new AutoCleanupService();