import React, { useRef, useEffect, useState } from 'react';
import { socket } from '../socket';
import Chat from './Chat';

export default function Broadcaster() {
  const localVideo = useRef();
  const peerConnections = useRef({});
  const currentStream = useRef(null);

  const [streamName, setStreamName] = useState('');
  const [userName, setUserName] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [videoSource, setVideoSource] = useState('camera');
  const [broadcasterId, setBroadcasterId] = useState('');

  const getMediaStream = async (source) => {
    try {
      const stream =
        source === 'screen'
          ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
          : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });

      if (currentStream.current) {
        currentStream.current.getTracks().forEach((track) => track.stop());
      }

      currentStream.current = stream;
      localVideo.current.srcObject = stream;

      Object.values(peerConnections.current).forEach((pc) => {
        pc.getSenders().forEach((sender) => {
          const kind = sender.track?.kind;
          const newTrack = stream.getTracks().find((t) => t.kind === kind);
          if (newTrack) sender.replaceTrack(newTrack);
        });
      });

      const screenTrack = stream.getVideoTracks()[0];
      if (source === 'screen' && screenTrack) {
        screenTrack.onended = () => {
          setVideoSource('camera');
          switchStream('camera');
        };
      }
    } catch (err) {
      console.error('Error getting media stream:', err);
      setError('Không thể truy cập nguồn video');
    }
  };

  const switchStream = async (source) => {
    setVideoSource(source);
    await getMediaStream(source);
  };

  useEffect(() => {
    if (!isStreaming) return;

    socket.emit('broadcaster', { livestreamName: streamName, userName });
    setBroadcasterId(socket.id); // Lưu socket.id của broadcaster

    getMediaStream(videoSource);

    socket.on('watcher', async (watcherId) => {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: ['stun:hk-turn1.xirsys.com'] },
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
          { urls: 'stun:stun.l.google.com:19302' }
        ]
      });

      peerConnections.current[watcherId] = pc;

      currentStream.current.getTracks().forEach((track) => pc.addTrack(track, currentStream.current));

      pc.onicecandidate = (e) => {
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
    });

    socket.on('answer', (id, description) => {
      const pc = peerConnections.current[id];
      if (pc) {
        pc.setRemoteDescription(new RTCSessionDescription(description)).catch(console.error);
      }
    });

    socket.on('candidate', (id, candidate) => {
      const pc = peerConnections.current[id];
      if (pc) {
        pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.error);
      }
    });

    socket.on('disconnectPeer', (id) => {
      const pc = peerConnections.current[id];
      if (pc) {
        pc.close();
        delete peerConnections.current[id];
      }
    });

    socket.on('viewerCount', (count) => {
      setViewerCount(count);
    });

    return () => {
      socket.off('watcher');
      socket.off('answer');
      socket.off('candidate');
      socket.off('disconnectPeer');
      socket.off('viewerCount');

      Object.values(peerConnections.current).forEach((pc) => pc.close());
      peerConnections.current = {};

      if (currentStream.current) {
        currentStream.current.getTracks().forEach((track) => track.stop());
        currentStream.current = null;
      }
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
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Nhập tên của bạn"
                style={{ width: '100%', padding: 8 }}
              />
            </label>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label>
              Tên livestream: <br />
              <input
                type="text"
                value={streamName}
                onChange={(e) => setStreamName(e.target.value)}
                placeholder="Nhập tên livestream"
                style={{ width: '100%', padding: 8 }}
              />
            </label>
          </div>

          <div style={{ marginBottom: 10 }}>
            <label>
              Nguồn video:
              <select
                value={videoSource}
                onChange={(e) => setVideoSource(e.target.value)}
                style={{ width: '100%', padding: 8 }}
              >
                <option value="camera">Camera</option>
                <option value="screen">Chia sẻ màn hình</option>
              </select>
            </label>
          </div>

          {error && <div style={{ color: 'red', marginBottom: 10 }}>{error}</div>}
          <button onClick={handleStartStream} style={{ padding: '10px 20px', fontSize: 16 }}>
            Xác nhận và bắt đầu Livestream
          </button>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: 10 }}>
            <strong>{`Livestream: ${streamName} - Người dùng: ${userName}`}</strong>
            <br />
            <span>Số người xem: {viewerCount}</span>
          </div>

          <video
            ref={localVideo}
            autoPlay
            muted
            playsInline
            style={{ width: '100%', backgroundColor: '#000', marginBottom: 10 }}
          />

          <div style={{ marginBottom: 10 }}>
            <label>
              Chuyển đổi nguồn video:
              <select
                value={videoSource}
                onChange={(e) => switchStream(e.target.value)}
                style={{ width: '100%', padding: 8 }}
              >
                <option value="camera">Camera</option>
                <option value="screen">Chia sẻ màn hình</option>
              </select>
            </label>
          </div>

          <Chat broadcasterId={broadcasterId} />
        </div>
      )}
    </div>
  );
}
