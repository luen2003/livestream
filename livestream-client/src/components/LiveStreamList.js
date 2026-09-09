import React, { useEffect, useState } from 'react';
import { socket } from '../socket';
import Viewer from './Viewer';

export default function LiveStreamList() {
  const [streams, setStreams] = useState([]);
  const [selectedBroadcasterId, setSelectedBroadcasterId] = useState(null);

  useEffect(() => {
    const handleBroadcastersList = (list) => {
      setStreams(list);
    };

    socket.on('broadcastersList', handleBroadcastersList);
    socket.emit('getBroadcastersList');

    return () => {
      socket.off('broadcastersList', handleBroadcastersList);
    };
  }, []);

  const selectedStream = streams.find(
    (stream) => stream.id === selectedBroadcasterId
  );

  const handleExitStream = () => {
    setSelectedBroadcasterId(null);

    socket.disconnect();

    setTimeout(() => {
      socket.connect();
      socket.emit('getBroadcastersList');
    }, 500);
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>
        Danh sách Livestream đang phát
      </h2>

      {/* DANH SÁCH LIVESTREAM */}
      <div style={styles.listWrapper}>
        {streams.length === 0 ? (
          <p style={styles.noStreamText}>
            Chưa có livestream nào đang phát.
          </p>
        ) : (
          <div style={styles.listContainer}>
            {streams.map((stream) => (
              <div key={stream.id} style={styles.streamCard}>
                <h3 style={styles.streamTitle}>
                  Tên Livestream: {stream.livestreamName}
                </h3>

                <p style={styles.streamUser}>
                  Người phát: {stream.userName}
                </p>

                <button
                  onClick={() =>
                    setSelectedBroadcasterId(stream.id)
                  }
                  style={styles.watchButton}
                >
                  Xác nhận và xem Livestream
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KHU VỰC XEM LIVESTREAM */}
      {selectedBroadcasterId && (
        <div style={styles.viewerSection}>
          <h3 style={styles.viewerTitle}>
            Đang xem:{' '}
            {selectedStream?.livestreamName || 'Livestream'}
          </h3>

          <Viewer broadcasterId={selectedBroadcasterId} />

          {/* NÚT THOÁT - CÙNG WIDTH VÀ HEIGHT VỚI VIDEO / NÚT VÀO XEM */}
          <button
            onClick={handleExitStream}
            style={styles.exitButton}
          >
            Thoát Livestream
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    maxWidth: 800,
    margin: '0 auto',
    padding: 20,
    boxSizing: 'border-box',
    fontFamily: 'Arial, sans-serif',
    textAlign: 'left',
  },

  header: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: 'left',
  },

  listWrapper: {
    width: '100%',
  },

  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: 15,
    width: '100%',
  },

  streamCard: {
    width: '100%',
    boxSizing: 'border-box',
    backgroundColor: '#f5f5f5',
    borderRadius: 10,
    padding: 20,
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)',
    display: 'flex',
    flexDirection: 'column',
  },

  streamTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },

  streamUser: {
    fontSize: 14,
    color: '#555',
    marginBottom: 15,
  },

  watchButton: {
    width: '100%',
    height: 45,
    padding: '0 15px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    fontSize: 15,
    fontWeight: 'bold',
    boxSizing: 'border-box',
  },

  noStreamText: {
    color: '#888',
    fontStyle: 'italic',
  },

  viewerSection: {
    width: '100%',
    marginTop: 40,
    textAlign: 'left',
  },

  viewerTitle: {
    marginBottom: 10,
    fontSize: 20,
    fontWeight: 'bold',
  },

  /*
   * QUAN TRỌNG:
   * Nút này có:
   * - width: 100% -> rộng bằng video
   * - height: 45px -> cao bằng nút "Vào xem ngay"
   */
  exitButton: {
    width: '100%',
    height: 45,
    marginTop: 10,
    padding: '0 15px',
    boxSizing: 'border-box',

    fontSize: 15,
    fontWeight: 'bold',

    backgroundColor: '#e53935',
    color: '#fff',

    border: 'none',
    borderRadius: 5,

    cursor: 'pointer',
    textAlign: 'center',
  },
};
