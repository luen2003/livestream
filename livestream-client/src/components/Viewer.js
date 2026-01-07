import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import Chat from './Chat';

export default function Viewer({ broadcasterId }) {
  const mainVideo = useRef(); // Video chính (Screen hoặc Camera khi ở mode đơn)
  const pipVideo = useRef();  // Video phụ (Camera khi ở mode Both)

  const [userName, setUserName] = useState('');
  const [isViewing, setIsViewing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState('');
  const [mediaState, setMediaState] = useState({ videoEnabled: true, audioEnabled: true });
  const [isStreamEnded, setIsStreamEnded] = useState(false);

  // State để quản lý layout: camera | screen | both
  const [viewMode, setViewMode] = useState('camera');

  const handleStartViewing = () => {
    if (!userName.trim()) {
      setError('Nhập tên');
      return;
    }
    setError('');
    setIsViewing(true);
    socket.emit('setUserName', userName);
    socket.emit('watcher', broadcasterId);
  };

  useEffect(() => {
    if (!isViewing || !broadcasterId) return;

    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: ['stun:hk-turn1.xirsys.com'] },
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    });

    // Xử lý khi nhận được Stream từ Broadcaster
    pc.ontrack = (e) => {
      const stream = e.streams[0];
      console.log("Received track:", e.track.kind, "Stream ID:", stream.id);

      if (!pipVideo.current.srcObject) {
        if (mainVideo.current) mainVideo.current.srcObject = stream;
      }

      if (mainVideo.current && mainVideo.current.srcObject && mainVideo.current.srcObject.id !== stream.id) {
        if (pipVideo.current) pipVideo.current.srcObject = stream;
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('candidate', broadcasterId, e.candidate);
    };

    socket.on('offer', async (id, desc) => {
      if (id !== broadcasterId) return;
      await pc.setRemoteDescription(new RTCSessionDescription(desc));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', broadcasterId, answer);
    });

    socket.on('candidate', (id, candidate) => {
      if (id === broadcasterId) pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on('media-state-changed', (state) => {
      setMediaState(state);
    });

    socket.on('broadcaster-mode-updated', (mode) => {
      console.log("Mode updated to:", mode);
      setViewMode(mode);
      if (mode !== 'both') {
        if (pipVideo.current) pipVideo.current.srcObject = null;
      }
    });

    socket.on('stream-ended', () => {
      setIsStreamEnded(true);
      setTimeout(() => {
        window.location.href = '/';
      }, 3000);
    });

    socket.on('viewerCount', (count) => setViewerCount(count));

    return () => {
      pc.close();
      socket.off('offer');
      socket.off('candidate');
      socket.off('viewerCount');
      socket.off('media-state-changed');
      socket.off('stream-ended');
      socket.off('broadcaster-mode-updated');
    };
  }, [isViewing, broadcasterId]);

  if (isStreamEnded) {
    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'black', color: 'white' }}>
        <h1>Livestream đã kết thúc</h1>
        <p>Đang quay về trang chủ trong 3 giây...</p>
      </div>
    );
  }

  if (!isViewing) {
    return (
      <div>
        <input
          placeholder="Tên của bạn"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          style={{ width: '100%', marginBottom: 10, height: 40, fontSize: 16 }}
        />
        {error && <div style={{ color: 'red' }}>{error}</div>}
        <button
          onClick={handleStartViewing}
          style={{ width: '100%', height: 45, fontSize: 16 }}
        >
          Xem livestream
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '10px' }}>

      {/* Header với nút Trở về và thông tin stream */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: '10px', gap: '5px' }}>

        {/* Nút Trở về */}
        <button
          onClick={() => window.location.reload()}
          style={{
            background: '#6c757d',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          ⬅ Trở về
        </button>
        <span style={{ fontWeight: 'bold' }}>
          Đang xem | <span style={{ color: '#000' }}>Viewers: {viewerCount}</span>
        </span>
      </div>

      <div style={{
        position: 'relative',
        background: '#000',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        minHeight: '400px',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center'
      }}>

        {/* Overlay trạng thái */}
        {!mediaState.videoEnabled && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(45, 45, 45, 0.9)', color: 'white', zIndex: 15 }}>
            <h2 style={{ marginBottom: '10px' }}>📷</h2>
            <p style={{ fontSize: '18px' }}>Người phát đã tạm tắt Hình ảnh</p>
          </div>
        )}

        {!mediaState.audioEnabled && (
          <div style={{ position: 'absolute', top: 15, right: 15, zIndex: 20, background: '#ff4d4f', color: 'white', padding: '6px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: '600', display: 'flex', alignItems: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
            <span style={{ marginRight: '5px' }}>🔇</span> Muted
          </div>
        )}

        {/* --- VIDEO AREA --- */}

        {/* Main Video */}
        <video
          ref={mainVideo}
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            maxHeight: '80vh',
            objectFit: viewMode === 'screen' || viewMode === 'both' ? 'contain' : 'cover'
          }}
        />

        {/* PIP Video */}
        <video
          ref={pipVideo}
          autoPlay
          playsInline
          style={{
            display: viewMode === 'both' ? 'block' : 'none',
            position: 'absolute',
            bottom: 15,
            right: 15,
            width: '25%',
            aspectRatio: '16/9',
            objectFit: 'cover',
            border: '2px solid rgba(255, 255, 255, 0.8)',
            borderRadius: '8px',
            zIndex: 10,
            backgroundColor: '#1a1a1a',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }}
        />
      </div>

      <div style={{ marginTop: '20px' }}>
        <Chat broadcasterId={broadcasterId} />
      </div>
    </div>
  );
}