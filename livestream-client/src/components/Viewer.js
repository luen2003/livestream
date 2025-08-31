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
    <div>
      <p>Đang xem | Viewers: {viewerCount}</p>
      <video ref={screenVideo} autoPlay playsInline style={{ width: '100%' }} />
      <video ref={cameraVideo} autoPlay playsInline style={{ width: '30%' }} />
      <Chat broadcasterId={broadcasterId} />
    </div>
  );
}
