import React, { useEffect, useState } from 'react';
import { socket } from '../socket';
import Viewer from './Viewer';

export default function LiveStreamList() {
  const [streams, setStreams] = useState([]);
  const [selectedBroadcasterId, setSelectedBroadcasterId] = useState(null);

  useEffect(() => {
    socket.on('broadcastersList', (list) => {
      setStreams(list);
    });

    socket.emit('getBroadcastersList');

    return () => {
      socket.off('broadcastersList');
    };
  }, []);

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Danh sách Livestream đang phát</h2>

      <div style={styles.listWrapper}>
        {streams.length === 0 ? (
          <p style={styles.noStreamText}>Chưa có livestream nào đang phát.</p>
        ) : (
          <div style={styles.listContainer}>
            {streams.map((stream) => (
              <div key={stream.id} style={styles.streamCard}>
                <h3 style={styles.streamTitle}>Tên Livestream: {stream.livestreamName}</h3>
                <p style={styles.streamUser}>Người phát: {stream.userName}</p>
                <button
                  onClick={() => setSelectedBroadcasterId(stream.id)}
                  style={styles.watchButton}
                >
                  Xác nhận và xem Livestream
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedBroadcasterId && (
        <div style={styles.viewerSection}>
          <h3 style={styles.viewerTitle}>
            Đang xem: {
              streams.find((s) => s.id === selectedBroadcasterId)?.livestreamName
            }
          </h3>

          <Viewer broadcasterId={selectedBroadcasterId} />

          <button
            onClick={() => {
              setSelectedBroadcasterId(null);
              socket.disconnect();
              setSelectedBroadcasterId(null);
              setTimeout(() => {
                socket.connect(); 
                socket.emit('getBroadcastersList');   
              }, 500);
            }}

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
    maxWidth: 800,
    margin: '0 auto',
    padding: 20,
    fontFamily: 'Arial, sans-serif',
    textAlign: 'left',
  },
  header: {
    fontSize: 24,
    marginBottom: 20,
    textAlign: 'left',
  },
  listWrapper: {
    textAlign: 'left',
  },
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '15px',
    width: '100%',
  },
  streamCard: {
    width: '100%',
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
    padding: '10px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    borderRadius: 5,
    cursor: 'pointer',
    width: 'fit-content',
  },
  noStreamText: {
    color: '#888',
    fontStyle: 'italic',
  },
  viewerSection: {
    marginTop: 40,
    textAlign: 'left',
  },
  viewerTitle: {
    marginBottom: 10,
    fontSize: 20,
    fontWeight: 'bold',
  },
  exitButton: {
    marginTop: 10,
    padding: '10px 20px',
    fontSize: 14,
    backgroundColor: '#e53935',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    cursor: 'pointer',
    width: 'fit-content',
  },
};
