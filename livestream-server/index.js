const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: {
    origin: "https://react-livestream-app.onrender.com",  // URL của client
    methods: ["GET", "POST"],
    credentials: true,
  },
});

const PORT = process.env.PORT || 4000;

// Lưu thông tin broadcaster và người dùng
const broadcasters = {};  // { socketId: { id, livestreamName, userName, viewersCount, viewersList } }
const users = {};  // { socketId: userName }

app.use(cors({
  origin: "https://react-livestream-app.onrender.com",  // URL của client
  methods: ["GET", "POST"],
  credentials: true,
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
    users[socket.id] = userName || 'Unknown';
  });

  // Broadcaster đăng ký livestream, gửi streamName + userName
  socket.on('broadcaster', (data) => {
    broadcasters[socket.id] = {
      id: socket.id,
      livestreamName: data.livestreamName || `Livestream ${Object.keys(broadcasters).length + 1}`,
      userName: data.userName || 'Streamer',
      viewersCount: 0, // Mới tạo, chưa có người xem
      viewersList: [], // Danh sách người xem (ID)
    };

    users[socket.id] = data.userName || 'Streamer';

    io.emit('broadcastersList', Object.values(broadcasters)); // Cập nhật danh sách livestreams
  });

  // Viewer yêu cầu danh sách livestream
  socket.on('getBroadcastersList', () => {
    socket.emit('broadcastersList', Object.values(broadcasters));
  });

  // Viewer muốn xem broadcaster nào (gửi broadcasterId)
  socket.on('watcher', (broadcasterId) => {
    if (broadcasters[broadcasterId]) {
      // Nếu người xem chưa có trong danh sách viewers, thêm vào
      if (!broadcasters[broadcasterId].viewersList.includes(socket.id)) {
        broadcasters[broadcasterId].viewersList.push(socket.id);
        broadcasters[broadcasterId].viewersCount++; // Tăng số lượng người xem
      }
      socket.to(broadcasterId).emit('watcher', socket.id); // Gửi thông báo tới broadcaster
      io.emit('broadcastersList', Object.values(broadcasters)); // Cập nhật lại danh sách broadcaster
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
    // Kiểm tra các broadcaster có socketId của người dùng không
    Object.keys(broadcasters).forEach(broadcasterId => {
      const broadcaster = broadcasters[broadcasterId];
      const viewerIndex = broadcaster.viewersList.indexOf(socket.id);

      if (viewerIndex !== -1) {
        // Xóa người xem khỏi danh sách viewers
        broadcaster.viewersList.splice(viewerIndex, 1);
        broadcaster.viewersCount--; // Giảm số người xem

        io.emit('broadcastersList', Object.values(broadcasters)); // Cập nhật danh sách broadcaster
      }
    });

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
