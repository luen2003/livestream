import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';
import Chat from './Chat';

export default function Viewer({ broadcasterId }) {
  const screenVideo = useRef(null);
  const cameraVideo = useRef(null);
  const audioRef = useRef(null);

  const [userName, setUserName] = useState('');
  const [isViewing, setIsViewing] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState('');

  const [hasCameraStream, setHasCameraStream] = useState(false);

  const [broadcasterMediaState, setBroadcasterMediaState] =
    useState({
      videoEnabled: true,
      audioEnabled: true,
    });

  const [streamEnded, setStreamEnded] = useState(false);
  const [redirectTimer, setRedirectTimer] = useState(3);

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
    if (!isViewing || !broadcasterId) {
      return;
    }

    const pc = new RTCPeerConnection({
      iceServers: [
        {
          urls: ['stun:hk-turn1.xirsys.com'],
        },
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
        {
          urls: 'stun:stun.l.google.com:19302',
        },
      ],
    });

    pc.ontrack = (event) => {
      if (event.track.kind === 'video') {
        if (!screenVideo.current?.srcObject) {
          if (screenVideo.current) {
            screenVideo.current.srcObject =
              event.streams[0];
          }

          setHasCameraStream(false);
        } else if (
          screenVideo.current.srcObject.id !==
          event.streams[0].id
        ) {
          if (cameraVideo.current) {
            cameraVideo.current.srcObject =
              event.streams[0];
          }

          setHasCameraStream(true);
        }
      }

      if (event.track.kind === 'audio') {
        if (audioRef.current) {
          audioRef.current.srcObject =
            event.streams[0];

          const playPromise =
            audioRef.current.play();

          if (playPromise !== undefined) {
            playPromise.catch((error) => {
              console.log(
                'Auto-play audio bị chặn:',
                error
              );
            });
          }
        }
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit(
          'candidate',
          broadcasterId,
          event.candidate
        );
      }
    };

    const handleOffer = async (id, desc) => {
      if (id !== broadcasterId) {
        return;
      }

      setHasCameraStream(false);

      if (screenVideo.current) {
        screenVideo.current.srcObject = null;
      }

      if (cameraVideo.current) {
        cameraVideo.current.srcObject = null;
      }

      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }

      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription(desc)
        );

        const answer = await pc.createAnswer();

        await pc.setLocalDescription(answer);

        socket.emit(
          'answer',
          broadcasterId,
          pc.localDescription
        );
      } catch (error) {
        console.error(
          'Lỗi xử lý offer:',
          error
        );
      }
    };

    const handleCandidate = async (
      id,
      candidate
    ) => {
      if (id !== broadcasterId) {
        return;
      }

      try {
        await pc.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error(
          'Lỗi thêm ICE candidate:',
          error
        );
      }
    };

    const handleViewerCount = (count) => {
      setViewerCount(count);
    };

    const handleMediaStateChanged = ({
      videoEnabled,
      audioEnabled,
    }) => {
      setBroadcasterMediaState({
        videoEnabled,
        audioEnabled,
      });
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

        if (cameraVideo.current) {
          cameraVideo.current.srcObject = null;
        }
      }
    };

    socket.on('offer', handleOffer);
    socket.on('candidate', handleCandidate);
    socket.on(
      'viewerCount',
      handleViewerCount
    );
    socket.on(
      'media-state-changed',
      handleMediaStateChanged
    );
    socket.on(
      'stream-ended',
      handleStreamEnded
    );
    socket.on(
      'change-stream-mode',
      handleChangeStreamMode
    );

    return () => {
      socket.emit(
        'disconnectPeer',
        broadcasterId
      );

      socket.off('offer', handleOffer);
      socket.off(
        'candidate',
        handleCandidate
      );
      socket.off(
        'viewerCount',
        handleViewerCount
      );
      socket.off(
        'media-state-changed',
        handleMediaStateChanged
      );
      socket.off(
        'stream-ended',
        handleStreamEnded
      );
      socket.off(
        'change-stream-mode',
        handleChangeStreamMode
      );

      pc.close();
    };
  }, [isViewing, broadcasterId]);

  return (
    <div style={styles.container}>
      {!isViewing ? (
        <div style={styles.loginSection}>
          <h2>
            Nhập tên để xem livestream
          </h2>

          <input
            placeholder="Tên của bạn"
            value={userName}
            onChange={(e) =>
              setUserName(e.target.value)
            }
            style={styles.nameInput}
          />

          {error && (
            <div style={styles.error}>
              {error}
            </div>
          )}

          {/* NÚT VÀO XEM NGAY */}
          <button
            onClick={handleStartViewing}
            style={styles.startButton}
          >
            Vào xem ngay
          </button>
        </div>
      ) : (
        <div style={styles.viewingContainer}>
          <div style={styles.viewerInfo}>
            Đang xem livestream |{' '}
            <span>
              Viewer(s): {viewerCount}
            </span>
          </div>

          <audio
            ref={audioRef}
            autoPlay
            playsInline
            style={{ display: 'none' }}
          />

          {/* VIDEO LIVESTREAM */}
          <div style={styles.videoContainer}>
            <div
              style={styles.statusContainer}
            >
              {!broadcasterMediaState.videoEnabled && (
                <span style={styles.offStatus}>
                  Cam Off
                </span>
              )}

              {!broadcasterMediaState.audioEnabled && (
                <span style={styles.offStatus}>
                  Mic Off
                </span>
              )}
            </div>

            <video
              ref={screenVideo}
              autoPlay
              playsInline
              controls={false}
              muted
              style={styles.screenVideo}
            />

            {/* CAMERA PIP */}
            <div
              style={{
                ...styles.cameraContainer,
                display: hasCameraStream
                  ? 'block'
                  : 'none',
              }}
            >
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
              <div
                style={
                  styles.streamEndedOverlay
                }
              >
                <h2>
                  Livestream đã kết thúc
                </h2>

                <p>
                  Quay về trang chủ sau{' '}
                  {redirectTimer}s...
                </p>
              </div>
            )}
          </div>

          {/* CHAT */}
          <div style={styles.chatContainer}>
            <Chat
              broadcasterId={broadcasterId}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    boxSizing: 'border-box',
  },

  viewingContainer: {
    width: '100%',
    boxSizing: 'border-box',
    fontWeight: '500',
  },

  loginSection: {
    width: '100%',
    boxSizing: 'border-box',
  },

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

  error: {
    color: 'red',
    marginBottom: 10,
  },

  /*
   * Nút này cao 45px
   */
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
    // fontWeight: 'bold',
    boxSizing: 'border-box',
  },

  viewerInfo: {
    width: '100%',
    fontSize: 14,
    marginBottom: 5,
  },

  /*
   * VIDEO
   * width = 100%
   */
  videoContainer: {
    position: 'relative',
    width: '100%',
    height: '80vh',
    background: '#000',
    borderRadius: 8,
    overflow: 'hidden',
    boxSizing: 'border-box',
  },

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
    objectFit: 'contain',
  },

  cameraContainer: {
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
    boxShadow:
      '0 4px 10px rgba(0,0,0,0.5)',
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
    backgroundColor:
      'rgba(0,0,0,0.85)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    zIndex: 100,
  },

  chatContainer: {
    width: '100%',
    marginTop: 10,
    boxSizing: 'border-box',
  },
};
