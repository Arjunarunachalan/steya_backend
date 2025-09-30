import http from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import connectDB from './config/db.js';
import Chat from './models/chatmodal.js';
import ChatRoom from './models/roommodal.js';
import dotenv from 'dotenv';

dotenv.config();
connectDB();

const PORT = process.env.PORT || 8080;
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

io.on('connection', (socket) => {
  console.log('✅ User connected', socket.id);

  // Join a chatroom
  socket.on('joinRoom', async ({ roomId }) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);

    // Send previous messages if they exist
    const chat = await Chat.findOne({ roomId });
    if (chat) {
      socket.emit('previousMessages', chat.messages.map(msg => ({
        ...msg._doc,
        fromMe: false // default, frontend will mark own messages as fromMe
      })));
    }
  });

  // Handle sending a message
  socket.on('sendMessage', async ({ roomId, sender, option }) => {
    // 1️⃣ Save to Chat collection
    let chat = await Chat.findOne({ roomId });
    if (!chat) {
      chat = new Chat({ roomId, messages: [] });
    }
    const newMessage = { sender, option, createdAt: new Date() };
    chat.messages.push(newMessage);
    await chat.save();

    // 2️⃣ Update lastMessage in ChatRoom
    await ChatRoom.findByIdAndUpdate(roomId, {
      lastMessage: option,
      updatedAt: new Date()
    });

    // 3️⃣ Broadcast to everyone in the room
    io.in(roomId).emit('receiveMessage', { ...newMessage, fromMe: false });
  });

  socket.on('disconnect', () => console.log('❌ User disconnected', socket.id));
});

server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
