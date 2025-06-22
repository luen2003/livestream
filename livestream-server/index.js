const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "http://localhost:3000",  // URL của client
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 4000;

const broadcasters = {};  // Lưu thông tin của broadcaster { socketId: {id, livestreamName, userName} }
const users = {};  // Lưu userName theo socketId (bao gồm cả broadcaster và viewer)

// Middleware
app.use(cors({
  origin: "http://localhost:3000",  // URL của client
  methods: ["GET", "POST"],
  credentials: true
}));

const __dirnamePath = path.resolve();

if (process.env.NODE_ENV === 'production') {
  const clientBuildPath = path.join(__dirnamePath, 'livestream-client', 'build');
  app.use(express.static(clientBuildPath));

  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('API is running....');
  });
}

io.on('connection', socket => {
  console.log('New connection:', socket.id);

  // Client gửi tên user lên server (cả broadcaster hoặc viewer)
  socket.on('setUserName', (userName) => {
    users[socket.id] = userName || 'Unknown';  // Lưu tên người dùng vào users
  });

  // Broadcaster đăng ký livestream, gửi streamName + userName
  socket.on('broadcaster', (data) => {
    broadcasters[socket.id] = {
      id: socket.id,
      livestreamName: data.livestreamName || `Livestream ${Object.keys(broadcasters).length + 1}`,
      userName: data.userName || 'Streamer'
    };

    users[socket.id] = data.userName || 'Streamer';

    io.emit('broadcastersList', Object.values(broadcasters));
  });

  // Viewer yêu cầu danh sách livestream
  socket.on('getBroadcastersList', () => {
    socket.emit('broadcastersList', Object.values(broadcasters));
  });

  // Viewer muốn xem broadcaster nào (gửi broadcasterId)
  socket.on('watcher', (broadcasterId) => {
    if (broadcasters[broadcasterId]) {
      socket.to(broadcasterId).emit('watcher', socket.id);
    }
  });

  // WebRTC signaling
  socket.on('offer', (id, message) => {
    socket.to(id).emit('offer', socket.id, message);
  });

  socket.on('answer', (id, message) => {
    socket.to(id).emit('answer', socket.id, message);
  });

  socket.on('candidate', (id, message) => {
    socket.to(id).emit('candidate', socket.id, message);
  });

  // Chat message broadcast, kèm tên userName
  socket.on('chat-message', (message) => {
    const userName = users[socket.id] || 'Unknown';  // Lấy tên người dùng từ `users`
    io.emit('chat-message', { id: socket.id, userName, message });
  });

  // Khi ngắt kết nối
  socket.on('disconnect', () => {
    delete users[socket.id];

    if (broadcasters[socket.id]) {
      delete broadcasters[socket.id];
      io.emit('broadcastersList', Object.values(broadcasters));
    }

    socket.broadcast.emit('disconnectPeer', socket.id);
  });
});


server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
