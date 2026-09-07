import './loadEnv.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import fs from 'fs/promises';
import { Server as SocketIOServer } from 'socket.io';
import WebSocket from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dbStore from './services/dbStore.js';
import { securityHeaders, sanitizeFilenameForHeader, sanitizeError, logSecurityEvent } from './middleware/security.js';
import { authenticate } from './middleware/auth.js';
import { verifyToken } from './services/authService.js';
import { cleanupExpiredSessions, initAuthService } from './services/authService.js';
import logger from './services/logger.js';
import healthService from './services/healthService.js';

// Import routes
import authRoutes from './routes/authRoutes.js';
import studyPlanRoutes from './routes/studyPlanRoutes.js';
import deadlineRoutes from './routes/deadlineRoutes.js';
import collabRoutes from './routes/collabRoutes.js';
import quizRoutes from './routes/quizRoutes.js';
import vaultRoutes from './routes/vaultRoutes.js';
import webrtcRoutes from './routes/webrtcRoutes.js';
import chatbotRoutes from './routes/chatbotRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Socket.io for WebRTC signaling
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST']
  }
});

// ============================================================
// WebSocket Authentication — Socket.io middleware
// Verifies JWT token before allowing connection
// ============================================================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;

  if (!token) {
    logger.warn('WebSocket connection rejected: no token provided', { ip: socket.handshake.address });
    return next(new Error('Authentication required'));
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    logger.security('AUTH_FAILURE', {
      ip: socket.handshake.address,
      message: 'WebSocket connection with invalid/expired token',
      severity: 'warn',
    });
    return next(new Error('Invalid or expired token'));
  }

  // Attach user info to socket
  socket.user = { id: decoded.id, email: decoded.email, role: decoded.role };
  next();
});

// Yjs WebSocket server for collaboration
const wss = new WebSocket.Server({ noServer: true });

// Room state for WebRTC
const rooms = new Map();

io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`, { userId: socket.user?.id });

  socket.on('join-room', (roomId) => {
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, { users: new Set(), chats: [] });
    }
    const room = rooms.get(roomId);
    room.users.add(socket.id);

    // Send existing users to new user
    const existingUsers = Array.from(room.users).filter(id => id !== socket.id);
    socket.emit('existing-users', existingUsers);

    // Notify others
    socket.to(roomId).emit('user-joined', socket.id);

    // Send chat history
    socket.emit('chat-history', room.chats);

    logger.info(`User ${socket.id} joined room ${roomId}`, { users: room.users.size });
  });

  // WebRTC Signaling
  socket.on('offer', ({ target, offer }) => {
    socket.to(target).emit('offer', { sender: socket.id, offer });
  });

  socket.on('answer', ({ target, answer }) => {
    socket.to(target).emit('answer', { sender: socket.id, answer });
  });

  socket.on('ice-candidate', ({ target, candidate }) => {
    socket.to(target).emit('ice-candidate', { sender: socket.id, candidate });
  });

  // Chat
  socket.on('chat-message', ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      sender: socket.id,
      text,
      timestamp: new Date().toISOString()
    };
    room.chats.push(msg);
    // Keep last 100 messages
    if (room.chats.length > 100) room.chats.shift();
    io.to(roomId).emit('chat-message', msg);
  });

  // Disconnect cleanup
  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`, { userId: socket.user?.id });
    rooms.forEach((room, roomId) => {
      if (room.users.has(socket.id)) {
        room.users.delete(socket.id);
        socket.to(roomId).emit('user-left', socket.id);
        if (room.users.size === 0) {
          rooms.delete(roomId);
          logger.info(`Room ${roomId} deleted (empty)`);
        }
      }
    });
  });
});

// Handle Yjs WebSocket upgrade — A01: JWT authentication
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  
  if (pathname.startsWith('/yjs')) {
    // Extract token from query string
    const url = new URL(request.url, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      logger.security('ACCESS_DENIED', {
        ip: request.socket?.remoteAddress,
        path: pathname,
        message: 'Yjs WebSocket connection rejected: no token',
        severity: 'warn',
      });
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      logger.security('ACCESS_DENIED', {
        ip: request.socket?.remoteAddress,
        path: pathname,
        message: 'Yjs WebSocket connection with invalid token',
        severity: 'warn',
      });
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Token valid — proceed with upgrade
    wss.handleUpgrade(request, socket, head, (ws) => {
      ws.userId = decoded.id; // Attach user for auditing
      wss.emit('connection', ws, request);
    });
  }
});

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req, { gc: true });
});

const PORT = process.env.PORT || 5000;
const PYTHON_RAG_URL = process.env.PYTHON_RAG_URL || `http://localhost:${process.env.PYTHON_RAG_PORT || 8000}`;

// === Security Middleware ===

// Helmet — HTTP security headers (X-Frame-Options, HSTS, etc.)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
    }
  },
  crossOriginEmbedderPolicy: false, // Allow PDF.js worker
}));

// A05: Additional security headers
app.use(securityHeaders);

// A05: CORS — restrict to known frontend origin only
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
];
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// A07: Global API rate limiter
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// A07: Stricter rate limiter for uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many upload attempts, please try again later.' }
});

// A03: Limit body size to prevent DoS (reduced from 50MB)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// A09: Request logging for security monitoring
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (res.statusCode >= 400) {
      logSecurityEvent('HTTP_ERROR', {
        ip: req.ip,
        path: req.path,
        message: `${req.method} ${req.path} → ${res.statusCode} (${duration}ms)`,
        severity: res.statusCode >= 500 ? 'error' : 'warn',
      });
    }
  });
  next();
});

// Serve uploads via an authenticated, sanitized endpoint (no public static serving)
app.get('/uploads/:filename', authenticate, async (req, res) => {
  try {
    const { filename } = req.params;

    // Allow only safe filenames (alphanumeric, dash, underscore, dot)
    if (!/^[\w-.]{1,255}$/.test(filename)) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    const uploadsDir = path.resolve(__dirname, 'uploads');
    const filePath = path.resolve(uploadsDir, filename);

    // Path traversal protection
    if (!filePath.startsWith(uploadsDir)) {
      logSecurityEvent('ACCESS_DENIED', {
        ip: req.ip,
        path: req.path,
        message: `Path traversal attempt blocked: ${filename}`,
        severity: 'critical',
        userId: req.user?.id
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      await fs.access(filePath);
    } catch {
      return res.status(404).json({ error: 'File not found' });
    }

    const safeName = sanitizeFilenameForHeader(filename);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Type', 'application/octet-stream');

    const data = await fs.readFile(filePath);
    res.send(data);

    logSecurityEvent('FILE_DOWNLOAD', {
      ip: req.ip,
      path: req.path,
      message: `Authenticated file download: ${filename}`,
      userId: req.user?.id,
      severity: 'info'
    });
  } catch (error) {
    logSecurityEvent('FILE_DOWNLOAD', {
      ip: req.ip,
      path: req.path,
      message: `Authenticated download error: ${error.message}`,
      userId: req.user?.id,
      severity: 'error'
    });
    res.status(500).json({ error: 'Internal server error during file download.' });
  }
});

// Proxy error handler factory
function ragProxyError(err, req, res) {
  logger.warn('Python RAG backend unavailable', { error: err.message });
  if (!res.headersSent) {
    res.status(503).json({
      error: 'PDF RAG service is not available. Please start the Python backend at ' + PYTHON_RAG_URL,
      details: 'Run: cd pdf-rag-python && python main.py'
    });
  }
}

// The RAG service keeps its index in memory, so pass the authenticated user ID
// to it and never trust a client-supplied value for that header.
function attachRagUser(req, res, next) {
  req.headers['x-rag-user-id'] = String(req.user.id);
  next();
}

// Proxy to Python RAG backend
app.use('/api/pdf', authenticate, attachRagUser, createProxyMiddleware({
  target: PYTHON_RAG_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/pdf': '/api/pdf' },
  on: { error: ragProxyError }
}));

app.use('/api/query', authenticate, attachRagUser, createProxyMiddleware({
  target: PYTHON_RAG_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/query': '/api/query' },
  on: { error: ragProxyError }
}));

app.use('/api/search', authenticate, attachRagUser, createProxyMiddleware({
  target: PYTHON_RAG_URL,
  changeOrigin: true,
  pathRewrite: { '^/api/search': '/api/search' },
  on: { error: ragProxyError }
}));

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/study-plans', studyPlanRoutes);
app.use('/api/deadlines', deadlineRoutes);
app.use('/api/documents', collabRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/vaults', vaultRoutes);
app.use('/api/webrtc', webrtcRoutes);
app.use('/api/chatbot', chatbotRoutes);

// Public file download by share token (root-level, no auth required)
// A03: Sanitized Content-Disposition header to prevent header injection
// A08: Path traversal protection — validate file_path is within uploads/
app.get('/download/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // A03: Validate token format (hex string only)
    if (!/^[a-f0-9]{1,128}$/i.test(token)) {
      return res.status(400).send('Invalid download link.');
    }

    const file = await dbStore.selectOne('shared_files', { share_token: token });

    if (!file) {
      return res.status(404).send('File not found or link has expired.');
    }

    if (file.expires_at && new Date(file.expires_at) < new Date()) {
      return res.status(410).send('This download link has expired.');
    }

    if (file.max_downloads && file.download_count >= file.max_downloads) {
      return res.status(410).send('Download limit reached.');
    }

    // A08: Path traversal protection — ensure file is within uploads directory
    const uploadsDir = path.resolve(__dirname, 'uploads');
    const filePath = path.resolve(file.file_path);
    if (!filePath.startsWith(uploadsDir)) {
      logSecurityEvent('ACCESS_DENIED', {
        ip: req.ip,
        path: req.path,
        message: `Path traversal attempt blocked: ${file.file_path}`,
        severity: 'critical',
      });
      return res.status(403).send('Access denied.');
    }

    try {
      await fs.access(file.file_path);
    } catch {
      return res.status(404).send('File not found on server.');
    }

    // Increment download count
    await dbStore.updateOne('shared_files', { share_token: token }, {
      download_count: file.download_count + 1
    });

    // A03: Sanitize filename to prevent header injection
    const safeName = sanitizeFilenameForHeader(file.original_name);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', file.file_size);

    const data = await fs.readFile(file.file_path);
    res.send(data);

    logSecurityEvent('FILE_DOWNLOAD', {
      ip: req.ip,
      path: req.path,
      message: `File downloaded: ${safeName} (token: ${token.slice(0, 8)}...)`,
      severity: 'info',
    });
  } catch (error) {
    logSecurityEvent('FILE_DOWNLOAD', {
      ip: req.ip,
      path: req.path,
      message: `Download error: ${error.message}`,
      severity: 'error',
    });
    res.status(500).send('Internal server error during file download.');
  }
});

// Health check — detailed system health
app.get('/api/health', async (req, res) => {
  try {
    const health = await healthService.getSystemHealth();
    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

// A05: Error handling — never leak stack traces or internal details
app.use((err, req, res, next) => {
  // Log full error internally (never sent to client)
  logger.error(`${req.method} ${req.path}: ${err.message}`, { stack: err.stack });

  // Handle multer upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File is too large. Maximum size is 25 MB.' });
  }
  if (err.message?.includes('Unsupported file type')) {
    return res.status(400).json({ error: 'Unsupported file type.' });
  }

  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }

  // A05: Sanitize error response — never leak internals
  const safeError = sanitizeError(err);
  res.status(err.status || 500).json(safeError);
});

// ============================================================
// Automated Session Cleanup — runs every 6 hours
// Purges expired refresh tokens from the sessions table
// ============================================================
const SESSION_CLEANUP_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours

async function runSessionCleanup() {
  try {
    await cleanupExpiredSessions();
    logger.info('Expired session cleanup completed');
  } catch (err) {
    logger.error('Session cleanup failed', { error: err.message });
  }
}

setInterval(runSessionCleanup, SESSION_CLEANUP_INTERVAL).unref();

// Initialize services
async function initializeServices() {
  try {
    await initAuthService();
    logger.info('Auth service initialized with Redis');
  } catch (err) {
    logger.error('Failed to initialize auth service', { error: err.message });
    // Continue without Redis - will use database fallback
  }
}

server.listen(PORT, async () => {
  await initializeServices();
  logger.info('StudySync Unified Server started', {
    port: PORT,
    api: `http://localhost:${PORT}/api`,
    websocket: `ws://localhost:${PORT}/yjs`,
  });
});

export { io, rooms };
