# WebRTC 5-Person Video Call

A complete WebRTC mesh video conferencing application supporting up to 5 participants. Built with React (frontend) and Node.js + Socket.IO (signaling server).

## Features

- **Video/Audio Conferencing** — P2P mesh topology, no media server required
- **Screen Sharing** — Replace your camera feed with screen capture
- **Text Chat** — Real-time messaging via WebSocket (persisted per room session)
- **Mute/Unmute** — Audio and video toggles
- **Connection Resilience** — Auto-cleanup on disconnect, ICE reconnection handling
- **Responsive Grid** — Dynamic layout for 1-5 participants

## Architecture

```
┌─────────┐   WebSocket    ┌──────────┐
│ Client A │◄─────────────►│ Node.js  │
│ (React)  │  (SDP/ICE)     │ Socket.IO│
└────┬─────┘                └──────────┘
     │ WebRTC P2P
     │ (SRTP)
     ▼
┌─────────┐
│ Client B │
│ (React)  │
└─────────┘
```

**Mesh topology**: Each peer connects directly to every other peer. For 5 users, each sends 4 video streams and receives 4 video streams.

## Quick Start

### 1. Start the Server

```bash
cd server
npm install
npm start
```

Server runs on `http://localhost:5000`

### 2. Start the Client

```bash
cd client
npm install
npm run dev
```

Client runs on `http://localhost:3000`

### 3. Open Multiple Tabs

Open `http://localhost:3000` in 2-5 browser tabs, enter the **same Room ID**, and join.

## File Structure

```
webrtc-5person/
├── server/
│   ├── package.json
│   └── server.js          # Socket.IO signaling + room management
├── client/
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── hooks/
│       │   └── useWebRTC.js    # Core WebRTC logic (mesh, signaling)
│       ├── components/
│       │   ├── VideoGrid.jsx   # Dynamic grid layout
│       │   ├── VideoPlayer.jsx # Video element wrapper
│       │   ├── Controls.jsx    # Mute/video/screen/leave buttons
│       │   └── Chat.jsx        # Chat panel
│       └── styles/
│           └── App.css
```

## How It Works

### Signaling Flow

1. Client joins room via Socket.IO
2. Server sends `existing-users` list to new joiner
3. New joiner creates `RTCPeerConnection` for each existing user and sends **offer**
4. Existing users receive **offer**, create answer, send back
5. Both sides exchange **ICE candidates** until connection establishes
6. Media flows directly peer-to-peer via WebRTC

### Screen Sharing

- Uses `getDisplayMedia()` to capture screen
- Replaces the video track on all active `RTCPeerConnection`s via `RTCRtpSender.replaceTrack()`
- Automatically stops sharing when user clicks "Stop sharing" in browser UI

## Production Considerations

### Add a TURN Server

~15% of users are behind symmetric NAT and need TURN. Add to `ICE_SERVERS` in `useWebRTC.js`:

```javascript
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    {
      urls: 'turn:your-turn-server.com:3478',
      username: 'user',
      credential: 'pass'
    }
  ]
};
```

**Options:**
- **Twilio Network Traversal** (managed, ~$0.40/GB)
- **Coturn** (self-hosted on any VPS)

### When to Switch to SFU

Mesh works well for ≤5 users. Beyond that, switch to an SFU like:
- [mediasoup](https://mediasoup.org/)
- [Pion](https://pion.ly/)
- [Janus](https://janus.conf.meetecho.com/)

The signaling logic stays the same — only the media routing changes.

### Environment Variables

Create `client/.env`:
```
VITE_SOCKET_URL=http://localhost:5000
```

## Browser Support

- Chrome/Edge 80+
- Firefox 75+
- Safari 14+

Requires HTTPS (or localhost) for camera access.

## License

MIT
