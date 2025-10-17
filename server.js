// server.js - FIXED ONLINE/OFFLINE STATUS SYSTEM
import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import connectDB from './config/db.js';
import Chat from './models/chatmodal.js';
import ChatRoom from './models/RoomChatmodal.js';
import User from './models/userModal.js';
import dotenv from 'dotenv';
import { sendPushNotification } from './utils/pushNotificationService.js';

dotenv.config();
connectDB();

const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
  transports: ['websocket', 'polling']
});

const onlineUsers = new Map();
const userRooms = new Map();
const userSockets = new Map();

// Rate limiting
const MESSAGE_RATE_LIMIT = 10;
const userMessageCounts = new Map();

const cleanupOldMessages = () => {
  const now = Date.now();
  for (const [userId, messages] of userMessageCounts.entries()) {
    const recent = messages.filter(time => now - time < 60000);
    if (recent.length === 0) {
      userMessageCounts.delete(userId);
    } else {
      userMessageCounts.set(userId, recent);
    }
  }
};

setInterval(cleanupOldMessages, 60000);

// FIXED: Enhanced online status broadcasting function
const broadcastOnlineStatus = async (roomId, excludedSocketId = null) => {
  try {
    const roomIdStr = roomId.toString();
    const room = await ChatRoom.findById(roomIdStr).populate('participants', '_id');
    if (!room) {
      console.warn(`⚠️ Room ${roomIdStr} not found for status broadcast`);
      return;
    }

    const onlineStatuses = {};
    for (const participant of room.participants) {
      const participantId = participant._id.toString();
      onlineStatuses[participantId] = onlineUsers.has(participantId);
    }

    console.log(`📢 Broadcasting online status for room ${roomIdStr}:`, onlineStatuses);
    
    if (excludedSocketId) {
      io.to(roomIdStr).except(excludedSocketId).emit('onlineStatuses', { 
        roomId: roomIdStr, 
        statuses: onlineStatuses 
      });
    } else {
      io.to(roomIdStr).emit('onlineStatuses', { 
        roomId: roomIdStr, 
        statuses: onlineStatuses 
      });
    }
  } catch (error) {
    console.error('❌ Error broadcasting online status:', error);
  }
};

io.use((socket, next) => {
  console.log(`🔄 Incoming connection from:`, socket.handshake.address);
  next();
});

io.on('connection', (socket) => {
  console.log('✅ User connected', socket.id, 'at', new Date().toISOString());

  // SIMPLIFIED: userOnline only for app-level presence (optional)
  socket.on('userOnline', ({ userId }) => {
    if (!userId) return;
    
    const userIdStr = userId.toString();
    onlineUsers.set(userIdStr, socket.id);
    userSockets.set(socket.id, userIdStr);
    
    console.log(`👤 User ${userIdStr} app is online (socket: ${socket.id})`);
  });

  // FIXED: joinRoom with proper event ordering and status broadcasting
  socket.on('joinRoom', async ({ roomId, userId }) => {
    console.log(`🎯 JOIN ROOM: User ${userId} → Room ${roomId}`);

    if (!roomId || !userId) {
      socket.emit('error', { message: 'Missing roomId or userId' });
      return;
    }

    const userIdStr = userId.toString();
    const roomIdStr = roomId.toString();

    socket.join(roomIdStr);

    // Track user's rooms
    if (!userRooms.has(userIdStr)) {
      userRooms.set(userIdStr, new Set());
    }
    userRooms.get(userIdStr).add(roomIdStr);

    // Mark user as ONLINE
    onlineUsers.set(userIdStr, socket.id);
    userSockets.set(socket.id, userIdStr);

    try {
      const chatRoom = await ChatRoom.findById(roomIdStr).populate('participants', '_id name picture');
      if (!chatRoom) {
        socket.emit('error', { message: 'Chat room not found' });
        return;
      }

      const userRole = chatRoom.participants[0]._id.toString() === userIdStr 
        ? 'inquirer' 
        : 'owner';

      const chat = await Chat.findOne({ roomId: roomIdStr });
      
      let currentState = 'START';
      let messages = [];
      let conversationMode = 'hybrid';

      if (chat) {
        conversationMode = chat.conversationMode || 'hybrid';
        currentState = chat.currentState || 'START';
        
        if (chat.messages.length > 0) {
          messages = chat.messages.map(msg => ({
            sender: msg.sender,
            optionId: msg.optionId,
            option: msg.option,
            text: msg.text,
            messageType: msg.messageType || 'option',
            nextState: msg.nextState,
            senderRole: msg.senderRole,
            createdAt: msg.createdAt,
            fromMe: msg.sender?.toString() === userIdStr
          }));
        }
      }

      // Build online statuses - current user ALWAYS true
      const onlineStatuses = {};
      for (const participant of chatRoom.participants) {
        const participantId = participant._id.toString();
        onlineStatuses[participantId] = onlineUsers.has(participantId);
      }

      console.log('📊 Sending initial online statuses to client:', onlineStatuses);

      // ✅ SEND initialData FIRST
      socket.emit('initialData', {
        messages,
        currentState,
        userRole,
        conversationMode,
        roomInfo: {
          propertyTitle: chatRoom.name,
          participants: chatRoom.participants
        },
        onlineStatuses
      });

      // ✅ THEN notify others (after client is ready)
      socket.to(roomIdStr).emit('userJoinedRoom', {
        userId: userIdStr,
        userInfo: chatRoom.participants.find(p => p._id.toString() === userIdStr),
        timestamp: new Date()
      });

      // ✅ Broadcast online status to others AFTER initialData sent
      setTimeout(() => {
        broadcastOnlineStatus(roomIdStr, socket.id);
      }, 100);

      console.log(`📢 User ${userIdStr} joined room ${roomIdStr}. Online status: true`);

    } catch (error) {
      console.error('❌ Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room', error: error.message });
    }
  });

  // ENHANCED HYBRID MESSAGE HANDLER
  socket.on('sendMessage', async ({ 
    roomId, 
    sender, 
    optionId, 
    optionText, 
    text,
    messageType = 'option',
    nextState, 
    senderRole 
  }) => {
    console.log(`📤 SEND MESSAGE (${messageType}):`, {
      room: roomId,
      sender,
      type: messageType,
      content: messageType === 'freetext' ? text : optionText
    });

    try {
      if (!roomId || !sender || !senderRole) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      // Rate limiting
      const now = Date.now();
      const userMessages = userMessageCounts.get(sender.toString()) || [];
      const recentMessages = userMessages.filter(time => now - time < 60000);
      
      if (recentMessages.length >= MESSAGE_RATE_LIMIT) {
        socket.emit('error', { message: 'Message rate limit exceeded. Please wait a moment.' });
        return;
      }

      if (messageType === 'option' && (!optionId || !optionText)) {
        socket.emit('error', { message: 'Option messages require optionId and optionText' });
        return;
      }

      if (messageType === 'freetext') {
        if (!text) {
          socket.emit('error', { message: 'Freetext messages require text' });
          return;
        }
        if (text.length > 500) {
          socket.emit('error', { message: 'Message too long (max 500 characters)' });
          return;
        }
        if (text.trim().length === 0) {
          socket.emit('error', { message: 'Message cannot be empty' });
          return;
        }
      }

      const senderUser = await User.findById(sender).select('name picture');
      
      const room = await ChatRoom.findById(roomId).populate('participants', '_id name expoPushToken notificationSettings');
      if (room) {
        const updateData = {
          lastMessage: messageType === 'freetext' ? text : optionText,
          updatedAt: new Date()
        };

        if (room.status === 'pending' && !room.hasMessages) {
          updateData.status = 'active';
          updateData.hasMessages = true;
          updateData.firstMessageAt = new Date();
        }

        await ChatRoom.findByIdAndUpdate(roomId, updateData);
      }

      let chat = await Chat.findOne({ roomId });
      if (!chat) {
        chat = new Chat({ 
          roomId, 
          messages: [],
          conversationMode: 'hybrid',
          currentState: nextState || 'START'
        });
      }

      const newMessage = {
        sender,
        messageType,
        senderRole,
        createdAt: new Date()
      };

      if (messageType === 'option') {
        newMessage.optionId = optionId;
        newMessage.option = optionText;
        newMessage.nextState = nextState;
      } else if (messageType === 'freetext') {
        newMessage.text = text;
        newMessage.nextState = chat.currentState;
      }

      chat.messages.push(newMessage);
      
      if (nextState && messageType === 'option') {
        chat.currentState = nextState;
      }
      
      await chat.save();

      recentMessages.push(now);
      userMessageCounts.set(sender.toString(), recentMessages);

      const broadcastData = {
        message: {
          sender: newMessage.sender,
          optionId: newMessage.optionId,
          option: newMessage.option,
          text: newMessage.text,
          messageType: newMessage.messageType,
          nextState: newMessage.nextState,
          senderRole: newMessage.senderRole,
          createdAt: newMessage.createdAt
        },
        nextState: messageType === 'option' ? nextState : chat.currentState
      };

      io.in(roomId).emit('newMessage', broadcastData);

      // Push notifications
      if (room && room.participants) {
        for (const participant of room.participants) {
          if (participant._id.toString() === sender.toString()) continue;
          
          const recipientSocketId = onlineUsers.get(participant._id.toString());
          const isRecipientInRoom = recipientSocketId && io.sockets.adapter.rooms.get(roomId)?.has(recipientSocketId);

          if (!isRecipientInRoom && participant.expoPushToken) {
            const notifEnabled = participant.notificationSettings?.enabled !== false;
            const chatNotifEnabled = participant.notificationSettings?.chatMessages !== false;

            if (notifEnabled && chatNotifEnabled) {
              try {
                const messageContent = messageType === 'freetext' ? text : optionText;
                
                await sendPushNotification(participant.expoPushToken, {
                  senderName: senderUser ? `${senderUser.name}` : 'New Message',
                  message: messageContent.length > 100 
                    ? messageContent.substring(0, 100) + '...' 
                    : messageContent,
                  senderAvatar: senderUser?.picture,
                  chatId: roomId.toString(),
                  userId: sender.toString(),
                  badge: 1,
                  additionalData: {
                    type: 'chat_message',
                    roomId: roomId.toString(),
                    senderId: sender.toString(),
                    senderName: senderUser?.name || 'Unknown User',
                    screen: 'ChatScreen',
                    productTitle: room.name,
                    messageType: messageType
                  }
                });
              } catch (pushError) {
                console.error('❌ Push notification failed:', pushError);
              }
            }
          }
        }
      }

    } catch (error) {
      console.error('❌ Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message', error: error.message });
    }
  });

  // FIXED: getOnlineStatus with validation
  socket.on('getOnlineStatus', async ({ roomId, userId }) => {
    try {
      if (!roomId || !userId) {
        console.warn('⚠️ getOnlineStatus: Missing roomId or userId');
        return;
      }

      const roomIdStr = roomId.toString();
      const userIdStr = userId.toString();
      
      const room = await ChatRoom.findById(roomIdStr).populate('participants', '_id');
      if (!room) {
        console.warn(`⚠️ Room ${roomIdStr} not found`);
        return;
      }

      const onlineStatuses = {};
      for (const participant of room.participants) {
        const participantId = participant._id.toString();
        onlineStatuses[participantId] = onlineUsers.has(participantId);
      }

      console.log(`📊 Sending online statuses for room ${roomIdStr}:`, onlineStatuses);
      socket.emit('onlineStatuses', { roomId: roomIdStr, statuses: onlineStatuses });
    } catch (error) {
      console.error('❌ Error getting online status:', error);
      socket.emit('error', { message: 'Failed to get online status' });
    }
  });

  // Add this socket event handler to your server.js file
// Place it with your other socket.on() handlers

socket.on('deleteMessage', async ({ roomId, messageId, userId }) => {
  console.log(`🗑️ DELETE MESSAGE REQUEST:`, {
    room: roomId,
    message: messageId,
    user: userId
  });

  try {
    // Validation
    if (!roomId || !messageId || !userId) {
      socket.emit('error', { message: 'Missing required fields for deletion' });
      return;
    }

    // Find the chat
    const chat = await Chat.findOne({ roomId });
    if (!chat) {
      socket.emit('error', { message: 'Chat not found' });
      return;
    }

    // Find the message
    const message = chat.messages.id(messageId);
    if (!message) {
      socket.emit('error', { message: 'Message not found' });
      return;
    }

    // Authorization check - only message sender can delete
    if (message.sender.toString() !== userId.toString()) {
      socket.emit('error', { message: 'Unauthorized: You can only delete your own messages' });
      return;
    }

    // Remove the message
    message.deleteOne();
    await chat.save();

    // Update room's last message if this was the last message
    const room = await ChatRoom.findById(roomId);
    if (room && room.lastMessage) {
      const lastMessage = chat.messages[chat.messages.length - 1];
      if (lastMessage) {
        const updateData = {
          lastMessage: lastMessage.messageType === 'freetext' 
            ? lastMessage.text 
            : lastMessage.option,
          updatedAt: new Date()
        };
        await ChatRoom.findByIdAndUpdate(roomId, updateData);
      } else {
        // No messages left
        await ChatRoom.findByIdAndUpdate(roomId, {
          lastMessage: null,
          updatedAt: new Date()
        });
      }
    }

    // Broadcast deletion to all users in the room
    io.in(roomId).emit('messageDeleted', {
      messageId,
      roomId,
      deletedBy: userId,
      timestamp: new Date()
    });

    console.log(`✅ Message ${messageId} deleted successfully`);

  } catch (error) {
    console.error('❌ Error deleting message:', error);
    socket.emit('error', { 
      message: 'Failed to delete message', 
      error: error.message 
    });
  }
});

  socket.on('messageStatus', async ({ roomId, messageId, status }) => {
    try {
      const chat = await Chat.findOne({ roomId });
      if (chat) {
        const message = chat.messages.id(messageId);
        if (message) {
          message.status = status;
          await chat.save();
          
          socket.to(roomId).emit('messageStatusUpdate', {
            messageId,
            status,
            updatedAt: new Date()
          });
        }
      }
    } catch (error) {
      console.error('❌ Error updating message status:', error);
    }
  });

  socket.on('typing', ({ roomId, userId, isTyping }) => {
    socket.to(roomId).emit('userTyping', { userId, isTyping });
  });

  socket.on('leaveRoom', ({ roomId, userId }) => {
    if (userId) {
      const userIdStr = userId.toString();
      const roomIdStr = roomId.toString();
      
      if (userRooms.has(userIdStr)) {
        userRooms.get(userIdStr).delete(roomIdStr);
        if (userRooms.get(userIdStr).size === 0) {
          userRooms.delete(userIdStr);
        }
      }

      // Broadcast status update when user leaves room
      setTimeout(() => {
        broadcastOnlineStatus(roomIdStr);
      }, 100);
    }
    
    socket.leave(roomId);
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ User disconnected: ${socket.id}, Reason: ${reason}`);
    
    const disconnectedUserId = userSockets.get(socket.id);
    
    if (disconnectedUserId) {
      onlineUsers.delete(disconnectedUserId);
      userSockets.delete(socket.id);

      if (userRooms.has(disconnectedUserId)) {
        const rooms = userRooms.get(disconnectedUserId);
        rooms.forEach(roomId => {
          // Broadcast status update after a short delay
          setTimeout(() => {
            broadcastOnlineStatus(roomId);
          }, 100);
        });
        userRooms.delete(disconnectedUserId);
      }
    }
  });
});

// Debug endpoints
app.get("/api/debug/connections", (req, res) => {
  const connections = [];
  io.sockets.sockets.forEach(socket => {
    connections.push({
      id: socket.id,
      connected: socket.connected,
      rooms: Array.from(socket.rooms)
    });
  });
  
  res.json({
    totalConnections: io.engine.clientsCount,
    onlineUsers: Array.from(onlineUsers.entries()),
    userRooms: Array.from(userRooms.entries()).map(([userId, rooms]) => ({
      userId,
      rooms: Array.from(rooms)
    })),
    connections,
    rateLimits: Array.from(userMessageCounts.entries()).map(([userId, times]) => ({
      userId,
      messageCount: times.length,
      lastMinute: times.filter(time => Date.now() - time < 60000).length
    }))
  });
});

app.get("/api/debug/rooms", (req, res) => {
  const rooms = {};
  io.sockets.adapter.rooms.forEach((sockets, roomId) => {
    rooms[roomId] = {
      sockets: Array.from(sockets),
      users: Array.from(sockets).map(socketId => userSockets.get(socketId)).filter(Boolean)
    };
  });
  
  res.json({
    totalRooms: Object.keys(rooms).length,
    rooms
  });
});

app.get("/api/debug/presence", (req, res) => {
  const presenceData = {
    onlineUsers: Array.from(onlineUsers.entries()),
    userRooms: Array.from(userRooms.entries()).map(([userId, rooms]) => ({
      userId,
      rooms: Array.from(rooms)
    })),
    userSockets: Array.from(userSockets.entries()),
    totalOnline: onlineUsers.size,
    totalTrackedUsers: userRooms.size
  };
  
  res.json(presenceData);
});

app.get("/api/debug/online-users", (req, res) => {
  res.json({
    onlineUsers: Array.from(onlineUsers.entries()),
    totalOnline: onlineUsers.size,
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount,
    onlineUsers: onlineUsers.size,
    rateLimitedUsers: userMessageCounts.size,
    mode: 'enhanced-presence'
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Socket.IO ready for ENHANCED ONLINE PRESENCE`);
  console.log(`🛡️  Rate limiting: ${MESSAGE_RATE_LIMIT} messages/minute`);
});

export default io;