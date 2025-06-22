const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://react-livestream-app.onrender.com/",  
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 4000;

const broadcasters = {};  // Lưu thông tin của broadcaster { socketId: {id, livestreamName, userName} }
const viewers = {};  // Lưu danh sách người xem theo broadcasterId
const users = {};  // Lưu userName theo socketId (bao gồm cả broadcaster và viewer)

// Middleware
app.use(cors({
  origin: "https://react-livestream-app.onrender.com/",
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

      // Thêm viewer vào danh sách của broadcaster
      if (!viewers[broadcasterId]) {
        viewers[broadcasterId] = [];
      }
      viewers[broadcasterId].push(socket.id);

      // Cập nhật số người xem cho broadcaster
      io.to(broadcasterId).emit('viewerCount', viewers[broadcasterId].length);
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

  // Khi ngắt kết nối
  socket.on('disconnect', () => {
    delete users[socket.id];

    if (broadcasters[socket.id]) {
      // Xóa broadcaster khi ngắt kết nối
      delete broadcasters[socket.id];
      io.emit('broadcastersList', Object.values(broadcasters));

      // Xóa viewer khỏi danh sách khi broadcaster ngắt kết nối
      for (const broadcasterId in viewers) {
        const index = viewers[broadcasterId].indexOf(socket.id);
        if (index !== -1) {
          viewers[broadcasterId].splice(index, 1);
          io.to(broadcasterId).emit('viewerCount', viewers[broadcasterId].length);
          break;
        }
      }
    }

    // Xóa viewer khỏi danh sách khi viewer ngắt kết nối
    for (const broadcasterId in viewers) {
      const index = viewers[broadcasterId].indexOf(socket.id);
      if (index !== -1) {
        viewers[broadcasterId].splice(index, 1);
        io.to(broadcasterId).emit('viewerCount', viewers[broadcasterId].length);
        break;
      }
    }

    socket.broadcast.emit('disconnectPeer', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
