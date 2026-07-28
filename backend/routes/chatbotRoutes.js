import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import { authenticate } from '../middleware/auth.js';
import { sanitizeHtml, logSecurityEvent } from '../middleware/security.js';
import pool from '../services/db.js';
import logger from '../services/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads', 'chatbot');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer configuration for chatbot file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    cb(null, crypto.randomUUID() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/plain', 'application/pdf'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

// ============================================================
// Health Check
// ============================================================
router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'chatbot', timestamp: new Date().toISOString() });
});

// ============================================================
// Fetch Models from OpenRouter
// A01: Authenticated — requires valid JWT
// ============================================================
router.get('/models', authenticate, async (req, res) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'StudySync Chatbot'
      }
    });
    const data = await response.json();
    
    // Filter free models if requested
    if (req.query.free === 'true' && data.data) {
      data.data = data.data.filter(m => m.id.includes(':free') || m.pricing?.prompt === '0');
    }
    
    res.json(data);
  } catch (error) {
    logger.error('Models fetch error', { error: error.message, userId: req.user?.id });
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// ============================================================
// Get All Conversations for User
// A01: Authenticated — returns only user's own conversations
// ============================================================
router.get('/conversations', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, COUNT(m.id) as message_count
       FROM conversations c
       LEFT JOIN messages m ON c.id = m.conversation_id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) {
    logger.error('Get conversations error', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================================
// Create New Conversation
// A01: Authenticated + A03: Input sanitization
// ============================================================
router.post('/conversations', authenticate, async (req, res) => {
  try {
    const { title, model, system_prompt } = req.body;
    
    // A03: Sanitize inputs
    const safeTitle = title ? sanitizeHtml(title).slice(0, 200) : 'New Conversation';
    const safeModel = model ? sanitizeHtml(model).slice(0, 100) : 'openrouter/auto';
    const safePrompt = system_prompt ? sanitizeHtml(system_prompt).slice(0, 2000) : 'You are a helpful AI assistant.';
    
    const result = await pool.query(
      'INSERT INTO conversations (title, model, system_prompt, user_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [safeTitle, safeModel, safePrompt, req.user.id]
    );
    
    logger.info('Conversation created', { conversationId: result.rows[0].id, userId: req.user.id });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Create conversation error', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================================
// Get Single Conversation with Messages
// A01: Authenticated + ownership check
// ============================================================
router.get('/conversations/:id', authenticate, async (req, res) => {
  try {
    const conv = await pool.query(
      'SELECT * FROM conversations WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (!conv.rows.length) {
      return res.status(404).json({ error: 'Not found' });
    }

    const messages = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    res.json({ ...conv.rows[0], messages: messages.rows });
  } catch (error) {
    logger.error('Get conversation error', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================================
// Update Conversation
// A01: Authenticated + ownership check + A03: Input sanitization
// ============================================================
router.patch('/conversations/:id', authenticate, async (req, res) => {
  try {
    const { title, model, system_prompt } = req.body;
    
    // A03: Sanitize inputs
    const safeTitle = title ? sanitizeHtml(title).slice(0, 200) : null;
    const safeModel = model ? sanitizeHtml(model).slice(0, 100) : null;
    const safePrompt = system_prompt ? sanitizeHtml(system_prompt).slice(0, 2000) : null;
    
    const result = await pool.query(
      `UPDATE conversations 
       SET title = COALESCE($1, title), 
           model = COALESCE($2, model), 
           system_prompt = COALESCE($3, system_prompt) 
       WHERE id = $4 AND user_id = $5 
       RETURNING *`,
      [safeTitle, safeModel, safePrompt, req.params.id, req.user.id]
    );
    
    if (!result.rows.length) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    logger.error('Update conversation error', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================================
// Delete Conversation
// A01: Authenticated + ownership check
// ============================================================
router.delete('/conversations/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM conversations WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Not found' });
    }
    
    logger.info('Conversation deleted', { conversationId: req.params.id, userId: req.user.id });
    res.json({ success: true });
  } catch (error) {
    logger.error('Delete conversation error', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================================
// Save Message to Conversation
// A01: Authenticated + ownership check
// ============================================================
router.post('/conversations/:id/messages', authenticate, async (req, res) => {
  try {
    // Verify conversation ownership
    const conv = await pool.query(
      'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    
    if (!conv.rows.length) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    
    const { role, content, model, tokens_used } = req.body;
    
    // A03: Validate role
    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    
    const result = await pool.query(
      'INSERT INTO messages (conversation_id, role, content, model, tokens_used) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.id, role, contentStr, model, tokens_used]
    );
    
    // Update conversation timestamp
    await pool.query(
      'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [req.params.id]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (error) {
    logger.error('Save message error', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: 'Database error' });
  }
});

// ============================================================
// Streaming Chat Proxy to OpenRouter
// A01: Authenticated + A10: SSRF prevention
// ============================================================
router.post('/chat', authenticate, async (req, res) => {
  const { messages, model } = req.body;
  
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }
  
  // A10: Validate messages array length
  if (messages.length > 50) {
    return res.status(400).json({ error: 'Too many messages (max 50)' });
  }
  
  // A10: Validate model string
  if (model && (typeof model !== 'string' || model.length > 100)) {
    return res.status(400).json({ error: 'Invalid model' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.FRONTEND_URL || 'http://localhost:5173',
        'X-Title': 'StudySync Chatbot'
      },
      body: JSON.stringify({
        model: model || 'openrouter/auto',
        messages,
        stream: true
      })
    });

    if (!response.ok) {
      const err = await response.text();
      logger.error('OpenRouter API error', { status: response.status, error: err });
      return res.status(response.status).json({ error: err });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);

    nodeStream.on('error', (err) => {
      logger.error('Stream error', { error: err.message });
      res.end();
    });
  } catch (error) {
    logger.error('Chat error', { error: error.message, userId: req.user.id });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat failed' });
    }
  }
});

// ============================================================
// File Upload
// A01: Authenticated + A03: File validation
// ============================================================
router.post('/upload', authenticate, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const { conversationId } = req.body;
    
    // Verify conversation ownership if provided
    if (conversationId) {
      const conv = await pool.query(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, req.user.id]
      );
      
      if (!conv.rows.length) {
        // Delete uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ error: 'Conversation not found' });
      }
    }
    
    const fileUrl = `/uploads/chatbot/${req.file.filename}`;

    const result = await pool.query(
      `INSERT INTO chatbot_uploads (conversation_id, filename, original_name, mime_type, file_path, file_url) 
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [conversationId || null, req.file.filename, req.file.originalname, req.file.mimetype, req.file.path, fileUrl]
    );

    logger.info('File uploaded', { fileId: result.rows[0].id, userId: req.user.id });
    res.json({ success: true, file: result.rows[0], url: fileUrl });
  } catch (error) {
    logger.error('Upload error', { error: error.message, userId: req.user.id });
    res.status(500).json({ error: 'Upload failed' });
  }
});

export default router;
