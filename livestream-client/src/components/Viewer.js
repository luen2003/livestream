import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import Chat from './Chat';  // Import Chat component

export default function Viewer({ broadcasterId }) {
  const remoteVideo = useRef(null);  // Khai báo ref cho video
  const [userName, setUserName] = useState('');
  const [isViewing, setIsViewing] = useState(false);
  const [error, setError] = useState('');
  const [viewerCount, setViewerCount] = useState(0); // 👉 Thêm state viewerCount

  useEffect(() => {
    if (userName.trim()) {
      socket.emit('setUserName', userName);  // Gửi tên người dùng lên server
    }
  }, [userName]);

  const handleStartViewing = () => {
    setError('');
    if (!userName.trim()) {
      setError('Vui lòng nhập tên người xem');
      return;
    }
    setIsViewing(true);
    socket.emit('watcher', broadcasterId); // Yêu cầu xem livestream từ broadcaster
  };

  useEffect(() => {
    if (!isViewing || !broadcasterId) return;

    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    peerConnection.ontrack = (event) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0]; // Phát video livestream
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('candidate', broadcasterId, event.candidate); // Gửi ICE candidate
      }
    };

    socket.on('offer', async (id, description) => {
      if (id !== broadcasterId) return;

      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', broadcasterId, answer);  // Gửi answer tới broadcaster
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });

    socket.on('candidate', (id, candidate) => {
      if (id !== broadcasterId) return;
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate)); // Thêm ICE candidate
    });

    // 👉 Nhận viewerCount từ server
    socket.on('viewerCount', (count) => {
      setViewerCount(count);
    });

    return () => {
      peerConnection.close();
      socket.off('offer');
      socket.off('candidate');
      socket.off('viewerCount');
    };
  }, [isViewing, broadcasterId]);

  if (!isViewing) {
    return (
      <div>
        <div style={{ marginBottom: 10 }}>
          <label>
            Tên người xem: <br />
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Nhập tên của bạn"
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </div>
        {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
        <button onClick={handleStartViewing} style={{ padding: '10px 20px', fontSize: 16 }}>
          Xác nhận và xem Livestream
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <strong>Số người xem hiện tại: {viewerCount}</strong>
      </div>
      <video
        ref={remoteVideo}
        autoPlay
        playsInline
        controls={false}
        style={{ width: '100%', backgroundColor: '#000' }}
      />
      <Chat />
    </div>
  );
}
