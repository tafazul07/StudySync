const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { uploadVault } = require('../middleware/upload');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// Create a new vault
router.post('/create', async (req, res) => {
    try {
        const { name, password, description } = req.body;

        if (!name || !password) {
            return res.status(400).json({ error: 'Vault name and password are required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const vaultToken = crypto.randomBytes(24).toString('hex');
        const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
        const passwordHash = await bcrypt.hash(password, saltRounds);

        const result = await pool.query(
            `INSERT INTO vaults (name, description, vault_token, password_hash, created_at)
             VALUES ($1, $2, $3, $4, NOW())
             RETURNING id, vault_token, created_at`,
            [name, description || null, vaultToken, passwordHash]
        );

        // Create vault directory
        const vaultDir = path.join(__dirname, '../../uploads/vaults', vaultToken);
        fs.mkdirSync(vaultDir, { recursive: true });

        res.json({
            success: true,
            message: 'Vault created successfully',
            vault: {
                id: result.rows[0].id,
                name: name,
                token: vaultToken,
                shareUrl: `${req.protocol}://${req.get('host')}/vault/${vaultToken}`,
                createdAt: result.rows[0].created_at
            }
        });
    } catch (err) {
        console.error('Vault create error:', err);
        res.status(500).json({ error: 'Failed to create vault' });
    }
});

// Verify vault password
router.post('/verify/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const result = await pool.query(
            'SELECT id, name, password_hash, description, created_at FROM vaults WHERE vault_token = $1',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vault not found' });
        }

        const vault = result.rows[0];
        const valid = await bcrypt.compare(password, vault.password_hash);

        if (!valid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        // Get files in vault
        const filesResult = await pool.query(
            `SELECT id, original_name, file_size, mime_type, created_at, file_token
             FROM vault_files WHERE vault_id = $1 ORDER BY created_at DESC`,
            [vault.id]
        );

        res.json({
            success: true,
            vault: {
                id: vault.id,
                name: vault.name,
                description: vault.description,
                createdAt: vault.created_at,
                files: filesResult.rows
            }
        });
    } catch (err) {
        console.error('Vault verify error:', err);
        res.status(500).json({ error: 'Failed to verify vault' });
    }
});

// Upload file to vault
router.post('/:token/upload', uploadVault.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const { token } = req.params;
        const { password } = req.body;

        // Verify vault exists and password
        const vaultResult = await pool.query(
            'SELECT id, password_hash FROM vaults WHERE vault_token = $1',
            [token]
        );

        if (vaultResult.rows.length === 0) {
            // Clean up uploaded file
            fs.unlinkSync(req.file.path);
            return res.status(404).json({ error: 'Vault not found' });
        }

        const valid = await bcrypt.compare(password, vaultResult.rows[0].password_hash);
        if (!valid) {
            fs.unlinkSync(req.file.path);
            return res.status(401).json({ error: 'Invalid password' });
        }

        const vaultId = vaultResult.rows[0].id;
        const fileToken = crypto.randomBytes(24).toString('hex');

        await pool.query(
            `INSERT INTO vault_files (vault_id, original_name, stored_name, file_token, file_size, mime_type)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [vaultId, req.file.originalname, req.file.filename, fileToken, req.file.size, req.file.mimetype]
        );

        res.json({
            success: true,
            message: 'File uploaded to vault',
            file: {
                name: req.file.originalname,
                size: req.file.size,
                token: fileToken
            }
        });
    } catch (err) {
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        console.error('Vault upload error:', err);
        res.status(500).json({ error: 'Failed to upload to vault' });
    }
});

// Download file from vault
router.get('/download/:fileToken', async (req, res) => {
    try {
        const { fileToken } = req.params;

        const result = await pool.query(
            `SELECT vf.stored_name, vf.original_name, vf.file_size, vf.mime_type, v.vault_token
             FROM vault_files vf
             JOIN vaults v ON vf.vault_id = v.id
             WHERE vf.file_token = $1`,
            [fileToken]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        const file = result.rows[0];
        const filePath = path.join(__dirname, '../../uploads/vaults', file.vault_token, file.stored_name);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: 'File not found on server' });
        }

        res.setHeader('Content-Disposition', `attachment; filename="${file.original_name}"`);
        res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
        res.setHeader('Content-Length', file.file_size);

        const fileStream = fs.createReadStream(filePath);
        fileStream.pipe(res);
    } catch (err) {
        console.error('Vault download error:', err);
        res.status(500).json({ error: 'Failed to download file' });
    }
});

// Delete file from vault
router.delete('/file/:fileToken', async (req, res) => {
    try {
        const { fileToken } = req.params;
        const { password } = req.body;

        const result = await pool.query(
            `SELECT vf.id, vf.stored_name, v.vault_token, v.password_hash
             FROM vault_files vf
             JOIN vaults v ON vf.vault_id = v.id
             WHERE vf.file_token = $1`,
            [fileToken]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'File not found' });
        }

        const file = result.rows[0];
        const valid = await bcrypt.compare(password, file.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const filePath = path.join(__dirname, '../../uploads/vaults', file.vault_token, file.stored_name);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

        await pool.query('DELETE FROM vault_files WHERE id = $1', [file.id]);

        res.json({ success: true, message: 'File deleted from vault' });
    } catch (err) {
        console.error('Vault file delete error:', err);
        res.status(500).json({ error: 'Failed to delete file' });
    }
});

// Delete entire vault
router.delete('/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const result = await pool.query(
            'SELECT id, password_hash FROM vaults WHERE vault_token = $1',
            [token]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Vault not found' });
        }

        const valid = await bcrypt.compare(password, result.rows[0].password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid password' });
        }

        const vaultId = result.rows[0].id;

        // Delete physical files
        const vaultDir = path.join(__dirname, '../../uploads/vaults', token);
        if (fs.existsSync(vaultDir)) {
            fs.rmSync(vaultDir, { recursive: true, force: true });
        }

        // Delete from DB (cascade will handle vault_files)
        await pool.query('DELETE FROM vaults WHERE id = $1', [vaultId]);

        res.json({ success: true, message: 'Vault deleted permanently' });
    } catch (err) {
        console.error('Vault delete error:', err);
        res.status(500).json({ error: 'Failed to delete vault' });
    }
});

// List all vaults (for debugging)
router.get('/list', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, vault_token, created_at, 
             (SELECT COUNT(*) FROM vault_files WHERE vault_id = vaults.id) as file_count
             FROM vaults ORDER BY created_at DESC`
        );
        res.json(result.rows);
    } catch (err) {
        console.error('Vault list error:', err);
        res.status(500).json({ error: 'Failed to list vaults' });
    }
});

module.exports = router;
