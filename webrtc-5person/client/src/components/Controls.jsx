import React from 'react';

const Controls = ({
  isAudioEnabled,
  isVideoEnabled,
  isScreenSharing,
  onToggleAudio,
  onToggleVideo,
  onToggleScreen
}) => {
  return (
    <div className="controls-bar">
      <div className="control-group">
        <button
          className={`control-btn ${!isAudioEnabled ? 'danger' : ''}`}
          onClick={onToggleAudio}
          title={isAudioEnabled ? 'Mute microphone' : 'Unmute microphone'}
        >
          <span className="control-icon">{isAudioEnabled ? '🎤' : '🔇'}</span>
          <span className="control-label">{isAudioEnabled ? 'Mute' : 'Unmute'}</span>
        </button>

        <button
          className={`control-btn ${!isVideoEnabled ? 'danger' : ''}`}
          onClick={onToggleVideo}
          title={isVideoEnabled ? 'Turn off camera' : 'Turn on camera'}
        >
          <span className="control-icon">{isVideoEnabled ? '📹' : '🚫'}</span>
          <span className="control-label">{isVideoEnabled ? 'Stop Cam' : 'Start Cam'}</span>
        </button>

        <button
          className={`control-btn ${isScreenSharing ? 'active' : ''}`}
          onClick={onToggleScreen}
          title="Share your screen"
        >
          <span className="control-icon">{isScreenSharing ? '📺' : '🖥️'}</span>
          <span className="control-label">{isScreenSharing ? 'Stop Share' : 'Share'}</span>
        </button>
      </div>

      <button
        className="control-btn leave"
        onClick={() => {
          if (window.confirm('Are you sure you want to leave the call?')) {
            window.location.reload();
          }
        }}
        title="Leave call"
      >
        <span className="control-icon">📞</span>
        <span className="control-label">Leave</span>
      </button>
    </div>
  );
};

export default Controls;
