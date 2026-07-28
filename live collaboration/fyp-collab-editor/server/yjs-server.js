/**
 * Yjs WebSocket Server
 * Handles real-time CRDT sync between clients
 * Run separately: node yjs-server.js
 */
const WebSocket = require('ws');
const http = require('http');
const { setupWSConnection } = require('y-websocket/bin/utils');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    // docName is extracted from URL path (e.g., ws://localhost:1234/my-doc-id)
    setupWSConnection(ws, req, { 
        gc: true // Enable garbage collection
    });
});

const PORT = process.env.YJS_PORT || 1234;
server.listen(PORT, () => {
    console.log(`Yjs WebSocket server running on ws://localhost:${PORT}`);
    console.log('Clients connect with: new WebsocketProvider("ws://localhost:' + PORT + '", docId, ydoc)');
});
