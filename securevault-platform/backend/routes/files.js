const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { uploadFile } = require('../middleware/upload');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');

// Upload a file and get shareable link
// Upload a file and get shareable link
router.post('/upload', uploadFile.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        console.log('--- UPLOAD DEBUG ---');
        console.log('File saved to disk:', req.file.filename);
        console.log('Original name:', req.file.originalname);
        console.log('Size:', req.file.size);

        const { originalname, filename, size, mimetype } = req.file;
        const shareToken = require('crypto').randomBytes(24).toString('hex');

        console.log('Generated token:', shareToken);
        console.log('Attempting DB insert...');

        const result = await pool.query(
            `INSERT INTO shared_files 
             (original_name, stored_name, share_token, file_size, mime_type, download_count, max_downloads, expires_at)
             VALUES ($1, $2, $3, $4, $5, 0, $6, $7)
             RETURNING id, share_token, created_at`,
            [
                originalname,
                filename,
                shareToken,
                size,
                mimetype,
                req.body.maxDownloads ? parseInt(req.body.maxDownloads) : null,
                req.body.expiresAt ? new Date(req.body.expiresAt) : null
            ]
        );

        console.log('DB insert SUCCESS:', result.rows[0]);
        console.log('--------------------');

        const shareUrl = `${req.protocol}://${req.get('host')}/download/${shareToken}`;

        res.json({
            success: true,
            message: 'File uploaded successfully',
            file: {
                id: result.rows[0].id,
                name: originalname,
                size: size,
                shareToken: shareToken,
                shareUrl: shareUrl,
                createdAt: result.rows[0].created_at
            }
        });
    } catch (err) {
        console.error('--- UPLOAD ERROR ---');
        console.error('Error message:', err.message);
        console.error('Error code:', err.code);
        console.error('Full error:', err);
        console.error('--------------------');
        res.status(500).json({ error: 'Failed to upload file', detail: err.message });
    }
});

// Get file info by share token
router.get('/info/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const result = await pool.query(
            `SELECT id, original_name, file_size, mime_type, download_count, max_downloads, 
                    expires_at, created_at, (expires_at IS NOT NULL AND expires_at < NOW()) as expired
             FROM shared_files WHERE share_token = $1`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'File not found or link expired' });
        }

        const file = result.rows[0];
        if (file.expired) {
            return res.status(410).json({ error: 'Link has expired' });
        }

        res.json({
            name: file.original_name,
            size: file.file_size,
            mimeType: file.mime_type,
            downloads: file.download_count,
            maxDownloads: file.max_downloads,
            expiresAt: file.expires_at,
            createdAt: file.created_at
        });
    } catch (err) {
        console.error('Info error:', err);
        res.status(500).json({ error: 'Failed to get file info' });
    }
});

// Download file by token
router.get('/download/:token', async (req, res) => {
    try {
        const { token } = req.params;

        const result = await pool.query(
            `SELECT id, original_name, stored_name, file_size, mime_type, download_count, max_downloads,
                    expires_at, (expires_at IS NOT NULL AND expires_at < NOW()) as expired
             FROM shared_files WHERE share_token = $1`,
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        const file = result.rows[0];

        if (file.expired) {
            return res.status(410).json({ error: 'Link has expired' });
        }

        if (file.max_downloads && file.download_count >= file.max_downloads) {
            return res.status(410).json({ error: 'Download limit reached' });
        }

        const filePath = path.join(__dirname, '../../uploads/files', file.stored_name);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        // Increment download count
        await pool.query(
            'UPDATE shared_files SET download_count = download_count + 1 WHERE id = $1',
            [file.id]
        );

        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', file.file_size);

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (err) {
        console.error('Download error:', err);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// List all shared files (admin/debug)
router.get('/list', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, original_name, file_size, download_count, max_downloads, 
                    expires_at, created_at, share_token
             FROM shared_files ORDER BY created_at DESC LIMIT 50`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('List error:', err);
        res.status(500).json({ error: 'Failed to list files' });
    }
});

// Delete shared file
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const fileResult = await pool.query(
            'SELECT stored_name FROM shared_files WHERE id = $1',
            [id]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        const filePath = path.join(__dirname, '../../uploads/files', fileResult.rows[0].stored_name);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await pool.query('DELETE FROM shared_files WHERE id = $1', [id]);

        res.json({ success: true, message: 'File deleted' });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

module.exports = router;
