import React, { useState, useRef, useEffect } from 'react';
import { useWebRTC } from './hooks/useWebRTC';
import VideoGrid from './components/VideoGrid';
import Controls from './components/Controls';
import Chat from './components/Chat';

function App() {
  // Parse URL params for room link joining
  const getUrlParams = () => {
    const params = new URLSearchParams(window.location.search);
    return {
      room: params.get('room') || '',
      name: params.get('name') || ''
    };
  };

  const urlParams = getUrlParams();
  const [roomId, setRoomId] = useState(urlParams.room);
  const [userName, setUserName] = useState(urlParams.name);
  const [joined, setJoined] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewStream, setPreviewStream] = useState(null);
  const [joinLink, setJoinLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);
  const videoPreviewRef = useRef(null);

  const {
    localStream,
    remoteStreams,
    isAudioEnabled,
    isVideoEnabled,
    isScreenSharing,
    messages,
    connectionStatus,
    mySocketId,
    devices,
    selectedVideoDevice,
    selectedAudioDevice,
    setSelectedVideoDevice,
    setSelectedAudioDevice,
    initMedia,
    toggleAudio,
    toggleVideo,
    toggleScreenShare,
    sendMessage
  } = useWebRTC(joined ? roomId : null);

  // Start preview when devices selected
  useEffect(() => {
    if (!joined && selectedVideoDevice) {
      const startPreview = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: selectedVideoDevice }, width: 640, height: 480 },
            audio: false
          });
          setPreviewStream(stream);
        } catch (err) {
          console.error('Preview error:', err);
        }
      };
      startPreview();
    }
    return () => {
      previewStream?.getTracks().forEach(t => t.stop());
    };
  }, [selectedVideoDevice, joined]);

  useEffect(() => {
    if (videoPreviewRef.current && previewStream) {
      videoPreviewRef.current.srcObject = previewStream;
    }
  }, [previewStream]);

  // Generate join link when room changes
  useEffect(() => {
    if (roomId.trim()) {
      const url = `${window.location.origin}?room=${encodeURIComponent(roomId)}`;
      setJoinLink(url);
    } else {
      setJoinLink('');
    }
  }, [roomId]);

  const handleJoin = async () => {
    if (roomId.trim() && userName.trim()) {
      previewStream?.getTracks().forEach(t => t.stop());
      await initMedia(selectedVideoDevice, selectedAudioDevice);
      setJoined(true);
      // Update URL without reload
      window.history.replaceState({}, '', `?room=${encodeURIComponent(roomId)}`);
    }
  };

  const copyRoomLink = () => {
    const url = `${window.location.origin}?room=${encodeURIComponent(roomId)}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const copyJoinLink = () => {
    if (!joinLink) return;
    navigator.clipboard.writeText(joinLink).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  };

  const videoDevices = devices.filter(d => d.kind === 'videoinput');
  const audioDevices = devices.filter(d => d.kind === 'audioinput');

  if (!joined) {
    return (
      <div className="join-container">
        <div className="join-card">
          <div className="join-brand">
            <span className="brand-icon">📹</span>
            <h1>WebRTC Meet</h1>
            <p className="subtitle">Secure peer-to-peer video calling</p>
          </div>

          {previewStream && (
            <div className="preview-box">
              <video
                ref={videoPreviewRef}
                autoPlay
                playsInline
                muted
                className="preview-video"
              />
              <div className="preview-badge">Preview</div>
            </div>
          )}

          <div className="device-selectors">
            {videoDevices.length > 0 && (
              <div className="input-group">
                <label>🎥 Camera</label>
                <select
                  value={selectedVideoDevice}
                  onChange={(e) => setSelectedVideoDevice(e.target.value)}
                >
                  {videoDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${videoDevices.indexOf(d) + 1}`}</option>
                  ))}
                </select>
              </div>
            )}
            {audioDevices.length > 0 && (
              <div className="input-group">
                <label>🎤 Microphone</label>
                <select
                  value={selectedAudioDevice}
                  onChange={(e) => setSelectedAudioDevice(e.target.value)}
                >
                  {audioDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Mic ${audioDevices.indexOf(d) + 1}`}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="input-group">
            <label>👤 Your Name</label>
            <input
              type="text"
              placeholder="Enter your name"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>

          <div className="input-group">
            <label>🏠 Room ID</label>
            <input
              type="text"
              placeholder="Enter or create a room ID"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleJoin()}
            />
          </div>

          {/* LINK JOIN INPUT */}
          <div className="input-group link-join-group">
            <label>🔗 Or paste a room link</label>
            <input
              type="text"
              placeholder="https://yourdomain.com/?room=abc123"
              onChange={(e) => {
                try {
                  const url = new URL(e.target.value);
                  const r = url.searchParams.get('room');
                  if (r) setRoomId(r);
                } catch {
                  // not a valid URL, ignore
                }
              }}
            />
          </div>

          {/* SHAREABLE LINK */}
          {joinLink && (
            <div className="share-link-box">
              <div className="share-link-text">{joinLink}</div>
              <button className="share-link-btn" onClick={copyJoinLink}>
                {linkCopied ? '✅ Copied!' : '📋 Copy'}
              </button>
            </div>
          )}

          <button
            className="join-btn"
            onClick={handleJoin}
            disabled={!roomId.trim() || !userName.trim()}
          >
            <span>🚀</span> Join Room
          </button>

          <div className="join-info">
            <p>🔒 End-to-end encrypted • No server sees your video</p>
            <p>👥 Up to 5 participants • P2P mesh topology</p>
            <p>💻 Screen sharing • Real-time chat included</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="room-header">
        <div className="room-info">
          <span className="room-badge">📌 {roomId}</span>
          <span className="participant-count">
            {1 + remoteStreams.size} / 5
          </span>
          <span className={`status-badge ${connectionStatus}`}>
            {connectionStatus === 'connected' ? '● Live' : connectionStatus}
          </span>
          <button className="copy-link-btn" onClick={copyRoomLink}>
            {copied ? '✅ Copied!' : '🔗 Copy Link'}
          </button>
        </div>
        <button
          className={`chat-toggle ${showChat ? 'active' : ''}`}
          onClick={() => setShowChat(!showChat)}
        >
          💬 {messages.length > 0 && <span className="chat-dot" />}
        </button>
      </div>

      <div className="main-area">
        <div className="video-area">
          <VideoGrid
            localStream={localStream}
            remoteStreams={remoteStreams}
            userName={userName}
            isVideoEnabled={isVideoEnabled}
            isAudioEnabled={isAudioEnabled}
            isScreenSharing={isScreenSharing}
          />
        </div>

        {showChat && (
          <Chat
            messages={messages}
            onSend={sendMessage}
            userName={userName}
            mySocketId={mySocketId}
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
