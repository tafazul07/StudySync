import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import dbStore from '../services/dbStore.js';
import { authenticate } from '../middleware/auth.js';
import { isFileExtensionSafe, sanitizeFilenameForHeader, logSecurityEvent } from '../middleware/security.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

// A08: File upload validation — size limit and type checking
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max
  fileFilter: (req, file, cb) => {
    // A08: Block dangerous file extensions
    if (!isFileExtensionSafe(file.originalname)) {
      return cb(new Error('File type not allowed'));
    }
    cb(null, true);
  }
});

// Create a new vault
router.post('/create', authenticate, async (req, res, next) => {
  try {
    const { name, password, description } = req.body;
    const userId = req.user.id;

    if (!name || !password) {
      return res.status(400).json({ error: 'Vault name and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const vaultToken = crypto.randomBytes(24).toString('hex');
    const saltRounds = parseInt(process.env.BCRYPT_SALT_ROUNDS) || 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const vault = await dbStore.insert('vaults', {
      name,
      description: description || '',
      vault_token: vaultToken,
      password_hash: passwordHash,
      owner_id: userId
    });

    // Create vault directory
    const vaultDir = path.join(__dirname, '../uploads/vaults', vaultToken);
    await fs.mkdir(vaultDir, { recursive: true });

    res.json({
      success: true,
      message: 'Vault created successfully',
      vault: {
        id: vault.id,
        name: name,
        token: vaultToken,
        shareUrl: `${req.protocol}://${req.get('host')}/vault/${vaultToken}`,
        createdAt: vault.created_at
      }
    });

    logSecurityEvent('SENSITIVE_OP', {
      ip: req.ip,
      userId: userId,
      path: req.path,
      message: `Vault created: ${name}`,
      severity: 'info',
    });
  } catch (error) {
    next(error);
  }
});

// Find a vault by its ID (public — returns name/description only, no files)
// Used by another user to search for a vault before entering token + password
router.get('/find/:vaultId', async (req, res, next) => {
  try {
    const { vaultId } = req.params;

    const vault = await dbStore.findById('vaults', vaultId);

    if (!vault) {
      return res.status(404).json({ error: 'Vault not found. Please check the Vault ID.' });
    }

    res.json({
      success: true,
      vault: {
        id: vault.id,
        name: vault.name,
        description: vault.description,
        createdAt: vault.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Access a vault by ID — requires vault token + password
// Another user searches by vault ID, then provides token + password to access
router.post('/access/:vaultId', async (req, res, next) => {
  try {
    const { vaultId } = req.params;
    const { vaultToken, password } = req.body;

    if (!vaultToken || !password) {
      return res.status(400).json({ error: 'Vault token and password are required' });
    }

    const vault = await dbStore.findById('vaults', vaultId);

    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    // Verify the vault token
    if (vault.vault_token !== vaultToken) {
      return res.status(401).json({ error: 'Invalid vault token' });
    }

    // Verify the password
    const valid = await bcrypt.compare(password, vault.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Get files in vault
    const files = await dbStore.select('shared_files', { vault_id: vault.id });

    res.json({
      success: true,
      vault: {
        id: vault.id,
        name: vault.name,
        description: vault.description,
        createdAt: vault.created_at,
        files: files.map(f => ({
          id: f.id,
          name: f.original_name,
          size: f.file_size,
          mimeType: f.mime_type,
          fileToken: f.file_token,
          uploadedAt: f.created_at
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

// List files in a vault (for owner, requires authentication)
router.get('/:vaultId/files', authenticate, async (req, res, next) => {
  try {
    const { vaultId } = req.params;
    const userId = req.user.id;

    const vault = await dbStore.findById('vaults', vaultId);

    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    // Only the owner can list files directly
    if (vault.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const files = await dbStore.select('shared_files', { vault_id: vault.id });

    res.json(files.map(f => ({
      id: f.id,
      name: f.original_name,
      size: f.file_size,
      mimeType: f.mime_type,
      fileToken: f.file_token,
      uploadedAt: f.created_at
    })));
  } catch (error) {
    next(error);
  }
});

// Legacy: Verify vault password by token — A01: requires authentication
router.post('/verify/:token', authenticate, async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const vault = await dbStore.selectOne('vaults', { vault_token: token });

    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    const valid = await bcrypt.compare(password, vault.password_hash);

    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Get files in vault
    const files = await dbStore.select('shared_files', { vault_id: vault.id });

    res.json({
      success: true,
      vault: {
        id: vault.id,
        name: vault.name,
        description: vault.description,
        createdAt: vault.created_at,
        files
      }
    });
  } catch (error) {
    next(error);
  }
});

// Upload file to vault — requires authentication
router.post('/:token/upload', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { token } = req.params;
    const { password } = req.body;

    // Verify vault exists and password
    const vault = await dbStore.selectOne('vaults', { vault_token: token });

    if (!vault) {
      await fs.unlink(req.file.path);
      return res.status(404).json({ error: 'Vault not found' });
    }

    const valid = await bcrypt.compare(password, vault.password_hash);
    if (!valid) {
      await fs.unlink(req.file.path);
      return res.status(401).json({ error: 'Invalid password' });
    }

    const fileToken = crypto.randomBytes(24).toString('hex');

    // Move file to vault directory
    const vaultDir = path.join(__dirname, '../uploads/vaults', token);
    const vaultFilePath = path.join(vaultDir, req.file.filename);
    await fs.rename(req.file.path, vaultFilePath);

    await dbStore.insert('shared_files', {
      filename: req.file.filename,
      original_name: req.file.originalname,
      file_path: vaultFilePath,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      encryption_key: null,
      shared_by: vault.owner_id,
      download_count: 0,
      vault_id: vault.id,
      file_token: fileToken,
      created_at: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'File uploaded to vault',
      file: {
        name: req.file.originalname,
        size: req.file.size,
        token: fileToken
      }
    });
  } catch (error) {
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (e) {
        console.warn('File cleanup failed:', e.message);
      }
    }
    next(error);
  }
});

// Download file from vault (by file_token) — A08: path traversal protection
router.get('/vault-file/:fileToken', async (req, res, next) => {
  try {
    const { fileToken } = req.params;

    // Validate token format
    if (!/^[a-f0-9]{1,128}$/i.test(fileToken)) {
      return res.status(400).json({ error: 'Invalid file token' });
    }

    const file = await dbStore.selectOne('shared_files', { file_token: fileToken });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // A08: Path traversal protection
    const uploadsDir = path.resolve(__dirname, '../uploads');
    const filePath = path.resolve(file.file_path);
    if (!filePath.startsWith(uploadsDir)) {
      logSecurityEvent('ACCESS_DENIED', {
        ip: req.ip,
        path: req.path,
        message: `Path traversal attempt in vault download: ${file.file_path}`,
        severity: 'critical',
      });
      return res.status(403).json({ error: 'Access denied' });
    }

    if (!await fs.access(file.file_path).then(() => true).catch(() => false)) {
      return res.status(404).json({ error: 'File not found on server' });
    }

    // A03: Sanitize filename to prevent header injection
    const safeName = sanitizeFilenameForHeader(file.original_name);
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Length', file.file_size);

    const fileStream = await fs.readFile(file.file_path);
    res.send(fileStream);
  } catch (error) {
    next(error);
  }
});

// Delete file from vault — A01: requires authentication
router.delete('/file/:fileToken', authenticate, async (req, res, next) => {
  try {
    const { fileToken } = req.params;
    const { password } = req.body;

    const file = await dbStore.selectOne('shared_files', { file_token: fileToken });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.vault_id) {
      const vault = await dbStore.findById('vaults', file.vault_id);
      if (vault) {
        const valid = await bcrypt.compare(password, vault.password_hash);
        if (!valid) {
          return res.status(401).json({ error: 'Invalid password' });
        }
      }
    }

    try {
      await fs.unlink(file.file_path);
    } catch (e) {
      console.warn('File deletion failed:', e.message);
    }

    await dbStore.deleteOne('shared_files', { file_token: fileToken });

    res.json({ success: true, message: 'File deleted from vault' });
  } catch (error) {
    next(error);
  }
});

// Delete entire vault
router.delete('/:token', authenticate, async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const userId = req.user.id;

    const vault = await dbStore.selectOne('vaults', { vault_token: token });

    if (!vault) {
      return res.status(404).json({ error: 'Vault not found' });
    }

    // Check if user owns this vault
    if (vault.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const valid = await bcrypt.compare(password, vault.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Delete physical files
    const vaultDir = path.join(__dirname, '../uploads/vaults', token);
    try {
      await fs.rm(vaultDir, { recursive: true, force: true });
    } catch (e) {
      console.warn('Vault directory deletion failed:', e.message);
    }

    // Delete files from database
    await dbStore.delete('shared_files', { vault_id: vault.id });
    await dbStore.deleteOne('vaults', { id: vault.id });

    logSecurityEvent('SENSITIVE_OP', {
      ip: req.ip,
      userId: userId,
      path: req.path,
      message: `Vault deleted: ${vault.name} (id: ${vault.id})`,
      severity: 'warn',
    });

    res.json({ success: true, message: 'Vault deleted permanently' });
  } catch (error) {
    next(error);
  }
});

// List all vaults
router.get('/list', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const vaults = await dbStore.select('vaults', { owner_id: userId });
    
    // Add file count to each vault
    const vaultsWithCounts = await Promise.all(vaults.map(async (vault) => {
      const files = await dbStore.select('shared_files', { vault_id: vault.id });
      return {
        ...vault,
        file_count: files.length
      };
    }));

    res.json(vaultsWithCounts);
  } catch (error) {
    next(error);
  }
});

// Simple file upload (non-vault)
router.post('/upload', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const userId = req.user.id;
    const { originalname, filename, size, mimetype } = req.file;
    const shareToken = crypto.randomBytes(24).toString('hex');

    const file = await dbStore.insert('shared_files', {
      filename,
      original_name: originalname,
      file_path: req.file.path,
      file_size: size,
      mime_type: mimetype,
      encryption_key: null,
      shared_by: userId,
      download_count: 0,
      max_downloads: req.body.maxDownloads ? parseInt(req.body.maxDownloads) : null,
      expires_at: req.body.expiresAt ? new Date(req.body.expiresAt).toISOString() : null,
      share_token: shareToken,
      created_at: new Date().toISOString()
    });

    const shareUrl = `${req.protocol}://${req.get('host')}/download/${shareToken}`;

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        id: file.id,
        name: originalname,
        size: size,
        shareToken: shareToken,
        shareUrl: shareUrl,
        createdAt: file.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get file info by share token
router.get('/info/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    const file = await dbStore.selectOne('shared_files', { share_token: token });

    if (!file) {
      return res.status(404).json({ error: 'File not found or link expired' });
    }

    if (file.expires_at && new Date(file.expires_at) < new Date()) {
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
  } catch (error) {
    next(error);
  }
});

// Download file by token
router.get('/download/:token', async (req, res, next) => {
  try {
    const { token } = req.params;

    const file = await dbStore.selectOne('shared_files', { share_token: token });

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (file.expires_at && new Date(file.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Link has expired' });
    }

    if (file.max_downloads && file.download_count >= file.max_downloads) {
      return res.status(410).json({ error: 'Download limit reached' });
    }

    try {
      await fs.access(file.file_path);
    } catch {
      return res.status(404).json({ error: 'File not found on server' });
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

    const fileStream = await fs.readFile(file.file_path);
    res.send(fileStream);
  } catch (error) {
    next(error);
  }
});

// List all shared files (quick-share files, not in vaults)
router.get('/files/list', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const files = await dbStore.select('shared_files', { shared_by: userId });
    res.json(files);
  } catch (error) {
    next(error);
  }
});

// Delete shared file
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const file = await dbStore.findById('shared_files', id);

    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Check if user owns this file
    if (file.shared_by !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    try {
      await fs.unlink(file.file_path);
    } catch (e) {
      console.warn('File deletion failed:', e.message);
    }

    await dbStore.deleteOne('shared_files', { id });

    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    next(error);
  }
});

export default router;
