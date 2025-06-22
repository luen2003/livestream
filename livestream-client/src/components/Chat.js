import React, { useState, useEffect } from 'react';
import { socket } from '../socket';

export default function Chat() {
  const [msg, setMsg] = useState('');
  const [chats, setChats] = useState([]);

  useEffect(() => {
    socket.on('chat-message', ({ id, userName, message }) => {
      setChats(prev => [...prev, { id, userName, message }]);
    });

    return () => socket.off('chat-message');
  }, []);

  const sendMsg = e => {
    e.preventDefault();
    if (msg.trim()) {
      socket.emit('chat-message', msg);
      setMsg('');
    }
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div
        style={{
          height: 200,
          overflowY: 'auto',
          border: '1px solid #ccc',
          padding: 10,
        }}
      >
        {chats.map((c, i) => (
          <div key={i}>
            <strong>{c.userName || "Unknown"}</strong>: {c.message}
          </div>
        ))}
      </div>
      <form onSubmit={sendMsg} style={{ marginTop: 10 }}>
        <input
          type="text"
          value={msg}
          onChange={e => setMsg(e.target.value)}
          style={{ width: '80%' }}
          placeholder="Type a message..."
        />
        <button type="submit">Send</button>
      </form>
    </div>
  );
}
