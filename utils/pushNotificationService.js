// services/pushNotificationService.js
import { Expo } from 'expo-server-sdk';

const expo = new Expo();

/**
 * Send push notification to a user
 * @param {string} pushToken - Expo push token
 * @param {object} data - Notification data
 */
export const sendPushNotification = async (pushToken, data) => {
  try {
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`❌ Invalid Expo push token: ${pushToken}`);
      return { success: false, error: 'Invalid push token' };
    }
    
    const message = {
      to: pushToken,
      sound: 'default',
      title: `New message from 👤 ${data.senderName}`,  
      body: data.message,  
      data: {
        type: 'chat_message',
        chatId: data.chatId,
        userId: data.userId,
        userName: data.senderName,
        selectedOption: data.message,
      },
      badge: data.badge || 1,
      priority: 'high',
      channelId: 'chat-messages',
    };

    console.log(message, "sent message");
    
    const ticketChunk = await expo.sendPushNotificationsAsync([message]);
    console.log('✅ Push notification sent:', ticketChunk);
    return { success: true, ticket: ticketChunk[0] };
  } catch (error) {
    console.error('❌ Error sending push notification:', error);
    return { success: false, error: error.message };
  }
};




/**
 * Send notifications to multiple users
 * @param {Array} messages - Array of message objects with pushToken and data
 */
export const sendBatchPushNotifications = async (messages) => {
  try {
    const expoPushMessages = messages
      .filter(msg => Expo.isExpoPushToken(msg.pushToken))
      .map(msg => ({
        to: msg.pushToken,
        sound: 'default',
        title: msg.title || 'New Message',
        body: msg.body,
        data: msg.data || {},
        badge: msg.badge || 1,
        priority: 'high',
        channelId: 'chat-messages',
      }));

    // Split into chunks (Expo limit: 100 notifications per request)
    const chunks = expo.chunkPushNotifications(expoPushMessages);
    const tickets = [];

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('❌ Error sending chunk:', error);
      }
    }

    console.log(`✅ Sent ${tickets.length} push notifications`);
    return { success: true, tickets };
  } catch (error) {
    console.error('❌ Error in batch send:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Check receipt status of sent notifications
 * @param {Array} receiptIds - Array of receipt IDs from tickets
 */
export const checkPushNotificationReceipts = async (receiptIds) => {
  try {
    const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds);
    const receipts = [];

    for (const chunk of receiptIdChunks) {
      try {
        const receiptChunk = await expo.getPushNotificationReceiptsAsync(chunk);
        receipts.push(receiptChunk);
      } catch (error) {
        console.error('❌ Error checking receipts:', error);
      }
    }

    return { success: true, receipts };
  } catch (error) {
    console.error('❌ Error checking receipts:', error);
    return { success: false, error: error.message };
  }
};

// ADD THESE NEW FUNCTIONS to your existing pushNotificationService.js

/**
 * Send expiry warning push notification (3 days before)
 */
export const sendExpiryWarningPush = async (pushToken, post, daysLeft) => {
  try {
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`❌ Invalid Expo push token: ${pushToken}`);
      return { success: false, error: 'Invalid push token' };
    }
    
    const message = {
      to: pushToken,
      sound: 'default',
      title: `⚠️ Reminder: Your property expires in ${daysLeft} days`,  
      body: `Your property "${post.title}" will expire soon. Tap to renew.`,  
      data: {
        type: 'expiry_warning',
        postId: post._id.toString(),
        daysLeft,
        screen: 'MyAds',
      },
      badge: 1,
      priority: 'high',
      channelId: 'property-alerts',
    };
    
    const ticketChunk = await expo.sendPushNotificationsAsync([message]);
    console.log('✅ Expiry warning push sent');
    return { success: true, ticket: ticketChunk[0] };
  } catch (error) {
    console.error('❌ Error sending expiry warning push:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send post expired push notification
 */
export const sendPostExpiredPush = async (pushToken, post) => {
  try {
    if (!Expo.isExpoPushToken(pushToken)) {
      return { success: false, error: 'Invalid push token' };
    }
    
    const message = {
      to: pushToken,
      sound: 'default',
     title: `❌ Your listing has expired — action needed`,

      body: `"${post.title}" has expired. Renew within 30 days to avoid automatic deletion.`,

      data: {
        type: 'post_expired',
        postId: post._id.toString(),
        screen: 'MyAds',
      },
      badge: 1,
      priority: 'high',
      channelId: 'property-alerts',
    };
    
    const ticketChunk = await expo.sendPushNotificationsAsync([message]);
    console.log('✅ Post expired push sent');
    return { success: true, ticket: ticketChunk[0] };
  } catch (error) {
    console.error('❌ Error sending post expired push:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Send final deletion warning push (3 days before deletion)
 */
export const sendFinalDeletionWarningPush = async (pushToken, post, daysLeft) => {
  try {
    if (!Expo.isExpoPushToken(pushToken)) {
      return { success: false, error: 'Invalid push token' };
    }
    
    const message = {
      to: pushToken,
      sound: 'default',
title:`🚨 Your listing will be deleted in ${daysLeft} days!`,
body: `"${post.title}" will be deleted soon. Renew it to keep it visible.`,


      data: {
        type: 'final_deletion_warning',
        postId: post._id.toString(),
        daysLeft,
        screen: 'MyAds',
      },
      badge: 1,
      priority: 'high',
      channelId: 'urgent-alerts',
    };
    
    const ticketChunk = await expo.sendPushNotificationsAsync([message]);
    console.log('✅ Final deletion warning push sent');
    return { success: true, ticket: ticketChunk[0] };
  } catch (error) {
    console.error('❌ Error sending final deletion push:', error);
    return { success: false, error: error.message };
  }
};

// Export the new functions
export default {
  sendPushNotification,
  sendBatchPushNotifications,
  checkPushNotificationReceipts,
  sendExpiryWarningPush,
  sendPostExpiredPush,
  sendFinalDeletionWarningPush,
};