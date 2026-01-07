const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:3000", "https://react-livestream-app.onrender.com/"],
    methods: ["GET", "POST"],
  }
});

const PORT = process.env.PORT || 4000;

const broadcasters = {}; 
const viewers = {}; 
const users = {}; 

app.use(cors({
    origin: ["http://localhost:3000", "https://react-livestream-app.onrender.com/"],
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
socket.on('stream-ended', (broadcasterId) => {
    const viewersInStream = viewers[broadcasterId] || [];
    viewersInStream.forEach((viewerId) => {
      io.to(viewerId).emit('stream-ended', broadcasterId);
    });
    // Xóa dữ liệu
    if (broadcasters[broadcasterId]) {
      delete broadcasters[broadcasterId];
      io.emit('broadcastersList', Object.values(broadcasters));
    }
  });
  socket.on('setUserName', (userName) => {
    users[socket.id] = userName || 'Unknown';
  });

  socket.on('media-state-changed', ({ broadcasterId, videoEnabled, audioEnabled }) => {
    const viewersInStream = viewers[broadcasterId] || [];
    viewersInStream.forEach((viewerId) => {
      io.to(viewerId).emit('media-state-changed', { videoEnabled, audioEnabled });
    });
  });

  // ---> MỚI: Xử lý sự kiện đổi chế độ hiển thị (Camera/Screen/Both)
  socket.on('change-stream-mode', ({ broadcasterId, mode }) => {
    const viewersInStream = viewers[broadcasterId] || [];
    viewersInStream.forEach((viewerId) => {
      io.to(viewerId).emit('broadcaster-mode-updated', mode);
    });
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

    if (!viewers[broadcasterId]) viewers[broadcasterId] = [];
    if (!viewers[broadcasterId].includes(socket.id)) viewers[broadcasterId].push(socket.id);

    const count = viewers[broadcasterId].length;
    io.to(broadcasterId).emit('viewerCount', count);
    viewers[broadcasterId].forEach((viewerId) => {
      io.to(viewerId).emit('viewerCount', count);
    });
  });

  socket.on('offer', (id, message) => {
    socket.to(id).emit('offer', socket.id, message);
  });

  socket.on('answer', (id, message) => {
    socket.to(id).emit('answer', socket.id, message);
  });

  socket.on('candidate', (id, message) => {
    socket.to(id).emit('candidate', socket.id, message);
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
    if (broadcasters[socket.id]) {
      const viewerList = viewers[socket.id] || [];
      viewerList.forEach((viewerId) => {
        io.to(viewerId).emit('stream-ended');
        io.to(viewerId).emit('viewerCount', 0);
      });
      delete broadcasters[socket.id];
      io.emit('broadcastersList', Object.values(broadcasters));
      delete viewers[socket.id];
    }

    for (const broadcasterId in viewers) {
      const viewerIndex = viewers[broadcasterId].indexOf(socket.id);
      if (viewerIndex !== -1) {
        viewers[broadcasterId].splice(viewerIndex, 1);
        const count = viewers[broadcasterId].length;
        io.to(broadcasterId).emit('viewerCount', count);
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