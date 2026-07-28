const express = require('express');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
require('dotenv').config();

const pool = require('./db/pool');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
        },
    },
}));

app.use(cors({ origin: true, credentials: true }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many upload attempts, please try again later.' }
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ===== DIRECT DOWNLOAD ROUTE (before catch-all) =====
app.get('/download/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const result = await pool.query(
            `SELECT id, original_name, stored_name, file_size, mime_type, download_count, max_downloads,
                    expires_at, (expires_at IS NOT NULL AND expires_at < NOW()) as expired
             FROM shared_files WHERE share_token = $1`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).send('<h1>404 - File Not Found</h1><p>The share link is invalid or has been removed.</p>');
        }

        const file = result.rows[0];
        if (file.expired) {
            return res.status(410).send('<h1>410 - Link Expired</h1><p>This share link has expired.</p>');
        }
        if (file.max_downloads && file.download_count >= file.max_downloads) {
            return res.status(410).send('<h1>410 - Limit Reached</h1><p>This file has reached its maximum download limit.</p>');
        }

        const filePath = path.join(__dirname, '../uploads/files', file.stored_name);
        if (!fs.existsSync(filePath)) {
            return res.status(404).send('<h1>404 - File Missing</h1><p>File not found on server.</p>');
        }

        await pool.query(
            'UPDATE shared_files SET download_count = download_count + 1 WHERE id = $1',
            [file.id]
        );

        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', file.file_size);
        fs.createReadStream(filePath).pipe(res);
    } catch (err) {
        console.error('Direct download error:', err);
        res.status(500).send('<h1>500 - Server Error</h1><p>Failed to download file.</p>');
    }
});

const fileRoutes = require('./routes/files');
const vaultRoutes = require('./routes/vaults');

app.use('/api/files', strictLimiter, fileRoutes);
app.use('/api/vaults', strictLimiter, vaultRoutes);

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({ status: 'ok', db: 'connected', timestamp: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ status: 'error', db: 'disconnected', error: err.message });
    }
});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// Test DB connection before starting
pool.query('SELECT 1')
    .then(() => {
        console.log('Database connected successfully');
        app.listen(PORT, () => {
            console.log(`Secure FileShare Server running on http://localhost:${PORT}`);
            console.log(`Upload limit: ${(process.env.MAX_FILE_SIZE || 104857600) / 1024 / 1024}MB`);
        });
    })
    .catch(err => {
        console.error('Database connection failed:', err.message);
        console.error('Please check your .env file and ensure PostgreSQL is running.');
        console.error('Run: cp backend/.env.example backend/.env and edit with your credentials');
        process.exit(1);
    });
