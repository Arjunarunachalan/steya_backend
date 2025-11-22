import cron from 'node-cron';
import Room from '../models/RoomSchema.js';

import { 
  sendExpiryWarningEmail, 
  sendPostExpiredEmail, 
  sendFinalDeletionWarningEmail 
} from '../services/emailService.js';
import {
  sendExpiryWarningPush,
  sendPostExpiredPush,
  sendFinalDeletionWarningPush,
} from '../utils/pushNotificationService.js';

export function startNotificationJobs() {
  
  // ✅ JOB 1: Check for posts expiring in 3 days (Run daily at 9 AM)
  cron.schedule('35 13 * * *', async () => {
 
    console.log('🔔 Checking for posts expiring in 3 days...');

    

    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      threeDaysFromNow.setHours(23, 59, 59, 999);

      const twoDaysFromNow = new Date();
      twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);
      twoDaysFromNow.setHours(0, 0, 0, 0);

      const expiringPosts = await Room.find({
        expiryDate: {
          $gte: twoDaysFromNow,
          $lte: threeDaysFromNow,
        },
        isDeleted: false,
        isActive: true,
      }).populate('createdBy');

      console.log(`📊 Found ${expiringPosts.length} posts expiring in 3 days`);

      for (const post of expiringPosts) {
        const user = post.createdBy;
        if (!user) continue;

        // Send Email
        await sendExpiryWarningEmail(user, post, 3);

        // Send Push Notification
        if (user.expoPushToken) {
          await sendExpiryWarningPush(user.expoPushToken, post, 3);
        }
      }

      console.log('✅ Expiry warning notifications sent');
    } catch (error) {
      console.error('❌ Error in expiry warning job:', error);
    }
  });

    // ✅ JOB 2: Check for posts expired in last 24 hours (Run daily at 10 AM)
cron.schedule('0 10 * * *', async () => {
  console.log('🔔 Checking for posts expired in the last 24 hours...');

  try {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // 👉 Only expired in the last 24 hours
    const expiredPosts = await Room.find({
      expiryDate: {
        $gte: twentyFourHoursAgo,
        $lt: now
      },
      isDeleted: false,
      isActive: true,
    }).populate('createdBy');

    console.log(`📊 Found ${expiredPosts.length} newly expired posts`);

    for (const post of expiredPosts) {
      const user = post.createdBy;
      if (!user) continue;

      await sendPostExpiredEmail(user, post);

      if (user.expoPushToken) {
        await sendPostExpiredPush(user.expoPushToken, post);
      }
    }

    console.log('✅ Notifications sent only for todays expired posts');
  } catch (error) {
    console.error('❌ Error in expired job:', error);
  }
});


  // ✅ JOB 3: Check for posts 3 days before permanent deletion (Run daily at 10 AM)
  cron.schedule('0 11 * * *', async () => {
  
    console.log('🔔 Checking for posts near permanent deletion...');
    
    try {
      const threeDaysFromNow = new Date();
      threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);
      
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const twentySevenDaysAgo = new Date(now.getTime() - 27 * 24 * 60 * 60 * 1000);

      const postsNearDeletion = await Room.find({
        expiryDate: {
        $gte: thirtyDaysAgo,
$lt: twentySevenDaysAgo,

        },
        isDeleted: false,
      }).populate('createdBy');

      console.log(`📊 Found ${postsNearDeletion.length} posts near deletion`);

      for (const post of postsNearDeletion) {
        const user = post.createdBy;
        if (!user) continue;

        const daysLeft = Math.ceil((new Date(post.expiryDate).getTime() + 30 * 24 * 60 * 60 * 1000 - now.getTime()) / (24 * 60 * 60 * 1000));

        // Send Email
        await sendFinalDeletionWarningEmail(user, post, daysLeft);

        // Send Push Notification
        if (user.expoPushToken) {
          await sendFinalDeletionWarningPush(user.expoPushToken, post, daysLeft);
        }
      }

      console.log('✅ Final deletion warnings sent');
    } catch (error) {
      console.error('❌ Error in deletion warning job:', error);
    }
  });

  console.log('🎯 Notification cron jobs started!');
}