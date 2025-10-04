// server.js - UPDATED HYBRID CHAT VERSION (Enhanced)
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

// Rate limiting
const MESSAGE_RATE_LIMIT = 10; // messages per minute
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

// Cleanup every minute
setInterval(cleanupOldMessages, 60000);

io.use((socket, next) => {
  console.log(`🔄 Incoming connection from:`, socket.handshake.address);
  next();
});

io.on('connection', (socket) => {
  console.log('✅ User connected', socket.id, 'at', new Date().toISOString());

  socket.on('userOnline', ({ userId }) => {
    if (!userId) return;
    onlineUsers.set(userId.toString(), socket.id);
    console.log(`👤 User ${userId} is online (socket: ${socket.id})`);
  });

  socket.on('joinRoom', async ({ roomId, userId }) => {
    console.log(`🎯 JOIN ROOM: User ${userId} → Room ${roomId}`);

    if (!roomId || !userId) {
      socket.emit('error', { message: 'Missing roomId or userId' });
      return;
    }

    socket.join(roomId);

    try {
      const chatRoom = await ChatRoom.findById(roomId).populate('participants', '_id name picture');
      if (!chatRoom) {
        socket.emit('error', { message: 'Chat room not found' });
        return;
      }

      const userRole = chatRoom.participants[0]._id.toString() === userId.toString() 
        ? 'inquirer' 
        : 'owner';

      const chat = await Chat.findOne({ roomId });
      
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
            fromMe: msg.sender?.toString() === userId?.toString()
          }));
        }
      }

      socket.emit('initialData', {
        messages,
        currentState,
        userRole,
        conversationMode,
        roomInfo: {
          propertyTitle: chatRoom.name,
          participants: chatRoom.participants
        }
      });

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
      // Enhanced validation
      if (!roomId || !sender || !senderRole) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      // Rate limiting check
      const now = Date.now();
      const userMessages = userMessageCounts.get(sender.toString()) || [];
      const recentMessages = userMessages.filter(time => now - time < 60000);
      
      if (recentMessages.length >= MESSAGE_RATE_LIMIT) {
        socket.emit('error', { message: 'Message rate limit exceeded. Please wait a moment.' });
        return;
      }

      // For option messages, require optionId and optionText
      if (messageType === 'option' && (!optionId || !optionText)) {
        socket.emit('error', { message: 'Option messages require optionId and optionText' });
        return;
      }

      // For freetext messages, require text and validate length
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
      
      // Update room status
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

      // Save message to database
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

      // Add type-specific fields
      if (messageType === 'option') {
        newMessage.optionId = optionId;
        newMessage.option = optionText;
        newMessage.nextState = nextState;
      } else if (messageType === 'freetext') {
        newMessage.text = text;
        newMessage.nextState = chat.currentState; // Keep current state for freetext
      }

      chat.messages.push(newMessage);
      
      // Update conversation state if it changed
      if (nextState && messageType === 'option') {
        chat.currentState = nextState;
      }
      
      await chat.save();

      // Update rate limiting
      recentMessages.push(now);
      userMessageCounts.set(sender.toString(), recentMessages);

      // Broadcast to room
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

      // Enhanced push notifications
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

  // Message status updates
  socket.on('messageStatus', async ({ roomId, messageId, status }) => {
    try {
      const chat = await Chat.findOne({ roomId });
      if (chat) {
        const message = chat.messages.id(messageId);
        if (message) {
          message.status = status;
          await chat.save();
          
          // Broadcast status update
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
    socket.leave(roomId);
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ User disconnected: ${socket.id}, Reason: ${reason}`);
    
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        break;
      }
    }
  });
});

// Enhanced debug endpoints
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
    rooms[roomId] = Array.from(sockets);
  });
  
  res.json({
    totalRooms: Object.keys(rooms).length,
    rooms
  });
});

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Socket.IO ready for ENHANCED HYBRID chat`);
  console.log(`🛡️  Rate limiting: ${MESSAGE_RATE_LIMIT} messages/minute`);
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount,
    onlineUsers: onlineUsers.size,
    rateLimitedUsers: userMessageCounts.size,
    mode: 'enhanced-hybrid'
  });
});

export default io;