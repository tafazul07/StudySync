const fs = require('fs');
const path = require('path');

const DATA_DIR = './data';
const DOCS_FILE = path.join(DATA_DIR, 'documents.json');
const CHUNKS_FILE = path.join(DATA_DIR, 'chunks.json');
const QUIZZES_FILE = path.join(DATA_DIR, 'quizzes.json');
const ATTEMPTS_FILE = path.join(DATA_DIR, 'attempts.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize files if they don't exist
if (!fs.existsSync(DOCS_FILE)) fs.writeFileSync(DOCS_FILE, '[]');
if (!fs.existsSync(CHUNKS_FILE)) fs.writeFileSync(CHUNKS_FILE, '[]');
if (!fs.existsSync(QUIZZES_FILE)) fs.writeFileSync(QUIZZES_FILE, '[]');
if (!fs.existsSync(ATTEMPTS_FILE)) fs.writeFileSync(ATTEMPTS_FILE, '[]');

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return [];
    }
}

function writeJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Document operations
function addDocument(doc) {
    const docs = readJson(DOCS_FILE);
    doc.id = docs.length > 0 ? Math.max(...docs.map(d => d.id)) + 1 : 1;
    doc.created_at = new Date().toISOString();
    docs.unshift(doc);
    writeJson(DOCS_FILE, docs);
    return doc;
}

function getDocuments() {
    return readJson(DOCS_FILE);
}

function getDocument(id) {
    const docs = readJson(DOCS_FILE);
    return docs.find(d => d.id === parseInt(id));
}

function deleteDocument(id) {
    let docs = readJson(DOCS_FILE);
    docs = docs.filter(d => d.id !== parseInt(id));
    writeJson(DOCS_FILE, docs);

    // Also delete chunks
    let chunks = readJson(CHUNKS_FILE);
    chunks = chunks.filter(c => c.doc_id !== parseInt(id));
    writeJson(CHUNKS_FILE, chunks);
}

// Chunk operations
function addChunks(docId, chunksList) {
    const chunks = readJson(CHUNKS_FILE);
    chunksList.forEach((chunkText, index) => {
        chunks.push({
            id: chunks.length > 0 ? Math.max(...chunks.map(c => c.id)) + 1 : 1,
            doc_id: docId,
            chunk_text: chunkText,
            chunk_index: index,
            embedding: null // Will be set later
        });
    });
    writeJson(CHUNKS_FILE, chunks);
}

function getChunks(docId) {
    const chunks = readJson(CHUNKS_FILE);
    return chunks.filter(c => c.doc_id === parseInt(docId));
}

function updateChunkEmbedding(chunkId, embedding) {
    const chunks = readJson(CHUNKS_FILE);
    const chunk = chunks.find(c => c.id === chunkId);
    if (chunk) {
        chunk.embedding = embedding;
        writeJson(CHUNKS_FILE, chunks);
    }
}

// Quiz operations
function addQuiz(quiz) {
    const quizzes = readJson(QUIZZES_FILE);
    quiz.id = quizzes.length > 0 ? Math.max(...quizzes.map(q => q.id)) + 1 : 1;
    quiz.created_at = new Date().toISOString();
    quizzes.unshift(quiz);
    writeJson(QUIZZES_FILE, quizzes);
    return quiz;
}

function getQuizzes(docId) {
    const quizzes = readJson(QUIZZES_FILE);
    if (docId) {
        return quizzes.filter(q => q.doc_id === parseInt(docId));
    }
    return quizzes;
}

function getQuiz(id) {
    const quizzes = readJson(QUIZZES_FILE);
    return quizzes.find(q => q.id === parseInt(id));
}

function updateDocumentTopics(id, topics) {
    const docs = readJson(DOCS_FILE);
    const doc = docs.find(d => d.id === parseInt(id));
    if (doc) {
        doc.topics = topics;
        writeJson(DOCS_FILE, docs);
    }
    return doc;
}

function addAttempt(attempt) {
    const attempts = readJson(ATTEMPTS_FILE);
    attempt.id = attempts.length > 0 ? Math.max(...attempts.map(a => a.id)) + 1 : 1;
    attempt.created_at = new Date().toISOString();
    attempts.unshift(attempt);
    writeJson(ATTEMPTS_FILE, attempts);
    return attempt;
}

function getAttempts() {
    return readJson(ATTEMPTS_FILE);
}

module.exports = {
    addDocument,
    getDocuments,
    getDocument,
    deleteDocument,
    addChunks,
    getChunks,
    updateChunkEmbedding,
    addQuiz,
    getQuizzes,
    getQuiz,
    updateDocumentTopics,
    addAttempt,
    getAttempts
};