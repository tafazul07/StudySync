import React from 'react';
import VideoPlayer from './VideoPlayer';

const VideoGrid = ({ localStream, remoteStreams, userName, isVideoEnabled, isAudioEnabled, isScreenSharing }) => {
  const total = 1 + remoteStreams.size;

  const getGridClass = () => {
    if (total === 1) return 'grid-1';
    if (total === 2) return 'grid-2';
    if (total === 3) return 'grid-3';
    if (total === 4) return 'grid-4';
    return 'grid-5';
  };

  return (
    <div className={`video-grid ${getGridClass()}`}>
      <VideoPlayer
        stream={localStream}
        muted
        isLocal
        label={`${userName} (You)`}
        videoEnabled={isVideoEnabled}
        audioEnabled={isAudioEnabled}
        isScreenSharing={isScreenSharing}
      />
      {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
        <VideoPlayer
          key={userId}
          stream={stream}
          label={`User ${userId.slice(0, 6)}`}
        />
      ))}
    </div>
  );
};

export default VideoGrid;
