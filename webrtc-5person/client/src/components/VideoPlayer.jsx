import React, { useRef, useEffect } from 'react';

const VideoPlayer = ({ stream, muted = false, isLocal = false, label, videoEnabled = true, audioEnabled = true, isScreenSharing = false }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const showPlaceholder = !videoEnabled && isLocal && !isScreenSharing;
  const showScreenBadge = isScreenSharing && isLocal;

  return (
    <div className={`video-container ${isLocal ? 'local' : ''} ${showPlaceholder ? 'video-off' : ''}`}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="video-element"
      />

      {showPlaceholder && (
        <div className="video-placeholder">
          <div className="avatar-circle">
            <span>👤</span>
          </div>
          <span className="placeholder-text">Camera is off</span>
        </div>
      )}

      <div className="video-overlay">
        <div className="video-meta">
          <span className="video-label">{label}</span>
          {isLocal && (
            <span className="local-badge">
              {isScreenSharing ? '📺 Sharing' : 'You'}
            </span>
          )}
        </div>
        <div className="video-indicators">
          {!audioEnabled && isLocal && (
            <span className="indicator muted" title="Muted">🔇</span>
          )}
          {!videoEnabled && isLocal && !isScreenSharing && (
            <span className="indicator no-video" title="Camera off">🚫</span>
          )}
          {showScreenBadge && (
            <span className="indicator screen" title="Screen sharing">📺</span>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoPlayer;
