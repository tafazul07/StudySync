require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { Readable } = require('stream');

const app = express();
const PORT = process.env.PORT || 8000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    cb(null, crypto.randomUUID() + path.extname(file.originalname));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'text/plain', 'application/pdf'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Fetch models from OpenRouter
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.APP_URL || `http://localhost:${PORT}`,
        'X-Title': 'NextLevel Chat'
      }
    });
    const data = await response.json();
    if (req.query.free === 'true' && data.data) {
      data.data = data.data.filter(m => m.id.includes(':free') || m.pricing?.prompt === '0');
    }
    res.json(data);
  } catch (error) {
    console.error('Models error:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

// Conversations
app.get('/api/conversations', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, COUNT(m.id) as message_count
       FROM conversations c
       LEFT JOIN messages m ON c.id = m.conversation_id
       GROUP BY c.id
       ORDER BY c.updated_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/conversations', async (req, res) => {
  try {
    const { title, model, system_prompt } = req.body;
    const result = await pool.query(
      'INSERT INTO conversations (title, model, system_prompt) VALUES ($1, $2, $3) RETURNING *',
      [title || 'New Conversation', model || 'openrouter/auto', system_prompt || 'You are a helpful AI assistant.']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.get('/api/conversations/:id', async (req, res) => {
  try {
    const conv = await pool.query('SELECT * FROM conversations WHERE id = $1', [req.params.id]);
    if (!conv.rows.length) return res.status(404).json({ error: 'Not found' });

    const messages = await pool.query(
      'SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );

    res.json({ ...conv.rows[0], messages: messages.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.patch('/api/conversations/:id', async (req, res) => {
  try {
    const { title, model, system_prompt } = req.body;
    const result = await pool.query(
      'UPDATE conversations SET title = COALESCE($1, title), model = COALESCE($2, model), system_prompt = COALESCE($3, system_prompt) WHERE id = $4 RETURNING *',
      [title, model, system_prompt, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/conversations/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM conversations WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Messages
app.post('/api/conversations/:id/messages', async (req, res) => {
  try {
    const { role, content, model, tokens_used } = req.body;
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    const result = await pool.query(
      'INSERT INTO messages (conversation_id, role, content, model, tokens_used) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.params.id, role, contentStr, model, tokens_used]
    );
    await pool.query('UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = $1', [req.params.id]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Streaming chat proxy
app.post('/api/chat', async (req, res) => {
  const { messages, model } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || `http://localhost:${PORT}`,
        'X-Title': 'NextLevel Chat'
      },
      body: JSON.stringify({
        model: model || 'openrouter/auto',
        messages,
        stream: true
      })
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const nodeStream = Readable.fromWeb(response.body);
    nodeStream.pipe(res);

    nodeStream.on('error', (err) => {
      console.error('Stream error:', err);
      res.end();
    });
  } catch (error) {
    console.error('Chat error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Chat failed' });
    }
  }
});

// File upload
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  try {
    const { conversationId } = req.body;
    const fileUrl = `/uploads/${req.file.filename}`;

    const result = await pool.query(
      'INSERT INTO uploads (conversation_id, filename, original_name, mime_type, file_path, file_url) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [conversationId || null, req.file.filename, req.file.originalname, req.file.mimetype, req.file.path, fileUrl]
    );

    res.json({ success: true, file: result.rows[0], url: fileUrl });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
  console.log(`🚀 NextLevel Chat running at http://localhost:${PORT}`);
});