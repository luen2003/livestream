import React, { useState } from 'react';
import Broadcaster from './components/Broadcaster';
import LiveStreamList from './components/LiveStreamList';
import Chat from './components/Chat';

function App() {
  const [role, setRole] = useState(null);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 20 }}>
      {!role && (
        <>
          <button onClick={() => setRole('broadcaster')}>Bắt đầu Livestream</button>
          <button onClick={() => setRole('viewer')}>Xem Livestream</button>
        </>
      )}

      {role === 'broadcaster' && <Broadcaster />}
      {role === 'viewer' && <LiveStreamList />}

      {role && <Chat />}
    </div>
  );
}

export default App;
