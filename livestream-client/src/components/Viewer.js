import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import Chat from './Chat';

export default function Viewer({ broadcasterId }) {
  const screenVideo = useRef();
  const cameraVideo = useRef();
  const [userName, setUserName] = useState('');
  const [isViewing, setIsViewing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState('');
const [mediaState, setMediaState] = useState({ videoEnabled: true, audioEnabled: true });
  const [isStreamEnded, setIsStreamEnded] = useState(false);
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
        {
          username:
            'aX_0HogGPHRGNvdzUm4KbELKRKa2e1-XXU7ykTjLzxPvYGtToLCCxE85kSodQr4uAAAAAGh001hkbHVvbmd0YQ==',
          credential: '3e8fc950-6098-11f0-9c7a-0242ac120004',
          urls: [
            'turn:hk-turn1.xirsys.com:80?transport=udp',
            'turn:hk-turn1.xirsys.com:3478?transport=udp',
            'turn:hk-turn1.xirsys.com:80?transport=tcp',
            'turn:hk-turn1.xirsys.com:3478?transport=tcp',
            'turns:hk-turn1.xirsys.com:443?transport=tcp',
            'turns:hk-turn1.xirsys.com:5349?transport=tcp',
          ],
        },
        { urls: 'stun:stun.l.google.com:19302' },
      ],
    });

    pc.ontrack = (e) => {
      if (e.track.kind === 'video') {
        if (!screenVideo.current.srcObject) {
          screenVideo.current.srcObject = e.streams[0];
        } else {
          cameraVideo.current.srcObject = e.streams[0];
        }
      }
      if (e.track.kind === 'audio') {
        if (!screenVideo.current.srcObject) screenVideo.current.srcObject = e.streams[0];
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
    // ---> THÊM: Lắng nghe sự kiện Stream kết thúc
    socket.on('stream-ended', () => {
      setIsStreamEnded(true); // Hiển thị màn hình thông báo
      
      // Đếm ngược 3 giây rồi reload về trang chủ
      setTimeout(() => {
        window.location.href = '/'; // Hoặc window.location.reload()
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
    };
  }, [isViewing, broadcasterId]);
if (isStreamEnded) {
    return (
      <div style={{ 
        height: '100vh', display: 'flex', flexDirection: 'column', 
        alignItems: 'center', justifyContent: 'center', background: 'black', color: 'white' 
      }}>
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
      <p style={{ fontWeight: 'bold' }}>
        Đang xem | <span style={{ color: '#1890ff' }}>Viewers: {viewerCount}</span>
      </p>
      
      {/* Container chính cho Video */}
      <div style={{ 
        position: 'relative', 
        background: '#000', 
        borderRadius: '12px', 
        overflow: 'hidden', 
        boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
        minHeight: '300px' 
      }}>
        
        {/* 1. Overlay thông báo khi Broadcaster tắt Camera hoàn toàn */}
        {!mediaState.videoEnabled && (
          <div style={{ 
            position: 'absolute', 
            inset: 0, 
            display: 'flex', 
            flexDirection: 'column',
            alignItems: 'center', 
            justifyContent: 'center', 
            background: 'rgba(45, 45, 45, 0.9)', 
            color: 'white', 
            zIndex: 15 
          }}>
            <h2 style={{ marginBottom: '10px' }}>📷</h2>
            <p style={{ fontSize: '18px' }}>Người phát đã tạm tắt Camera</p>
          </div>
        )}

        {/* 2. Icon thông báo khi Broadcaster tắt Mic (Góc trên bên phải) */}
        {!mediaState.audioEnabled && (
          <div style={{ 
            position: 'absolute', 
            top: 15, 
            right: 15, 
            zIndex: 20, 
            background: '#ff4d4f', 
            color: 'white', 
            padding: '6px 12px', 
            borderRadius: '20px',
            fontSize: '14px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
          }}>
            <span style={{ marginRight: '5px' }}>🔇</span> Muted
          </div>
        )}

        {/* 3. Video chính (Thường là Màn hình hoặc luồng camera chính) */}
        <video 
          ref={screenVideo} 
          autoPlay 
          playsInline 
          style={{ 
            width: '100%', 
            display: 'block',
            maxHeight: '80vh',
            objectFit: 'contain' // Giữ toàn bộ tỉ lệ màn hình chia sẻ
          }} 
        />

        {/* 4. Video nhỏ (Camera phụ - Góc dưới bên phải) */}
        <video 
          ref={cameraVideo} 
          autoPlay 
          playsInline 
          style={{ 
            position: 'absolute', 
            bottom: 15, 
            right: 15, 
            width: '28%', 
            aspectRatio: '16/9', // Ép khung hình về tỉ lệ 16:9
            objectFit: 'cover',   // QUAN TRỌNG: Cắt bỏ khoảng đen thừa để lấp đầy khung
            border: '2px solid rgba(255, 255, 255, 0.8)',
            borderRadius: '8px',
            zIndex: 10,
            display: mediaState.videoEnabled ? 'block' : 'none',
            backgroundColor: '#1a1a1a', // Nền tối nếu chưa load kịp
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
          }} 
        />
      </div>

      {/* Khu vực Chat bên dưới video */}
      <div style={{ marginTop: '20px' }}>
        <Chat broadcasterId={broadcasterId} />
      </div>
    </div>
  );
}
