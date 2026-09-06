import React, {
  useState,
  useEffect,
  useRef,
} from 'react';

import { socket } from '../socket';
import Chat from './Chat';

export default function Viewer({
  broadcasterId,
}) {
  const screenVideo =
    useRef(null);

  const cameraVideo =
    useRef(null);

  /*
    Audio có thể đến trước video.

    Vì vậy nếu audio đến trước,
    chúng ta lưu track lại rồi gắn
    vào stream chính khi video đến.
  */
  const pendingAudioTracks =
    useRef([]);

  const [userName, setUserName] =
    useState('');

  const [isViewing, setIsViewing] =
    useState(false);

  const [viewerCount, setViewerCount] =
    useState(0);

  const [error, setError] =
    useState('');

  const [
    hasCameraStream,
    setHasCameraStream,
  ] = useState(false);

  const [
    broadcasterMediaState,
    setBroadcasterMediaState,
  ] = useState({
    videoEnabled: true,
    audioEnabled: true,
  });

  const [
    streamEnded,
    setStreamEnded,
  ] = useState(false);

  const [
    redirectTimer,
    setRedirectTimer,
  ] = useState(3);

  // =========================================================
  // START VIEWING
  // =========================================================

  const handleStartViewing = () => {
    if (!userName.trim()) {
      setError(
        'Vui lòng nhập tên'
      );

      return;
    }

    setError('');

    setIsViewing(true);

    socket.emit(
      'setUserName',
      userName
    );

    socket.emit(
      'watcher',
      broadcasterId
    );
  };

  // =========================================================
  // WEBRTC
  // =========================================================

  useEffect(() => {
    if (!isViewing) return;
    if (!broadcasterId) return;

    const pc =
      new RTCPeerConnection({
        iceServers: [
          {
            urls: [
              'stun:hk-turn1.xirsys.com',
            ],
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
            urls:
              'stun:stun.l.google.com:19302',
          },
        ],
      });

    // =======================================================
    // ON TRACK
    // =======================================================

    pc.ontrack = (e) => {
      console.log(
        '[Viewer] Received track:',
        e.track.kind,
        'stream:',
        e.streams[0]?.id
      );

      // =====================================================
      // AUDIO
      // =====================================================

      if (e.track.kind === 'audio') {
        const audioTrack =
          e.track;

        console.log(
          '[Viewer] Audio track received'
        );

        /*
          Nếu video chính đã có stream,
          gắn audio trực tiếp vào đó.
        */

        if (
          screenVideo.current &&
          screenVideo.current
            .srcObject
        ) {
          const mainStream =
            screenVideo.current
              .srcObject;

          const exists =
            mainStream
              .getAudioTracks()
              .some(
                (track) =>
                  track.id ===
                  audioTrack.id
              );

          if (!exists) {
            mainStream.addTrack(
              audioTrack
            );
          }

          /*
            Quan trọng:
            video chính KHÔNG muted.
          */

          screenVideo.current
            .play()
            .catch((err) => {
              console.log(
                'Không thể autoplay audio:',
                err
              );
            });
        } else {
          /*
            Video chưa đến.
            Lưu audio lại.
          */

          console.log(
            '[Viewer] Audio đến trước video'
          );

          const exists =
            pendingAudioTracks.current.some(
              (track) =>
                track.id ===
                audioTrack.id
            );

          if (!exists) {
            pendingAudioTracks.current.push(
              audioTrack
            );
          }
        }

        return;
      }

      // =====================================================
      // VIDEO
      // =====================================================

      if (e.track.kind === 'video') {
        const incomingStream =
          e.streams[0];

        if (!incomingStream) {
          console.warn(
            '[Viewer] Video không có stream'
          );

          return;
        }

        /*
          VIDEO #1
          = Main Screen / Main Camera
        */

        if (
          !screenVideo.current
            .srcObject
        ) {
          screenVideo.current.srcObject =
            incomingStream;

          /*
            Nếu audio đến trước,
            gắn audio vào stream chính.
          */

          pendingAudioTracks.current.forEach(
            (audioTrack) => {
              const exists =
                incomingStream
                  .getAudioTracks()
                  .some(
                    (track) =>
                      track.id ===
                      audioTrack.id
                  );

              if (!exists) {
                incomingStream.addTrack(
                  audioTrack
                );
              }
            }
          );

          pendingAudioTracks.current =
            [];

          setHasCameraStream(
            false
          );

          /*
            Bắt đầu phát video + audio
          */

          screenVideo.current
            .play()
            .catch((err) => {
              console.log(
                'Main video play error:',
                err
              );
            });
        }

        /*
          VIDEO #2
          = Camera overlay
        */

        else {
          if (
            cameraVideo.current
          ) {
            cameraVideo.current.srcObject =
              incomingStream;

            setHasCameraStream(
              true
            );

            cameraVideo.current
              .play()
              .catch((err) => {
                console.log(
                  'Camera video play error:',
                  err
                );
              });
          }
        }
      }
    };

    // =======================================================
    // ICE
    // =======================================================

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit(
          'candidate',
          broadcasterId,
          e.candidate
        );
      }
    };

    // =======================================================
    // CONNECTION STATE
    // =======================================================

    pc.onconnectionstatechange =
      () => {
        console.log(
          '[Viewer] Connection state:',
          pc.connectionState
        );
      };

    // =======================================================
    // OFFER
    // =======================================================

    const handleOffer = async (
      id,
      desc
    ) => {
      if (id !== broadcasterId)
        return;

      try {
        console.log(
          '[Viewer] Received offer'
        );

        /*
          KHÔNG reset srcObject ở đây.

          Khi Broadcaster đổi mode,
          WebRTC sẽ renegotiate tracks.
        */

        await pc.setRemoteDescription(
          new RTCSessionDescription(
            desc
          )
        );

        const answer =
          await pc.createAnswer();

        await pc.setLocalDescription(
          answer
        );

        socket.emit(
          'answer',
          broadcasterId,
          pc.localDescription
        );
      } catch (err) {
        console.error(
          '[Viewer] Offer error:',
          err
        );
      }
    };

    // =======================================================
    // CANDIDATE
    // =======================================================

    const handleCandidate = (
      id,
      candidate
    ) => {
      if (id !== broadcasterId)
        return;

      if (!candidate) return;

      pc.addIceCandidate(
        new RTCIceCandidate(candidate)
      ).catch((err) => {
        console.error(
          '[Viewer] ICE candidate error:',
          err
        );
      });
    };

    // =======================================================
    // VIEWER COUNT
    // =======================================================

    const handleViewerCount = (
      count
    ) => {
      setViewerCount(count);
    };

    // =======================================================
    // MEDIA STATE
    // =======================================================

    const handleMediaStateChanged =
      ({
        videoEnabled,
        audioEnabled,
      }) => {
        setBroadcasterMediaState({
          videoEnabled,
          audioEnabled,
        });
      };

    // =======================================================
    // STREAM ENDED
    // =======================================================

    const handleStreamEnded = () => {
      setStreamEnded(true);

      let countdown = 3;

      setRedirectTimer(
        countdown
      );

      const interval =
        setInterval(() => {
          countdown -= 1;

          setRedirectTimer(
            countdown
          );

          if (countdown <= 0) {
            clearInterval(
              interval
            );

            window.location.href =
              '/';
          }
        }, 1000);
    };

    // =======================================================
    // CHANGE MODE
    // =======================================================

    const handleChangeStreamMode =
      ({ mode }) => {
        console.log(
          '[Viewer] Stream mode:',
          mode
        );

        /*
          Không reset screenVideo.

          Khi WebRTC nhận track mới,
          ontrack sẽ tự xử lý.

          Chỉ cần đảm bảo nếu mode không
          phải both thì camera overlay ẩn.
        */

        if (mode !== 'both') {
          setHasCameraStream(
            false
          );

          if (
            cameraVideo.current
          ) {
            cameraVideo.current.srcObject =
              null;
          }
        }
      };

    // =======================================================
    // SOCKET LISTENERS
    // =======================================================

    socket.on(
      'offer',
      handleOffer
    );

    socket.on(
      'candidate',
      handleCandidate
    );

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

    // =======================================================
    // CLEANUP
    // =======================================================

    return () => {
      socket.emit(
        'disconnectPeer',
        broadcasterId
      );

      socket.off(
        'offer',
        handleOffer
      );

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

      pendingAudioTracks.current =
        [];

      if (
        screenVideo.current
      ) {
        screenVideo.current.srcObject =
          null;
      }

      if (
        cameraVideo.current
      ) {
        cameraVideo.current.srcObject =
          null;
      }
    };
  }, [
    isViewing,
    broadcasterId,
  ]);

  // =========================================================
  // UI
  // =========================================================

  return (
    <div>
      {!isViewing ? (
        <div>
          <h2>
            Nhập tên để xem
            livestream
          </h2>

          <input
            placeholder="Tên của bạn"
            value={userName}
            onChange={(e) =>
              setUserName(
                e.target.value
              )
            }
            style={{
              width: '100%',
              marginBottom: 10,
              height: 40,
              fontSize: 16,
            }}
          />

          {error && (
            <div
              style={{
                color: 'red',
                marginBottom: 10,
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={
              handleStartViewing
            }
            style={{
              width: '100%',
              height: 45,
              backgroundColor:
                '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: 4,
            }}
          >
            Vào xem ngay
          </button>
        </div>
      ) : (
        <div>
          <div
            style={{
              fontSize: 14,
              marginBottom: 5,
            }}
          >
            Đang xem livestream |
            <b>
              {' '}
              Viewers:{' '}
              {viewerCount}
            </b>
          </div>

          {/* =================================================
              VIDEO CONTAINER
          ================================================= */}

          <div
            style={{
              position: 'relative',
              width: '100%',
              background: '#000',
              height: '80vh',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {/* MEDIA STATE */}

            <div
              style={{
                position:
                  'absolute',
                top: 10,
                left: 10,
                zIndex: 30,
                display: 'flex',
                gap: 10,
              }}
            >
              {!broadcasterMediaState.videoEnabled && (
                <span
                  style={{
                    background:
                      '#ff4d4f',
                    color: 'white',
                    padding:
                      '4px 8px',
                    borderRadius: 4,
                  }}
                >
                  📷 Cam Off
                </span>
              )}

              {!broadcasterMediaState.audioEnabled && (
                <span
                  style={{
                    background:
                      '#ff4d4f',
                    color: 'white',
                    padding:
                      '4px 8px',
                    borderRadius: 4,
                  }}
                >
                  🔇 Mic Off
                </span>
              )}
            </div>

            {/* =================================================
                MAIN VIDEO

                QUAN TRỌNG:
                KHÔNG muted
            ================================================= */}

            <video
              ref={screenVideo}
              autoPlay
              playsInline
              controls={false}
              muted={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                background: '#000',
              }}
            />

            {/* =================================================
                CAMERA OVERLAY

                Camera này KHÔNG phát audio.
            ================================================= */}

            <div
              style={{
                display:
                  hasCameraStream
                    ? 'block'
                    : 'none',

                position:
                  'absolute',

                bottom: 20,
                right: 20,

                width: '200px',
                height: '150px',

                borderRadius: 8,
                border:
                  '2px solid white',

                overflow: 'hidden',

                background: '#000',

                zIndex: 20,

                boxShadow:
                  '0 4px 10px rgba(0,0,0,0.5)',
              }}
            >
              <video
                ref={cameraVideo}
                autoPlay
                playsInline
                muted
                controls={false}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>

            {/* =================================================
                STREAM ENDED
            ================================================= */}

            {streamEnded && (
              <div
                style={{
                  position:
                    'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,

                  backgroundColor:
                    'rgba(0,0,0,0.85)',

                  display: 'flex',
                  flexDirection:
                    'column',

                  alignItems:
                    'center',

                  justifyContent:
                    'center',

                  color: 'white',

                  zIndex: 100,
                }}
              >
                <h2>
                  Livestream đã
                  kết thúc
                </h2>

                <p>
                  Quay về trang chủ
                  sau{' '}
                  {redirectTimer}
                  s...
                </p>
              </div>
            )}
          </div>

          {/* =================================================
              CHAT
          ================================================= */}

          <div
            style={{
              marginTop: 10,
            }}
          >
            <Chat
              broadcasterId={
                broadcasterId
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}
