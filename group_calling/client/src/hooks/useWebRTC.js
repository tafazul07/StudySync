import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ]
};

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';

export const useWebRTC = (roomId) => {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState(new Map());
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting');

  const socketRef = useRef(null);
  const peersRef = useRef(new Map()); // userId -> { pc, videoSender }
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraTrackRef = useRef(null); // always keep reference to camera track

  // 1. Initialize local media
  useEffect(() => {
    const initMedia = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });
        localStreamRef.current = stream;
        cameraTrackRef.current = stream.getVideoTracks()[0];
        setLocalStream(stream);
        setConnectionStatus('ready');
      } catch (err) {
        console.error('Failed to get local media:', err);
        setConnectionStatus('error');
        alert('Camera/Microphone access denied or not available.');
      }
    };
    initMedia();

    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // 2. Socket connection & signaling
  useEffect(() => {
    if (!localStream || !roomId) return;

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    setConnectionStatus('signaling');

    socket.emit('join-room', roomId);

    socket.on('existing-users', (userIds) => {
      userIds.forEach(userId => createPeerConnection(userId, true));
    });

    socket.on('user-joined', (userId) => {
      createPeerConnection(userId, false);
    });

    socket.on('offer', async ({ sender, offer }) => {
      const { pc } = createPeerConnection(sender, false);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { target: sender, answer });
      } catch (err) {
        console.error('Error handling offer:', err);
      }
    });

    socket.on('answer', async ({ sender, answer }) => {
      const peerData = peersRef.current.get(sender);
      if (peerData && peerData.pc.signalingState !== 'stable') {
        try {
          await peerData.pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
          console.error('Error setting remote description:', err);
        }
      }
    });

    socket.on('ice-candidate', async ({ sender, candidate }) => {
      const peerData = peersRef.current.get(sender);
      if (peerData && peerData.pc.remoteDescription) {
        try {
          await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('Error adding ICE candidate:', err);
        }
      }
    });

    socket.on('chat-history', (history) => setMessages(history));
    socket.on('chat-message', (msg) => {
      setMessages(prev => [...prev, msg]);
    });

    socket.on('user-left', (userId) => {
      const peerData = peersRef.current.get(userId);
      if (peerData) {
        peerData.pc.close();
        peersRef.current.delete(userId);
      }
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.delete(userId);
        return next;
      });
    });

    socket.on('connect', () => setConnectionStatus('connected'));
    socket.on('disconnect', () => setConnectionStatus('disconnected'));

    return () => {
      socket.disconnect();
      peersRef.current.forEach(({ pc }) => pc.close());
      peersRef.current.clear();
      setRemoteStreams(new Map());
    };
  }, [localStream, roomId]);

  const createPeerConnection = useCallback((userId, isInitiator) => {
    if (peersRef.current.has(userId)) {
      return peersRef.current.get(userId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks
    const currentStream = screenStreamRef.current || localStreamRef.current;
    let videoSender = null;
    if (currentStream) {
      currentStream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, currentStream);
        if (track.kind === 'video') videoSender = sender;
      });
    }

    // Remote stream handler
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(userId, remoteStream);
        return next;
      });
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socketRef.current.emit('ice-candidate', {
          target: userId,
          candidate: event.candidate
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`Connection ${userId}: ${pc.connectionState}`);
      if (pc.connectionState === 'failed') {
        pc.close();
        peersRef.current.delete(userId);
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.delete(userId);
          return next;
        });
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected') {
        setTimeout(() => {
          if (pc.iceConnectionState === 'disconnected') {
            pc.close();
            peersRef.current.delete(userId);
            setRemoteStreams(prev => {
              const next = new Map(prev);
              next.delete(userId);
              return next;
            });
          }
        }, 5000);
      }
    };

    const peerData = { pc, videoSender };
    peersRef.current.set(userId, peerData);

    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then(offer => pc.setLocalDescription(offer))
        .then(() => {
          socketRef.current.emit('offer', {
            target: userId,
            offer: pc.localDescription
          });
        })
        .catch(err => console.error('Error creating offer:', err));
    }

    return peerData;
  }, []);

  // Replace video track on ALL peer connections
  const replaceVideoOnAllPeers = useCallback((newTrack) => {
    peersRef.current.forEach(({ pc, videoSender }, userId) => {
      let sender = videoSender;
      // If we don't have the stored sender, try to find it
      if (!sender) {
        sender = pc.getSenders().find(s => s.track?.kind === 'video');
      }
      if (sender) {
        sender.replaceTrack(newTrack)
          .then(() => {
            // Update stored reference
            const peerData = peersRef.current.get(userId);
            if (peerData) peerData.videoSender = sender;
          })
          .catch(err => console.error('replaceTrack error:', err));
      } else {
        // No sender found — add track if stream exists
        const stream = screenStreamRef.current || localStreamRef.current;
        if (stream && newTrack) {
          const newSender = pc.addTrack(newTrack, stream);
          const peerData = peersRef.current.get(userId);
          if (peerData) peerData.videoSender = newSender;
        }
      }
    });
  }, []);

  const toggleAudio = useCallback(() => {
    const audioTrack = localStreamRef.current?.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setIsAudioEnabled(audioTrack.enabled);
    }
  }, []);

  // FIX #1: Camera freeze — just disable the track, don't replace with null
  const toggleVideo = useCallback(() => {
    const videoTrack = cameraTrackRef.current;
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
      // DON'T call replaceTrack — track.enabled sends black frames automatically
      // and preserves the sender for future screen sharing
    }
  }, []);

  // FIX #2: Screen sharing — use stored videoSender, fallback to getSenders()
  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      // Stop screen share
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;

      // Restore camera track
      const camTrack = cameraTrackRef.current;
      if (camTrack) {
        camTrack.enabled = isVideoEnabled; // respect current video toggle state
        replaceVideoOnAllPeers(camTrack);
      }
      setIsScreenSharing(false);
    } else {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false
        });
        screenStreamRef.current = stream;
        setIsScreenSharing(true);

        const screenTrack = stream.getVideoTracks()[0];

        // Disable camera track locally (but keep it alive)
        const camTrack = cameraTrackRef.current;
        if (camTrack) camTrack.enabled = false;

        // Replace with screen track on all peers
        replaceVideoOnAllPeers(screenTrack);

        // When user stops sharing via browser UI
        screenTrack.onended = () => {
          // Restore camera
          screenStreamRef.current = null;
          if (camTrack) {
            camTrack.enabled = isVideoEnabled;
            replaceVideoOnAllPeers(camTrack);
          }
          setIsScreenSharing(false);
        };
      } catch (err) {
        console.error('Screen share error:', err);
      }
    }
  }, [isScreenSharing, isVideoEnabled, replaceVideoOnAllPeers]);

  const sendMessage = useCallback((text) => {
    if (socketRef.current && roomId) {
      socketRef.current.emit('chat-message', { roomId, text });
    }
  }, [roomId]);

  return {
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
  };
};
