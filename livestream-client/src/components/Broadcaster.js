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

  // Chế độ được chọn TRƯỚC khi livestream
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

  // =========================================================
  // INIT
  // =========================================================

  useEffect(() => {
    canvasRef.current = document.createElement('canvas');

    const AudioContext =
      window.AudioContext || window.webkitAudioContext;

    if (AudioContext) {
      audioContextRef.current = new AudioContext();

      audioDestinationRef.current =
        audioContextRef.current.createMediaStreamDestination();
    }

    return () => {
      stopAll();

      if (
        audioContextRef.current &&
        audioContextRef.current.state !== 'closed'
      ) {
        audioContextRef.current.close();
      }

      if (recordedVideoUrl) {
        URL.revokeObjectURL(recordedVideoUrl);
      }
    };
  }, []);

  // =========================================================
  // STOP ALL MEDIA
  // =========================================================

  const stopAll = () => {
    // Stop worker
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
      workerRef.current.terminate();
      workerRef.current = null;
    }

    // Stop all streams
    Object.values(currentStreams.current).forEach((stream) => {
      if (stream) {
        stream.getTracks().forEach((track) => {
          track.stop();
        });
      }
    });

    currentStreams.current = {};

    // Disconnect audio source
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch (e) {
        // ignore
      }

      audioSourceRef.current = null;
    }

    if (localScreenVideo.current) {
      localScreenVideo.current.srcObject = null;
    }

    if (localCameraVideo.current) {
      localCameraVideo.current.srcObject = null;
    }
  };

  // =========================================================
  // DRAW COVER
  // =========================================================

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

    if (!ctx) return;

    // Stop worker cũ
    if (workerRef.current) {
      workerRef.current.postMessage('stop');
      workerRef.current.terminate();
      workerRef.current = null;
    }

    const drawCover = (context, video, x, y, w, h) => {
      if (!video) return;
      if (!video.videoWidth || !video.videoHeight) return;

      const videoRatio =
        video.videoWidth / video.videoHeight;

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
          clearInterval(timer);

          timer = setInterval(() => {
            self.postMessage('tick');
          }, 33);
        }

        if (e.data === 'stop') {
          clearInterval(timer);
          timer = null;
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

      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      // =====================================================
      // SCREEN
      // =====================================================

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

      // =====================================================
      // CAMERA ONLY
      // =====================================================

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

      // =====================================================
      // CAMERA OVERLAY
      // =====================================================

      if (
        mode === 'both' &&
        cameraVideo &&
        cameraVideo.readyState >= 2
      ) {
        const camWidth = width * 0.3;
        const camHeight = camWidth * (3 / 4);

        const padding = 6;

        const x =
          width - camWidth - padding;

        const y =
          height - camHeight - padding;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;

        ctx.strokeRect(
          x,
          y,
          camWidth,
          camHeight
        );

        drawCover(
          ctx,
          cameraVideo,
          x,
          y,
          camWidth,
          camHeight
        );
      }
    };

    worker.postMessage('start');

    workerRef.current = worker;
  };

  // =========================================================
  // AUDIO
  // =========================================================

  const connectAudioToProxy = (stream) => {
    if (!audioContextRef.current) return;
    if (!audioDestinationRef.current) return;

    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.disconnect();
      } catch (e) {
        // ignore
      }

      audioSourceRef.current = null;
    }

    const audioTracks =
      stream?.getAudioTracks() || [];

    if (audioTracks.length === 0) return;

    try {
      if (
        audioContextRef.current.state ===
        'suspended'
      ) {
        audioContextRef.current.resume();
      }

      audioSourceRef.current =
        audioContextRef.current.createMediaStreamSource(
          stream
        );

      audioSourceRef.current.connect(
        audioDestinationRef.current
      );
    } catch (err) {
      console.error(
        'Không thể kết nối microphone:',
        err
      );
    }
  };

  // =========================================================
  // RECORDING
  // =========================================================

  const startProxyRecording = () => {
    if (!canvasRef.current) return;
    if (!audioDestinationRef.current) return;

    try {
      const canvasStream =
        canvasRef.current.captureStream(30);

      const canvasTrack =
        canvasStream.getVideoTracks()[0];

      const audioTrack =
        audioDestinationRef.current.stream.getAudioTracks()[0];

      if (!canvasTrack) {
        console.error(
          'Không có canvas video track'
        );

        return;
      }

      const tracks = [canvasTrack];

      if (audioTrack) {
        tracks.push(audioTrack);
      }

      const proxyStream =
        new MediaStream(tracks);

      initMediaRecorder(proxyStream);
    } catch (err) {
      console.error(
        'Không thể tạo recording stream:',
        err
      );
    }
  };

  const initMediaRecorder = (streamToRecord) => {
    if (!streamToRecord) return;

    try {
      let mimeType = 'video/webm';

      if (
        MediaRecorder.isTypeSupported(
          'video/webm;codecs=vp9,opus'
        )
      ) {
        mimeType =
          'video/webm;codecs=vp9,opus';
      } else if (
        MediaRecorder.isTypeSupported(
          'video/webm;codecs=vp8,opus'
        )
      ) {
        mimeType =
          'video/webm;codecs=vp8,opus';
      }

      const recorder =
        new MediaRecorder(
          streamToRecord,
          {
            mimeType,
          }
        );

      recorder.ondataavailable = (e) => {
        if (
          e.data &&
          e.data.size > 0
        ) {
          recordedChunksRef.current.push(
            e.data
          );
        }
      };

      recorder.onerror = (e) => {
        console.error(
          'MediaRecorder error:',
          e
        );
      };

      recorder.start(1000);

      mediaRecorderRef.current =
        recorder;
    } catch (err) {
      console.error(
        'Lỗi khi khởi tạo ghi hình:',
        err
      );
    }
  };

  // =========================================================
  // GET MEDIA STREAM
  // =========================================================

  const getMediaStream = async (source) => {
    try {
      stopAll();

      let newStreams = {};
      let activeStreamForAudio = null;

      // =====================================================
      // CAMERA
      // =====================================================

      if (source === 'camera') {
        const cam =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode:
                facingModeRef.current,
            },
            audio: true,
          });

        newStreams = {
          camera: cam,
        };

        activeStreamForAudio = cam;

        if (localCameraVideo.current) {
          localCameraVideo.current.srcObject =
            cam;
        }
      }

      // =====================================================
      // SCREEN
      // =====================================================

      else if (source === 'screen') {
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

        activeStreamForAudio =
          combinedStream;

        if (localScreenVideo.current) {
          localScreenVideo.current.srcObject =
            combinedStream;
        }

        // Người dùng dừng chia sẻ màn hình
        scr.getVideoTracks()[0].onended =
          () => {
            console.log(
              'Người dùng đã dừng chia sẻ màn hình'
            );

            // KHÔNG chuyển sang camera.
            // Vì chế độ đã được khóa khi livestream.
            if (isStreaming) {
              stopStreaming();
            }
          };
      }

      // =====================================================
      // BOTH
      // =====================================================

      else if (source === 'both') {
        const scr =
          await navigator.mediaDevices.getDisplayMedia({
            video: true,
          });

        const cam =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode:
                facingModeRef.current,
            },
            audio: true,
          });

        /*
          Screen stream:
            - Screen video
            - Microphone audio

          Camera stream:
            - Camera video

          WebRTC:
            Video #1 = Screen
            Video #2 = Camera
            Audio #1 = Microphone
        */

        const screenStream =
          new MediaStream([
            ...scr.getVideoTracks(),
            ...cam.getAudioTracks(),
          ]);

        const cameraStream =
          new MediaStream([
            ...cam.getVideoTracks(),
          ]);

        newStreams = {
          screen: screenStream,
          camera: cameraStream,
        };

        activeStreamForAudio =
          screenStream;

        if (localScreenVideo.current) {
          localScreenVideo.current.srcObject =
            screenStream;
        }

        if (localCameraVideo.current) {
          localCameraVideo.current.srcObject =
            cameraStream;
        }

        // Người dùng dừng chia sẻ màn hình
        scr.getVideoTracks()[0].onended =
          () => {
            console.log(
              'Người dùng đã dừng chia sẻ màn hình'
            );

            // KHÔNG chuyển sang camera.
            // Dừng luôn livestream.
            if (isStreaming) {
              stopStreaming();
            }
          };
      }

      currentStreams.current =
        newStreams;

      // =====================================================
      // AUDIO
      // =====================================================

      if (activeStreamForAudio) {
        connectAudioToProxy(
          activeStreamForAudio
        );
      }

      // =====================================================
      // CANVAS
      // =====================================================

      const canvasWidth =
        isPortrait ? 720 : 1280;

      const canvasHeight =
        isPortrait ? 1280 : 960;

      drawToCanvas(
        source,
        localScreenVideo.current,
        localCameraVideo.current,
        canvasWidth,
        canvasHeight
      );

      // =====================================================
      // RECORD
      // =====================================================

      if (
        !mediaRecorderRef.current ||
        mediaRecorderRef.current.state ===
        'inactive'
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

  // =========================================================
  // TOGGLE VIDEO
  // =========================================================

  const toggleVideo = () => {
    const newState =
      !videoEnabled;

    Object.values(
      currentStreams.current
    ).forEach((stream) => {
      stream
        .getVideoTracks()
        .forEach((track) => {
          track.enabled = newState;
        });
    });

    setVideoEnabled(newState);

    socket.emit(
      'media-state-changed',
      {
        broadcasterId:
          socket.id,
        videoEnabled:
          newState,
        audioEnabled,
      }
    );
  };

  // =========================================================
  // TOGGLE AUDIO
  // =========================================================

  const toggleAudio = () => {
    const newState =
      !audioEnabled;

    Object.values(
      currentStreams.current
    ).forEach((stream) => {
      stream
        .getAudioTracks()
        .forEach((track) => {
          track.enabled = newState;
        });
    });

    setAudioEnabled(newState);

    socket.emit(
      'media-state-changed',
      {
        broadcasterId:
          socket.id,
        videoEnabled,
        audioEnabled:
          newState,
      }
    );
  };

  // =========================================================
  // FLIP CAMERA
  // =========================================================

  const flipCamera = async () => {
    // Screen không có camera
    if (videoSource === 'screen') {
      return;
    }

    const newMode =
      facingModeRef.current ===
        'user'
        ? 'environment'
        : 'user';

    try {
      facingModeRef.current =
        newMode;

      setFacingMode(
        newMode
      );

      /*
        Khi livestream đang chạy:

        Không được đổi videoSource.

        Nhưng vẫn cho đổi camera trước/sau.
      */

      const cameraTracks = [];

      Object.values(
        currentStreams.current
      ).forEach((stream) => {
        stream
          .getVideoTracks()
          .forEach((track) => {
            cameraTracks.push(
              track
            );
          });
      });

      // Nếu camera đang được sử dụng
      if (
        videoSource ===
        'camera'
      ) {
        const newCamera =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode:
                newMode,
            },
            audio: false,
          });

        const newTrack =
          newCamera.getVideoTracks()[0];

        const oldStream =
          currentStreams.current.camera;

        const oldTrack =
          oldStream?.getVideoTracks()[0];

        // Thay track local
        if (
          oldTrack &&
          oldStream
        ) {
          oldStream.removeTrack(
            oldTrack
          );

          oldTrack.stop();

          oldStream.addTrack(
            newTrack
          );
        }

        if (
          localCameraVideo.current
        ) {
          localCameraVideo.current.srcObject =
            oldStream;
        }

        // Replace track WebRTC
        Object.values(
          peerConnections.current
        ).forEach((pc) => {
          pc.getSenders().forEach(
            (sender) => {
              if (
                sender.track &&
                sender.track.kind ===
                'video'
              ) {
                sender
                  .replaceTrack(
                    newTrack
                  )
                  .catch((err) => {
                    console.error(
                      'Replace camera track error:',
                      err
                    );
                  });
              }
            }
          );
        });

        // Canvas sẽ tự đọc video mới
        return;
      }

      // =====================================================
      // BOTH
      // =====================================================

      if (
        videoSource ===
        'both'
      ) {
        const newCamera =
          await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode:
                newMode,
            },
            audio: false,
          });

        const newTrack =
          newCamera.getVideoTracks()[0];

        const oldStream =
          currentStreams.current.camera;

        const oldTrack =
          oldStream?.getVideoTracks()[0];

        if (
          oldTrack &&
          oldStream
        ) {
          oldStream.removeTrack(
            oldTrack
          );

          oldTrack.stop();

          oldStream.addTrack(
            newTrack
          );
        }

        if (
          localCameraVideo.current
        ) {
          localCameraVideo.current.srcObject =
            oldStream;
        }

        /*
          Tìm sender camera.

          Có 2 video track:

          1. Screen
          2. Camera

          replaceTrack cho video sender
          đang chứa camera.
        */

        Object.values(
          peerConnections.current
        ).forEach((pc) => {
          const videoSenders =
            pc
              .getSenders()
              .filter(
                (sender) =>
                  sender.track?.kind ===
                  'video'
              );

          if (
            videoSenders.length >
            0
          ) {
            // Camera là video sender thứ 2
            const cameraSender =
              videoSenders[1];

            if (cameraSender) {
              cameraSender
                .replaceTrack(
                  newTrack
                )
                .catch((err) => {
                  console.error(
                    'Replace camera track error:',
                    err
                  );
                });
            }
          }
        });
      }
    } catch (err) {
      console.error(
        'Không thể đổi camera:',
        err
      );

      setError(
        'Không thể chuyển camera trước/sau.'
      );
    }
  };

  // =========================================================
  // STOP STREAMING
  // =========================================================

  const stopStreaming = () => {
    socket.emit(
      'stream-ended',
      socket.id
    );

    setIsStreaming(false);

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !==
      'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }

    setTimeout(() => {
      if (
        recordedChunksRef.current.length >
        0
      ) {
        const blob =
          new Blob(
            recordedChunksRef.current,
            {
              type: 'video/webm',
            }
          );

        const url =
          URL.createObjectURL(
            blob
          );

        setRecordedVideoUrl(
          url
        );
      }
    }, 600);

    stopAll();
  };

  // =========================================================
  // STREAMING EFFECT
  // =========================================================

  useEffect(() => {
    if (!isStreaming) return;

    let mounted = true;

    // =======================================================
    // REGISTER BROADCASTER
    // =======================================================

    socket.emit(
      'broadcaster',
      {
        livestreamName:
          streamName,
        userName,
      }
    );

    // =======================================================
    // GET MEDIA
    // =======================================================

    getMediaStream(
      videoSource
    );

    // =======================================================
    // WATCHER
    // =======================================================

    const handleWatcher =
      async (watcherId) => {
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

        peerConnections.current[
          watcherId
        ] = pc;

        // ===================================================
        // ADD CURRENT TRACKS
        // ===================================================

        Object.values(
          currentStreams.current
        ).forEach((stream) => {
          stream
            .getTracks()
            .forEach((track) => {
              pc.addTrack(
                track,
                stream
              );
            });
        });

        // ===================================================
        // ICE
        // ===================================================

        pc.onicecandidate = (
          e
        ) => {
          if (e.candidate) {
            socket.emit(
              'candidate',
              watcherId,
              e.candidate
            );
          }
        };

        // ===================================================
        // CONNECTION STATE
        // ===================================================

        pc.onconnectionstatechange =
          () => {
            console.log(
              'Broadcaster connection:',
              watcherId,
              pc.connectionState
            );
          };

        // ===================================================
        // OFFER
        // ===================================================

        try {
          const offer =
            await pc.createOffer();

          await pc.setLocalDescription(
            offer
          );

          socket.emit(
            'offer',
            watcherId,
            pc.localDescription
          );
        } catch (err) {
          console.error(
            'Create offer error:',
            err
          );
        }
      };

    // =======================================================
    // ANSWER
    // =======================================================

    const handleAnswer = (
      id,
      description
    ) => {
      const pc =
        peerConnections.current[
        id
        ];

      if (!pc) return;

      pc.setRemoteDescription(
        new RTCSessionDescription(
          description
        )
      ).catch((err) => {
        console.error(
          'setRemoteDescription answer error:',
          err
        );
      });
    };

    // =======================================================
    // ICE CANDIDATE
    // =======================================================

    const handleCandidate = (
      id,
      candidate
    ) => {
      const pc =
        peerConnections.current[
        id
        ];

      if (!pc) return;

      pc.addIceCandidate(
        new RTCIceCandidate(
          candidate
        )
      ).catch((err) => {
        console.error(
          'addIceCandidate error:',
          err
        );
      });
    };

    // =======================================================
    // DISCONNECT PEER
    // =======================================================

    const handleDisconnectPeer =
      (id) => {
        const pc =
          peerConnections.current[
          id
          ];

        if (pc) {
          pc.close();

          delete peerConnections.current[
            id
          ];
        }
      };

    // =======================================================
    // VIEWER COUNT
    // =======================================================

    const handleViewerCount =
      (count) => {
        if (mounted) {
          setViewerCount(
            count
          );
        }
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

    // =======================================================
    // CLEANUP
    // =======================================================

    return () => {
      mounted = false;

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
        pc.close();
      });

      peerConnections.current = {};

      stopAll();
    };
  }, [isStreaming]);

  // =========================================================
  // START STREAM
  // =========================================================

  const handleStartStream =
    () => {
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

      setRecordedVideoUrl(
        null
      );

      recordedChunksRef.current =
        [];

      setIsStreaming(true);
    };

  // =========================================================
  // UI
  // =========================================================

  return (
    <div>
      {!isStreaming ? (
        // =====================================================
        // SETUP
        // =====================================================

        <div>
          <h2>
            Thiết lập Livestream
          </h2>

          <input
            placeholder="Tên bạn"
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

          <input
            placeholder="Tên livestream"
            value={streamName}
            onChange={(e) =>
              setStreamName(
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

          {/* =================================================
              CHỌN CHẾ ĐỘ TRƯỚC KHI LIVESTREAM
          ================================================= */}

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
              Chỉ Camera
            </option>

            <option value="screen">
              Chỉ Màn hình
            </option>

            <option value="both">
              Cả Camera + Màn hình
            </option>
          </select>

          {/* Camera trước/sau */}
          {videoSource !==
            'screen' && (
              <select
                value={facingMode}
                onChange={(e) => {
                  setFacingMode(
                    e.target.value
                  );

                  facingModeRef.current =
                    e.target.value;
                }}
                style={{
                  width: '100%',
                  marginBottom: 10,
                  height: 45,
                  fontSize: 16,
                }}
              >
                <option value="user">
                  Sử dụng Camera Trước
                </option>

                <option value="environment">
                  Sử dụng Camera Sau
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
            onClick={
              handleStartStream
            }
            style={{
              width: '100%',
              height: 45,
              fontSize: 16,
              backgroundColor:
                '#1890ff',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            Bắt đầu livestream
          </button>

          {/* =================================================
              RECORDED VIDEO
          ================================================= */}

          {recordedVideoUrl && (
            <div
              style={{
                marginTop: 30,
                padding: 20,
                border:
                  '2px dashed #10b981',
                borderRadius: 8,
                background:
                  '#f9fafb',
              }}
            >
              <h3
                style={{
                  color: '#10b981',
                  marginBottom: 15,
                }}
              >
                ✨ Livestream của bạn đã
                được lưu hoàn chỉnh!
              </h3>

              <video
                src={recordedVideoUrl}
                controls
                style={{
                  width: '100%',
                  borderRadius: 8,
                  backgroundColor:
                    '#000',
                  marginBottom: 15,
                }}
              />

              <a
                href={
                  recordedVideoUrl
                }
                download={`Livestream_${streamName ||
                  'Record'
                  }.webm`}
                style={{
                  display: 'block',
                  textAlign:
                    'center',
                  backgroundColor:
                    '#10b981',
                  color: 'white',
                  padding: '10px',
                  borderRadius: 4,
                  textDecoration:
                    'none',
                  fontWeight:
                    'bold',
                }}
              >
                ⬇️ Tải Video Về Máy
                (.webm)
              </a>
            </div>
          )}
        </div>
      ) : (
        // =====================================================
        // STREAMING
        // =====================================================

        <div>
          <div
            style={{
              fontSize: 14,
              marginBottom: 10,
            }}
          >
            Tên livestream:{' '}
            <b>{streamName}</b>{' '}
            | Người livestream:{' '}
            {userName} | Viewers:{' '}
            {viewerCount}
          </div>

          {/* =================================================
              HIỂN THỊ CHẾ ĐỘ ĐANG DÙNG
              KHÔNG CÓ NÚT ĐỔI CHẾ ĐỘ
          ================================================= */}

          <div
            style={{
              marginBottom: 10,
              padding: '8px 12px',
              background:
                '#008cff',
              borderRadius: 6,
              fontSize: 14,
              color: '#fff',
              fontWeight: 'bold'
            }}
          >
            Chế độ:{' '}
            <span>
              {/* <b> */}
              {videoSource ===
                'camera' &&
                'Camera'}

              {videoSource ===
                'screen' &&
                'Màn hình'}

              {videoSource ===
                'both' &&
                'Cả Camera + Màn hình'}
              {/* </b> */}
            </span>

            <span
              style={{
                marginLeft: 8,
                color: '#fff',
              }}
            >
              (Không thể thay đổi khi
              đang livestream)
            </span>
          </div>

          {/* =================================================
              PREVIEW
          ================================================= */}

          <div
            style={{
              position:
                'relative',
              width: '100%',
              maxWidth:
                isPortrait
                  ? '100%'
                  : '900px',
              margin: '0 auto',
              aspectRatio:
                isPortrait
                  ? '9/16'
                  : '4/3',
              maxHeight:
                '85vh',
              background:
                '#000',
              borderRadius: 8,
              overflow:
                'hidden',
            }}
          >
            {/* STATUS */}
            <div
              style={{
                position:
                  'absolute',
                top: 10,
                left: 10,
                zIndex: 30,
                display:
                  'flex',
                gap: 10,
              }}
            >
              {!videoEnabled && (
                <span
                  style={{
                    background:
                      'red',
                    color:
                      'white',
                    padding:
                      '4px 8px',
                    borderRadius:
                      4,
                  }}
                >
                  Cam Off
                </span>
              )}

              {!audioEnabled && (
                <span
                  style={{
                    background:
                      'red',
                    color:
                      'white',
                    padding:
                      '4px 8px',
                    borderRadius:
                      4,
                  }}
                >
                  🔇 Mic Off
                </span>
              )}
            </div>

            {/* =================================================
                CAMERA
            ================================================= */}

            {videoSource ===
              'camera' && (
                <video
                  ref={
                    localCameraVideo
                  }
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit:
                      'cover',
                  }}
                />
              )}

            {/* =================================================
                SCREEN
            ================================================= */}

            {videoSource ===
              'screen' && (
                <video
                  ref={
                    localScreenVideo
                  }
                  autoPlay
                  muted
                  playsInline
                  style={{
                    width: '100%',
                    height: '100%',
                    objectFit:
                      'cover',
                  }}
                />
              )}

            {/* =================================================
                BOTH
            ================================================= */}

            {videoSource ===
              'both' && (
                <>
                  <video
                    ref={
                      localScreenVideo
                    }
                    autoPlay
                    muted
                    playsInline
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit:
                        'cover',
                    }}
                  />

                  <div
                    style={{
                      position:
                        'absolute',
                      bottom: '2px',
                      right: '2px',
                      width: '28%',
                      aspectRatio:
                        '4/3',
                      borderRadius:
                        8,
                      overflow:
                        'hidden',
                      boxShadow:
                        '0 4px 8px rgba(0,0,0,0.5)',
                      border:
                        '2px solid white',
                      zIndex: 20,
                      background:
                        '#000',
                    }}
                  >
                    <video
                      ref={
                        localCameraVideo
                      }
                      autoPlay
                      muted
                      playsInline
                      style={{
                        width:
                          '100%',
                        height:
                          '100%',
                        objectFit:
                          'cover',
                      }}
                    />
                  </div>
                </>
              )}
          </div>

          {/* =================================================
              CONTROLS
          ================================================= */}

          <div
            style={{
              marginTop: 10,
              display:
                'flex',
              gap: 10,
            }}
          >
            {/* VIDEO */}
            <button
              onClick={
                toggleVideo
              }
              style={{
                flex: 1,
                padding:
                  '10px 0',
                backgroundColor:
                  videoEnabled
                    ? '#52c41a'
                    : '#ff4d4f',
                color:
                  'white',
                border:
                  'none',
                borderRadius:
                  4,
                cursor:
                  'pointer',
              }}
            >
              {videoEnabled
                ? 'Tắt hình'
                : 'Bật hình'}
            </button>

            {/* AUDIO */}
            <button
              onClick={
                toggleAudio
              }
              style={{
                flex: 1,
                padding:
                  '10px 0',
                backgroundColor:
                  audioEnabled
                    ? '#1890ff'
                    : '#ff4d4f',
                color:
                  'white',
                border:
                  'none',
                borderRadius:
                  4,
                cursor:
                  'pointer',
              }}
            >
              {audioEnabled
                ? 'Tắt tiếng'
                : 'Bật tiếng'}
            </button>

            {/* FLIP CAMERA */}
            <button
              onClick={
                flipCamera
              }
              disabled={
                videoSource ===
                'screen'
              }
              style={{
                flex: 1,
                padding:
                  '10px 0',
                backgroundColor:
                  videoSource ===
                    'screen'
                    ? '#d9d9d9'
                    : '#8a2be2',
                color:
                  videoSource ===
                    'screen'
                    ? '#888'
                    : 'white',
                border:
                  'none',
                borderRadius:
                  4,
                cursor:
                  videoSource ===
                    'screen'
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {facingMode ===
                'user'
                ? 'Cam Trước'
                : 'Cam Sau'}
            </button>
          </div>

          {/* =================================================
              CHAT
          ================================================= */}

          <Chat
            broadcasterId={
              socket.id
            }
          />

          {/* =================================================
              STOP
          ================================================= */}

          <button
            onClick={
              stopStreaming
            }
            style={{
              marginTop: 10,
              backgroundColor:
                '#ff4d4f',
              color:
                'white',
              border:
                'none',
              padding:
                '10px 20px',
              width:
                '100%',
              cursor:
                'pointer',
            }}
          >
            Dừng Livestream
          </button>
        </div>
      )}
    </div>
  );
}
