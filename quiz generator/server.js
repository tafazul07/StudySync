const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

process.env.PORT = process.env.PORT || '3000';

const uploadRoutes = require('./routes/upload');
const quizRoutes = require('./routes/quiz');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50,
    message: { error: 'Too many requests' }
});
app.use('/api/', limiter);

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/upload', uploadRoutes);
app.use('/api/quiz', quizRoutes);

app.get('/api/health', (req, res) => {
    const hasKey = !!process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY !== 'sk-or-v1-your-key-here';

    res.json({
        status: hasKey ? 'ok' : 'missing_api_key',
        openrouter: {
            model: process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct',
            hasKey: hasKey
        },
        storage: 'JSON files (no database)'
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT;
app.listen(PORT, () => {
    console.log('🚀 Quiz Generator Server (No Database)');
    console.log(`📡 http://localhost:${PORT}`);
    console.log(`🌐 Model: ${process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.1-8b-instruct'}`);
    console.log(`💾 Storage: JSON files in ./data/`);
    console.log('');
    console.log('Press Ctrl+C to stop');
});

module.exports = app;

