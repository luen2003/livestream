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

  // State kiểm soát xem có stream thứ 2 không để chia layout
  const [hasCameraStream, setHasCameraStream] = useState(false);

  const [broadcasterMediaState, setBroadcasterMediaState] = useState({ videoEnabled: true, audioEnabled: true });
  const [streamEnded, setStreamEnded] = useState(false);
  const [redirectTimer, setRedirectTimer] = useState(3);

  const handleStartViewing = () => {
    if (!userName.trim()) {
      setError('Vui lòng nhập tên');
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
      // Logic gán stream:
      // Stream đầu tiên vào screenVideo.
      // Nếu có stream thứ 2 (hoặc gọi lại), gán vào cameraVideo.
      if (e.track.kind === 'video') {
        if (!screenVideo.current.srcObject) {
          screenVideo.current.srcObject = e.streams[0];
          // Nếu chỉ có 1 stream, reset trạng thái camera
          setHasCameraStream(false); 
        } else {
          // Có stream thứ 2 -> Bật chế độ chia đôi màn hình
          cameraVideo.current.srcObject = e.streams[0];
          setHasCameraStream(true); 
        }
      }
      if (e.track.kind === 'audio') {
        // Gắn audio vào element đầu tiên để phát tiếng
        if (screenVideo.current.srcObject) return;
        screenVideo.current.srcObject = e.streams[0];
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('candidate', broadcasterId, e.candidate);
    };

    socket.on('offer', async (id, desc) => {
      if (id !== broadcasterId) return;
      // Reset khi có offer mới (đề phòng trường hợp chuyển đổi mode)
      setHasCameraStream(false);
      // Xóa srcObject cũ để gán lại từ đầu
      if(screenVideo.current) screenVideo.current.srcObject = null;
      if(cameraVideo.current) cameraVideo.current.srcObject = null;

      await pc.setRemoteDescription(new RTCSessionDescription(desc));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('answer', broadcasterId, pc.localDescription);
    });

    socket.on('candidate', (id, candidate) => {
      if (id !== broadcasterId) return;
      pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on('viewerCount', (count) => setViewerCount(count));

    socket.on('media-state-changed', ({ videoEnabled, audioEnabled }) => {
      setBroadcasterMediaState({ videoEnabled, audioEnabled });
    });

    socket.on('stream-ended', () => {
      setStreamEnded(true);
      let countdown = 3;
      const interval = setInterval(() => {
        countdown -= 1;
        setRedirectTimer(countdown);
        if (countdown <= 0) {
          clearInterval(interval);
          window.location.href = '/';
        }
      }, 1000);
    });

    // Sự kiện lắng nghe thay đổi chế độ từ Server (nếu cần xử lý thêm UI)
    socket.on('change-stream-mode', ({ mode }) => {
      // Có thể dùng để hiển thị thông báo "Broadcaster đang đổi chế độ..."
      console.log("Mode changed to:", mode);
      if (mode !== 'both') setHasCameraStream(false);
    });

    return () => {
      socket.emit('disconnectPeer', broadcasterId);
      socket.off('offer');
      socket.off('candidate');
      socket.off('viewerCount');
      socket.off('media-state-changed');
      socket.off('stream-ended');
      socket.off('change-stream-mode');
      pc.close();
    };
  }, [isViewing, broadcasterId]);

  return (
    <div>
      {!isViewing ? (
        <div>
          <h2>Nhập tên để xem livestream</h2>
          <input
            placeholder="Tên của bạn"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{ width: '100%', marginBottom: 10, height: 40, fontSize: 16 }}
          />
          {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
          <button
            onClick={handleStartViewing}
            style={{ width: '100%', height: 45, fontSize: 16, backgroundColor: '#1890ff', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer' }}
          >
            Vào xem ngay
          </button>
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 10, gap: 5 }}>          
            <div style={{ fontSize: 14 }}>
               Đang xem livestream | <b>Viewers: {viewerCount}</b>
            </div>
          </div>

          {/* CONTAINER CHÍNH */}
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            background: '#000', 
            height: '80vh',           // Chiều cao cố định
            borderRadius: 8, 
            overflow: 'hidden', 
            marginBottom: 10,
            display: 'flex',          // Flexbox
            flexDirection: 'column',  // Cột dọc
            gap: '10px'               // Khoảng cách giữa 2 video
          }}>
            
            {/* Status Overlay */}
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 10 }}>
              {!broadcasterMediaState.videoEnabled && <span style={{ background: '#ff4d4f', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: '14px', fontWeight: 'bold' }}>📷 Cam Off</span>}
              {!broadcasterMediaState.audioEnabled && <span style={{ background: '#ff4d4f', color: 'white', padding: '4px 8px', borderRadius: 4, fontSize: '14px', fontWeight: 'bold' }}>🔇 Mic Off</span>}
            </div>

            {/* VIDEO 1: Màn hình chính (Luôn hiển thị) */}
            <div style={{ 
              flex: 1, // Chiếm toàn bộ nếu chỉ có 1 video, hoặc 50% nếu có 2
              position: 'relative', 
              width: '100%', 
              overflow: 'hidden',
              background: '#1a1a1a'
            }}>
              <video
                ref={screenVideo}
                autoPlay
                playsInline
                controls={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>

            {/* VIDEO 2: Camera phụ (Chỉ hiển thị khi hasCameraStream = true) */}
            <div style={{ 
              flex: hasCameraStream ? 1 : 0,    // Bật lên 50% chiều cao nếu có stream
              display: hasCameraStream ? 'block' : 'none',
              position: 'relative', 
              width: '100%', 
              overflow: 'hidden',
              background: '#1a1a1a'
            }}>
              <video
                ref={cameraVideo}
                autoPlay
                playsInline
                muted // Viewer mute video phụ để tránh echo, tiếng đã có ở video 1
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>

            {/* Overlay Stream Ended */}
            {streamEnded && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.85)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: 'white', zIndex: 100
              }}>
                <h2 style={{ marginBottom: 10 }}>Livestream đã kết thúc</h2>
                <p>Tự động quay về trang chủ sau {redirectTimer}s...</p>
              </div>
            )}
          </div>

          <div style={{ marginTop: 10 }}>
             <Chat broadcasterId={broadcasterId} />
          </div>
        </div>
      )}
    </div>
  );
}