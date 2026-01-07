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

    socket.on('viewerCount', (count) => setViewerCount(count));

    return () => {
      pc.close();
      socket.off('offer');
      socket.off('candidate');
      socket.off('viewerCount');
    };
  }, [isViewing, broadcasterId]);

  if (!isViewing) {
    return (
      <div style={{ maxWidth: 400, margin: '20px auto' }}>
        <input
          placeholder="Tên của bạn"
          value={userName}
          onChange={(e) => setUserName(e.target.value)}
          style={{ width: '100%', marginBottom: 10, height: 40, fontSize: 16, padding: 8 }}
        />
        {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
        <button
          onClick={handleStartViewing}
          style={{ width: '100%', height: 45, fontSize: 16, cursor: 'pointer' }}
        >
          Xem livestream
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'row', height: '80vh', maxWidth: 1200, margin: '20px auto' }}>
      {/* Phần video và overlay */}
      <div style={{ position: 'relative', flex: 3, marginRight: 20 }}>
        <video
          ref={screenVideo}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', backgroundColor: 'black', borderRadius: 8 }}
        />
        <video
          ref={cameraVideo}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            bottom: 20,
            right: 20,
            width: '25%',
            maxWidth: 300,
            border: '3px solid white',
            borderRadius: 8,
            boxShadow: '0 0 8px rgba(0,0,0,0.5)',
          }}
        />
        <p style={{ position: 'absolute', top: 10, left: 10, color: 'white', fontWeight: 'bold', textShadow: '1px 1px 2px black' }}>
          Đang xem | Viewers: {viewerCount}
        </p>
      </div>

      {/* Phần chat */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Chat broadcasterId={broadcasterId} style={{ flex: 1, borderRadius: 8, overflow: 'auto' }} />
      </div>
    </div>
  );
}
