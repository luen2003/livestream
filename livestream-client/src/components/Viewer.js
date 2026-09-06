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

  const audioElement =
    useRef(null);

  const peerConnection =
    useRef(null);

  const [userName, setUserName] =
    useState('');

  const [isViewing, setIsViewing] =
    useState(false);

  const [viewerCount, setViewerCount] =
    useState(0);

  const [error, setError] =
    useState('');

  const [hasCameraStream, setHasCameraStream] =
    useState(false);

  const [
    broadcasterMediaState,
    setBroadcasterMediaState,
  ] = useState({
    videoEnabled: true,
    audioEnabled: true,
  });

  const [streamEnded, setStreamEnded] =
    useState(false);

  const [redirectTimer, setRedirectTimer] =
    useState(3);

  /*
   * ==========================================
   * START VIEWING
   * ==========================================
   */

  const handleStartViewing = () => {
    if (!userName.trim()) {
      setError('Vui lòng nhập tên');
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

  /*
   * ==========================================
   * WEBRTC
   * ==========================================
   */

  useEffect(() => {
    if (
      !isViewing ||
      !broadcasterId
    ) {
      return;
    }

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

    peerConnection.current = pc;

    /*
     * ========================================
     * NHẬN TRACK
     * ========================================
     */

    pc.ontrack = (event) => {
      console.log(
        'Received track:',
        event.track.kind,
        event.streams
      );

      if (
        !event.streams ||
        event.streams.length === 0
      ) {
        return;
      }

      const stream =
        event.streams[0];

      /*
       * AUDIO
       *
       * Đây là phần quan trọng để
       * Viewer nghe được microphone.
       */
      if (
        event.track.kind === 'audio'
      ) {
        if (audioElement.current) {
          /*
           * Tạo stream chỉ chứa audio.
           */
          const audioStream =
            new MediaStream([
              event.track,
            ]);

          audioElement.current.srcObject =
            audioStream;

          audioElement.current
            .play()
            .catch((err) => {
              console.warn(
                'Audio autoplay bị chặn:',
                err
              );
            });
        }

        return;
      }

      /*
       * ======================================
       * VIDEO
       * ======================================
       */

      if (
        event.track.kind !== 'video'
      ) {
        return;
      }

      /*
       * Stream ID dùng để phân biệt
       * Screen và Camera.
       *
       * Broadcaster tạo:
       *
       * screen -> screen stream
       * camera -> camera stream
       *
       * Nếu stream.id chứa camera thì
       * đưa vào cameraVideo.
       */

      const streamId =
        stream.id.toLowerCase();

      console.log(
        'Video stream:',
        streamId
      );

      /*
       * Camera stream
       */
      if (
        streamId.includes('camera')
      ) {
        if (cameraVideo.current) {
          cameraVideo.current.srcObject =
            stream;

          setHasCameraStream(true);
        }

        return;
      }

      /*
       * Screen stream
       */
      if (
        streamId.includes('screen')
      ) {
        if (screenVideo.current) {
          screenVideo.current.srcObject =
            stream;
        }

        return;
      }

      /*
       * Fallback:
       *
       * Nếu browser không giữ tên stream
       * như mong muốn thì video đầu tiên
       * sẽ làm video chính.
       */

      if (
        !screenVideo.current?.srcObject
      ) {
        screenVideo.current.srcObject =
          stream;
      } else if (
        !cameraVideo.current?.srcObject
      ) {
        cameraVideo.current.srcObject =
          stream;

        setHasCameraStream(true);
      }
    };

    /*
     * ========================================
     * ICE
     * ========================================
     */

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit(
          'candidate',
          broadcasterId,
          event.candidate
        );
      }
    };

    /*
     * ========================================
     * OFFER
     * ========================================
     */

    const handleOffer = async (
      id,
      description
    ) => {
      if (
        id !== broadcasterId
      ) {
        return;
      }

      /*
       * Không reset video trước khi
       * nhận offer nếu không cần thiết.
       *
       * Tránh trường hợp màn hình
       * bị nhấp nháy.
       */

      try {
        await pc.setRemoteDescription(
          new RTCSessionDescription(
            description
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
          'Offer error:',
          err
        );
      }
    };

    /*
     * ========================================
     * CANDIDATE
     * ========================================
     */

    const handleCandidate = (
      id,
      candidate
    ) => {
      if (
        id !== broadcasterId
      ) {
        return;
      }

      pc.addIceCandidate(
        new RTCIceCandidate(
          candidate
        )
      ).catch((err) => {
        console.error(
          'ICE candidate error:',
          err
        );
      });
    };

    /*
     * ========================================
     * VIEWER COUNT
     * ========================================
     */

    const handleViewerCount = (
      count
    ) => {
      setViewerCount(count);
    };

    /*
     * ========================================
     * MEDIA STATE
     * ========================================
     */

    const handleMediaStateChanged = ({
      videoEnabled,
      audioEnabled,
    }) => {
      setBroadcasterMediaState({
        videoEnabled,
        audioEnabled,
      });

      /*
       * Nếu broadcaster tắt mic,
       * đảm bảo audio element muted.
       */
      if (audioElement.current) {
        audioElement.current.muted =
          !audioEnabled;
      }
    };

    /*
     * ========================================
     * STREAM ENDED
     * ========================================
     */

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
            clearInterval(interval);

            window.location.href =
              '/';
          }
        }, 1000);
    };

    /*
     * ========================================
     * SOCKET EVENTS
     * ========================================
     */

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

    /*
     * ========================================
     * CLEANUP
     * ========================================
     */

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

      if (audioElement.current) {
        audioElement.current.srcObject =
          null;
      }

      if (screenVideo.current) {
        screenVideo.current.srcObject =
          null;
      }

      if (cameraVideo.current) {
        cameraVideo.current.srcObject =
          null;
      }

      pc.close();

      peerConnection.current =
        null;
    };
  }, [
    isViewing,
    broadcasterId,
  ]);

  /*
   * ==========================================
   * UI
   * ==========================================
   */

  return (
    <div>
      {!isViewing ? (
        <div>
          <h2>
            Nhập tên để xem livestream
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
            Đang xem livestream |{' '}
            <b>
              Viewers: {viewerCount}
            </b>
          </div>

          {/*
           * AUDIO RIÊNG
           *
           * Không hiển thị.
           */
          }

          <audio
            ref={audioElement}
            autoPlay
            playsInline
            style={{
              display: 'none',
            }}
          />

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
            <div
              style={{
                position: 'absolute',
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

            {/*
             * VIDEO CHÍNH
             */}
            <video
              ref={screenVideo}
              autoPlay
              playsInline
              controls={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />

            {/*
             * CAMERA PHỤ
             */}
            <div
              style={{
                display: hasCameraStream
                  ? 'block'
                  : 'none',

                position: 'absolute',
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
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>

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
                  Livestream đã kết thúc
                </h2>

                <p>
                  Quay về trang chủ sau{' '}
                  {redirectTimer}s...
                </p>
              </div>
            )}
          </div>

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
