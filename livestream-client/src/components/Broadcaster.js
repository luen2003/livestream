import React, { useRef, useEffect, useState } from 'react';
import { socket } from '../socket';

export default function Broadcaster() {
  const localVideo = useRef();
  const peerConnections = useRef({});

  const [streamName, setStreamName] = useState('');
  const [userName, setUserName] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [viewersCount, setViewersCount] = useState(0);  // Trạng thái số người xem

  useEffect(() => {
    if (!isStreaming) return;

    // Lấy media stream từ camera và microphone
    const getMediaStream = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true
        });
        localVideo.current.srcObject = stream;  // Gán stream vào video
        return stream;
      } catch (err) {
        console.error("Error accessing media devices.", err);
        setError("Không thể truy cập camera và microphone.");
        setIsStreaming(false);
      }
    };

    getMediaStream().then(stream => {
      socket.emit('broadcaster', { livestreamName: streamName, userName });

      // Lắng nghe khi có người xem
      socket.on('watcher', async watcherId => {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        });

        peerConnections.current[watcherId] = pc;

        stream.getTracks().forEach(track => pc.addTrack(track, stream));

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

        // Cập nhật số người xem
        socket.emit('getBroadcastersList');
      });

      // Lắng nghe sự thay đổi số lượng người xem
      socket.on('broadcastersList', (broadcasters) => {
        const broadcaster = broadcasters.find(b => b.id === socket.id);
        if (broadcaster) {
          setViewersCount(broadcaster.viewersCount);
        }
      });
    });

    return () => {
      socket.off('watcher');
      socket.off('answer');
      socket.off('candidate');
      socket.off('broadcastersList');

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
