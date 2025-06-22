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
    <div>
      <h2>Danh sách Livestream đang phát</h2>
      <ul>
        {streams.length === 0 && <li>Chưa có livestream nào đang phát</li>}
        {streams.map(stream => (
          <li key={stream.id}>
            <button onClick={() => setSelectedBroadcasterId(stream.id)}>
              {stream.livestreamName} ({stream.viewersCount} người đang xem)
            </button>
          </li>
        ))}
      </ul>

      {selectedBroadcasterId && (
        <div>
          <h3>Đang xem: {streams.find(s => s.id === selectedBroadcasterId)?.livestreamName}</h3>
          <Viewer broadcasterId={selectedBroadcasterId} />
          <button onClick={() => setSelectedBroadcasterId(null)}>Thoát Livestream</button>
        </div>
      )}
    </div>
  );
}
