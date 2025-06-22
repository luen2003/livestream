import React, { useRef, useEffect, useState } from 'react';
import { socket } from '../socket';

export default function Broadcaster() {
  const localVideo = useRef();
  const peerConnections = useRef({});

  const [streamName, setStreamName] = useState('');
  const [userName, setUserName] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [viewersCount, setViewersCount] = useState(0);  // Thêm trạng thái số người xem

  useEffect(() => {
    if (!isStreaming) return;

    // Gửi thông tin broadcaster lên server khi bắt đầu stream
    socket.emit('broadcaster', { livestreamName: streamName, userName });

    // Lắng nghe khi có người xem
    socket.on('watcher', async watcherId => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      });

      peerConnections.current[watcherId] = pc;

      localVideo.current.srcObject.getTracks().forEach(track => pc.addTrack(track, localVideo.current.srcObject));

      pc.onicecandidate = e => {
        if (e.candidate) {
          socket.emit('candidate', watcherId, e.candidate);
        }
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', watcherId, pc.localDescription);
      } catch (err) {
        console.error('Error creating or sending offer:', err);
      }

      // Tăng số lượng người xem khi có người xem mới
      setViewersCount(prevCount => prevCount + 1);
    });

    // Lắng nghe câu trả lời từ người xem
    socket.on('answer', (id, description) => {
      const pc = peerConnections.current[id];
      if (!pc) return;
      pc.setRemoteDescription(new RTCSessionDescription(description)).catch(console.error);
    });

    // Lắng nghe candidate ICE từ người xem
    socket.on('candidate', (id, candidate) => {
      const pc = peerConnections.current[id];
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
    });

    // Xử lý khi người xem ngắt kết nối
    socket.on('disconnectPeer', id => {
      const pc = peerConnections.current[id];
      if (pc) {
        pc.close();
        delete peerConnections.current[id];
      }

      // Giảm số lượng người xem khi người xem ngắt kết nối
      setViewersCount(prevCount => prevCount - 1);
    });

    return () => {
      socket.off('watcher');
      socket.off('answer');
      socket.off('candidate');
      socket.off('disconnectPeer');

      Object.values(peerConnections.current).forEach(pc => pc.close());
      peerConnections.current = {};
    };
  }, [isStreaming]);

  const handleStartStream = () => {
    setError('');
    if (!streamName.trim()) {
      setError('Vui lòng nhập tên livestream');
      return;
    }
    if (!userName.trim()) {
      setError('Vui lòng nhập tên người dùng');
      return;
    }
    setIsStreaming(true);
  };

  return (
    <div>
      {!isStreaming ? (
        <div>
          <div style={{ marginBottom: 10 }}>
            <label>
              Tên người dùng (Streamer): <br />
              <input
                type="text"
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="Nhập tên của bạn"
                style={{ width: '100%', padding: 8 }}
              />
            </label>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label>
              Tên Livestream: <br />
              <input
                type="text"
                value={streamName}
                onChange={e => setStreamName(e.target.value)}
                placeholder="Nhập tên livestream"
                style={{ width: '100%', padding: 8 }}
              />
            </label>
          </div>
          {error && (
            <div style={{ color: 'red', marginBottom: 10 }}>
              {error}
            </div>
          )}
          <button onClick={handleStartStream} style={{ padding: '10px 20px', fontSize: 16 }}>
            Xác nhận và bắt đầu Livestream
          </button>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 10 }}>
            <strong>{`Livestream: ${streamName} - Người dùng: ${userName}`}</strong>
          </div>
          <div style={{ marginBottom: 10 }}>
            <span>{`Số người xem: ${viewersCount}`}</span> {/* Hiển thị số người xem */}
          </div>
          <video
            ref={localVideo}
            autoPlay
            muted
            playsInline
            style={{ width: '100%', backgroundColor: '#000' }}
          />
        </div>
      )}
    </div>
  );
}
