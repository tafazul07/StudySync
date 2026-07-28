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
  const [devices, setDevices] = useState([]);
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [mySocketId, setMySocketId] = useState('');

  const socketRef = useRef(null);
  const peersRef = useRef(new Map());
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const cameraTrackRef = useRef(null);

  // Enumerate devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        const devs = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devs.filter(d => d.kind === 'videoinput');
        const audioDevs = devs.filter(d => d.kind === 'audioinput');
        setDevices(devs);
        if (videoDevs.length) setSelectedVideoDevice(videoDevs[0].deviceId);
        if (audioDevs.length) setSelectedAudioDevice(audioDevs[0].deviceId);
      } catch (err) {
        console.error('Device enumeration failed:', err);
      }
    };
    getDevices();
  }, []);

  // Initialize local media with selected devices
  const initMedia = useCallback(async (videoId, audioId) => {
    try {
      localStreamRef.current?.getTracks().forEach(t => t.stop());

      const constraints = {
        video: videoId ? { deviceId: { exact: videoId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } } : false,
        audio: audioId ? { deviceId: { exact: audioId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localStreamRef.current = stream;
      cameraTrackRef.current = stream.getVideoTracks()[0] || null;
      setLocalStream(stream);
      setIsVideoEnabled(!!stream.getVideoTracks()[0]?.enabled);
      setIsAudioEnabled(!!stream.getAudioTracks()[0]?.enabled);
      setConnectionStatus('ready');
      return stream;
    } catch (err) {
      console.error('Failed to get local media:', err);
      setConnectionStatus('error');
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Socket connection & signaling
  useEffect(() => {
    if (!localStream || !roomId) return;

    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    setConnectionStatus('signaling');

    socket.on('connect', () => {
      setMySocketId(socket.id);
      setConnectionStatus('connected');
      socket.emit('join-room', roomId);
    });

    socket.on('existing-users', (userIds) => {
      console.log('Existing users:', userIds);
      userIds.forEach(userId => createPeerConnection(userId, true));
    });

    socket.on('user-joined', (userId) => {
      console.log('User joined:', userId);
      createPeerConnection(userId, false);
    });

    socket.on('offer', async ({ sender, offer }) => {
      console.log('Received offer from:', sender);
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
      console.log('Received answer from:', sender);
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
      console.log('User left:', userId);
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

    const currentStream = screenStreamRef.current || localStreamRef.current;
    let videoSender = null;
    if (currentStream) {
      currentStream.getTracks().forEach(track => {
        const sender = pc.addTrack(track, currentStream);
        if (track.kind === 'video') videoSender = sender;
      });
    }

    pc.ontrack = (event) => {
      console.log('Received remote track from:', userId, event.streams);
      const [remoteStream] = event.streams;
      if (remoteStream) {
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.set(userId, remoteStream);
          return next;
        });
      }
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
      console.log(`ICE ${userId}: ${pc.iceConnectionState}`);
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

  const replaceVideoOnAllPeers = useCallback((newTrack) => {
    peersRef.current.forEach(({ pc, videoSender }, userId) => {
      let sender = videoSender;
      if (!sender) {
        sender = pc.getSenders().find(s => s.track?.kind === 'video');
      }
      if (sender) {
        sender.replaceTrack(newTrack)
          .then(() => {
            const peerData = peersRef.current.get(userId);
            if (peerData) peerData.videoSender = sender;
          })
          .catch(err => console.error('replaceTrack error:', err));
      } else if (newTrack) {
        const stream = screenStreamRef.current || localStreamRef.current;
        if (stream) {
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

  const toggleVideo = useCallback(() => {
    const videoTrack = cameraTrackRef.current;
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
    }
  }, []);

  const toggleScreenShare = useCallback(async () => {
    if (isScreenSharing) {
      screenStreamRef.current?.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
      const camTrack = cameraTrackRef.current;
      if (camTrack) {
        camTrack.enabled = isVideoEnabled;
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
        const camTrack = cameraTrackRef.current;
        if (camTrack) camTrack.enabled = false;
        replaceVideoOnAllPeers(screenTrack);
        screenTrack.onended = () => {
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
  };
};
