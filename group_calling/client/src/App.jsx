import React, { useState } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import VideoGrid from './components/VideoGrid';
import Controls from './components/Controls';
import Chat from './components/Chat';

function App() {
  const [roomId, setRoomId] = useState('');
  const [userName, setUserName] = useState('');
  const [joined, setJoined] = useState(false);
  const [showChat, setShowChat] = useState(false);

  const {
    localStream,
    remoteStreams,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    messages,
    connectionStatus,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    sendMessage
  } = useWebRTC(joined ? roomId : null);

  const handleJoin = () => {
    if (roomId.trim() && userName.trim()) {
      setJoined(true);
    }
  };

  if (!joined) {
    return (
      <div className="join-container">
        <div className="join-card">
          <h1>\ud83d\udcf9 WebRTC 5-Person Call</h1>
          <p className="subtitle">Mesh topology • No media server needed</p>

          <div className="input-group">
            <label>Your Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>

          <div className="input-group">
            <label>Room ID</label>
            <input
              type="text"
              placeholder="Enter room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>

          <button 
            className="join-btn" 
            onClick={handleJoin}
            disabled={!roomId.trim() || !userName.trim()}
          >
            Join Room
          </button>

          <div className="join-info">
            <p>\u2022 Supports up to 5 participants</p>
            <p>\u2022 P2P mesh (no server-side media)</p>
            <p>\u2022 End-to-end encrypted</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="room-header">
        <div className="room-info">
          <span className="room-badge">\ud83d\udccc {roomId}</span>
          <span className="participant-count">
            {1 + remoteStreams.size} / 5
          </span>
          <span className={`status-badge ${connectionStatus}`}>
            {connectionStatus}
          </span>
        </div>
        <button 
          className="chat-toggle"
          onClick={() => setShowChat(!showChat)}
        >
          {showChat ? '\u2715' : '\ud83d\udcac'}
        </button>
      </div>

      <div className="main-area">
        <div className="video-area">
          <VideoGrid 
            localStream={localStream} 
            remoteStreams={remoteStreams}
            userName={userName}
            isVideoEnabled={isVideoEnabled}
          />
        </div>

        {showChat && (
          <Chat 
            messages={messages} 
            onSend={sendMessage} 
            userName={userName}
          />
        )}
      </div>

      <Controls
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        isScreenSharing={isScreenSharing}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleScreen={toggleScreenShare}
      />
    </div>
  );
}

export default App;
