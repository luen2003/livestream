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
  const [broadcasterId, setBroadcasterId] = useState('');

  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);

  // Get media stream based on source mode
  const getMediaStream = async (source) => {
    try {
      stopAll();
      if (source === 'camera') {
        const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        currentStreams.current = { camera: cam };
        localCameraVideo.current.srcObject = cam;
      } else if (source === 'screen') {
        const scr = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        currentStreams.current = { screen: scr };
        localScreenVideo.current.srcObject = scr;
      } else if (source === 'both') {
        const scr = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        const cam = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        currentStreams.current = { screen: scr, camera: cam };
        localScreenVideo.current.srcObject = scr;
        localCameraVideo.current.srcObject = cam;
      }

      // Update tracks for all peers when changing mode
      Object.values(peerConnections.current).forEach((pc) => {
        // Remove old tracks
        pc.getSenders().forEach((sender) => pc.removeTrack(sender));
        // Add new tracks
        Object.values(currentStreams.current).forEach((stream) =>
          stream.getTracks().forEach((track) => pc.addTrack(track, stream))
        );
      });
    } catch (err) {
      console.error('Error getting media:', err);
      setError('Không thể truy cập nguồn video');
    }
  };

  // Stop all old tracks
  const stopAll = () => {
    Object.values(currentStreams.current).forEach((stream) =>
      stream.getTracks().forEach((track) => track.stop())
    );
    currentStreams.current = {};
  };

  // Toggle video on/off
  const toggleVideo = () => {
    Object.values(currentStreams.current).forEach((stream) => {
      stream.getVideoTracks().forEach((track) => (track.enabled = !track.enabled));
    });
    setVideoEnabled((prev) => !prev);
  };

  // Toggle audio on/off
  const toggleAudio = () => {
    Object.values(currentStreams.current).forEach((stream) => {
      stream.getAudioTracks().forEach((track) => (track.enabled = !track.enabled));
    });
    setAudioEnabled((prev) => !prev);
  };

  // Start streaming and handle signaling
  useEffect(() => {
    if (!isStreaming) return;

    socket.emit('broadcaster', { livestreamName: streamName, userName });
    setBroadcasterId(socket.id);

    getMediaStream(videoSource);

    socket.on('watcher', async (watcherId) => {
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

      peerConnections.current[watcherId] = pc;

      // Add all tracks from current streams
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
            <option value="both">Cả 2</option>
          </select>
          {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
          <button
            onClick={handleStartStream}
            style={{ width: '100%', height: 45, fontSize: 16 }}
          >
            Bắt đầu livestream
          </button>
        </div>
      ) : (
        <div>
          <p>
            <b>Stream Name: {streamName}</b> - Username: {userName} | Viewers: {viewerCount}
          </p>
          {videoSource !== 'camera' && (
            <video
              ref={localScreenVideo}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', background: '#000' }}
            />
          )}
          {videoSource !== 'screen' && (
            <video
              ref={localCameraVideo}
              autoPlay
              muted
              playsInline
              style={{ width: videoSource === 'both' ? '30%' : '100%', background: '#000' }}
            />
          )}
          <div>
            <button onClick={toggleVideo}>
              {videoEnabled ? 'Tắt Video' : 'Bật Video'}
            </button>
            <button onClick={toggleAudio}>
              {audioEnabled ? 'Tắt Mic' : 'Bật Mic'}
            </button>
          </div>
          <Chat broadcasterId={broadcasterId} />
        </div>
      )}
    </div>
  );
}
