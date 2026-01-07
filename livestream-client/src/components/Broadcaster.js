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
        // Gán srcObject ngay lập tức
        // Lưu ý: React ref có thể null nếu DOM chưa render xong, nhưng ở đây luồng logic ổn
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
    const newStreams = await getMediaStream(newMode);
    if (!newStreams) return;

    socket.emit('change-stream-mode', { broadcasterId: socket.id, mode: newMode });

    Object.keys(peerConnections.current).forEach(async (watcherId) => {
      const pc = peerConnections.current[watcherId];
      pc.getSenders().forEach((sender) => pc.removeTrack(sender));
      Object.values(newStreams).forEach((stream) => {
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      });

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', watcherId, pc.localDescription);
      } catch (e) {
        console.error("Renegotiation failed:", e);
      }
    });
  };

  const toggleVideo = () => {
    const newState = !videoEnabled;
    Object.values(currentStreams.current).forEach((stream) => {
      stream.getVideoTracks().forEach((track) => (track.enabled = newState));
    });
    setVideoEnabled(newState);
    socket.emit('media-state-changed', { broadcasterId: socket.id, videoEnabled: newState, audioEnabled });
  };

  const toggleAudio = () => {
    const newState = !audioEnabled;
    Object.values(currentStreams.current).forEach((stream) => {
      stream.getAudioTracks().forEach((track) => (track.enabled = newState));
    });
    setAudioEnabled(newState);
    socket.emit('media-state-changed', { broadcasterId: socket.id, videoEnabled, audioEnabled: newState });
  };

  const stopStreaming = () => {
    socket.emit('stream-ended', socket.id);
    setIsStreaming(false);
    stopAll();
  };

  useEffect(() => {
    if (!isStreaming) return;
    socket.emit('broadcaster', { livestreamName: streamName, userName });
    getMediaStream(videoSource);

    socket.on('watcher', async (watcherId) => {
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

      peerConnections.current[watcherId] = pc;

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
          <input placeholder="Tên bạn" value={userName} onChange={(e) => setUserName(e.target.value)} style={{ width: '100%', marginBottom: 10, height: 40, fontSize: 16 }} />
          <input placeholder="Tên livestream" value={streamName} onChange={(e) => setStreamName(e.target.value)} style={{ width: '100%', marginBottom: 10, height: 40, fontSize: 16 }} />
          <select value={videoSource} onChange={(e) => setVideoSource(e.target.value)} style={{ width: '100%', marginBottom: 10, height: 45, fontSize: 16 }}>
            <option value="camera">Chỉ Camera</option>
            <option value="screen">Chỉ Màn hình</option>
            <option value="both">Cả 2 (Màn hình chính + Camera phụ)</option>
          </select>
          {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
          <button onClick={handleStartStream} style={{ width: '100%', height: 45, fontSize: 16, backgroundColor: '#1890ff', color: 'white', border: 'none', borderRadius: 4 }}>Bắt đầu livestream</button>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 14, marginBottom: 10 }}>
            Tên livestream: <b>{streamName}</b> | Người livestream: {userName} | Viewers: {viewerCount}
          </div>

          <div style={{ marginBottom: 10, display: 'flex', gap: 10 }}>
            <button disabled={videoSource === 'camera'} onClick={() => switchMode('camera')} style={{ flex: 1, padding: 5 }}>📷 Camera</button>
            <button disabled={videoSource === 'screen'} onClick={() => switchMode('screen')} style={{ flex: 1, padding: 5 }}>🖥 Screen</button>
            <button disabled={videoSource === 'both'} onClick={() => switchMode('both')} style={{ flex: 1, padding: 5 }}>📷 + 🖥 Both</button>
          </div>

          {/* VIDEO CONTAINER CHÍNH */}
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            height: '80vh', 
            background: '#000', 
            borderRadius: 8, 
            overflow: 'hidden'
          }}>
            {/* Overlay trạng thái */}
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 30, display: 'flex', gap: 10 }}>
              {!videoEnabled && <span style={{ background: 'red', color: 'white', padding: '4px 8px', borderRadius: 4 }}>📷 Cam Off</span>}
              {!audioEnabled && <span style={{ background: 'red', color: 'white', padding: '4px 8px', borderRadius: 4 }}>🔇 Mic Off</span>}
            </div>

            {/* CASE 1: CAMERA ONLY */}
            {videoSource === 'camera' && (
               <video ref={localCameraVideo} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}

            {/* CASE 2: SCREEN ONLY */}
            {videoSource === 'screen' && (
               <video ref={localScreenVideo} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}

            {/* CASE 3: BOTH (PIP STYLE) */}
            {videoSource === 'both' && (
              <>
                {/* Layer 1: Screen (Background) */}
                <video 
                  ref={localScreenVideo} 
                  autoPlay muted playsInline 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                />
                
                {/* Layer 2: Camera (Floating Overlay) */}
                <div style={{
                  position: 'absolute',
                  bottom: 20,
                  right: 20,
                  width: '200px', // Camera nhỏ lại
                  height: '150px',
                  borderRadius: 8,
                  overflow: 'hidden',
                  boxShadow: '0 4px 8px rgba(0,0,0,0.5)',
                  border: '2px solid white',
                  zIndex: 20,
                  background: '#000'
                }}>
                   <video 
                     ref={localCameraVideo} 
                     autoPlay muted playsInline 
                     style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                   />
                </div>
              </>
            )}
          </div>

          <div style={{ marginTop: 10, display: 'flex', gap: 10 }}>
            <button onClick={toggleVideo} style={{ flex: 1, padding: '10px 0', backgroundColor: videoEnabled ? '#52c41a' : '#ff4d4f', color: 'white', border: 'none', borderRadius: 4 }}>{videoEnabled ? 'Tắt hình' : 'Bật hình'}</button>
            <button onClick={toggleAudio} style={{ flex: 1, padding: '10px 0', backgroundColor: audioEnabled ? '#1890ff' : '#ff4d4f', color: 'white', border: 'none', borderRadius: 4 }}>{audioEnabled ? 'Tắt tiếng' : 'Bật tiếng'}</button>
          </div>
          <Chat broadcasterId={socket.id} />
          <button onClick={stopStreaming} style={{ marginTop: 10, backgroundColor: '#ff4d4f', color: 'white', border: 'none', padding: '10px 20px', width: '100%' }}>Dừng Livestream</button>
        </div>
      )}
    </div>
  );
}