import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';

export default function Viewer({ broadcasterId }) {
  const remoteVideo = useRef(null);
  const [userName, setUserName] = useState('');
  const [isViewing, setIsViewing] = useState(false);
  const [error, setError] = useState('');

  // Gửi tên người xem lên server mỗi khi thay đổi userName
  useEffect(() => {
    if (userName.trim()) {
      socket.emit('setUserName', userName);
    }
  }, [userName]);

  // Hàm bắt đầu xem livestream
  const handleStartViewing = () => {
    setError('');
    if (!userName.trim()) {
      setError('Vui lòng nhập tên người xem');
      return;
    }
    setIsViewing(true);
    socket.emit('watcher', broadcasterId);
  };

  // Kết nối WebRTC và lắng nghe các tín hiệu
  useEffect(() => {
    if (!isViewing || !broadcasterId) return;

    // Khởi tạo peer connection
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }], // STUN server
    });

    // Lắng nghe khi nhận được stream từ broadcaster
    peerConnection.ontrack = (event) => {
      if (remoteVideo.current) {
        remoteVideo.current.srcObject = event.streams[0]; // Gán stream vào video
      }
    };

    // Lắng nghe khi có ICE candidate
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('candidate', broadcasterId, event.candidate);
      }
    };

    // Lắng nghe offer từ broadcaster và tạo answer
    socket.on('offer', async (id, description) => {
      if (id !== broadcasterId) return; // Kiểm tra ID broadcaster

      try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', broadcasterId, answer);
      } catch (error) {
        console.error('Error handling offer:', error);
      }
    });

    // Lắng nghe ICE candidate từ broadcaster
    socket.on('candidate', (id, candidate) => {
      if (id !== broadcasterId) return; // Kiểm tra ID broadcaster
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });

    // Dọn dẹp khi component unmount
    return () => {
      peerConnection.close();
      socket.off('offer');
      socket.off('candidate');
    };
  }, [isViewing, broadcasterId]);

  // Nếu người xem chưa nhập tên, hiển thị form nhập tên
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

  // Nếu người xem đã nhập tên, hiển thị video
  return (
    <div>
      <video
        ref={remoteVideo}
        autoPlay
        playsInline
        controls={false}
        style={{ width: '100%', backgroundColor: '#000' }}
      />
    </div>
  );
}
