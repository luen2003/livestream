// import React, { useState, useEffect, useRef } from 'react';
// import { socket } from '../socket';
// import Chat from './Chat';

// export default function Viewer({ broadcasterId }) {
//   const screenVideo = useRef(null);
//   const cameraVideo = useRef(null);
//   const audioRef = useRef(null);
  
//   const [videoRatio, setVideoRatio] = useState('16/9');

//   const [userName, setUserName] = useState('');
//   const [isViewing, setIsViewing] = useState(false);
//   const [viewerCount, setViewerCount] = useState(0);
//   const [error, setError] = useState('');

//   const [hasCameraStream, setHasCameraStream] = useState(false);

//   const [broadcasterMediaState, setBroadcasterMediaState] = useState({
//     videoEnabled: true,
//     audioEnabled: true,
//   });

//   const [streamEnded, setStreamEnded] = useState(false);
//   const [redirectTimer, setRedirectTimer] = useState(3);

//   const handleStartViewing = () => {
//     if (!userName.trim()) {
//       setError('Vui lòng nhập tên');
//       return;
//     }
//     setError('');
//     setIsViewing(true);
//     socket.emit('setUserName', userName.trim());
//     socket.emit('watcher', broadcasterId);
//   };

//   useEffect(() => {
//     if (!isViewing || !broadcasterId) return;

//     const pc = new RTCPeerConnection({
//       iceServers: [
//         { urls: ['stun:hk-turn1.xirsys.com'] },
//         {
//           username:
//             'aX_0HogGPHRGNvdzUm4KbELKRKa2e1-XXU7ykTjLzxPvYGtToLCCxE85kSodQr4uAAAAAGh001hkbHVvbmd0YQ==',
//           credential:
//             '3e8fc950-6098-11f0-9c7a-0242ac120004',
//           urls: [
//             'turn:hk-turn1.xirsys.com:80?transport=udp',
//             'turn:hk-turn1.xirsys.com:3478?transport=udp',
//             'turn:hk-turn1.xirsys.com:80?transport=tcp',
//             'turn:hk-turn1.xirsys.com:3478?transport=tcp',
//             'turns:hk-turn1.xirsys.com:443?transport=tcp',
//             'turns:hk-turn1.xirsys.com:5349?transport=tcp',
//           ],
//         },
//         { urls: 'stun:stun.l.google.com:19302' },
//       ],
//     });

//     pc.ontrack = (event) => {
//       if (event.track.kind === 'video') {
//         if (!screenVideo.current?.srcObject) {
//           if (screenVideo.current) {
//             screenVideo.current.srcObject = event.streams[0];
//           }
//           setHasCameraStream(false);
//         } else if (screenVideo.current.srcObject.id !== event.streams[0].id) {
//           if (cameraVideo.current) {
//             cameraVideo.current.srcObject = event.streams[0];
//           }
//           setHasCameraStream(true);
//         }
//       }

//       if (event.track.kind === 'audio') {
//         if (audioRef.current) {
//           audioRef.current.srcObject = event.streams[0];
//           const playPromise = audioRef.current.play();
//           if (playPromise !== undefined) {
//             playPromise.catch((error) => console.log('Auto-play audio bị chặn:', error));
//           }
//         }
//       }
//     };

//     pc.onicecandidate = (event) => {
//       if (event.candidate) {
//         socket.emit('candidate', broadcasterId, event.candidate);
//       }
//     };

//     const handleOffer = async (id, desc) => {
//       if (id !== broadcasterId) return;
//       setHasCameraStream(false);
//       if (screenVideo.current) screenVideo.current.srcObject = null;
//       if (cameraVideo.current) cameraVideo.current.srcObject = null;
//       if (audioRef.current) audioRef.current.srcObject = null;

//       try {
//         await pc.setRemoteDescription(new RTCSessionDescription(desc));
//         const answer = await pc.createAnswer();
//         await pc.setLocalDescription(answer);
//         socket.emit('answer', broadcasterId, pc.localDescription);
//       } catch (error) {
//         console.error('Lỗi xử lý offer:', error);
//       }
//     };

//     const handleCandidate = async (id, candidate) => {
//       if (id !== broadcasterId) return;
//       try {
//         await pc.addIceCandidate(new RTCIceCandidate(candidate));
//       } catch (error) {
//         console.error('Lỗi thêm ICE candidate:', error);
//       }
//     };

//     const handleViewerCount = (count) => setViewerCount(count);
//     const handleMediaStateChanged = ({ videoEnabled, audioEnabled }) => {
//       setBroadcasterMediaState({ videoEnabled, audioEnabled });
//     };

//     const handleStreamEnded = () => {
//       setStreamEnded(true);
//       let countdown = 3;
//       setRedirectTimer(countdown);
//       const interval = setInterval(() => {
//         countdown -= 1;
//         setRedirectTimer(countdown);
//         if (countdown <= 0) {
//           clearInterval(interval);
//           window.location.href = '/';
//         }
//       }, 1000);
//     };

//     const handleChangeStreamMode = ({ mode }) => {
//       if (mode !== 'both') {
//         setHasCameraStream(false);
//         if (cameraVideo.current) cameraVideo.current.srcObject = null;
//       }
//     };

//     socket.on('offer', handleOffer);
//     socket.on('candidate', handleCandidate);
//     socket.on('viewerCount', handleViewerCount);
//     socket.on('media-state-changed', handleMediaStateChanged);
//     socket.on('stream-ended', handleStreamEnded);
//     socket.on('change-stream-mode', handleChangeStreamMode);

//     return () => {
//       socket.emit('disconnectPeer', broadcasterId);
//       socket.off('offer', handleOffer);
//       socket.off('candidate', handleCandidate);
//       socket.off('viewerCount', handleViewerCount);
//       socket.off('media-state-changed', handleMediaStateChanged);
//       socket.off('stream-ended', handleStreamEnded);
//       socket.off('change-stream-mode', handleChangeStreamMode);
//       pc.close();
//     };
//   }, [isViewing, broadcasterId]);

//   return (
//     <div style={styles.container}>
//       {!isViewing ? (
//         <div style={styles.loginSection}>
//           <h3 style={{ fontSize: 23, marginBottom: 10, fontWeight: 'bold', color: '#000' }}>
//             Nhập tên để xem livestream
//           </h3>
//           <input
//             placeholder="Tên của bạn"
//             value={userName}
//             onChange={(e) => setUserName(e.target.value)}
//             style={styles.nameInput}
//           />
//           {error && <div style={styles.error}>{error}</div>}
//           <button onClick={handleStartViewing} style={styles.startButton}>
//             Vào xem ngay
//           </button>
//         </div>
//       ) : (
//         <div style={styles.viewingContainer}>
//           <div style={styles.viewerInfo}>
//             Đang xem livestream | <span>Viewer(s): {viewerCount}</span>
//           </div>

//           <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

//           {/* CONTAINER TỔNG BAO GỒM SCREEN VÀ CAMERA */}
//           <div style={{
//             position: 'relative',
//             width: '100%',
//             maxWidth: '900px',
//             margin: '0 auto',
//             display: 'flex',
//             flexDirection: 'column',
//             gap: hasCameraStream ? 10 : 0, // Luôn cách nhau 10px khi có camera phụ
//           }}>
            
//             {/* 1. KHUNG CHỨA SCREEN VIDEO */}
//             <div style={{
//               position: 'relative',
//               width: '100%',
//               aspectRatio: videoRatio, 
//               maxHeight: hasCameraStream ? 'none' : '85vh',
//               background: '#000',
//               borderRadius: 8,
//               overflow: 'hidden'
//             }}>
//               <div style={styles.statusContainer}>
//                 {!broadcasterMediaState.videoEnabled && (
//                   <span style={styles.offStatus}>Cam Off</span>
//                 )}
//                 {!broadcasterMediaState.audioEnabled && (
//                   <span style={styles.offStatus}>Mic Off</span>
//                 )}
//               </div>

//               <video
//                 ref={screenVideo}
//                 autoPlay
//                 playsInline
//                 controls={false}
//                 muted
//                 style={styles.screenVideo}
//                 onLoadedMetadata={(e) => {
//                   const { videoWidth, videoHeight } = e.target;
//                   if (videoWidth && videoHeight) {
//                     setVideoRatio(`${videoWidth}/${videoHeight}`);
//                   }
//                 }}
//               />
//             </div>

//             {/* 2. KHUNG CHỨA CAMERA LUÔN TÁCH RỜI BÊN DƯỚI */}
//             <div style={{
//               display: hasCameraStream ? 'block' : 'none',
//               position: 'relative',
//               width: '100%',
//               aspectRatio: '16/9',
//               background: '#000',
//               borderRadius: 8,
//               overflow: 'hidden',
//               border: '1px solid #333'
//             }}>
//               <video
//                 ref={cameraVideo}
//                 autoPlay
//                 playsInline
//                 muted
//                 style={styles.cameraVideo}
//               />
//             </div>

//             {/* LIVESTREAM ĐÃ KẾT THÚC */}
//             {streamEnded && (
//               <div style={styles.streamEndedOverlay}>
//                 <h2>Livestream đã kết thúc</h2>
//                 <p>Quay về trang chủ sau {redirectTimer}s...</p>
//               </div>
//             )}
//           </div>

//           {/* CHAT */}
//           <div style={styles.chatContainer}>
//             <Chat broadcasterId={broadcasterId} />
//           </div>
//         </div>
//       )}
//     </div>
//   );
// }

// const styles = {
//   container: { width: '100%', boxSizing: 'border-box' },
//   viewingContainer: { width: '100%', boxSizing: 'border-box', fontWeight: 'bold' },
//   loginSection: { width: '100%', boxSizing: 'border-box' },
//   nameInput: {
//     width: '100%',
//     height: 40,
//     marginBottom: 10,
//     padding: '0 10px',
//     boxSizing: 'border-box',
//     border: '1px solid #ccc',
//     borderRadius: 5,
//     fontSize: 14,
//   },
//   error: { color: 'red', marginBottom: 10 },
//   startButton: {
//     width: '100%',
//     height: 45,
//     padding: 0,
//     backgroundColor: '#1890ff',
//     color: 'white',
//     border: 'none',
//     borderRadius: 5,
//     cursor: 'pointer',
//     fontSize: 15,
//     boxSizing: 'border-box',
//   },
//   viewerInfo: { width: '100%', fontSize: 14, marginBottom: 5, fontWeight: 'bold' },
//   statusContainer: {
//     position: 'absolute',
//     top: 10,
//     left: 10,
//     zIndex: 10,
//     display: 'flex',
//     gap: 10,
//   },
//   offStatus: {
//     background: '#ff4d4f',
//     color: 'white',
//     padding: '4px 8px',
//     borderRadius: 4,
//   },
//   screenVideo: {
//     display: 'block',
//     width: '100%',
//     height: '100%',
//     objectFit: 'cover',
//   },
//   cameraVideo: {
//     display: 'block',
//     width: '100%',
//     height: '100%',
//     objectFit: 'cover', // Đổi lại thành contain nếu muốn cam không bị cắt
//   },
//   streamEndedOverlay: {
//     position: 'absolute',
//     top: 0,
//     left: 0,
//     right: 0,
//     bottom: 0,
//     backgroundColor: 'rgba(0,0,0,0.85)',
//     display: 'flex',
//     flexDirection: 'column',
//     alignItems: 'center',
//     justifyContent: 'center',
//     color: 'white',
//     zIndex: 100,
//     borderRadius: 8,
//   },
//   chatContainer: {
//     width: '100%',
//     marginTop: 10,
//     boxSizing: 'border-box',
//   },
// };
import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import Chat from './Chat';

export default function Viewer({ broadcasterId }) {
  const screenVideo = useRef(null);
  const cameraVideo = useRef(null);
  const audioRef = useRef(null);
  
  const [videoRatio, setVideoRatio] = useState('16/9');

  // Thêm state để nhận diện kích thước màn hình (Mobile vs PC)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 0
  );

  const [userName, setUserName] = useState('');
  const [isViewing, setIsViewing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState('');

  const [hasCameraStream, setHasCameraStream] = useState(false);

  const [broadcasterMediaState, setBroadcasterMediaState] = useState({
    videoEnabled: true,
    audioEnabled: true,
  });

  const [streamEnded, setStreamEnded] = useState(false);
  const [redirectTimer, setRedirectTimer] = useState(3);

  // Lắng nghe sự kiện thay đổi kích thước màn hình
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Tính toán layout: Dưới 768px coi là mobile. 
  // Nếu là Mobile + Có camera phụ => Xếp dọc (Stack)
  const isMobileLayout = windowWidth <= 768;
  const shouldStack = isMobileLayout && hasCameraStream;

  const handleStartViewing = () => {
    if (!userName.trim()) {
      setError('Vui lòng nhập tên');
      return;
    }
    setError('');
    setIsViewing(true);
    socket.emit('setUserName', userName.trim());
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
          credential:
            '3e8fc950-6098-11f0-9c7a-0242ac120004',
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

    pc.ontrack = (event) => {
      if (event.track.kind === 'video') {
        if (!screenVideo.current?.srcObject) {
          if (screenVideo.current) {
            screenVideo.current.srcObject = event.streams[0];
          }
          setHasCameraStream(false);
        } else if (screenVideo.current.srcObject.id !== event.streams[0].id) {
          if (cameraVideo.current) {
            cameraVideo.current.srcObject = event.streams[0];
          }
          setHasCameraStream(true);
        }
      }

      if (event.track.kind === 'audio') {
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          const playPromise = audioRef.current.play();
          if (playPromise !== undefined) {
            playPromise.catch((error) => console.log('Auto-play audio bị chặn:', error));
          }
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('candidate', broadcasterId, event.candidate);
      }
    };

    const handleOffer = async (id, desc) => {
      if (id !== broadcasterId) return;
      setHasCameraStream(false);
      if (screenVideo.current) screenVideo.current.srcObject = null;
      if (cameraVideo.current) cameraVideo.current.srcObject = null;
      if (audioRef.current) audioRef.current.srcObject = null;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(desc));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', broadcasterId, pc.localDescription);
      } catch (error) {
        console.error('Lỗi xử lý offer:', error);
      }
    };

    const handleCandidate = async (id, candidate) => {
      if (id !== broadcasterId) return;
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.error('Lỗi thêm ICE candidate:', error);
      }
    };

    const handleViewerCount = (count) => setViewerCount(count);
    const handleMediaStateChanged = ({ videoEnabled, audioEnabled }) => {
      setBroadcasterMediaState({ videoEnabled, audioEnabled });
    };

    const handleStreamEnded = () => {
      setStreamEnded(true);
      let countdown = 3;
      setRedirectTimer(countdown);
      const interval = setInterval(() => {
        countdown -= 1;
        setRedirectTimer(countdown);
        if (countdown <= 0) {
          clearInterval(interval);
          window.location.href = '/';
        }
      }, 1000);
    };

    const handleChangeStreamMode = ({ mode }) => {
      if (mode !== 'both') {
        setHasCameraStream(false);
        if (cameraVideo.current) cameraVideo.current.srcObject = null;
      }
    };

    socket.on('offer', handleOffer);
    socket.on('candidate', handleCandidate);
    socket.on('viewerCount', handleViewerCount);
    socket.on('media-state-changed', handleMediaStateChanged);
    socket.on('stream-ended', handleStreamEnded);
    socket.on('change-stream-mode', handleChangeStreamMode);

    return () => {
      socket.emit('disconnectPeer', broadcasterId);
      socket.off('offer', handleOffer);
      socket.off('candidate', handleCandidate);
      socket.off('viewerCount', handleViewerCount);
      socket.off('media-state-changed', handleMediaStateChanged);
      socket.off('stream-ended', handleStreamEnded);
      socket.off('change-stream-mode', handleChangeStreamMode);
      pc.close();
    };
  }, [isViewing, broadcasterId]);

  return (
    <div style={styles.container}>
      {!isViewing ? (
        <div style={styles.loginSection}>
          <h3 style={{ fontSize: 23, marginBottom: 10, fontWeight: 'bold', color: '#000' }}>
            Nhập tên để xem livestream
          </h3>
          <input
            placeholder="Tên của bạn"
            value={userName}
            onChange={(e) => setUserName(e.target.value)}
            style={styles.nameInput}
          />
          {error && <div style={styles.error}>{error}</div>}
          <button onClick={handleStartViewing} style={styles.startButton}>
            Vào xem ngay
          </button>
        </div>
      ) : (
        <div style={styles.viewingContainer}>
          <div style={styles.viewerInfo}>
            Đang xem livestream | <span>Viewer(s): {viewerCount}</span>
          </div>

          <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />

          {/* CONTAINER TỔNG BAO GỒM SCREEN VÀ CAMERA */}
          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '900px',
            margin: '0 auto',
            display: 'flex',
            flexDirection: 'column',
            gap: shouldStack ? 10 : 0, // Cách nhau 10px khi ở mobile xếp dọc
          }}>
            
            {/* 1. KHUNG CHỨA SCREEN VIDEO */}
            <div style={{
              position: 'relative',
              width: '100%',
              aspectRatio: videoRatio, 
              maxHeight: shouldStack ? 'none' : '85vh',
              background: '#000',
              borderRadius: 8,
              overflow: 'hidden'
            }}>
              <div style={styles.statusContainer}>
                {!broadcasterMediaState.videoEnabled && (
                  <span style={styles.offStatus}>Cam Off</span>
                )}
                {!broadcasterMediaState.audioEnabled && (
                  <span style={styles.offStatus}>Mic Off</span>
                )}
              </div>

              <video
                ref={screenVideo}
                autoPlay
                playsInline
                controls={false}
                muted
                style={styles.screenVideo}
                onLoadedMetadata={(e) => {
                  const { videoWidth, videoHeight } = e.target;
                  if (videoWidth && videoHeight) {
                    setVideoRatio(`${videoWidth}/${videoHeight}`);
                  }
                }}
              />
            </div>

            {/* 2. KHUNG CHỨA CAMERA PIP (Linh hoạt PC / Mobile) */}
            <div style={{
              display: hasCameraStream ? 'block' : 'none',
              ...(shouldStack
                ? {
                    // CSS CHO MOBILE (XẾP DỌC PHÍA DƯỚI)
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16/9',
                    background: '#000',
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid #333'
                  }
                : {
                    // CSS CHO PC (ĐÈ GÓC DƯỚI BÊN PHẢI)
                    position: 'absolute',
                    bottom: 20,
                    right: 20,
                    width: 200,
                    height: 150,
                    borderRadius: 8,
                    border: '2px solid white',
                    overflow: 'hidden',
                    background: '#000',
                    zIndex: 20,
                    boxShadow: '0 4px 10px rgba(0,0,0,0.5)',
                  })
            }}>
              <video
                ref={cameraVideo}
                autoPlay
                playsInline
                muted
                style={styles.cameraVideo}
              />
            </div>

            {/* LIVESTREAM ĐÃ KẾT THÚC */}
            {streamEnded && (
              <div style={styles.streamEndedOverlay}>
                <h2>Livestream đã kết thúc</h2>
                <p>Quay về trang chủ sau {redirectTimer}s...</p>
              </div>
            )}
          </div>

          {/* CHAT */}
          <div style={styles.chatContainer}>
            <Chat broadcasterId={broadcasterId} />
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { width: '100%', boxSizing: 'border-box' },
  viewingContainer: { width: '100%', boxSizing: 'border-box', fontWeight: 'bold' },
  loginSection: { width: '100%', boxSizing: 'border-box' },
  nameInput: {
    width: '100%',
    height: 40,
    marginBottom: 10,
    padding: '0 10px',
    boxSizing: 'border-box',
    border: '1px solid #ccc',
    borderRadius: 5,
    fontSize: 14,
  },
  error: { color: 'red', marginBottom: 10 },
  startButton: {
    width: '100%',
    height: 45,
    padding: 0,
    backgroundColor: '#1890ff',
    color: 'white',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 15,
    boxSizing: 'border-box',
  },
  viewerInfo: { width: '100%', fontSize: 14, marginBottom: 5, fontWeight: 'bold' },
  statusContainer: {
    position: 'absolute',
    top: 10,
    left: 10,
    zIndex: 10,
    display: 'flex',
    gap: 10,
  },
  offStatus: {
    background: '#ff4d4f',
    color: 'white',
    padding: '4px 8px',
    borderRadius: 4,
  },
  screenVideo: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  cameraVideo: {
    display: 'block',
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  streamEndedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    zIndex: 100,
    borderRadius: 8,
  },
  chatContainer: {
    width: '100%',
    marginTop: 10,
    boxSizing: 'border-box',
  },
};