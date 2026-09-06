import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import Chat from './Chat';

export default function Viewer({ broadcasterId }) {
  const screenVideo = useRef(); // Luồng chính (Screen hoặc Camera nếu chỉ có 1)
  const cameraVideo = useRef(); // Luồng phụ (Camera khi ở chế độ both)
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
        iceServers:  [
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
        // Logic mới: 
        // Nếu chưa có stream chính -> gán vào screenVideo (Main)
        // Nếu đã có stream chính -> gán vào cameraVideo (Overlay)
        if (!screenVideo.current.srcObject) {
          screenVideo.current.srcObject = e.streams[0];
          setHasCameraStream(false); 
        } else {
          // Stream thứ 2 đến, đây là Camera phụ
          if(cameraVideo.current) {
             cameraVideo.current.srcObject = e.streams[0];
             setHasCameraStream(true); 
          }
        }
      }
      if (e.track.kind === 'audio') {
        // Gắn audio vào element chính để phát tiếng
        if (screenVideo.current && !screenVideo.current.srcObject) return;
        // Đảm bảo audio chạy trên video chính
        if (screenVideo.current.srcObject !== e.streams[0] && !hasCameraStream) {
             // Logic dự phòng nếu audio track đến từ stream khác
        }
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) socket.emit('candidate', broadcasterId, e.candidate);
    };

    socket.on('offer', async (id, desc) => {
      if (id !== broadcasterId) return;
      // Reset layout khi Broadcaster thay đổi mode (renegotiation)
      setHasCameraStream(false);
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

    socket.on('change-stream-mode', ({ mode }) => {
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
          <input placeholder="Tên của bạn" value={userName} onChange={(e) => setUserName(e.target.value)} style={{ width: '100%', marginBottom: 10, height: 40 }} />
          {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
          <button onClick={handleStartViewing} style={{ width: '100%', height: 45, backgroundColor: '#1890ff', color: 'white', border: 'none' }}>Vào xem ngay</button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 14, marginBottom: 5 }}>Đang xem livestream | <b>Viewers: {viewerCount}</b></div>

          {/* CONTAINER CHÍNH */}
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            background: '#000', 
            height: '80vh', 
            borderRadius: 8, 
            overflow: 'hidden', 
          }}>
            
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 10 }}>
              {!broadcasterMediaState.videoEnabled && <span style={{ background: '#ff4d4f', color: 'white', padding: '4px 8px', borderRadius: 4 }}>📷 Cam Off</span>}
              {!broadcasterMediaState.audioEnabled && <span style={{ background: '#ff4d4f', color: 'white', padding: '4px 8px', borderRadius: 4 }}>🔇 Mic Off</span>}
            </div>

            {/* VIDEO 1: MAIN BACKGROUND (Screen hoặc Cam chính) */}
            <video
              ref={screenVideo}
              autoPlay
              playsInline
              controls={false}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />

            {/* VIDEO 2: FLOATING OVERLAY (Chỉ hiện khi có 2 stream) */}
            <div style={{ 
              display: hasCameraStream ? 'block' : 'none',
              position: 'absolute', 
              bottom: 20,
              right: 20,
              width: '200px', // Kích thước nhỏ
              height: '150px',
              borderRadius: 8,
              border: '2px solid white',
              overflow: 'hidden',
              background: '#000',
              zIndex: 20,
              boxShadow: '0 4px 10px rgba(0,0,0,0.5)'
            }}>
              <video
                ref={cameraVideo}
                autoPlay
                playsInline
                muted // Mute để tránh tiếng vang, tiếng đã có ở video chính
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            {streamEnded && (
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', zIndex: 100 }}>
                <h2>Livestream đã kết thúc</h2>
                <p>Quay về trang chủ sau {redirectTimer}s...</p>
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