import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import { createWorker } from 'tesseract.js';
import dbStore from '../services/dbStore.js';
import { chunkText, findRelevantChunks, storeChunksWithEmbeddings } from '../services/chunker.js';
import { generateQuiz, extractTopics } from '../services/openrouter.js';
import { authenticate } from '../middleware/auth.js';
import { sanitizeHtml } from '../middleware/security.js';

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

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.docx', '.pptx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOCX, PPTX, and TXT files are allowed'));
    }
  }
});

// Text extraction functions
async function extractPDF(filePath) {
  const buffer = await fs.readFile(filePath);
  const data = await pdfParse(buffer);
  let text = data.text || '';

  if (text.trim().length < 500) {
    console.log('📄 Low text, running OCR...');
    try {
      const worker = await createWorker('eng');
      const ret = await worker.recognize(filePath);
      text += '\n' + (ret.data.text || '');
      await worker.terminate();
    } catch (e) {
      console.warn('OCR failed:', e.message);
    }
  }
  return text;
}

async function extractDOCX(filePath) {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value || '';
}

async function extractTXT(filePath) {
  return await fs.readFile(filePath, 'utf8');
}

function cleanText(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// Upload document for quiz generation
router.post('/upload', authenticate, upload.single('file'), async (req, res, next) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    console.log(`📥 Processing: ${req.file.originalname}`);

    let fullText = '';
    switch (ext) {
      case '.pdf':
        fullText = await extractPDF(filePath);
        break;
      case '.docx':
        fullText = await extractDOCX(filePath);
        break;
      case '.txt':
        fullText = await extractTXT(filePath);
        break;
      default:
        throw new Error('Unsupported file type');
    }

    fullText = cleanText(fullText);

    if (fullText.trim().length < 100) {
      throw new Error('Could not extract sufficient text from file.');
    }

    // Extract topics using OpenRouter
    let topics = [];
    try {
      topics = await extractTopics(fullText);
      console.log(`🏷️  Extracted ${topics.length} topics`);
    } catch (topicsErr) {
      console.warn('⚠️ Topic extraction failed:', topicsErr.message);
      topics = [{ topic: "General Content", description: "Main concepts covered in the document" }];
    }

    // Save document metadata
    const userId = req.user.id;
    const doc = await dbStore.insert('rag_documents', {
      filename: req.file.filename,
      original_name: req.file.originalname,
      file_type: ext.substring(1),
      text_length: fullText.length,
      preview: fullText.substring(0, 300),
      topics: JSON.stringify(topics),
      user_id: userId
    });

    // Chunk and store with embeddings
    const chunks = chunkText(fullText);
    console.log(`✂️  ${chunks.length} chunks created`);

    await storeChunksWithEmbeddings(doc.id, chunks);

    // Clean up uploaded file
    try {
      await fs.unlink(filePath);
    } catch (e) {
      console.warn('File cleanup failed:', e.message);
    }

    console.log(`✅ Done: doc ${doc.id}`);

    res.json({
      success: true,
      docId: doc.id,
      filename: req.file.originalname,
      fileType: ext.substring(1),
      chunks: chunks.length,
      embedded: chunks.length,
      textLength: fullText.length,
      preview: fullText.substring(0, 300) + (fullText.length > 300 ? '...' : '')
    });

  } catch (error) {
    console.error('❌ Upload error:', error.message);
    if (filePath) {
      try {
        await fs.unlink(filePath);
      } catch (e) {
        console.warn('File cleanup failed:', e.message);
      }
    }
    next(error);
  }
});

// Get all documents
router.get('/documents', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const docs = await dbStore.select('rag_documents', { user_id: userId });
    res.json({ documents: docs });
  } catch (error) {
    next(error);
  }
});

// Get document by ID — A01: requires authentication
router.get('/documents/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const doc = await dbStore.findById('rag_documents', req.params.id);
    if (!doc) return res.status(404).json({ error: 'Document not found' });
    // A01: Check ownership
    if (doc.user_id !== userId) return res.status(403).json({ error: 'Access denied' });
    res.json({ document: doc });
  } catch (error) {
    next(error);
  }
});

// Delete document
router.delete('/documents/:id', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const doc = await dbStore.findById('rag_documents', req.params.id);
    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }
    if (doc.user_id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await dbStore.deleteOne('rag_documents', { id: req.params.id });
    res.json({ success: true, message: 'Document deleted' });
  } catch (error) {
    next(error);
  }
});

// Generate quiz
router.post('/generate', authenticate, async (req, res, next) => {
  const startTime = Date.now();

  try {
    const { docId, topic, numQuestions = 5, quizType = 'mcq', difficulty = 'medium' } = req.body;

    if (!docId) return res.status(400).json({ error: 'docId is required' });
    if (!topic || topic.trim().length === 0) return res.status(400).json({ error: 'topic is required' });

    // A03: Sanitize topic to prevent injection via AI prompt
    const safeTopic = sanitizeHtml(topic).slice(0, 500);

    const validTypes = ['mcq', 'fill_blank'];
    if (!validTypes.includes(quizType)) return res.status(400).json({ error: 'quizType must be mcq or fill_blank' });

    const numQ = Math.min(Math.max(parseInt(numQuestions) || 5, 1), 20);

    console.log(`🎯 Generating ${quizType} (${difficulty}) quiz for doc ${docId}, topic: "${safeTopic}"`);

    const doc = await dbStore.findById('rag_documents', docId);
    if (!doc) return res.status(404).json({ error: 'Document not found' });

    console.log('🔍 Retrieving chunks...');
    const chunks = await findRelevantChunks(docId, safeTopic, 5);

    if (chunks.length === 0) {
      return res.status(404).json({ error: 'No relevant content found.' });
    }

    console.log(`✅ ${chunks.length} chunks retrieved`);
    console.log('🌐 Calling OpenRouter API...');

    const quiz = await generateQuiz(chunks, safeTopic, numQ, quizType, difficulty);

    // Save quiz
    const userId = req.user.id;
    await dbStore.insert('quizzes', {
      title: quiz.quiz.title,
      doc_id: docId,
      user_id: userId,
      quiz_type: quizType,
      topic: safeTopic,
      num_questions: quiz.quiz.total_questions,
      difficulty: difficulty,
      questions: JSON.stringify(quiz)
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Quiz done in ${duration}s`);

    res.json({
      success: true,
      quiz,
      meta: {
        docId,
        docName: doc.original_name,
        topic: safeTopic,
        quizType,
        numQuestions: quiz.quiz.total_questions,
        difficulty,
        chunksUsed: chunks.length,
        generationTime: `${duration}s`
      }
    });

  } catch (error) {
    console.error('❌ Quiz error:', error.message);
    next(error);
  }
});

// Get quiz history for a document — A01: requires authentication
router.get('/history/:docId', authenticate, async (req, res, next) => {
  try {
    const quizzes = await dbStore.select('quizzes', { doc_id: req.params.docId });
    res.json({ quizzes });
  } catch (error) {
    next(error);
  }
});

// Get specific quiz — A01: requires authentication
router.get('/:quizId', authenticate, async (req, res, next) => {
  try {
    const quiz = await dbStore.findById('quizzes', req.params.quizId);
    if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
    res.json({ quiz });
  } catch (error) {
    next(error);
  }
});

// Get all quizzes
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const quizzes = await dbStore.select('quizzes', { user_id: userId });
    res.json({ quizzes });
  } catch (error) {
    next(error);
  }
});

// Submit quiz attempt
router.post('/submit-attempt', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { quizId, score, totalQuestions, answers, subtopicBreakdown } = req.body;
    
    // Validate required fields
    if (!quizId || quizId === '') {
      return res.status(400).json({ error: 'Quiz ID is required' });
    }
    
    const attempt = await dbStore.insert('quiz_attempts', {
      quiz_id: quizId,
      user_id: userId,
      score: score,
      total_questions: totalQuestions,
      answers: JSON.stringify(answers),
      subtopic_breakdown: JSON.stringify(subtopicBreakdown || [])
    });
    res.json({ success: true, attemptId: attempt.id });
  } catch (error) {
    next(error);
  }
});

// Get quiz analytics
router.get('/analytics', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.id;
    const attempts = await dbStore.select('quiz_attempts', { user_id: userId });
    const docs = await dbStore.select('rag_documents', { user_id: userId });

    // KPI metrics
    const totalAttempts = attempts.length;

    let avgScorePercent = 0;
    if (totalAttempts > 0) {
      const sumScores = attempts.reduce((sum, a) => {
        const total = parseInt(a.total_questions) || 1;
        const score = parseInt(a.score) || 0;
        return sum + (score / total);
      }, 0);
      avgScorePercent = Math.round((sumScores / totalAttempts) * 100);
    }

    const activeDocs = docs.length;

    // Subtopic analysis
    const subtopicStats = {};

    attempts.forEach(a => {
      if (a.subtopic_breakdown) {
        const breakdown = JSON.parse(a.subtopic_breakdown);
        if (Array.isArray(breakdown)) {
          breakdown.forEach(sub => {
            const name = sub.subtopic || 'General Concepts';
            if (!subtopicStats[name]) {
              subtopicStats[name] = { correct: 0, total: 0 };
            }
            subtopicStats[name].correct += parseInt(sub.correct) || 0;
            subtopicStats[name].total += parseInt(sub.total) || 0;
          });
        }
      }
    });

    const topicMastery = Object.keys(subtopicStats).map(name => {
      const stats = subtopicStats[name];
      const percent = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      return {
        subtopic: name,
        correct: stats.correct,
        total: stats.total,
        percentage: percent
      };
    });

    let topWeakTopic = 'N/A';
    if (topicMastery.length > 0) {
      const sortedMastery = [...topicMastery].sort((a, b) => a.percentage - b.percentage);
      topWeakTopic = `${sortedMastery[0].subtopic} (${sortedMastery[0].percentage}%)`;
    }

    // Trends (last 10 attempts)
    const recentAttempts = attempts.slice(-10).reverse();
    const trends = recentAttempts.map(a => {
      const total = parseInt(a.total_questions) || 1;
      const score = parseInt(a.score) || 0;
      return {
        date: a.created_at ? new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Unknown',
        score: Math.round((score / total) * 100),
        topic: a.topic || 'General'
      };
    });

    res.json({
      success: true,
      summary: {
        totalAttempts,
        averageScore: `${avgScorePercent}%`,
        activeDocs,
        topWeakTopic
      },
      trends,
      topicMastery,
      recentAttempts: attempts.slice(-10)
    });
  } catch (error) {
    console.error('Analytics endpoint error:', error);
    next(error);
  }
});

export default router;
