const express = require('express');
const { findRelevantChunks } = require('../services/chunker');
const { generateQuiz } = require('../services/openrouter');
const { getDocument, addQuiz, getQuizzes, getQuiz } = require('../services/store');

const router = express.Router();

router.post('/generate', async (req, res) => {
    const startTime = Date.now();

    try {
        const { docId, topic, numQuestions = 5, quizType = 'mcq', difficulty = 'medium' } = req.body;

        if (!docId) return res.status(400).json({ error: 'docId is required' });
        if (!topic || topic.trim().length === 0) return res.status(400).json({ error: 'topic is required' });

        const validTypes = ['mcq', 'fill_blank'];
        if (!validTypes.includes(quizType)) return res.status(400).json({ error: 'quizType must be mcq or fill_blank' });

        const numQ = Math.min(Math.max(parseInt(numQuestions) || 5, 1), 20);

        console.log(`🎯 Generating ${quizType} (${difficulty}) quiz for doc ${docId}, topic: "${topic}"`);

        const doc = getDocument(docId);
        if (!doc) return res.status(404).json({ error: 'Document not found' });

        console.log('🔍 Retrieving chunks...');
        const chunks = await findRelevantChunks(docId, topic, 5);

        if (chunks.length === 0) {
            return res.status(404).json({ error: 'No relevant content found.' });
        }

        console.log(`✅ ${chunks.length} chunks retrieved`);
        console.log('🌐 Calling OpenRouter API...');

        const quiz = await generateQuiz(chunks, topic, numQ, quizType, difficulty);

        // Save quiz
        addQuiz({
            doc_id: docId,
            quiz_type: quizType,
            topic: topic,
            num_questions: numQ,
            difficulty: difficulty,
            questions: quiz
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✅ Quiz done in ${duration}s`);

        res.json({
            success: true,
            quiz,
            meta: {
                docId,
                docName: doc.original_name,
                topic,
                quizType,
                numQuestions: numQ,
                difficulty,
                chunksUsed: chunks.length,
                generationTime: `${duration}s`
            }
        });

    } catch (error) {
        console.error('❌ Quiz error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

router.get('/history/:docId', (req, res) => {
    try {
        const quizzes = getQuizzes(req.params.docId);
        res.json({ quizzes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/:quizId', (req, res) => {
    try {
        const quiz = getQuiz(req.params.quizId);
        if (!quiz) return res.status(404).json({ error: 'Quiz not found' });
        res.json({ quiz });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/', (req, res) => {
    try {
        const quizzes = getQuizzes();
        res.json({ quizzes });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.post('/submit-attempt', (req, res) => {
    try {
        const { addAttempt } = require('../services/store');
        const attempt = addAttempt(req.body);
        res.json({ success: true, attemptId: attempt.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get('/analytics', (req, res) => {
    try {
        const { getAttempts, getDocuments } = require('../services/store');
        const attempts = getAttempts();
        const docs = getDocuments();

        // 1. KPI metrics
        const totalAttempts = attempts.length;

        let avgScorePercent = 0;
        if (totalAttempts > 0) {
            const sumScores = attempts.reduce((sum, a) => {
                const total = parseInt(a.totalQuestions) || 1;
                const score = parseInt(a.score) || 0;
                return sum + (score / total);
            }, 0);
            avgScorePercent = Math.round((sumScores / totalAttempts) * 100);
        }

        const activeDocs = docs.length;

        // 2. Subtopic analysis (topic mastery and weak topics)
        const subtopicStats = {}; // { subtopicName: { correct: X, total: Y } }

        attempts.forEach(a => {
            if (a.subtopicBreakdown && Array.isArray(a.subtopicBreakdown)) {
                a.subtopicBreakdown.forEach(sub => {
                    const name = sub.subtopic || 'General Concepts';
                    if (!subtopicStats[name]) {
                        subtopicStats[name] = { correct: 0, total: 0 };
                    }
                    subtopicStats[name].correct += parseInt(sub.correct) || 0;
                    subtopicStats[name].total += parseInt(sub.total) || 0;
                });
            }
        });

        // Convert subtopicStats to list
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

        // Sort to find the weakest subtopic (lowest percentage)
        let topWeakTopic = 'N/A';
        if (topicMastery.length > 0) {
            const sortedMastery = [...topicMastery].sort((a, b) => a.percentage - b.percentage);
            topWeakTopic = `${sortedMastery[0].subtopic} (${sortedMastery[0].percentage}%)`;
        }

        // 3. Trends (last 10 attempts)
        const recentAttempts = attempts.slice(0, 10).reverse();
        const trends = recentAttempts.map(a => {
            const total = parseInt(a.totalQuestions) || 1;
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
            recentAttempts: attempts.slice(0, 10)
        });
    } catch (error) {
        console.error('Analytics endpoint error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;