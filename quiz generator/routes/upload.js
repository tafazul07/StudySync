const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const { createWorker } = require('tesseract.js');

const { chunkText, storeChunksWithEmbeddings } = require('../services/chunker');
const { addDocument, getDocuments, getDocument, deleteDocument } = require('../services/store');

const router = express.Router();

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 },
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

async function extractPDF(filePath) {
    const buffer = fs.readFileSync(filePath);
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

function extractTXT(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function cleanText(text) {
    return text.replace(/\s+/g, ' ').trim();
}

router.post('/', upload.single('file'), async (req, res) => {
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
                fullText = extractTXT(filePath);
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
            const { extractTopics } = require('../services/openrouter');
            topics = await extractTopics(fullText);
            console.log(`🏷️  Extracted ${topics.length} topics`);
        } catch (topicsErr) {
            console.warn('⚠️ Topic extraction failed:', topicsErr.message);
            topics = [{ topic: "General Content", description: "Main concepts covered in the document" }];
        }

        // Save document metadata
        const doc = addDocument({
            filename: req.file.filename,
            original_name: req.file.originalname,
            file_type: ext.substring(1),
            text_length: fullText.length,
            preview: fullText.substring(0, 300),
            topics: topics
        });

        // Chunk and store with embeddings
        const chunks = chunkText(fullText);
        console.log(`✂️  ${chunks.length} chunks created`);

        await storeChunksWithEmbeddings(doc.id, chunks);

        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

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
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);

        res.status(500).json({
            error: error.message || 'Failed to process file'
        });
    }
});

router.get('/documents', (req, res) => {
    try {
        const docs = getDocuments();
        res.json({ documents: docs });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/documents/:id', (req, res) => {
    try {
        const doc = getDocument(req.params.id);
        if (!doc) return res.status(404).json({ error: 'Document not found' });
        res.json({ document: doc });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.delete('/documents/:id', (req, res) => {
    try {
        deleteDocument(req.params.id);
        res.json({ success: true, message: 'Document deleted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;