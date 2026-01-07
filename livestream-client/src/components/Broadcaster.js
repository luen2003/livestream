import React, { useRef, useEffect, useState } from 'react';
import { socket } from '../socket';
import Chat from './Chat';

export default function Broadcaster() {
  const localScreenVideo = useRef();
  const localCameraVideo = useRef();
  const peerConnections = useRef({});
  const currentStreams = useRef({}); // {screen, camera}

  const [streamName, setStreamName] = useState('');
  const [userName, setUserName] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [videoSource, setVideoSource] = useState('camera'); // camera | screen | both

  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Stop all old tracks
  const stopAll = () => {
    Object.values(currentStreams.current).forEach((stream) =>
      stream.getTracks().forEach((track) => track.stop())
    );
    currentStreams.current = {};
  };

  // Get media stream based on source mode
  const getMediaStream = async (source) => {
    try {
      // Dừng track cũ để giải phóng tài nguyên
      stopAll();
      let newStreams = {};

      if (source === 'camera') {
        const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        newStreams = { camera: cam };
        if (localCameraVideo.current) localCameraVideo.current.srcObject = cam;
      } else if (source === 'screen') {
        const scr = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        newStreams = { screen: scr };
        if (localScreenVideo.current) localScreenVideo.current.srcObject = scr;
      } else if (source === 'both') {
        const scr = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        newStreams = { screen: scr, camera: cam };
        if (localScreenVideo.current) localScreenVideo.current.srcObject = scr;
        if (localCameraVideo.current) localCameraVideo.current.srcObject = cam;
      }

      currentStreams.current = newStreams;
      return newStreams;
    } catch (err) {
      console.error('Error getting media:', err);
      setError('Không thể truy cập nguồn video hoặc người dùng đã hủy');
      return null;
    }
  };

  // Hàm chuyển đổi chế độ khi đang Streaming
  const switchMode = async (newMode) => {
    setVideoSource(newMode);

    // 1. Lấy Stream mới
    const newStreams = await getMediaStream(newMode);
    if (!newStreams) return;

    // 2. Thông báo server để Viewer cập nhật giao diện
    socket.emit('change-stream-mode', { broadcasterId: socket.id, mode: newMode });

    // 3. Cập nhật WebRTC cho tất cả Viewer (Renegotiation)
    Object.keys(peerConnections.current).forEach(async (watcherId) => {
      const pc = peerConnections.current[watcherId];

      // Xóa hết track cũ
      pc.getSenders().forEach((sender) => pc.removeTrack(sender));

      // Thêm track mới
      Object.values(newStreams).forEach((stream) => {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      });

      // Tạo lại Offer để đồng bộ hóa track mới
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', watcherId, pc.localDescription);
      } catch (e) {
        console.error("Renegotiation failed:", e);
      }
    });
  };

  // Toggle video on/off
  const toggleVideo = () => {
    const newState = !videoEnabled;
    Object.values(currentStreams.current).forEach((stream) => {
      stream.getVideoTracks().forEach((track) => (track.enabled = newState));
    });
    setVideoEnabled(newState);
    socket.emit('media-state-changed', { broadcasterId: socket.id, videoEnabled: newState, audioEnabled });
  };

  // Toggle audio on/off
  const toggleAudio = () => {
    const newState = !audioEnabled;
    Object.values(currentStreams.current).forEach((stream) => {
      stream.getAudioTracks().forEach((track) => (track.enabled = newState));
    });
    setAudioEnabled(newState);
    socket.emit('media-state-changed', { broadcasterId: socket.id, videoEnabled, audioEnabled: newState });
  };

  // Stop streaming and notify viewers
  const stopStreaming = () => {
    socket.emit('stream-ended', socket.id);
    setIsStreaming(false);
    stopAll();
  };

  // Start streaming logic
  useEffect(() => {
    if (!isStreaming) return;

    socket.emit('broadcaster', { livestreamName: streamName, userName });

    // Lấy stream ban đầu
    getMediaStream(videoSource);

    socket.on('watcher', async (watcherId) => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: ['stun:hk-turn1.xirsys.com'] },
          { urls: 'stun:stun.l.google.com:19302' },
        ],
      });

      peerConnections.current[watcherId] = pc;

      // Add tracks
      Object.values(currentStreams.current).forEach((stream) =>
        stream.getTracks().forEach((track) => pc.addTrack(track, stream))
      );

      pc.onicecandidate = (e) => {
        if (e.candidate) socket.emit('candidate', watcherId, e.candidate);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('offer', watcherId, pc.localDescription);
    });

    socket.on('answer', (id, description) => {
      const pc = peerConnections.current[id];
      if (pc) pc.setRemoteDescription(new RTCSessionDescription(description));
    });

    socket.on('candidate', (id, candidate) => {
      const pc = peerConnections.current[id];
      if (pc) pc.addIceCandidate(new RTCIceCandidate(candidate));
    });

    socket.on('disconnectPeer', (id) => {
      if (peerConnections.current[id]) {
        peerConnections.current[id].close();
        delete peerConnections.current[id];
      }
    });

    socket.on('viewerCount', (count) => setViewerCount(count));

    return () => {
      socket.off('watcher');
      socket.off('answer');
      socket.off('candidate');
      socket.off('disconnectPeer');
      socket.off('viewerCount');
      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStreaming]);

  const handleStartStream = () => {
    if (!streamName.trim() || !userName.trim()) {
      setError('Vui lòng nhập đủ thông tin');
      return;
    }
    setError('');
    setIsStreaming(true);
  };

  return (
    <div>
      {!isStreaming ? (
        <div>
          <h2>Thiết lập Livestream</h2>
          <input
            placeholder="Tên bạn"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={{ width: '100%', marginBottom: 10, height: 40, fontSize: 16 }}
          />
          <input
            placeholder="Tên livestream"
            value={streamName}
            onChange={(e) => setStreamName(e.target.value)}
            style={{ width: '100%', marginBottom: 10, height: 40, fontSize: 16 }}
          />
          <select
            value={videoSource}
            onChange={(e) => setVideoSource(e.target.value)}
            style={{ width: '100%', marginBottom: 10, height: 45, fontSize: 16 }}
          >
            <option value="camera">Chỉ Camera</option>
            <option value="screen">Chỉ Màn hình</option>
            <option value="both">Cả 2 (Chia đôi màn hình)</option>
          </select>
          {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
          <button
            onClick={handleStartStream}
            style={{ width: '100%', height: 45, fontSize: 16, backgroundColor: '#1890ff', color: 'white', border: 'none', borderRadius: 4 }}
          >
            Bắt đầu livestream
          </button>
        </div>
      ) : (
        <div>
          {/* HEADER */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginBottom: 10, gap: 5 }}>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: '#6c757d', color: 'white', border: 'none',
                padding: '8px 16px', borderRadius: '4px', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: '5px'
              }}
            >
              ⬅ Trở về
            </button>
            <div style={{ fontSize: 14 }}>
              Tên livestream: <b>{streamName}</b> | Người livestream: {userName} | Số người xem: {viewerCount}
            </div>
          </div>

          {/* CONTROLS */}
          <div style={{ marginBottom: 10, display: 'flex', gap: 10 }}>
            <button
              disabled={videoSource === 'camera'}
              onClick={() => switchMode('camera')}
              style={{ flex: 1, background: videoSource === 'camera' ? '#ccc' : '#e6f7ff', cursor: 'pointer', padding: 5 }}
            >
              📷 Camera
            </button>
            <button
              disabled={videoSource === 'screen'}
              onClick={() => switchMode('screen')}
              style={{ flex: 1, background: videoSource === 'screen' ? '#ccc' : '#e6f7ff', cursor: 'pointer', padding: 5 }}
            >
              🖥 Screen
            </button>
            <button
              disabled={videoSource === 'both'}
              onClick={() => switchMode('both')}
              style={{ flex: 1, background: videoSource === 'both' ? '#ccc' : '#e6f7ff', cursor: 'pointer', padding: 5 }}
            >
              📷 + 🖥 Both
            </button>
          </div>

          {/* VIDEO CONTAINER */}
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            background: '#000', 
            height: '80vh',      // Chiều cao cố định lớn để chia tỷ lệ
            borderRadius: 8, 
            overflow: 'hidden',
            display: 'flex',     // Sử dụng Flexbox
            flexDirection: 'column', // Xếp dọc
            gap: '10px'          // Khoảng cách giữa 2 video
          }}>
            {/* Status Overlay */}
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, display: 'flex', gap: 10 }}>
              {!videoEnabled && <span style={{ background: 'red', color: 'white', padding: '4px 8px', borderRadius: 4 }}>📷 Cam Off</span>}
              {!audioEnabled && <span style={{ background: 'red', color: 'white', padding: '4px 8px', borderRadius: 4 }}>🔇 Mic Off</span>}
            </div>

            {/* --- LOGIC RENDER VIDEO --- */}
            
            {/* 1. Camera Mode */}
            {videoSource === 'camera' && (
              <div style={{ flex: 1, width: '100%', overflow: 'hidden' }}>
                <video ref={localCameraVideo} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            )}

            {/* 2. Screen Mode */}
            {videoSource === 'screen' && (
              <div style={{ flex: 1, width: '100%', overflow: 'hidden' }}>
                <video ref={localScreenVideo} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            )}

            {/* 3. Both Mode (Chia đôi: Trên Screen, Dưới Camera) */}
            {videoSource === 'both' && (
              <>
                <div style={{ flex: 1, width: '100%', overflow: 'hidden', background: '#1a1a1a' }}>
                   <video ref={localScreenVideo} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
                <div style={{ flex: 1, width: '100%', overflow: 'hidden', background: '#1a1a1a' }}>
                   <video ref={localCameraVideo} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
            <button
              onClick={toggleVideo}
              style={{
                flex: 1, padding: '10px 0', fontSize: 16, borderRadius: 8, border: 'none', cursor: 'pointer',
                backgroundColor: videoEnabled ? '#52c41a' : '#ff4d4f', color: 'white',
              }}
            >
              {videoEnabled ? '📷 Tắt hình' : '📷 Bật hình'}
            </button>
            <button
              onClick={toggleAudio}
              style={{
                flex: 1, padding: '10px 0', fontSize: 16, borderRadius: 8, border: 'none', cursor: 'pointer',
                backgroundColor: audioEnabled ? '#1890ff' : '#ff4d4f', color: 'white',
              }}
            >
              {audioEnabled ? '🔇 Tắt tiếng' : '🔊Bật tiếng'}
            </button>
          </div>

          <Chat broadcasterId={socket.id} />
          <button
            onClick={stopStreaming}
            style={{
              marginTop: 10, backgroundColor: '#ff4d4f', color: 'white', border: 'none',
              padding: '10px 20px', cursor: 'pointer', width: '100%'
            }}
          >
            Dừng Livestream
          </button>
        </div>
      )}
    </div>
  );
}