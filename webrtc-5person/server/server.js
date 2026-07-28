const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from client build in production
app.use(express.static(path.join(__dirname, '../client/dist')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Room state: roomId -> { users: Set<socketId>, chats: Array }
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('\u2705 User connected:', socket.id);

  socket.on('join-room', (roomId) => {
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Set(), chats: [] });
    }
    const room = rooms.get(roomId);
    room.users.add(socket.id);

    // Send existing users to new user
    const existingUsers = Array.from(room.users).filter(id => id !== socket.id);
    socket.emit('existing-users', existingUsers);

    // Notify others
    socket.to(roomId).emit('user-joined', socket.id);

    // Send chat history
    socket.emit('chat-history', room.chats);

    console.log(`\ud83d\udccc User ${socket.id} joined room ${roomId} (${room.users.size} users)`);
  });

  // WebRTC Signaling
  socket.on('offer', ({ target, offer }) => {
    socket.to(target).emit('offer', { sender: socket.id, offer });
  });

  socket.on('answer', ({ target, answer }) => {
    socket.to(target).emit('answer', { sender: socket.id, answer });
  });

  socket.on('ice-candidate', ({ target, candidate }) => {
    socket.to(target).emit('ice-candidate', { sender: socket.id, candidate });
  });

  // Chat
  socket.on('chat-message', ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      sender: socket.id,
      text,
      timestamp: new Date().toISOString()
    };
    room.chats.push(msg);
    // Keep last 100 messages
    if (room.chats.length > 100) room.chats.shift();
    io.to(roomId).emit('chat-message', msg);
  });

  // Disconnect cleanup
  socket.on('disconnect', () => {
    console.log('\u274c User disconnected:', socket.id);
    rooms.forEach((room, roomId) => {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        socket.to(roomId).emit('user-left', socket.id);
        if (room.users.size === 0) {
          rooms.delete(roomId);
          console.log(`\ud83d\uddd1\ufe0f Room ${roomId} deleted`);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\ud83d\ude80 Signaling server running on port ${PORT}`);
});
