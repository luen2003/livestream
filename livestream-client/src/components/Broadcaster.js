import React, { useRef, useEffect, useState } from 'react';
import { socket } from '../socket';
import Chat from './Chat';

export default function Broadcaster() {
  const localScreenVideo = useRef();
  const localCameraVideo = useRef();
  const peerConnections = useRef({});
  const currentStreams = useRef({}); 
  
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const canvasRef = useRef(null);
  const workerRef = useRef(null);

  const [streamName, setStreamName] = useState('');
  const [userName, setUserName] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [videoSource, setVideoSource] = useState('camera'); 

  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [recordedVideoUrl, setRecordedVideoUrl] = useState(null);

  // KHÔI PHỤC: State và Ref để quản lý hướng Camera
  const [facingMode, setFacingMode] = useState('user');
  const facingModeRef = useRef('user');

  useEffect(() => {
    canvasRef.current = document.createElement('canvas');
    return () => stopAll();
  }, []);

  const stopAll = () => {
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
      workerRef.current.terminate();
      workerRef.current = null;
    }
    Object.values(currentStreams.current).forEach((stream) =>
      stream.getTracks().forEach((track) => track.stop())
    );
    currentStreams.current = {};
  };

  const drawBothStreamsToCanvas = (screenVideo, cameraVideo, width, height) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const workerCode = `
      let timer;
      self.onmessage = function(e) {
        if (e.data === 'start') {
          timer = setInterval(() => self.postMessage('tick'), 33);
        } else if (e.data === 'stop') {
          clearInterval(timer);
        }
      };
    `;
    
    const blob = new Blob([workerCode], { type: 'application/javascript' });
    const worker = new Worker(URL.createObjectURL(blob));

    worker.onmessage = () => {
      if (!canvas || !ctx) return;

      if (screenVideo && screenVideo.readyState === screenVideo.HAVE_ENOUGH_DATA) {
        ctx.drawImage(screenVideo, 0, 0, width, height);
      } else {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, width, height);
      }

      if (cameraVideo && cameraVideo.readyState === cameraVideo.HAVE_ENOUGH_DATA) {
        // FIX SIZE MOBILE: Tỷ lệ camera đè tự động co giãn theo width/height
        const camWidth = width * 0.3; 
        const camHeight = camWidth * (height / width); 
        const padding = 20;
        const x = width - camWidth - padding;
        const y = height - camHeight - padding;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(x, y, camWidth, camHeight);
        ctx.drawImage(cameraVideo, x, y, camWidth, camHeight);
      }
    };

    worker.postMessage('start');
    workerRef.current = worker;
  };

  const startRecording = (streams, mode) => {
    let targetStream;
    
    if (mode === 'both') {
      setTimeout(() => {
        if (!canvasRef.current) return;
        const canvasVideoTrack = canvasRef.current.captureStream(30).getVideoTracks()[0];
        const cameraAudioTrack = streams.camera ? streams.camera.getAudioTracks()[0] : null;
        
        const combinedTracks = [];
        if (canvasVideoTrack) combinedTracks.push(canvasVideoTrack);
        if (cameraAudioTrack) combinedTracks.push(cameraAudioTrack);

        targetStream = new MediaStream(combinedTracks);
        initMediaRecorder(targetStream);
      }, 1000); 
    } else {
      targetStream = streams[mode === 'camera' ? 'camera' : 'screen'];
      initMediaRecorder(targetStream);
    }
  };

  const initMediaRecorder = (streamToRecord) => {
    if (!streamToRecord) return;
    try {
      const recorder = new MediaRecorder(streamToRecord, { mimeType: 'video/webm' });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };
      recorder.start(1000); 
      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.error('Lỗi khi khởi tạo ghi hình:', err);
    }
  };

  const getMediaStream = async (source) => {
    try {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      
      stopAll();
      let newStreams = {};

      if (source === 'camera') {
        // KHÔI PHỤC: Thêm facingMode
        const cam = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: facingModeRef.current }, 
          audio: true 
        });
        newStreams = { camera: cam };
        if (localCameraVideo.current) localCameraVideo.current.srcObject = cam;
      } else if (source === 'screen') {
        const scr = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const mic = await navigator.mediaDevices.getUserMedia({ audio: true });

        const combinedStream = new MediaStream([
          ...scr.getVideoTracks(),
          ...mic.getAudioTracks()
        ]);

        newStreams = { screen: combinedStream };
        if (localScreenVideo.current) localScreenVideo.current.srcObject = combinedStream;
      } else if (source === 'both') {
        const scr = await navigator.mediaDevices.getDisplayMedia({ video: true });
        // KHÔI PHỤC: Thêm facingMode
        const cam = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: facingModeRef.current }, 
          audio: true 
        });
        newStreams = { screen: scr, camera: cam };
        
        if (localScreenVideo.current) localScreenVideo.current.srcObject = scr;
        if (localCameraVideo.current) localCameraVideo.current.srcObject = cam;

        // FIX SIZE MOBILE: Tự nhận diện màn hình dọc hay ngang để vẽ Canvas
        const isPortrait = window.innerHeight > window.innerWidth;
        const canvasWidth = isPortrait ? 720 : 1280;
        const canvasHeight = isPortrait ? 1280 : 720;
        drawBothStreamsToCanvas(localScreenVideo.current, localCameraVideo.current, canvasWidth, canvasHeight);
      }

      currentStreams.current = newStreams;
      startRecording(newStreams, source);
      
      return newStreams;
    } catch (err) {
      console.error('Error getting media:', err);
      setError('Không thể truy cập nguồn video hoặc người dùng đã hủy');
      return null;
    }
  };

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

  // KHÔI PHỤC: Hàm đổi Camera
  const flipCamera = async () => {
    const newMode = facingModeRef.current === 'user' ? 'environment' : 'user';
    facingModeRef.current = newMode;
    setFacingMode(newMode);
    await switchMode(videoSource);
  };

  const stopStreaming = () => {
    socket.emit('stream-ended', socket.id);
    setIsStreaming(false);
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }

    setTimeout(() => {
      if (recordedChunksRef.current.length > 0) {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedVideoUrl(url);
      }
    }, 600);

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
    setRecordedVideoUrl(null);
    recordedChunksRef.current = [];
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

          {/* KHÔI PHỤC: Dropdown chọn hướng Camera ban đầu */}
          {videoSource !== 'screen' && (
            <select
              value={facingMode}
              onChange={(e) => {
                setFacingMode(e.target.value);
                facingModeRef.current = e.target.value; 
              }}
              style={{ width: '100%', marginBottom: 10, height: 45, fontSize: 16 }}
            >
              <option value="user">Sử dụng Camera Trước</option>
              <option value="environment">Sử dụng Camera Sau</option>
            </select>
          )}

          {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
          <button onClick={handleStartStream} style={{ width: '100%', height: 45, fontSize: 16, backgroundColor: '#1890ff', color: 'white', border: 'none', borderRadius: 4 }}>Bắt đầu livestream</button>

          {recordedVideoUrl && (
            <div style={{ marginTop: 30, padding: 20, border: '2px dashed #10b981', borderRadius: 8, background: '#f9fafb' }}>
              <h3 style={{ color: '#10b981', marginBottom: 15 }}>✨ Livestream của bạn đã được lưu hoàn chỉnh!</h3>
              <video 
                src={recordedVideoUrl} 
                controls 
                style={{ width: '100%', borderRadius: 8, backgroundColor: '#000', marginBottom: 15 }} 
              />
              <a 
                href={recordedVideoUrl} 
                download={`Livestream_${streamName || 'Record'}.webm`}
                style={{ display: 'block', textAlign: 'center', backgroundColor: '#10b981', color: 'white', padding: '10px', borderRadius: 4, textDecoration: 'none', fontWeight: 'bold' }}
              >
                ⬇️ Tải Video Về Máy (.webm)
              </a>
            </div>
          )}

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

          {/* FIX UI MOBILE: Dùng aspect ratio thay cho height cứng */}
          <div style={{ 
            position: 'relative', 
            width: '100%', 
            aspectRatio: '16/9',
            maxHeight: '75vh',
            background: '#000', 
            borderRadius: 8, 
            overflow: 'hidden'
          }}>
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 30, display: 'flex', gap: 10 }}>
              {!videoEnabled && <span style={{ background: 'red', color: 'white', padding: '4px 8px', borderRadius: 4 }}>📷 Cam Off</span>}
              {!audioEnabled && <span style={{ background: 'red', color: 'white', padding: '4px 8px', borderRadius: 4 }}>🔇 Mic Off</span>}
            </div>

            {videoSource === 'camera' && (
               <video ref={localCameraVideo} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}

            {videoSource === 'screen' && (
               <video ref={localScreenVideo} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            )}

            {videoSource === 'both' && (
              <>
                <video 
                  ref={localScreenVideo} 
                  autoPlay muted playsInline 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                />
                {/* FIX UI MOBILE: Dùng tỷ lệ % cho camera nhỏ */}
                <div style={{
                  position: 'absolute',
                  bottom: '5%',
                  right: '5%',
                  width: '28%',
                  aspectRatio: '3/4',
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
            
            {/* KHÔI PHỤC: Nút Đổi Lật Camera */}
            <button
              onClick={flipCamera}
              disabled={videoSource === 'screen'}
              style={{
                flex: 1,
                padding: '10px 0',
                backgroundColor: videoSource === 'screen' ? '#d9d9d9' : '#8a2be2',
                color: videoSource === 'screen' ? '#888' : 'white',
                border: 'none',
                borderRadius: 4,
                cursor: videoSource === 'screen' ? 'not-allowed' : 'pointer'
              }}
            >
              {facingMode === 'user' ? 'Cam Trước' : 'Cam Sau'}
            </button>
          </div>
          
          <Chat broadcasterId={socket.id} />
          <button onClick={stopStreaming} style={{ marginTop: 10, backgroundColor: '#ff4d4f', color: 'white', border: 'none', padding: '10px 20px', width: '100%' }}>Dừng Livestream</button>
        </div>
      )}
    </div>
  );
}