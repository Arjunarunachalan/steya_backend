// server.js - WITH ENHANCED DEBUGGING
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

// 🔥 ENHANCED DEBUGGING MIDDLEWARE
io.use((socket, next) => {
  console.log(`🔄 Incoming connection attempt from:`, socket.handshake.address);
  console.log(`📋 Handshake query:`, socket.handshake.query);
  console.log(`📦 Handshake headers:`, socket.handshake.headers);
  next();
});

io.on('connection', (socket) => {
  console.log('✅ User connected', socket.id, 'at', new Date().toISOString());
  console.log(`📊 Total connections: ${io.engine.clientsCount}`);

  // 🔥 ENHANCED: Connection monitoring
  socket.conn.on("packet", (packet) => {
    console.log(`📦 ${socket.id} packet:`, packet.type);
  });

  socket.conn.on("close", (reason) => {
    console.log(`🔌 ${socket.id} closed:`, reason);
  });

  socket.conn.on("upgrade", (transport) => {
    console.log(`⚡ ${socket.id} upgraded to:`, transport.name);
  });

  // User comes online
  socket.on('userOnline', ({ userId }) => {
    if (!userId) {
      console.error('❌ userOnline: Missing userId');
      return;
    }
    onlineUsers.set(userId.toString(), socket.id);
    console.log(`👤 User ${userId} is online (socket: ${socket.id})`);
    console.log('📊 Online users:', Array.from(onlineUsers.entries()));
  });

  // Join a chatroom - ENHANCED DEBUGGING
  socket.on('joinRoom', async ({ roomId, userId }) => {
    console.log(`🎯 JOIN ROOM REQUEST:`);
    console.log(`   - Socket: ${socket.id}`);
    console.log(`   - User: ${userId}`);
    console.log(`   - Room: ${roomId}`);
    console.log(`   - Timestamp: ${new Date().toISOString()}`);

    if (!roomId || !userId) {
      console.error('❌ joinRoom: Missing roomId or userId');
      socket.emit('error', { message: 'Missing roomId or userId' });
      return;
    }

    socket.join(roomId);
    console.log(`✅ User ${socket.id} joined room ${roomId}`);
    console.log(`🏠 Rooms for ${socket.id}:`, Array.from(socket.rooms));
    console.log(`👥 All users in room ${roomId}:`, Array.from(io.sockets.adapter.rooms.get(roomId) || []));

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

      console.log('🏠 ChatRoom participants:', chatRoom.participants.map(p => ({
        id: p._id,
        name: p.name
      })));

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
        console.log('📍 Resuming from state:', currentState, 'Last message:', lastMsg.option);
      } else {
        console.log('📭 No previous messages, starting fresh');
      }

      // Send initial data
      const initialData = {
        messages,
        currentState,
        userRole,
        roomInfo: {
          propertyTitle: chatRoom.name,
          participants: chatRoom.participants
        }
      };

      socket.emit('initialData', initialData);
      console.log(`✅ Sent initial data to user ${userId}:`, {
        messageCount: messages.length,
        currentState,
        userRole,
        roomName: chatRoom.name
      });

    } catch (error) {
      console.error('❌ Error joining room:', error);
      console.error('❌ Error stack:', error.stack);
      socket.emit('error', { 
        message: 'Failed to join room', 
        error: error.message,
        stack: error.stack 
      });
    }
  });

  // Handle sending a message - ENHANCED DEBUGGING
  socket.on('sendMessage', async ({ roomId, sender, optionId, optionText, nextState, senderRole }) => {
    console.log(`📤 SEND MESSAGE REQUEST:`);
    console.log(`   - Room: ${roomId}`);
    console.log(`   - Sender: ${sender}`);
    console.log(`   - Option: ${optionText}`);
    console.log(`   - Next State: ${nextState}`);
    console.log(`   - Sender Role: ${senderRole}`);

    try {
      if (!roomId || !sender || !optionId || !optionText || !nextState || !senderRole) {
        const missing = [];
        if (!roomId) missing.push('roomId');
        if (!sender) missing.push('sender');
        if (!optionId) missing.push('optionId');
        if (!optionText) missing.push('optionText');
        if (!nextState) missing.push('nextState');
        if (!senderRole) missing.push('senderRole');
        
        console.error('❌ Missing required fields:', missing);
        socket.emit('error', { message: `Missing required fields: ${missing.join(', ')}` });
        return;
      }

      // Get sender info
      const senderUser = await User.findById(sender).select('name picture');
      console.log(`👤 Sender info:`, senderUser);

      // Activate room if pending
      const room = await ChatRoom.findById(roomId).populate('participants', '_id name pushToken notificationSettings');
      if (room) {
        console.log(`🏠 Room status: ${room.status}, hasMessages: ${room.hasMessages}`);
        
        if (room.status === 'pending' && !room.hasMessages) {
          await ChatRoom.findByIdAndUpdate(roomId, {
            status: 'active',
            hasMessages: true,
            firstMessageAt: new Date(),
            lastMessage: optionText,
            updatedAt: new Date()
          });
          console.log('✅ Room activated from pending to active:', roomId);
        } else {
          await ChatRoom.findByIdAndUpdate(roomId, {
            lastMessage: optionText,
            updatedAt: new Date()
          });
        }
      } else {
        console.error('❌ Room not found in database:', roomId);
      }

      // Save message
      let chat = await Chat.findOne({ roomId });
      if (!chat) {
        chat = new Chat({ roomId, messages: [] });
        console.log('📝 Created new chat document');
      } else {
        console.log('📝 Found existing chat with', chat.messages.length, 'messages');
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
      console.log('💾 Message saved to database');

      // Broadcast to room
      const broadcastData = {
        message: {
          sender: newMessage.sender,
          optionId: newMessage.optionId,
          option: newMessage.option,
          nextState: newMessage.nextState,
          senderRole: newMessage.senderRole,
          createdAt: newMessage.createdAt
        },
        nextState
      };

      console.log(`📢 Broadcasting to room ${roomId}:`, broadcastData);
      io.in(roomId).emit('newMessage', broadcastData);
      console.log(`✅ Message broadcast to room ${roomId}`);

      // 🔔 PUSH NOTIFICATIONS - ENHANCED DEBUGGING
      if (room && room.participants) {
        console.log(`🔔 Checking push notifications for ${room.participants.length} participants`);
        
        for (const participant of room.participants) {
          if (participant._id.toString() === sender.toString()) {
            console.log(`⏩ Skipping sender: ${participant._id}`);
            continue;
          }
          
          const recipientSocketId = onlineUsers.get(participant._id.toString());
          const isRecipientInRoom = recipientSocketId && io.sockets.adapter.rooms.get(roomId)?.has(recipientSocketId);
          
          console.log(`👤 Participant ${participant._id}:`, {
            socketId: recipientSocketId,
            inRoom: isRecipientInRoom,
            hasPushToken: !!participant.pushToken
          });

          if (!isRecipientInRoom && participant.pushToken) {
            const notifEnabled = participant.notificationSettings?.enabled !== false;
            const chatNotifEnabled = participant.notificationSettings?.chatMessages !== false;
            
            console.log(`🔔 Notification settings for ${participant._id}:`, {
              notifEnabled,
              chatNotifEnabled
            });

            if (notifEnabled && chatNotifEnabled) {
              try {
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
              } catch (pushError) {
                console.error('❌ Push notification failed:', pushError);
              }
            } else {
              console.log(`🔕 Notifications disabled for ${participant._id}`);
            }
          } else {
            console.log(`🔕 Skipping push for ${participant._id} (online in room)`);
          }
        }
      }

    } catch (error) {
      console.error('❌ Error sending message:', error);
      console.error('❌ Error stack:', error.stack);
      socket.emit('error', { 
        message: 'Failed to send message', 
        error: error.message,
        stack: error.stack 
      });
    }
  });

  // Handle typing indicator
  socket.on('typing', ({ roomId, userId, isTyping }) => {
    console.log(`⌨️ Typing: User ${userId} in room ${roomId} - ${isTyping}`);
    socket.to(roomId).emit('userTyping', { userId, isTyping });
  });

  // Handle user leaving room
  socket.on('leaveRoom', ({ roomId, userId }) => {
    console.log(`👋 User ${userId} leaving room ${roomId}`);
    socket.leave(roomId);
    console.log(`✅ User left room. Current rooms:`, Array.from(socket.rooms));
  });

  socket.on('disconnect', (reason) => {
    console.log(`❌ User disconnected: ${socket.id}, Reason: ${reason}`);
    
    // Remove from online users
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`👋 User ${userId} went offline`);
        break;
      }
    }
    
    console.log('📊 Remaining online users:', Array.from(onlineUsers.entries()));
    console.log(`📊 Total connections now: ${io.engine.clientsCount}`);
  });

  socket.on('error', (error) => {
    console.error('❌ Socket error:', error);
  });
});

// 🔥 ADD DEBUG ENDPOINTS
app.get("/api/debug/connections", (req, res) => {
  const connections = [];
  io.sockets.sockets.forEach(socket => {
    connections.push({
      id: socket.id,
      connected: socket.connected,
      rooms: Array.from(socket.rooms),
      handshake: {
        address: socket.handshake.address,
        query: socket.handshake.query,
        headers: socket.handshake.headers
      }
    });
  });
  
  res.json({
    totalConnections: io.engine.clientsCount,
    onlineUsers: Array.from(onlineUsers.entries()),
    connections: connections
  });
});

app.get("/api/debug/rooms", (req, res) => {
  const rooms = {};
  io.sockets.adapter.rooms.forEach((sockets, roomId) => {
    rooms[roomId] = Array.from(sockets);
  });
  
  res.json({
    totalRooms: Object.keys(rooms).length,
    rooms: rooms
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
  console.log(`🐛 Debug endpoints available:`);
  console.log(`   - /api/health`);
  console.log(`   - /api/debug/connections`);
  console.log(`   - /api/debug/rooms`);
});

app.get("/api/health", (req, res) => {
  console.log("💓 Health check ping at", new Date().toISOString());
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount,
    onlineUsers: onlineUsers.size
  });
});

export default io;