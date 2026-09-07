import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { Video, Plus, Users, Phone, PhoneOff, X, Mic, MicOff, Camera, CameraOff, Monitor, Sparkles, Signal, AlertCircle } from 'lucide-react';
import { apiFetch } from '../services/api';

export default function WebRTC() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    name: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [activeRoom, setActiveRoom] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [callError, setCallError] = useState('');
  const localVideoRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef({});

  useEffect(() => {
    fetchRooms();
    return () => leaveRoom();
  }, []);

  const leaveRoom = () => {
    Object.values(peersRef.current).forEach(peer => peer.close());
    peersRef.current = {};
    socketRef.current?.disconnect();
    socketRef.current = null;
    localStreamRef.current?.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    setRemoteStreams({});
    setActiveRoom(null);
  };

  const createPeer = (peerId, stream) => {
    if (peersRef.current[peerId]) return peersRef.current[peerId];

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    stream.getTracks().forEach(track => peer.addTrack(track, stream));
    peer.onicecandidate = ({ candidate }) => {
      if (candidate) socketRef.current?.emit('ice-candidate', { target: peerId, candidate });
    };
    peer.ontrack = ({ streams }) => {
      if (streams[0]) setRemoteStreams(previous => ({ ...previous, [peerId]: streams[0] }));
    };
    peer.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(peer.connectionState)) {
        peer.close();
        delete peersRef.current[peerId];
        setRemoteStreams(previous => {
          const next = { ...previous };
          delete next[peerId];
          return next;
        });
      }
    };
    peersRef.current[peerId] = peer;
    return peer;
  };

  const handleJoinRoom = async (room) => {
    setCallError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      setActiveRoom(room);
      setTimeout(() => {
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      }, 0);

      const token = localStorage.getItem('accessToken');
      const socket = io({ auth: { token } });
      socketRef.current = socket;

      socket.on('connect', () => socket.emit('join-room', room.id));
      socket.on('existing-users', (users) => {
        for (const peerId of users) {
          // Existing peers initiate offers after receiving `user-joined`, which
          // avoids both peers creating an offer at the same time.
          createPeer(peerId, stream);
        }
      });
      socket.on('user-joined', async (peerId) => {
        const peer = createPeer(peerId, stream);
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        socket.emit('offer', { target: peerId, offer });
      });
      socket.on('offer', async ({ sender, offer }) => {
        const peer = createPeer(sender, stream);
        await peer.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('answer', { target: sender, answer });
      });
      socket.on('answer', async ({ sender, answer }) => {
        const peer = peersRef.current[sender];
        if (peer) await peer.setRemoteDescription(new RTCSessionDescription(answer));
      });
      socket.on('ice-candidate', async ({ sender, candidate }) => {
        const peer = peersRef.current[sender];
        if (peer) await peer.addIceCandidate(new RTCIceCandidate(candidate));
      });
      socket.on('user-left', (peerId) => {
        peersRef.current[peerId]?.close();
        delete peersRef.current[peerId];
        setRemoteStreams(previous => {
          const next = { ...previous };
          delete next[peerId];
          return next;
        });
      });
      socket.on('connect_error', () => setCallError('Unable to connect to the room. Please try again.'));
    } catch (error) {
      console.error('Unable to join room:', error);
      setCallError('Camera and microphone access is required to join a room.');
      leaveRoom();
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await apiFetch('/api/webrtc/rooms');
      const data = await res.json();
      setRooms(data.rooms || []);
    } catch (error) {
      console.error('Failed to fetch rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/webrtc/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      
      if (data.success || data.room) {
        setShowModal(false);
        setFormData({ name: '' });
        fetchRooms();
      } else {
        alert('Failed to create room');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Error creating room');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full blur-xl opacity-50 animate-pulse-slow" />
          <div className="spinner relative" />
        </div>
        <span className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">Connecting to video servers...</span>
      </div>
    );
  }

  if (activeRoom) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold gradient-text">{activeRoom.name}</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">You are connected to this study room.</p>
          </div>
          <button onClick={leaveRoom} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 text-white hover:bg-rose-700 transition-colors font-semibold">
            <PhoneOff className="w-4 h-4" /> Leave Room
          </button>
        </div>

        {callError && <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400"><AlertCircle className="w-5 h-5" />{callError}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 shadow-xl">
            <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-lg bg-black/60 text-xs font-medium text-white">You</span>
          </div>
          {Object.entries(remoteStreams).map(([peerId, stream]) => (
            <RemoteVideo key={peerId} stream={stream} />
          ))}
          {Object.keys(remoteStreams).length === 0 && (
            <div className="aspect-video rounded-2xl border-2 border-dashed border-gray-300 dark:border-gray-700 flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400">
              <Users className="w-10 h-10 mb-3" />
              <p className="font-medium">Waiting for others to join</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold gradient-text">Video Calls</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">HD video conferencing for collaborative learning</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 shadow-lg shadow-primary-500/20">
          <Video className="w-4 h-4" />
          Create Room
        </button>
      </div>

      <div className="glass-card rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 animate-slide-up">
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5 flex items-center gap-2">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-lg blur-md opacity-50 animate-pulse-slow" />
            <Video className="w-5 h-5 text-indigo-600 relative" />
          </div>
          Active Rooms
        </h2>
        {rooms.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {rooms.map((room, index) => (
              <div 
                key={room.id} 
                className="group relative p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 border border-gray-200/50 dark:border-gray-700/30 hover:border-indigo-400/60 hover:shadow-xl hover:shadow-indigo-500/20 transition-all duration-300 card-hover animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <div className="relative">
                  <div className="flex items-start gap-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-lg blur-md opacity-30 group-hover:opacity-50 transition-opacity" />
                      <Video className="w-5 h-5 text-indigo-600 relative mt-0.5" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">{room.name}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                        <Signal className="w-3 h-3" />
                        {new Date(room.created_at).toLocaleDateString()}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {room.active ? (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-700 text-[10px] font-semibold border border-emerald-200">
                            <div className="relative">
                              <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75" />
                              <div className="relative w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                            </div>
                            Live
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-[10px] font-semibold">
                            <div className="w-1.5 h-1.5 bg-gray-400 rounded-full" />
                            Inactive
                          </div>
                        )}
                        <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                          <Users className="w-3 h-3" />
                          <span>{Math.floor(Math.random() * 5) + 1} online</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleJoinRoom(room)} className="btn-secondary w-full mt-4 flex items-center justify-center gap-2 shadow-sm hover:shadow-md transition-all group-hover:scale-105">
                    <Phone className="w-4 h-4" />
                    Join Room
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-to-br from-gray-50/50 to-white/50 dark:from-gray-900/10 dark:to-gray-900/5">
            <div className="relative inline-block mb-3">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full blur-xl opacity-30 animate-pulse-slow" />
              <Video className="w-12 h-12 text-gray-400 mx-auto relative animate-bounce" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No active rooms</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create a room to start video calls</p>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50 hover:border-indigo-400/60 transition-all cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg blur-md opacity-30 group-hover:opacity-50 transition-opacity" />
              <Camera className="w-8 h-8 text-blue-600 relative" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Camera</h3>
              <p className="text-xs text-gray- dark:text-gray-400">HD Video</p>
            </div>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50 hover:border-indigo-400/60 transition-all cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg blur-md opacity-30 group-hover:opacity-50 transition-opacity" />
              <Mic className="w-8 h-8 text-purple-600 relative" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Microphone</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Noise Cancel</p>
            </div>
          </div>
        </div>
        <div className="glass-card rounded-xl p-4 border border-gray-200/50 dark:border-gray-700/50 hover:border-indigo-400/60 transition-all cursor-pointer group">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg blur-md opacity-30 group-hover:opacity-50 transition-opacity" />
              <Monitor className="w-8 h-8 text-emerald-600 relative" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Screen Share</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">One click</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create Room Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="glass-card rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold gradient-text flex items-center gap-2">
                <Video className="w-5 h-5 text-indigo-600" />
                Create Video Room
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Room Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus"
                  placeholder="e.g., Study Group Session"
                  required
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white disabled:opacity-50 transition-all font-semibold shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 btn-glow flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="spinner w-4 h-4 border-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Create Room
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function RemoteVideo({ stream }) {
  const videoRef = useRef(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);

  return <video ref={videoRef} autoPlay playsInline className="w-full aspect-video object-cover rounded-2xl bg-slate-900 shadow-xl" />;
}
