require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'brainsync',
    password: process.env.DB_PASSWORD || 'password',
    port: process.env.DB_PORT || 5432,
});

// Middleware
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '../client')));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', env: !!process.env.OPENROUTER_API_KEY }));

// === DOCUMENTS ===

app.get('/api/documents', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM documents ORDER BY updated_at DESC'
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/documents', async (req, res) => {
    try {
        const { title } = req.body;
        const result = await pool.query(
            'INSERT INTO documents (title) VALUES ($1) RETURNING *',
            [title || 'Untitled Document']
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/documents/:id', async (req, res) => {
    try {
        const { title } = req.body;
        const result = await pool.query(
            'UPDATE documents SET title = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
            [title, req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// === DOCUMENT CONTENT ===

app.get('/api/documents/:id/content', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT update_data FROM document_updates 
             WHERE doc_id = $1 
             ORDER BY created_at DESC LIMIT 1`,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.json({ update: null, message: 'New document' });
        }

        const base64 = Buffer.from(result.rows[0].update_data).toString('base64');
        res.json({ update: base64 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/documents/:id/save', async (req, res) => {
    try {
        const { update } = req.body;
        if (!update) return res.status(400).json({ error: 'Missing update' });

        const buffer = Buffer.from(update, 'base64');

        await pool.query(
            'INSERT INTO document_updates (doc_id, update_data) VALUES ($1, $2)',
            [req.params.id, buffer]
        );

        await pool.query(
            'UPDATE documents SET updated_at = NOW() WHERE id = $1',
            [req.params.id]
        );

        res.json({ success: true, saved_at: new Date().toISOString() });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// === VERSION HISTORY ===

// List all versions
app.get('/api/documents/:id/versions', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, version_number, title, change_summary, created_at 
             FROM document_versions 
             WHERE doc_id = $1 
             ORDER BY version_number DESC`,
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Create a named version
app.post('/api/documents/:id/versions', async (req, res) => {
    try {
        const { update, title, change_summary } = req.body;
        if (!update) return res.status(400).json({ error: 'Missing update data' });

        const buffer = Buffer.from(update, 'base64');

        // Get next version number
        const verResult = await pool.query(
            'SELECT COALESCE(MAX(version_number), 0) + 1 as next_ver FROM document_versions WHERE doc_id = $1',
            [req.params.id]
        );
        const nextVer = verResult.rows[0].next_ver;

        const result = await pool.query(
            `INSERT INTO document_versions (doc_id, version_number, title, update_data, change_summary)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [req.params.id, nextVer, title || 'Untitled', buffer, change_summary || 'Manual version save']
        );

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Get specific version content
app.get('/api/documents/:id/versions/:versionId', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM document_versions WHERE doc_id = $1 AND id = $2',
            [req.params.id, req.params.versionId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Version not found' });
        }

        const row = result.rows[0];
        const base64 = Buffer.from(row.update_data).toString('base64');
        res.json({ ...row, update: base64 });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// Restore document to a version
app.post('/api/documents/:id/restore', async (req, res) => {
    try {
        const { version_id } = req.body;

        // Get the version
        const verResult = await pool.query(
            'SELECT update_data FROM document_versions WHERE id = $1 AND doc_id = $2',
            [version_id, req.params.id]
        );

        if (verResult.rows.length === 0) {
            return res.status(404).json({ error: 'Version not found' });
        }

        // Save it as current content
        await pool.query(
            'INSERT INTO document_updates (doc_id, update_data) VALUES ($1, $2)',
            [req.params.id, verResult.rows[0].update_data]
        );

        await pool.query(
            'UPDATE documents SET updated_at = NOW() WHERE id = $1',
            [req.params.id]
        );

        res.json({ success: true, message: 'Document restored' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// === DELETE DOCUMENT ===

app.delete('/api/documents/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM documents WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Document deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// === AI PROXY (OpenRouter via backend .env) ===

app.post('/api/ai/generate', async (req, res) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return res.status(503).json({ error: 'AI not configured. Set OPENROUTER_API_KEY in .env' });
    }

    try {
        const { messages, model } = req.body;

        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': req.headers.origin || 'http://localhost:3000',
                'X-Title': 'Brain Sync'
            },
            body: JSON.stringify({
                model: model || 'openai/gpt-4o-mini',
                messages: messages || []
            })
        });

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({ 
                error: data.error?.message || 'OpenRouter error',
                details: data
            });
        }

        res.json(data);
    } catch (err) {
        console.error('AI proxy error:', err);
        res.status(500).json({ error: err.message });
    }
});

// === PARAGRAPH PERMISSIONS ===

app.get('/api/documents/:id/permissions', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT paragraph_id, user_id, permission_type FROM paragraph_permissions WHERE doc_id = $1',
            [req.params.id]
        );
        const perms = {};
        result.rows.forEach(row => {
            if (!perms[row.paragraph_id]) perms[row.paragraph_id] = {};
            perms[row.paragraph_id][row.user_id] = row.permission_type;
        });
        res.json(perms);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/documents/:id/permissions', async (req, res) => {
    try {
        const { paragraph_id, user_id, permission_type } = req.body;
        await pool.query(
            `INSERT INTO paragraph_permissions (doc_id, paragraph_id, user_id, permission_type)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (doc_id, paragraph_id, user_id) 
             DO UPDATE SET permission_type = EXCLUDED.permission_type`,
            [req.params.id, paragraph_id, user_id, permission_type]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

// === COMMENTS ===

app.get('/api/documents/:id/comments', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM comments WHERE doc_id = $1 ORDER BY created_at DESC',
            [req.params.id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/documents/:id/comments', async (req, res) => {
    try {
        const { paragraph_id, content } = req.body;
        const result = await pool.query(
            'INSERT INTO comments (doc_id, user_id, paragraph_id, content) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.params.id, 1, paragraph_id, content]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.patch('/api/comments/:id/resolve', async (req, res) => {
    try {
        const result = await pool.query(
            'UPDATE comments SET resolved = TRUE WHERE id = $1 RETURNING *',
            [req.params.id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('=================================');
    console.log('  Brain Sync API Server');
    console.log('=================================');
    console.log(`API:       http://localhost:${PORT}/api`);
    console.log(`Client:    http://localhost:${PORT}`);
    console.log(`Yjs WS:    ws://localhost:1234 (run yjs-server.js)`);
    console.log(`AI Proxy:  ${process.env.OPENROUTER_API_KEY ? '✅ Configured' : '❌ Not configured (set OPENROUTER_API_KEY)'}`);
    console.log('=================================');
});
