import express from 'express';
import dbStore from '../services/dbStore.js';
import { authenticate } from '../middleware/auth.js';
import { query } from '../services/db.js';
import { sanitizeHtml, logSecurityEvent } from '../middleware/security.js';

const router = express.Router();

// Get all documents
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Get documents owned by user
    const ownedDocuments = await dbStore.select('documents', { owner_id: userId });
    
    // Try to get documents shared with user (if table exists)
    let sharedDocuments = [];
    try {
      const sharedResult = await query(
        `SELECT d.*, ds.permission 
         FROM document_shares ds 
         JOIN documents d ON ds.document_id = d.id 
         WHERE ds.shared_with = $1`,
        [userId]
      );
      
      sharedDocuments = sharedResult.rows.map(row => ({
        ...row,
        shared_permission: row.permission
      }));
    } catch (err) {
      // Table doesn't exist yet, skip shared documents
      console.log('document_shares table not available yet');
    }
    
    // Combine and deduplicate
    const allDocuments = [...ownedDocuments, ...sharedDocuments];
    res.json(allDocuments);
  } catch (error) {
    next(error);
  }
});

// Create document
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { title, content } = req.body;
    const userId = req.user.id;
    // A03: Sanitize document content
    const safeTitle = sanitizeHtml(title || 'Untitled Document').slice(0, 200);
    const safeContent = typeof content === 'string' ? content.slice(0, 100000) : '';
    const document = await dbStore.insert('documents', {
      title: safeTitle,
      content: safeContent,
      owner_id: userId
    });
    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Get document by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const document = await dbStore.findById('documents', req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    // Check if user owns this document
    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(document);
  } catch (error) {
    next(error);
  }
});

// Update document
router.patch('/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { title, content } = req.body;
    const document = await dbStore.findById('documents', req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    // Check if user owns this document
    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const updated = await dbStore.updateOne('documents', { id: req.params.id }, {
      title,
      content
    });
    if (!updated) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const updatedDocument = await dbStore.findById('documents', req.params.id);
    res.json(updatedDocument);
  } catch (error) {
    next(error);
  }
});

// Get document content — A01: requires authentication
router.get('/:id/content', authenticate, async (req, res, next) => {
  try {
    const updates = await dbStore.select('document_updates', { document_id: req.params.id });
    
    if (updates.length === 0) {
      return res.json({ update: null, message: 'New document' });
    }

    const latestUpdate = updates[updates.length - 1];
    const base64 = Buffer.from(latestUpdate.changes).toString('base64');
    res.json({ update: base64 });
  } catch (error) {
    next(error);
  }
});

// Save document content
router.post('/:id/save', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { update } = req.body;
    if (!update) return res.status(400).json({ error: 'Missing update' });

    const document = await dbStore.findById('documents', req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    // Check if user owns this document
    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const buffer = Buffer.from(update, 'base64');

    await dbStore.insert('document_updates', {
      document_id: req.params.id,
      user_id: userId,
      changes: buffer.toString('utf-8')
    });

    await dbStore.updateOne('documents', { id: req.params.id }, {
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, saved_at: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

// Get document versions — A01: requires authentication
router.get('/:id/versions', authenticate, async (req, res, next) => {
  try {
    const versions = await dbStore.select('document_versions', { document_id: req.params.id });
    res.json(versions);
  } catch (error) {
    next(error);
  }
});

// Create document version
router.post('/:id/versions', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { update, title, change_summary } = req.body;
    if (!update) return res.status(400).json({ error: 'Missing update data' });

    const document = await dbStore.findById('documents', req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    // Check if user owns this document
    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const buffer = Buffer.from(update, 'base64');

    const version = await dbStore.insert('document_versions', {
      document_id: req.params.id,
      content: buffer.toString('utf-8'),
      created_by: userId,
      title: title || 'Untitled',
      change_summary: change_summary || 'Manual version save'
    });

    res.json(version);
  } catch (error) {
    next(error);
  }
});

// Get specific version — A01: requires authentication
router.get('/:id/versions/:versionId', authenticate, async (req, res, next) => {
  try {
    const version = await dbStore.findById('document_versions', req.params.versionId);
    if (!version || version.document_id !== req.params.id) {
      return res.status(404).json({ error: 'Version not found' });
    }

    const base64 = Buffer.from(version.content).toString('base64');
    res.json({ ...version, update: base64 });
  } catch (error) {
    next(error);
  }
});

// Restore document to version — A01: requires authentication + ownership
router.post('/:id/restore', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { version_id } = req.body;

    // Check document ownership
    const document = await dbStore.findById('documents', req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const version = await dbStore.findById('document_versions', version_id);
    if (!version || version.document_id !== req.params.id) {
      return res.status(404).json({ error: 'Version not found' });
    }

    await dbStore.insert('document_updates', {
      document_id: req.params.id,
      user_id: userId,
      changes: version.content
    });

    await dbStore.updateOne('documents', { id: req.params.id }, {
      updated_at: new Date().toISOString()
    });

    res.json({ success: true, message: 'Document restored' });
  } catch (error) {
    next(error);
  }
});

// Delete document
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const document = await dbStore.findById('documents', req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    // Check if user owns this document
    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await dbStore.delete('document_updates', { document_id: req.params.id });
    await dbStore.delete('document_versions', { document_id: req.params.id });
    await dbStore.delete('comments', { document_id: req.params.id });
    await dbStore.deleteOne('documents', { id: req.params.id });
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    next(error);
  }
});

// Get document permissions — A01: requires authentication
router.get('/:id/permissions', authenticate, async (req, res, next) => {
  try {
    const permissions = await dbStore.select('paragraph_permissions', { document_id: req.params.id });
    const perms = {};
    permissions.forEach(p => {
      if (!perms[p.paragraph_index]) perms[p.paragraph_index] = {};
      perms[p.paragraph_index][p.user_id] = p.permission;
    });
    res.json(perms);
  } catch (error) {
    next(error);
  }
});

// Set document permission — A01: requires authentication + ownership
router.post('/:id/permissions', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { paragraph_index, user_id, permission } = req.body;

    // Check document ownership
    const document = await dbStore.findById('documents', req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await dbStore.insert('paragraph_permissions', {
      document_id: req.params.id,
      paragraph_index,
      user_id,
      permission
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get document comments — A01: requires authentication
router.get('/:id/comments', authenticate, async (req, res, next) => {
  try {
    const comments = await dbStore.select('comments', { document_id: req.params.id });
    res.json(comments);
  } catch (error) {
    next(error);
  }
});

// Add comment
router.post('/:id/comments', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { paragraph_id, content } = req.body;
    const document = await dbStore.findById('documents', req.params.id);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
// A03: Sanitize comment content to prevent stored XSS
    const comment = await dbStore.insert('comments', {
      document_id: req.params.id,
      user_id: userId,
      paragraph_id,
      content: sanitizeHtml(content || '').slice(0, 5000)
    });
    res.json(comment);
  } catch (error) {
    next(error);
  }
});

// Share document with user
router.post('/:id/share', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { email, permission } = req.body;
    const document = await dbStore.findById('documents', req.params.id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check if user owns this document
    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // Find user by email
    const userResult = await query('SELECT id, full_name FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const targetUserId = userResult.rows[0].id;
    
    // Check if already shared
    const existingShare = await query(
      'SELECT * FROM document_shares WHERE document_id = $1 AND shared_with = $2',
      [req.params.id, targetUserId]
    );
    
    if (existingShare.rows.length > 0) {
      // Update existing share
      await query(
        'UPDATE document_shares SET permission = $1 WHERE document_id = $2 AND shared_with = $3',
        [permission || 'view', req.params.id, targetUserId]
      );
    } else {
      // Create new share
      await query(
        'INSERT INTO document_shares (document_id, shared_by, shared_with, permission) VALUES ($1, $2, $3, $4)',
        [req.params.id, userId, targetUserId, permission || 'view']
      );
    }
    
    res.json({ success: true, message: 'Document shared successfully' });
  } catch (error) {
    next(error);
  }
});

// Get document shares
router.get('/:id/shares', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const document = await dbStore.findById('documents', req.params.id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check if user owns this document
    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    const sharesResult = await query(
      `SELECT ds.*, u.full_name, u.email 
       FROM document_shares ds 
       JOIN users u ON ds.shared_with = u.id 
       WHERE ds.document_id = $1`,
      [req.params.id]
    );
    
    res.json({ shares: sharesResult.rows });
  } catch (error) {
    next(error);
  }
});

// Remove document share
router.delete('/:id/shares/:shareId', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const document = await dbStore.findById('documents', req.params.id);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Check if user owns this document
    if (document.owner_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    await query('DELETE FROM document_shares WHERE id = $1 AND document_id = $2', [req.params.shareId, req.params.id]);
    
    res.json({ success: true, message: 'Share removed' });
  } catch (error) {
    next(error);
  }
});

// AI proxy endpoint — A01: requires auth, A10: validate inputs
router.post('/ai/generate', authenticate, async (req, res, next) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'AI not configured. Set OPENROUTER_API_KEY in .env' });
  }

  try {
    const { messages, model } = req.body;

    // A10: Validate inputs — limit message count and model string
    if (!Array.isArray(messages) || messages.length > 20) {
      return res.status(400).json({ error: 'Messages must be an array of max 20 items' });
    }
    if (typeof model !== 'string' || model.length > 100) {
      return res.status(400).json({ error: 'Invalid model parameter' });
    }
    // A10: Only allow known AI provider — prevent SSRF
    const ALLOWED_AI_HOST = 'openrouter.ai';

    const response = await fetch(`https://${ALLOWED_AI_HOST}/api/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': req.headers.origin || 'http://localhost:5173',
        'X-Title': 'StudySync'
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
  } catch (error) {
    next(error);
  }
});

export default router;
