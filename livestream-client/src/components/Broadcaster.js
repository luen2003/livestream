import React, { useRef, useEffect, useState } from 'react';
import { socket } from '../socket';
import Chat from './Chat';

export default function Broadcaster() {
  const localScreenVideo = useRef(null);
  const localCameraVideo = useRef(null);
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

  const [facingMode, setFacingMode] = useState('user');
  const facingModeRef = useRef('user');

  const audioContextRef = useRef(null);
  const audioDestinationRef = useRef(null);
  const audioSourceRef = useRef(null);

  const isPortrait =
    typeof window !== 'undefined' &&
    window.innerHeight > window.innerWidth;

  /*
   * ============================================
   * CLEANUP
   * ============================================
   */

  const stopAll = () => {
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
      workerRef.current.terminate();
      workerRef.current = null;
    }

    Object.values(currentStreams.current).forEach((stream) => {
      stream.getTracks().forEach((track) => track.stop());
    });

    currentStreams.current = {};

    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch (e) { }

      audioSourceRef.current = null;
    }
  };

  useEffect(() => {
    canvasRef.current = document.createElement('canvas');

    const AudioContext =
      window.AudioContext || window.webkitAudioContext;

    audioContextRef.current = new AudioContext();

    audioDestinationRef.current =
      audioContextRef.current.createMediaStreamDestination();

    return () => {
      stopAll();

      Object.values(peerConnections.current).forEach((pc) => {
        try {
          pc.close();
        } catch (e) { }
      });

      peerConnections.current = {};

      if (
        audioContextRef.current &&
        audioContextRef.current.state !== 'closed'
      ) {
        audioContextRef.current.close();
      }
    };
  }, []);

  /*
   * ============================================
   * CANVAS
   * ============================================
   */

  const drawToCanvas = (
    mode,
    screenVideo,
    cameraVideo,
    width = 1280,
    height = 720
  ) => {
    const canvas = canvasRef.current;

    if (!canvas) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');

    if (workerRef.current) {
      workerRef.current.postMessage('stop');
      workerRef.current.terminate();
      workerRef.current = null;
    }

    const drawCover = (context, video, x, y, w, h) => {
      if (!video || !video.videoWidth || !video.videoHeight) return;

      const videoRatio = video.videoWidth / video.videoHeight;
      const targetRatio = w / h;

      let sWidth = video.videoWidth;
      let sHeight = video.videoHeight;
      let sx = 0;
      let sy = 0;

      if (videoRatio > targetRatio) {
        sWidth = sHeight * targetRatio;
        sx = (video.videoWidth - sWidth) / 2;
      } else {
        sHeight = sWidth / targetRatio;
        sy = (video.videoHeight - sHeight) / 2;
      }

      context.drawImage(
        video,
        sx,
        sy,
        sWidth,
        sHeight,
        x,
        y,
        w,
        h
      );
    };

    const workerCode = `
      let timer = null;

      self.onmessage = function(e) {
        if (e.data === 'start') {
          if (timer) clearInterval(timer);

          timer = setInterval(() => {
            self.postMessage('tick');
          }, 33);
        }

        if (e.data === 'stop') {
          if (timer) {
            clearInterval(timer);
            timer = null;
          }
        }
      };
    `;

    const blob = new Blob([workerCode], {
      type: 'application/javascript',
    });

    const worker = new Worker(
      URL.createObjectURL(blob)
    );

    worker.onmessage = () => {
      if (!canvas || !ctx) return;

      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);

      if (
        (mode === 'screen' || mode === 'both') &&
        screenVideo &&
        screenVideo.readyState >= 2
      ) {
        drawCover(
          ctx,
          screenVideo,
          0,
          0,
          width,
          height
        );
      }

      if (
        mode === 'camera' &&
        cameraVideo &&
        cameraVideo.readyState >= 2
      ) {
        drawCover(
          ctx,
          cameraVideo,
          0,
          0,
          width,
          height
        );
      }

      if (
        mode === 'both' &&
        cameraVideo &&
        cameraVideo.readyState >= 2
      ) {
        const camWidth = width * 0.3;
        const camHeight = camWidth * (3 / 4);

        const padding = 6;

        const x = width - camWidth - padding;
        const y = height - camHeight - padding;

        ctx.save();

        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 4;

        drawCover(
          ctx,
          cameraVideo,
          x,
          y,
          camWidth,
          camHeight
        );

        ctx.strokeRect(
          x,
          y,
          camWidth,
          camHeight
        );

        ctx.restore();
      }
    };

    worker.postMessage('start');

    workerRef.current = worker;
  };

  /*
   * ============================================
   * AUDIO
   * ============================================
   */

  const connectAudioToProxy = (stream) => {
    if (!stream || !audioContextRef.current) return;

    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch (e) { }

      audioSourceRef.current = null;
    }

    const audioTracks = stream.getAudioTracks();

    if (audioTracks.length === 0) return;

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    audioSourceRef.current =
      audioContextRef.current.createMediaStreamSource(
        stream
      );

    audioSourceRef.current.connect(
      audioDestinationRef.current
    );
  };

  /*
   * ============================================
   * RECORDING
   * ============================================
   */

  const startProxyRecording = () => {
    if (
      !canvasRef.current ||
      !audioDestinationRef.current
    ) {
      return;
    }

    const canvasStream =
      canvasRef.current.captureStream(30);

    const canvasTrack =
      canvasStream.getVideoTracks()[0];

    const audioTrack =
      audioDestinationRef.current.stream.getAudioTracks()[0];

    if (!canvasTrack) return;

    const tracks = [canvasTrack];

    if (audioTrack) {
      tracks.push(audioTrack);
    }

    const proxyStream = new MediaStream(tracks);

    initMediaRecorder(proxyStream);
  };

  const initMediaRecorder = (streamToRecord) => {
    if (!streamToRecord) return;

    try {
      let mimeType = 'video/webm;codecs=vp9,opus';

      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm';
      }

      const recorder = new MediaRecorder(
        streamToRecord,
        { mimeType }
      );

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.start(1000);

      mediaRecorderRef.current = recorder;
    } catch (err) {
      console.error(
        'Lỗi khi khởi tạo ghi hình:',
        err
      );
    }
  };

  /*
   * ============================================
   * GET MEDIA
   * ============================================
   */

  const getMediaStream = async (source) => {
    try {
      stopAll();

      let newStreams = {};
      let activeStreamForAudio = null;

      if (source === 'camera') {
        const cam =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: facingModeRef.current,
            },
            audio: true,
          });

        newStreams = {
          camera: cam,
        };

        activeStreamForAudio = cam;

        if (localCameraVideo.current) {
          localCameraVideo.current.srcObject = cam;
        }
      }

      if (source === 'screen') {
        const scr =
          await navigator.mediaDevices.getDisplayMedia({
            video: true,
          });

        const mic =
          await navigator.mediaDevices.getUserMedia({
            audio: true,
          });

        const combinedStream =
          new MediaStream([
            ...scr.getVideoTracks(),
            ...mic.getAudioTracks(),
          ]);

        newStreams = {
          screen: combinedStream,
        };

        activeStreamForAudio = combinedStream;

        if (localScreenVideo.current) {
          localScreenVideo.current.srcObject =
            combinedStream;
        }
      }

      if (source === 'both') {
        const scr =
          await navigator.mediaDevices.getDisplayMedia({
            video: true,
          });

        const cam =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: facingModeRef.current,
            },
            audio: true,
          });

        newStreams = {
          screen: scr,
          camera: cam,
        };

        /*
         * Audio lấy từ camera/microphone.
         */
        activeStreamForAudio = cam;

        if (localScreenVideo.current) {
          localScreenVideo.current.srcObject = scr;
        }

        if (localCameraVideo.current) {
          localCameraVideo.current.srcObject = cam;
        }
      }

      currentStreams.current = newStreams;

      /*
       * Kết nối microphone vào AudioContext.
       */
      if (activeStreamForAudio) {
        connectAudioToProxy(activeStreamForAudio);
      }

      const canvasWidth = isPortrait
        ? 720
        : 1280;

      const canvasHeight = isPortrait
        ? 1280
        : 960;

      /*
       * Chờ video có kích thước trước khi vẽ.
       */
      await new Promise((resolve) => {
        setTimeout(resolve, 500);
      });

      drawToCanvas(
        source,
        localScreenVideo.current,
        localCameraVideo.current,
        canvasWidth,
        canvasHeight
      );

      /*
       * Recording chỉ khởi tạo một lần.
       */
      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state === 'inactive'
      ) {
        setTimeout(() => {
          startProxyRecording();
        }, 1000);
      }

      return newStreams;
    } catch (err) {
      console.error(
        'Error getting media:',
        err
      );

      setError(
        'Không thể truy cập nguồn video hoặc người dùng đã hủy.'
      );

      return null;
    }
  };

  /*
   * ============================================
   * TOGGLE VIDEO
   * ============================================
   */

  const toggleVideo = () => {
    const newState = !videoEnabled;

    Object.values(currentStreams.current).forEach(
      (stream) => {
        stream.getVideoTracks().forEach(
          (track) => {
            track.enabled = newState;
          }
        );
      }
    );

    setVideoEnabled(newState);

    socket.emit(
      'media-state-changed',
      {
        broadcasterId: socket.id,
        videoEnabled: newState,
        audioEnabled,
      }
    );
  };

  /*
   * ============================================
   * TOGGLE AUDIO
   * ============================================
   */

  const toggleAudio = () => {
    const newState = !audioEnabled;

    Object.values(currentStreams.current).forEach(
      (stream) => {
        stream.getAudioTracks().forEach(
          (track) => {
            track.enabled = newState;
          }
        );
      }
    );

    /*
     * Đồng thời bật/tắt audio source.
     */
    if (audioSourceRef.current) {
      audioSourceRef.current.disconnect();

      if (newState) {
        const audioStream =
          Object.values(
            currentStreams.current
          ).find(
            (stream) =>
              stream.getAudioTracks().length > 0
          );

        if (audioStream) {
          audioSourceRef.current =
            audioContextRef.current.createMediaStreamSource(
              audioStream
            );

          audioSourceRef.current.connect(
            audioDestinationRef.current
          );
        }
      } else {
        audioSourceRef.current = null;
      }
    }

    setAudioEnabled(newState);

    socket.emit(
      'media-state-changed',
      {
        broadcasterId: socket.id,
        videoEnabled,
        audioEnabled: newState,
      }
    );
  };

  /*
   * ============================================
   * FLIP CAMERA
   *
   * Chỉ cho phép trước khi livestream.
   * ============================================
   */

  const flipCameraBeforeStart = () => {
    const newMode =
      facingModeRef.current === 'user'
        ? 'environment'
        : 'user';

    facingModeRef.current = newMode;

    setFacingMode(newMode);
  };

  /*
   * ============================================
   * STOP STREAMING
   * ============================================
   */

  const stopStreaming = () => {
    socket.emit(
      'stream-ended',
      socket.id
    );

    setIsStreaming(false);

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }

    setTimeout(() => {
      if (
        recordedChunksRef.current.length > 0
      ) {
        const blob = new Blob(
          recordedChunksRef.current,
          {
            type: 'video/webm',
          }
        );

        const url =
          URL.createObjectURL(blob);

        setRecordedVideoUrl(url);
      }
    }, 600);

    stopAll();
  };

  /*
   * ============================================
   * WEBRTC
   * ============================================
   */

  useEffect(() => {
    if (!isStreaming) return;

    socket.emit('broadcaster', {
      livestreamName: streamName,
      userName,
    });

    /*
     * Chỉ lấy stream MỘT LẦN khi bắt đầu.
     */
    getMediaStream(videoSource);

    const handleWatcher = async (watcherId) => {
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

      peerConnections.current[watcherId] = pc;

      /*
       * Quan trọng:
       * addTrack với stream tương ứng.
       *
       * Camera -> stream id camera
       * Screen -> stream id screen
       */
      Object.entries(
        currentStreams.current
      ).forEach(([streamType, stream]) => {
        stream.getTracks().forEach((track) => {
          /*
           * Gắn metadata vào track.
           */
          track.contentHint =
            track.kind === 'video'
              ? 'motion'
              : '';

          pc.addTrack(track, stream);
        });
      });

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socket.emit(
            'candidate',
            watcherId,
            e.candidate
          );
        }
      };

      const offer =
        await pc.createOffer();

      await pc.setLocalDescription(offer);

      socket.emit(
        'offer',
        watcherId,
        pc.localDescription
      );
    };

    const handleAnswer = (
      id,
      description
    ) => {
      const pc =
        peerConnections.current[id];

      if (!pc) return;

      pc.setRemoteDescription(
        new RTCSessionDescription(
          description
        )
      );
    };

    const handleCandidate = (
      id,
      candidate
    ) => {
      const pc =
        peerConnections.current[id];

      if (!pc) return;

      pc.addIceCandidate(
        new RTCIceCandidate(candidate)
      ).catch((err) => {
        console.error(
          'ICE candidate error:',
          err
        );
      });
    };

    const handleDisconnectPeer = (id) => {
      if (
        peerConnections.current[id]
      ) {
        peerConnections.current[id].close();

        delete peerConnections.current[id];
      }
    };

    const handleViewerCount = (count) => {
      setViewerCount(count);
    };

    socket.on(
      'watcher',
      handleWatcher
    );

    socket.on(
      'answer',
      handleAnswer
    );

    socket.on(
      'candidate',
      handleCandidate
    );

    socket.on(
      'disconnectPeer',
      handleDisconnectPeer
    );

    socket.on(
      'viewerCount',
      handleViewerCount
    );

    return () => {
      socket.off(
        'watcher',
        handleWatcher
      );

      socket.off(
        'answer',
        handleAnswer
      );

      socket.off(
        'candidate',
        handleCandidate
      );

      socket.off(
        'disconnectPeer',
        handleDisconnectPeer
      );

      socket.off(
        'viewerCount',
        handleViewerCount
      );

      Object.values(
        peerConnections.current
      ).forEach((pc) => {
        try {
          pc.close();
        } catch (e) { }
      });

      peerConnections.current = {};

      stopAll();
    };
  }, [isStreaming]);

  /*
   * ============================================
   * START STREAM
   * ============================================
   */

  const handleStartStream = () => {
    if (
      !streamName.trim() ||
      !userName.trim()
    ) {
      setError(
        'Vui lòng nhập đủ thông tin'
      );

      return;
    }

    setError('');

    setRecordedVideoUrl(null);

    recordedChunksRef.current = [];

    setIsStreaming(true);
  };

  /*
   * ============================================
   * UI
   * ============================================
   */

  return (
    <div>
      {!isStreaming ? (
        <div>
          <h2>
            Thiết lập Livestream
          </h2>

          <input
            placeholder="Tên bạn"
            value={userName}
            onChange={(e) =>
              setUserName(e.target.value)
            }
            style={{
              width: '100%',
              marginBottom: 10,
              height: 40,
              fontSize: 16,
            }}
          />

          <input
            placeholder="Tên livestream"
            value={streamName}
            onChange={(e) =>
              setStreamName(e.target.value)
            }
            style={{
              width: '100%',
              marginBottom: 10,
              height: 40,
              fontSize: 16,
            }}
          />

          <select
            value={videoSource}
            onChange={(e) =>
              setVideoSource(
                e.target.value
              )
            }
            style={{
              width: '100%',
              marginBottom: 10,
              height: 45,
              fontSize: 16,
            }}
          >
            <option value="camera">
              📷 Chỉ Camera
            </option>

            <option value="screen">
              🖥 Chỉ Màn hình
            </option>

            <option value="both">
              📷 + 🖥 Màn hình + Camera
            </option>
          </select>

          {videoSource !== 'screen' && (
            <select
              value={facingMode}
              onChange={(e) => {
                const value =
                  e.target.value;

                setFacingMode(value);

                facingModeRef.current =
                  value;
              }}
              style={{
                width: '100%',
                marginBottom: 10,
                height: 45,
                fontSize: 16,
              }}
            >
              <option value="user">
                Camera trước
              </option>

              <option value="environment">
                Camera sau
              </option>
            </select>
          )}

          {error && (
            <div
              style={{
                color: 'red',
                marginBottom: 8,
              }}
            >
              {error}
            </div>
          )}

          <button
            onClick={handleStartStream}
            style={{
              width: '100%',
              height: 45,
              fontSize: 16,
              backgroundColor: '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: 4,
            }}
          >
            Bắt đầu livestream
          </button>

          {recordedVideoUrl && (
            <div
              style={{
                marginTop: 30,
                padding: 20,
                border:
                  '2px dashed #10b981',
                borderRadius: 8,
                background: '#f9fafb',
              }}
            >
              <h3
                style={{
                  color: '#10b981',
                }}
              >
                ✨ Livestream đã được
                lưu hoàn chỉnh!
              </h3>

              <video
                src={recordedVideoUrl}
                controls
                style={{
                  width: '100%',
                  borderRadius: 8,
                  backgroundColor: '#000',
                  marginBottom: 15,
                }}
              />

              <a
                href={recordedVideoUrl}
                download={`Livestream_${streamName || 'Record'
                  }.webm`}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  backgroundColor: '#10b981',
                  color: 'white',
                  padding: '10px',
                  borderRadius: 4,
                  textDecoration: 'none',
                  fontWeight: 'bold',
                }}
              >
                ⬇️ Tải Video Về Máy
                (.webm)
              </a>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div
            style={{
              fontSize: 14,
              marginBottom: 10,
            }}
          >
            Tên livestream:{' '}
            <b>{streamName}</b>
            {' | '}
            Người livestream:{' '}
            {userName}
            {' | '}
            Viewers:{' '}
            {viewerCount}
          </div>

          {/*
           * KHÔNG CÒN NÚT CHUYỂN MODE
           *
           * Mode đã được chọn trước khi
           * livestream.
           */}

          <div
            style={{
              fontSize: 13,
              marginBottom: 10,
              color: '#000',
            }}
          >
            Chế độ:{' '}
            <b>
              {videoSource === 'camera'
                ? '📷 Camera'
                : videoSource ===
                  'screen'
                  ? '🖥 Màn hình'
                  : '📷 + 🖥 Màn hình + Camera'}
            </b>
          </div>

          <div
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: isPortrait
                ? '100%'
                : '900px',
              margin: '0 auto',
              aspectRatio: isPortrait
                ? '9/16'
                : '4/3',
              maxHeight: '85vh',
              background: '#000',
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
              {!videoEnabled && (
                <span
                  style={{
                    background: 'red',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: 4,
                  }}
                >
                  Cam Off
                </span>
              )}

              {!audioEnabled && (
                <span
                  style={{
                    background: 'red',
                    color: 'white',
                    padding: '4px 8px',
                    borderRadius: 4,
                  }}
                >
                  Mic Off
                </span>
              )}
            </div>

            {videoSource === 'camera' && (
              <video
                ref={localCameraVideo}
                autoPlay
                muted
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}

            {videoSource === 'screen' && (
              <video
                ref={localScreenVideo}
                autoPlay
                muted
                playsInline
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}

            {videoSource === 'both' && (
              <>
                <video
                  ref={localScreenVideo}
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />

                <div
                  style={{
                    position: 'absolute',
                    bottom: '2px',
                    right: '2px',
                    width: '28%',
                    aspectRatio: '4/3',
                    borderRadius: 8,
                    overflow: 'hidden',
                    boxShadow:
                      '0 4px 8px rgba(0,0,0,0.5)',
                    border:
                      '2px solid white',
                    zIndex: 20,
                    background: '#000',
                  }}
                >
                  <video
                    ref={localCameraVideo}
                    autoPlay
                    muted
                    playsInline
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                </div>
              </>
            )}
          </div>

          <div
            style={{
              marginTop: 10,
              display: 'flex',
              gap: 10,
            }}
          >
            <button
              onClick={toggleVideo}
              style={{
                flex: 1,
                padding: '10px 0',
                backgroundColor:
                  videoEnabled
                    ? '#52c41a'
                    : '#ff4d4f',
                color: 'white',
                border: 'none',
                borderRadius: 4,
              }}
            >
              {videoEnabled
                ? 'Tắt hình'
                : 'Bật hình'}
            </button>

            <button
              onClick={toggleAudio}
              style={{
                flex: 1,
                padding: '10px 0',
                backgroundColor:
                  audioEnabled
                    ? '#1890ff'
                    : '#ff4d4f',
                color: 'white',
                border: 'none',
                borderRadius: 4,
              }}
            >
              {audioEnabled
                ? 'Tắt tiếng'
                : 'Bật tiếng'}
            </button>

            {videoSource !== 'screen' && (
              <button
                disabled
                style={{
                  flex: 1,
                  padding: '10px 0',
                  backgroundColor:
                    '#d9d9d9',
                  color: '#888',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'not-allowed',
                }}
                title="Camera được cố định khi livestream"
              >
                {facingMode === 'user'
                  ? 'Cam Trước'
                  : 'Cam Sau'}
              </button>
            )}
          </div>

          <Chat
            broadcasterId={socket.id}
          />

          <button
            onClick={stopStreaming}
            style={{
              marginTop: 10,
              backgroundColor: '#ff4d4f',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              width: '100%',
            }}
          >
            Dừng Livestream
          </button>
        </div>
      )}
    </div>
  );
}
