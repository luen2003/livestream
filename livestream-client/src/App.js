import React, { useState } from 'react';
import Broadcaster from './components/Broadcaster';
import LiveStreamList from './components/LiveStreamList';
import Chat from './components/Chat';

function App() {
  const [role, setRole] = useState(null);

  const handleBack = () => {
    setRole(null);
  };

  const buttonStyle = {
    padding: '12px 24px',
    margin: '10px',
    fontSize: '16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    backgroundColor: '#007bff',
    color: 'white',
    transition: 'background-color 0.3s ease',
  };

  const backButtonStyle = {
    ...buttonStyle,
    backgroundColor: '#6c757d',
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
      {!role && (
        <div style={{ textAlign: 'center' }}>
          <h2>Chọn vai trò của bạn</h2>
          <button style={buttonStyle} onClick={() => setRole('broadcaster')}>
            Bắt đầu Livestream
          </button>
          <button style={buttonStyle} onClick={() => setRole('viewer')}>
            Xem Livestream
          </button>
        </div>
      )}

      {role && (
        <div style={{ textAlign: 'left', marginBottom: 20 }}>
          <button style={backButtonStyle} onClick={handleBack}>
            Trở về
          </button>
        </div>
      )}

      {role === 'broadcaster' && <Broadcaster />}
      {role === 'viewer' && <LiveStreamList />}
    </div>
  );
}

export default App;
