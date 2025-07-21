import React, { useState, useEffect, useRef } from 'react';
import { socket } from '../socket';

export default function Chat({ broadcasterId }) {
  const [msg, setMsg] = useState('');
  const [chats, setChats] = useState([]);
  const chatBoxRef = useRef(null);

  useEffect(() => {
    const handleMessage = ({ id, userName, message, broadcasterId: incomingId }) => {
      if (incomingId === broadcasterId) {
        setChats(prev => [...prev, { id, userName, message }]);
      }
    };

    socket.on('chat-message', handleMessage);
    return () => socket.off('chat-message', handleMessage);
  }, [broadcasterId]);

  useEffect(() => {
    if (chatBoxRef.current) {
      chatBoxRef.current.scrollTop = chatBoxRef.current.scrollHeight;
    }
  }, [chats]);

  const sendMsg = (e) => {
    e.preventDefault();
    if (msg.trim()) {
      socket.emit('chat-message', { broadcasterId, message: msg });
      setMsg('');
    }
  };

  return (
    <div style={styles.container}>
      <h4 style={styles.chatTitle}>Chat Livestream</h4>
      <div ref={chatBoxRef} style={styles.chatBox}>
        {chats.map((c, i) => (
          <div key={i} style={styles.message}>
            <span style={styles.userName}>{c.userName || 'Người xem'}:</span>
            <span style={styles.text}> {c.message}</span>
          </div>
        ))}
      </div>

      <form onSubmit={sendMsg} style={styles.form}>
        <input
          type="text"
          value={msg}
          onChange={e => setMsg(e.target.value)}
          placeholder="Nhập tin nhắn..."
          style={styles.input}
        />
        <button type="submit" style={styles.sendButton}>Gửi</button>
      </form>
    </div>
  );
}

const styles = {
  container: {
    marginTop: 30,
    width: '100%',
    textAlign: 'left',
  },
  chatTitle: {
    fontSize: 18,
    marginBottom: 10,
    fontWeight: 'bold',
  },
  chatBox: {
    height: 250,
    width: '100%',
    border: '1px solid #ccc',
    borderRadius: 6,
    overflowY: 'auto',
    backgroundColor: '#fafafa',
  },
  message: {
    marginBottom: 8,
    marginLeft: 8,
  },
  userName: {
    fontWeight: 'bold',
    color: '#000',
  },
  text: {
    marginLeft: 4,
    wordBreak: 'break-word',
  },
  form: {
    display: 'flex',
    marginTop: 10,
    width: '100%',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '8px 12px',
    fontSize: 14,
    border: '1px solid #ccc',
    boxSizing: 'border-box',
  },
  sendButton: {
    padding: '8px 16px',
    backgroundColor: '#1976d2',
    color: 'white',
    border: 'none',
    fontSize: 14,
    cursor: 'pointer',
    minWidth: 70,
  },
};
