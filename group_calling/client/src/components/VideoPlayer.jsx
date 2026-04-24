import React, { useRef, useEffect } from 'react';

const VideoPlayer = ({ stream, muted = false, isLocal = false, label, videoEnabled = true }) => {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // When video is disabled, force the element to show black by drawing a frame
  useEffect(() => {
    if (!videoEnabled && videoRef.current && stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && videoTrack.readyState === 'live') {
        // Draw a black frame to clear the last frozen frame
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const blackStream = canvas.captureStream(1);
        const blackTrack = blackStream.getVideoTracks()[0];

        // Briefly swap to black track then back — this forces the video element to refresh
        // Actually simpler: just pause and play to trigger a frame refresh
        videoRef.current.pause();
        requestAnimationFrame(() => {
          if (videoRef.current) videoRef.current.play().catch(() => {});
        });
      }
    }
  }, [videoEnabled, stream]);

  const showPlaceholder = !videoEnabled && isLocal;

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
          <div className="avatar-circle">\ud83d\udc64</div>
          <span className="placeholder-text">Camera Off</span>
        </div>
      )}
      <div className="video-overlay">
        <span className="video-label">{label}</span>
        {isLocal && <span className="local-badge">YOU</span>}
      </div>
    </div>
  );
};

export default VideoPlayer;
