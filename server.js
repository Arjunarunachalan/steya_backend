// server.js - WITH PUSH NOTIFICATIONS
import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import connectDB from './config/db.js';
import Chat from './models/chatmodal.js';
import ChatRoom from './models/RoomChatmodal.js';
import User from './models/userModal.js'
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

// Store online users
const onlineUsers = new Map(); // userId -> socketId

io.on('connection', (socket) => {
  console.log('✅ User connected', socket.id);

  // User comes online
  socket.on('userOnline', ({ userId }) => {
    onlineUsers.set(userId.toString(), socket.id);
    console.log(`👤 User ${userId} is online`);
  });

  // Join a chatroom
  socket.on('joinRoom', async ({ roomId, userId }) => {
    socket.join(roomId);
    console.log(`👤 User ${socket.id} (${userId}) joined room ${roomId}`);

    try {
      const chatRoom = await ChatRoom.findById(roomId).populate('participants', '_id name picture');
      if (!chatRoom) {
        console.error('❌ Chat room not found:', roomId);
        socket.emit('error', { message: 'Chat room not found' });
        return;
      }

      if (!chatRoom.participants || chatRoom.participants.length < 2) {
        console.error('❌ Invalid participants in room:', roomId);
        socket.emit('error', { message: 'Invalid chat room participants' });
        return;
      }

      console.log('🏠 ChatRoom participants:', chatRoom.participants.map(p => p._id));

      const userRole = chatRoom.participants[0]._id.toString() === userId.toString() 
        ? 'inquirer' 
        : 'owner';

      console.log(`✅ User ${userId} assigned role: ${userRole}`);

      const chat = await Chat.findOne({ roomId });
      
      let currentState = 'START';
      let messages = [];

      if (chat && chat.messages.length > 0) {
        messages = chat.messages.map(msg => ({
          sender: msg.sender,
          optionId: msg.optionId,
          option: msg.option,
          nextState: msg.nextState,
          senderRole: msg.senderRole,
          createdAt: msg.createdAt,
          fromMe: msg.sender?.toString() === userId?.toString()
        }));
        
        const lastMsg = chat.messages[chat.messages.length - 1];
        currentState = lastMsg.nextState || 'START';
        console.log('📍 Resuming from state:', currentState);
      } else {
        console.log('📭 No previous messages, starting fresh');
      }

      socket.emit('initialData', {
        messages,
        currentState,
        userRole,
        roomInfo: {
          propertyTitle: chatRoom.name,
          participants: chatRoom.participants
        }
      });

      console.log(`✅ Sent initial data to user ${userId}:`, {
        messageCount: messages.length,
        currentState,
        userRole
      });

    } catch (error) {
      console.error('❌ Error joining room:', error);
      socket.emit('error', { message: 'Failed to join room', error: error.message });
    }
  });

  // Handle sending a message WITH PUSH NOTIFICATION
  socket.on('sendMessage', async ({ roomId, sender, optionId, optionText, nextState, senderRole }) => {
    try {
      console.log(`📤 Sending message in room ${roomId} from ${senderRole}: ${optionText}`);

      if (!roomId || !sender || !optionId || !optionText || !nextState || !senderRole) {
        socket.emit('error', { message: 'Missing required fields' });
        return;
      }

      // Get sender info
      const senderUser = await User.findById(sender).select('name picture');

      // Activate room if pending
      const room = await ChatRoom.findById(roomId).populate('participants', '_id name pushToken notificationSettings');
      if (room && room.status === 'pending' && !room.hasMessages) {
        await ChatRoom.findByIdAndUpdate(roomId, {
          status: 'active',
          hasMessages: true,
          firstMessageAt: new Date(),
          lastMessage: optionText,
          updatedAt: new Date()
        });
        console.log('✅ Room activated from pending to active:', roomId);
      } else if (room) {
        await ChatRoom.findByIdAndUpdate(roomId, {
          lastMessage: optionText,
          updatedAt: new Date()
        });
      }

      // Save message
      let chat = await Chat.findOne({ roomId });
      if (!chat) {
        chat = new Chat({ roomId, messages: [] });
      }

      const newMessage = {
        sender,
        optionId,
        option: optionText,
        nextState,
        senderRole,
        createdAt: new Date()
      };

      chat.messages.push(newMessage);
      await chat.save();

      // Broadcast to room
      io.in(roomId).emit('newMessage', {
        message: {
          sender: newMessage.sender,
          optionId: newMessage.optionId,
          option: newMessage.option,
          nextState: newMessage.nextState,
          senderRole: newMessage.senderRole,
          createdAt: newMessage.createdAt
        },
        nextState
      });

      console.log(`✅ Message broadcast to room ${roomId}: ${optionText} → Next: ${nextState}`);

      // 🔔 SEND PUSH NOTIFICATION TO OTHER PARTICIPANT(S)
      if (room && room.participants) {
        for (const participant of room.participants) {
          // Skip sender and users who are online in this room
          if (participant._id.toString() === sender.toString()) continue;
          
          const recipientSocketId = onlineUsers.get(participant._id.toString());
          const isRecipientInRoom = recipientSocketId && io.sockets.adapter.rooms.get(roomId)?.has(recipientSocketId);
          
          // Only send push if user is offline or not in the room
          if (!isRecipientInRoom && participant.pushToken) {
            // Check notification settings
            const notifEnabled = participant.notificationSettings?.enabled !== false;
            const chatNotifEnabled = participant.notificationSettings?.chatMessages !== false;
            
            if (notifEnabled && chatNotifEnabled) {
              await sendPushNotification(participant.pushToken, {
                title: senderUser ? `${senderUser.name}` : 'New Message',
                body: optionText.length > 100 ? optionText.substring(0, 100) + '...' : optionText,
                additionalData: {
                  type: 'chat_message',
                  roomId: roomId.toString(),
                  senderId: sender.toString(),
                  senderName: senderUser?.name || 'Unknown User',
                  screen: 'ChatScreen',
                  productTitle: room.name
                },
                badge: 1
              });
              
              console.log(`🔔 Push notification sent to ${participant._id}`);
            }
          }
        }
      }

    } catch (error) {
      console.error('❌ Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message', error: error.message });
    }
  });

  // Handle typing indicator
  socket.on('typing', ({ roomId, userId, isTyping }) => {
    socket.to(roomId).emit('userTyping', { userId, isTyping });
  });

  // Handle user leaving room
  socket.on('leaveRoom', ({ roomId, userId }) => {
    socket.leave(roomId);
    console.log(`👋 User ${userId} left room ${roomId}`);
  });

  socket.on('disconnect', () => {
    // Remove from online users
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`👋 User ${userId} went offline`);
        break;
      }
    }
    console.log('❌ User disconnected', socket.id);
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📡 Socket.IO ready for connections`);
});

export default io;