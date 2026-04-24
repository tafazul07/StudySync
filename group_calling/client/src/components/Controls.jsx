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
      <button 
        className={`control-btn ${!isAudioEnabled ? 'danger' : ''}`}
        onClick={onToggleAudio}
        title={isAudioEnabled ? 'Mute' : 'Unmute'}
      >
        {isAudioEnabled ? '\ud83c\udfa4' : '\ud83d\udd07'}
      </button>

      <button 
        className={`control-btn ${!isVideoEnabled ? 'danger' : ''}`}
        onClick={onToggleVideo}
        title={isVideoEnabled ? 'Stop Video' : 'Start Video'}
      >
        {isVideoEnabled ? '\ud83d\udcf9' : '\ud83d\udcf9'}
      </button>

      <button 
        className={`control-btn ${isScreenSharing ? 'active' : ''}`}
        onClick={onToggleScreen}
        title="Share Screen"
      >
        \ud83d\udcfa
      </button>

      <button 
        className="control-btn danger leave"
        onClick={() => window.location.reload()}
        title="Leave Call"
      >
        \ud83d\udece\ufe0f
      </button>
    </div>
  );
};

export default Controls;
