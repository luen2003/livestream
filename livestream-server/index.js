const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    //origin: "http://localhost:3000",
    origin: "https://react-livestream-app.onrender.com/",
    methods: ["GET", "POST"],
  }
});

const PORT = process.env.PORT || 4000;

const broadcasters = {}; // { socketId: { id, livestreamName, userName } }
const viewers = {}; // { broadcasterId: [ viewerSocketId, ... ] }
const users = {}; // { socketId: userName }

app.use(cors({
    origin: "http://localhost:3000",
    //origin: "https://react-livestream-app.onrender.com/",
    methods: ["GET", "POST"],
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

io.on('connection', (socket) => {
  console.log('New connection:', socket.id);

  socket.on('setUserName', (userName) => {
    users[socket.id] = userName || 'Unknown';
  });
  socket.on('media-state-changed', ({ broadcasterId, videoEnabled, audioEnabled }) => {
    const viewersInStream = viewers[broadcasterId] || [];
    viewersInStream.forEach((viewerId) => {
      io.to(viewerId).emit('media-state-changed', { videoEnabled, audioEnabled });
    });
  });

  socket.on("broadcasterModeChanged", ({ broadcasterId, mode }) => {
    console.log(`Broadcaster ${broadcasterId} đổi chế độ: ${mode}`);
    socket.broadcast.emit("broadcasterModeChanged", { broadcasterId, mode });
  });

  socket.on('broadcaster', (data) => {
    broadcasters[socket.id] = {
      id: socket.id,
      livestreamName: data.livestreamName || `Livestream ${Object.keys(broadcasters).length + 1}`,
      userName: data.userName || 'Streamer'
    };
    users[socket.id] = data.userName || 'Streamer';

    io.emit('broadcastersList', Object.values(broadcasters));
  });

  socket.on('getBroadcastersList', () => {
    socket.emit('broadcastersList', Object.values(broadcasters));
  });

  socket.on('watcher', (broadcasterId) => {
    if (!broadcasters[broadcasterId]) return;

    socket.to(broadcasterId).emit('watcher', socket.id);

    if (!viewers[broadcasterId]) {
      viewers[broadcasterId] = [];
    }

    if (!viewers[broadcasterId].includes(socket.id)) {
      viewers[broadcasterId].push(socket.id);
    }

    const count = viewers[broadcasterId].length;

    // Gửi viewerCount cho broadcaster
    io.to(broadcasterId).emit('viewerCount', count);

    // Gửi viewerCount cho tất cả viewer đang xem stream đó
    viewers[broadcasterId].forEach((viewerId) => {
      io.to(viewerId).emit('viewerCount', count);
    });
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

  socket.on('changeVideoSource', (newSource) => {
    socket.broadcast.emit('changeVideoSource', newSource);
  });

  socket.on('chat-message', ({ broadcasterId, message }) => {
  const userName = users[socket.id] || 'Unknown';
  const viewersInStream = viewers[broadcasterId] || [];
  [...viewersInStream, broadcasterId].forEach(id => {
    io.to(id).emit('chat-message', {
      id: socket.id,
      userName,
      message,
      broadcasterId
    });
  });
});


  socket.on('disconnect', () => {
    delete users[socket.id];
// Nếu là broadcaster
    if (broadcasters[socket.id]) {
      // ---> THÊM MỚI: Báo cho tất cả viewer là stream đã kết thúc TRƯỚC KHI xóa dữ liệu
      const viewerList = viewers[socket.id] || [];
      viewerList.forEach((viewerId) => {
        io.to(viewerId).emit('stream-ended'); // Sự kiện này kích hoạt chuyển trang ở Viewer
        io.to(viewerId).emit('viewerCount', 0);
      });

      delete broadcasters[socket.id];
      io.emit('broadcastersList', Object.values(broadcasters));

      delete viewers[socket.id]; 
    }
    // Nếu là broadcaster
    if (broadcasters[socket.id]) {
      delete broadcasters[socket.id];
      io.emit('broadcastersList', Object.values(broadcasters));

      // Gỡ tất cả viewer của broadcaster này
      const viewerList = viewers[socket.id] || [];
      delete viewers[socket.id];

      // Gửi viewerCount = 0 cho viewer và broadcaster (đã ngắt)
      viewerList.forEach((viewerId) => {
        io.to(viewerId).emit('viewerCount', 0);
      });
    }

    // Nếu là viewer
    for (const broadcasterId in viewers) {
      const viewerIndex = viewers[broadcasterId].indexOf(socket.id);
      if (viewerIndex !== -1) {
        viewers[broadcasterId].splice(viewerIndex, 1);

        const count = viewers[broadcasterId].length;

        // Gửi viewerCount cho broadcaster
        io.to(broadcasterId).emit('viewerCount', count);

        // Gửi viewerCount cho tất cả viewer còn lại
        viewers[broadcasterId].forEach((viewerId) => {
          io.to(viewerId).emit('viewerCount', count);
        });

        break;
      }
    }

    socket.broadcast.emit('disconnectPeer', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});