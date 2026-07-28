import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import dbStore from '../services/dbStore.js';
import { generateStudyPlan } from '../services/openrouter.js';
import { extractText } from '../services/fileParserService.js';
import { sendStudyPlanEmail } from '../services/emailService.js';
import { authenticate } from '../middleware/auth.js';
import { sanitizeHtml } from '../middleware/security.js';
import fs from 'fs/promises';


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

const ALLOWED_MIMETYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown'
];

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}. Supported formats: PDF, DOCX, TXT, MD.`));
    }
  }
});

// Create study plan
router.post('/', authenticate, upload.single('file'), async (req, res, next) => {
  try {
    const { title, preferences, userEmail } = req.body;
    const userId = req.user.id;
    let extractedText = '';

    // A03: Sanitize inputs
    const safeTitle = title ? sanitizeHtml(title).slice(0, 200) : null;
    const safeEmail = userEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail) ? userEmail : null;

    if (req.file) {
      try {
        extractedText = await extractText(req.file.path, req.file.mimetype);
      } catch (extractError) {
        return res.status(400).json({
          error: extractError.message
        });
      }
    } else if (req.body.content && req.body.content.trim()) {
      extractedText = req.body.content;
    } else {
      return res.status(400).json({
        error: 'Please either upload a file (PDF, DOCX, TXT) or enter text content to generate a study plan.'
      });
    }

    // Validate extracted text has meaningful content
    if (!extractedText || extractedText.trim().length < 50) {
      const source = req.file ? 'the uploaded file' : 'the entered text';
      return res.status(400).json({
        error: `Not enough content from ${source}. Please provide at least 50 characters of text, ` +
               `upload a different file, or paste more content directly.`
      });
    }

    const plan = await generateStudyPlan(extractedText, JSON.parse(preferences || '{}'));

    const savedPlan = await dbStore.insert('study_plans', {
      title: plan.title || safeTitle,
      description: plan.description || '',
      subject: plan.subject || '',
      start_date: plan.startDate || new Date().toISOString(),
      end_date: plan.endDate || '',
      original_filename: req.file?.originalname || null,
      file_path: req.file?.path || null,
      extracted_text: extractedText.substring(0, 5000),
      plan_content: JSON.stringify(plan),
      user_id: userId
    });

    if (plan.milestones && Array.isArray(plan.milestones)) {
      for (const milestone of plan.milestones) {
        await dbStore.insert('deadlines', {
          study_plan_id: savedPlan.id,
          title: sanitizeHtml(milestone.title || '').slice(0, 200),
          description: sanitizeHtml(milestone.description || '').slice(0, 1000),
          due_date: milestone.targetDate,
          priority: 'medium',
          status: 'pending',
          email: safeEmail || '',
          user_id: userId
        });
      }
    }

    if (safeEmail) {
      try {
        await sendStudyPlanEmail(safeEmail, plan);
      } catch (e) {
        console.error('Email send failed:', e.message);
      }
    }

    res.status(201).json({
      success: true,
      data: savedPlan
    });
  } catch (error) {
    next(error);
  }
});

// Get all study plans
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const plans = await dbStore.select('study_plans', { user_id: userId });
    res.json({ success: true, data: plans });
  } catch (error) {
    next(error);
  }
});

// Get study plan by ID
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const plan = await dbStore.findById('study_plans', id);

    if (!plan) {
      return res.status(404).json({ error: 'Study plan not found' });
    }

    // Check if user owns this plan
    if (plan.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const deadlines = await dbStore.select('deadlines', { study_plan_id: id });

    res.json({
      success: true,
      data: {
        ...plan,
        deadlines
      }
    });
  } catch (error) {
    next(error);
  }
});

// Delete study plan
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const plan = await dbStore.findById('study_plans', id);

    if (!plan) {
      return res.status(404).json({ error: 'Study plan not found' });
    }

    // Check if user owns this plan
    if (plan.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    if (plan?.file_path) {
      try {
        await fs.unlink(plan.file_path);
      } catch (e) {
        console.error('File deletion failed:', e.message);
      }
    }

    await dbStore.delete('deadlines', { study_plan_id: id });
    await dbStore.deleteOne('study_plans', { id });
    
    res.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
