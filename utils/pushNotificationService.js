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
    // Check if token is valid
    if (!Expo.isExpoPushToken(pushToken)) {
      console.error(`❌ Invalid Expo push token: ${pushToken}`);
      return { success: false, error: 'Invalid push token' };
    }

    const message = {
      to: pushToken,
      sound: 'default',
      title: data.senderName || data.title || 'New Message', // Username as title
      body: data.message || data.body || 'You have a new message', // Message content
      data: {
        ...data.additionalData,
        type: 'chat_message',
        chatId: data.chatId,
        userId: data.userId,
        userName: data.senderName,
      },
      badge: data.badge || 1,
      priority: 'high',
      channelId: 'chat-messages',
      
      // Android-specific WhatsApp-style layout
      android: {
        channelId: 'chat-messages',
        priority: 'high',
        vibrate: [0, 250, 250, 250],
        color: '#25D366', // WhatsApp green
        
        // This creates the left-side profile picture
        image: data.senderAvatar || data.avatarUrl,
        
        // Messaging style for conversation layout
        style: {
          type: 'messaging',
          conversation: {
            title: data.senderName || data.title,
            messages: [
              {
                text: data.message || data.body,
                timestamp: Date.now(),
              }
            ]
          }
        }
      }
    };

    // Send notification
    const ticketChunk = await expo.sendPushNotificationsAsync([message]);
    console.log('✅ WhatsApp-style push notification sent:', ticketChunk);

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

export default {
  sendPushNotification,
  sendBatchPushNotifications,
  checkPushNotificationReceipts
};