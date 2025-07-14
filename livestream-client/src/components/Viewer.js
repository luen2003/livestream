import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import Chat from './Chat';

export default function Viewer({ broadcasterId }) {
  const remoteVideo = useRef(null);
  const [userName, setUserName] = useState('');
  const [isViewing, setIsViewing] = useState(false);
  const [error, setError] = useState('');
  const [viewerCount, setViewerCount] = useState(0);

  useEffect(() => {
    if (userName.trim()) {
      socket.emit('setUserName', userName);
    }
  }, [userName]);

  const handleStartViewing = () => {
    setError('');
    if (!userName.trim()) {
      setError('Vui lòng nhập tên người xem');
      return;
    }
    setIsViewing(true);
    socket.emit('watcher', broadcasterId);
  };

  useEffect(() => {
    if (!isViewing || !broadcasterId) return;

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: ['stun:hk-turn1.xirsys.com']
        },
        {
          username: 'aX_0HogGPHRGNvdzUm4KbELKRKa2e1-XXU7ykTjLzxPvYGtToLCCxE85kSodQr4uAAAAAGh001hkbHVvbmd0YQ==',
          credential: '3e8fc950-6098-11f0-9c7a-0242ac120004',
          urls: [
            'turn:hk-turn1.xirsys.com:80?transport=udp',
            'turn:hk-turn1.xirsys.com:3478?transport=udp',
            'turn:hk-turn1.xirsys.com:80?transport=tcp',
            'turn:hk-turn1.xirsys.com:3478?transport=tcp',
            'turns:hk-turn1.xirsys.com:443?transport=tcp',
            'turns:hk-turn1.xirsys.com:5349?transport=tcp'
          ]
        },
        {
          urls: 'stun:stun.l.google.com:19302'
        }
      ]
    });

    peerConnection.ontrack = (event) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0];
      }
    };

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('candidate', broadcasterId, event.candidate);
      }
    };

    socket.on('offer', async (id, description) => {
      if (id !== broadcasterId) return;

      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', broadcasterId, answer);
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });

    socket.on('candidate', (id, candidate) => {
      if (id !== broadcasterId) return;
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
    });

    socket.on('viewerCount', (count) => {
      setViewerCount(count);
    });

    return () => {
      peerConnection.close();
      socket.off('offer');
      socket.off('candidate');
      socket.off('viewerCount');
    };
  }, [isViewing, broadcasterId]);

  if (!isViewing) {
    return (
      <div>
        <div style={{ marginBottom: 10 }}>
          <label>
            Tên người xem: <br />
            <input
              type="text"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              placeholder="Nhập tên của bạn"
              style={{ width: '100%', padding: 8 }}
            />
          </label>
        </div>
        {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
        <button onClick={handleStartViewing} style={{ padding: '10px 20px', fontSize: 16 }}>
          Xác nhận và xem Livestream
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <strong>Số người xem hiện tại: {viewerCount}</strong>
      </div>
      <video
        ref={remoteVideo}
        autoPlay
        playsInline
        controls={false}
        style={{ width: '100%', backgroundColor: '#000' }}
      />
      <Chat />
    </div>
  );
}
