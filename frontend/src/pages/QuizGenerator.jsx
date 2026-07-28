import { useState, useEffect } from 'react';
import {
  BookOpen,
  Upload,
  TrendingUp,
  X,
  ChevronRight,
  ChevronLeft,
  CheckCircle,
  XCircle,
  Loader2,
  FileText,
  Zap,
  Award,
  Target,
  ArrowLeft,
  RefreshCw,
  BarChart2,
  Sparkles
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useVoiceAction } from '../hooks/useVoiceControl';

const DIFFICULTY_COLORS = {
  easy: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400',
  hard: 'bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400',
};

export default function QuizGenerator() {
  const [view, setView] = useState('list'); // 'list' | 'taking' | 'results'
  const [documents, setDocuments] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showQuizModal, setShowQuizModal] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [file, setFile] = useState(null);
  const [quizForm, setQuizForm] = useState({
    topic: '',
    numQuestions: 5,
    quizType: 'mcq',
    difficulty: 'medium'
  });

  // Quiz player state
  const [activeQuiz, setActiveQuiz] = useState(null); // parsed quiz object
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState({});
  const [fillAnswer, setFillAnswer] = useState('');
  const [showExplanation, setShowExplanation] = useState(false);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [quizResults, setQuizResults] = useState(null);
  const [topicFilter, setTopicFilter] = useState(null); // for doc topics

  // Voice actions for Quiz Forge
  useVoiceAction('upload', (data) => {
    // Only handle if no target route (current page) or target route matches current page
    if (!data.targetRoute || data.targetRoute === '/quiz') {
      setShowUploadModal(true);
    }
  });

  // Handle pending voice upload from navigation
  useEffect(() => {
    const pendingUpload = sessionStorage.getItem('pendingVoiceUpload');
    if (pendingUpload) {
      try {
        const data = JSON.parse(pendingUpload);
        // Only handle if target route matches current page or no target
        if (!data.targetRoute || data.targetRoute === '/quiz') {
          // Small delay to ensure component is fully mounted
          setTimeout(() => setShowUploadModal(true), 200);
        }
        sessionStorage.removeItem('pendingVoiceUpload');
      } catch (e) {
        sessionStorage.removeItem('pendingVoiceUpload');
      }
    }
  }, []);

  useVoiceAction('generate_quiz', (data) => {
    if (data.topic) {
      setQuizForm(prev => ({ ...prev, topic: data.topic }));
      setShowQuizModal(true);
    }
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [docsRes, quizzesRes] = await Promise.all([
        apiFetch('/api/quizzes/documents').then(r => r.json()).catch(() => ({ documents: [] })),
        apiFetch('/api/quizzes').then(r => r.json()).catch(() => ({ quizzes: [] }))
      ]);
      setDocuments(docsRes.documents || []);
      setQuizzes(quizzesRes.quizzes || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      setDocuments([]);
      setQuizzes([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await apiFetch('/api/quizzes/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setShowUploadModal(false);
        setFile(null);
        fetchData();
      } else {
        alert(data.error || 'Failed to upload document');
      }
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Error uploading document');
    } finally {
      setUploading(false);
    }
  };

  const handleGenerateQuiz = async (e) => {
    e.preventDefault();
    setGenerating(true);
    try {
      const res = await apiFetch('/api/quizzes/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId: selectedDoc.id,
          topic: quizForm.topic,
          numQuestions: quizForm.numQuestions,
          quizType: quizForm.quizType,
          difficulty: quizForm.difficulty
        })
      });
      const data = await res.json();
      if (data.success && data.quiz) {
        setShowQuizModal(false);
        setSelectedDoc(null);
        setQuizForm({ topic: '', numQuestions: 5, quizType: 'mcq', difficulty: 'medium' });
        fetchData();
        // Auto-launch the quiz player
        launchQuiz(data.quiz, quizForm.difficulty);
      } else {
        alert(data.error || 'Failed to generate quiz');
      }
    } catch (error) {
      console.error('Error generating quiz:', error);
      alert('Error generating quiz');
    } finally {
      setGenerating(false);
    }
  };

  const launchQuiz = (quizData, difficulty = 'medium') => {
    const questions = quizData.quiz?.questions || [];
    if (!questions.length) {
      alert('No questions found in this quiz.');
      return;
    }
    setActiveQuiz({ ...quizData, difficulty });
    setCurrentQuestionIdx(0);
    setUserAnswers({});
    setFillAnswer('');
    setShowExplanation(false);
    setQuizSubmitted(false);
    setQuizResults(null);
    setView('taking');
  };

  const handleOpenExistingQuiz = (quiz) => {
    try {
      const parsed = typeof quiz.questions === 'string'
        ? JSON.parse(quiz.questions)
        : quiz.questions;
      launchQuiz(parsed, quiz.difficulty);
    } catch (e) {
      alert('Could not load quiz data.');
    }
  };

  const openQuizModal = (doc) => {
    setSelectedDoc(doc);
    // Pre-fill topic from extracted doc topics if available
    const topics = doc.topics ? (typeof doc.topics === 'string' ? JSON.parse(doc.topics) : doc.topics) : [];
    setTopicFilter(topics);
    setQuizForm({ topic: '', numQuestions: 5, quizType: 'mcq', difficulty: 'medium' });
    setShowQuizModal(true);
  };

  // --- Quiz Player Helpers ---
  const currentQuestion = activeQuiz?.quiz?.questions?.[currentQuestionIdx];
  const totalQuestions = activeQuiz?.quiz?.questions?.length || 0;
  const quizType = activeQuiz?.quiz?.questions?.[0]?.options ? 'mcq' : 'fill_blank';
  const progress = totalQuestions > 0 ? ((currentQuestionIdx + 1) / totalQuestions) * 100 : 0;

  const handleSelectAnswer = (key) => {
    if (quizSubmitted) return;
    setUserAnswers(prev => ({ ...prev, [currentQuestionIdx]: key }));
    setShowExplanation(false);
  };

  const handleFillSubmit = () => {
    if (!fillAnswer.trim() || quizSubmitted) return;
    setUserAnswers(prev => ({ ...prev, [currentQuestionIdx]: fillAnswer.trim() }));
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (currentQuestionIdx < totalQuestions - 1) {
      setCurrentQuestionIdx(idx => idx + 1);
      setFillAnswer('');
      setShowExplanation(false);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIdx > 0) {
      setCurrentQuestionIdx(idx => idx - 1);
      setFillAnswer('');
      setShowExplanation(false);
    }
  };

  const handleFinishQuiz = () => {
    const questions = activeQuiz.quiz.questions;
    let score = 0;
    const subtopicMap = {};

    const detailed = questions.map((q, i) => {
      const userAns = userAnswers[i];
      const correctAns = q.correct_answer || q.answer;
      const isCorrect = quizType === 'fill_blank'
        ? (userAns || '').toLowerCase().trim() === (correctAns || '').toLowerCase().trim()
        : userAns === correctAns;

      if (isCorrect) score++;

      const sub = q.subtopic || 'General';
      if (!subtopicMap[sub]) subtopicMap[sub] = { correct: 0, total: 0 };
      subtopicMap[sub].total++;
      if (isCorrect) subtopicMap[sub].correct++;

      return { ...q, userAnswer: userAns, isCorrect };
    });

    const subtopicBreakdown = Object.entries(subtopicMap).map(([subtopic, s]) => ({
      subtopic,
      correct: s.correct,
      total: s.total,
      percentage: Math.round((s.correct / s.total) * 100)
    }));

    // Post attempt to backend
    apiFetch('/api/quizzes/submit-attempt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quizId: activeQuiz?.id || '',
        score,
        totalQuestions: questions.length,
        answers: userAnswers,
        subtopicBreakdown,
        topic: activeQuiz?.quiz?.title || ''
      })
    }).catch(e => console.warn('Attempt save failed:', e));

    setQuizResults({ score, total: questions.length, detailed, subtopicBreakdown });
    setQuizSubmitted(true);
    setView('results');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary-600" />
        <span className="text-gray-500 dark:text-gray-400 font-medium">Loading quiz workspace...</span>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // QUIZ PLAYER VIEW
  // ─────────────────────────────────────────────
  if (view === 'taking' && activeQuiz) {
    const q = currentQuestion;
    const userAns = userAnswers[currentQuestionIdx];
    const isAnswered = userAns !== undefined;

    return (
      <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setView('list')}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 line-clamp-1">
              {activeQuiz.quiz?.title || 'Quiz'}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Question {currentQuestionIdx + 1} of {totalQuestions}
            </p>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold capitalize ${DIFFICULTY_COLORS[activeQuiz.difficulty] || DIFFICULTY_COLORS.medium}`}>
            {activeQuiz.difficulty}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-primary-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Question Card */}
        <div className="glass rounded-2xl p-6 shadow-sm border border-gray-200 dark:border-gray-700">
          <div className="mb-2">
            <span className="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wider">
              {q?.subtopic || 'General'}
            </span>
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 leading-relaxed mb-6">
            {q?.question}
          </h2>

          {/* MCQ Options */}
          {quizType === 'mcq' && q?.options && (
            <div className="space-y-3">
              {Object.entries(q.options).map(([key, value]) => {
                const isSelected = userAns === key;
                const isCorrect = q.correct_answer === key;
                const showResult = showExplanation && isSelected;

                return (
                  <button
                    key={key}
                    onClick={() => { handleSelectAnswer(key); setShowExplanation(true); }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center gap-3 ${
                      isSelected && showResult
                        ? isCorrect
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-100'
                          : 'border-rose-500 bg-rose-50 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100'
                        : isSelected
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 text-primary-900 dark:text-primary-100'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 text-gray-800 dark:text-gray-200 hover:border-primary-400 hover:bg-primary-50/40 dark:hover:bg-primary-950/20'
                    }`}
                  >
                    <span className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-sm font-bold shrink-0 ${
                      isSelected
                        ? 'border-current'
                        : 'border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
                    }`}>
                      {key}
                    </span>
                    <span className="flex-1">{value}</span>
                    {showResult && isSelected && (
                      isCorrect
                        ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                        : <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Fill in the Blank */}
          {quizType === 'fill_blank' && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={fillAnswer}
                  onChange={e => setFillAnswer(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleFillSubmit()}
                  placeholder="Type your answer..."
                  className="flex-1 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  disabled={isAnswered}
                />
                {!isAnswered && (
                  <button onClick={handleFillSubmit} className="btn-primary px-5">
                    Check
                  </button>
                )}
              </div>

              {isAnswered && (
                <div className={`p-3 rounded-lg ${
                  (userAns || '').toLowerCase().trim() === (q.answer || '').toLowerCase().trim()
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700'
                    : 'bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-700'
                }`}>
                  {(userAns || '').toLowerCase().trim() === (q.answer || '').toLowerCase().trim() ? (
                    <p className="text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" /> Correct! The answer is "{q.answer}"
                    </p>
                  ) : (
                    <div className="text-rose-700 dark:text-rose-300 space-y-1">
                      <p className="font-semibold flex items-center gap-2">
                        <XCircle className="w-4 h-4" /> Incorrect. Correct answer: <span className="font-bold">"{q.answer}"</span>
                      </p>
                    </div>
                  )}
                  {q.hint && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">💡 Hint: {q.hint}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MCQ Explanation */}
          {quizType === 'mcq' && showExplanation && q?.explanation && (
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-1">💡 Explanation</p>
              <p className="text-sm text-blue-700 dark:text-blue-400">{q.explanation}</p>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={handlePrev}
            disabled={currentQuestionIdx === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>

          {/* Question dots */}
          <div className="flex gap-1.5 flex-wrap justify-center">
            {activeQuiz.quiz.questions.map((_, i) => (
              <button
                key={i}
                onClick={() => { setCurrentQuestionIdx(i); setFillAnswer(''); setShowExplanation(false); }}
                className={`w-7 h-7 rounded-full text-xs font-bold transition-all ${
                  i === currentQuestionIdx
                    ? 'bg-primary-500 text-white scale-110'
                    : userAnswers[i] !== undefined
                      ? 'bg-emerald-500 text-white'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-300'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {currentQuestionIdx < totalQuestions - 1 ? (
            <button
              onClick={handleNext}
              disabled={!isAnswered}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 hover:bg-primary-700 text-white disabled:opacity-40 transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinishQuiz}
              disabled={Object.keys(userAnswers).length < totalQuestions}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 transition-colors font-semibold"
            >
              <Award className="w-4 h-4" /> Finish Quiz
            </button>
          )}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // RESULTS VIEW
  // ─────────────────────────────────────────────
  if (view === 'results' && quizResults) {
    const pct = Math.round((quizResults.score / quizResults.total) * 100);
    const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';
    const gradeColor = pct >= 80 ? 'text-emerald-500' : pct >= 60 ? 'text-amber-500' : 'text-rose-500';

    return (
      <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
        {/* Results Header Card */}
        <div className="glass rounded-2xl p-8 text-center border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-500/5 to-transparent pointer-events-none" />
          <Award className={`w-16 h-16 mx-auto mb-4 ${gradeColor}`} />
          <div className={`text-7xl font-black ${gradeColor} mb-2`}>{grade}</div>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            {quizResults.score} / {quizResults.total} Correct
          </p>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{pct}% Score</p>
          <p className="text-sm mt-3 text-gray-500 dark:text-gray-400">
            {pct >= 80 ? '🎉 Excellent work! You have mastered this topic.' : pct >= 60 ? '👍 Good effort! Review the missed concepts.' : '📚 Keep studying and try again!'}
          </p>
        </div>

        {/* Subtopic Breakdown */}
        {quizResults.subtopicBreakdown.length > 0 && (
          <div className="glass rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
            <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-5">
              <BarChart2 className="w-5 h-5 text-primary-600" /> Topic Mastery Breakdown
            </h3>
            <div className="space-y-4">
              {quizResults.subtopicBreakdown.map((sub, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-medium text-gray-800 dark:text-gray-200">{sub.subtopic}</span>
                    <span className="text-gray-500 dark:text-gray-400">{sub.correct}/{sub.total} ({sub.percentage}%)</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-700 ${
                        sub.percentage >= 80 ? 'bg-emerald-500' :
                        sub.percentage >= 60 ? 'bg-amber-500' :
                        'bg-rose-500'
                      }`}
                      style={{ width: `${sub.percentage}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Question Review */}
        <div className="glass rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h3 className="font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-5">
            <Target className="w-5 h-5 text-primary-600" /> Answer Review
          </h3>
          <div className="space-y-4">
            {quizResults.detailed.map((q, i) => (
              <div key={i} className={`p-4 rounded-xl border-l-4 ${
                q.isCorrect
                  ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'border-rose-500 bg-rose-50/50 dark:bg-rose-950/20'
              }`}>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="font-medium text-gray-900 dark:text-gray-100 text-sm leading-snug">
                    <span className="text-gray-500 dark:text-gray-400 mr-2">Q{i + 1}.</span>
                    {q.question}
                  </p>
                  {q.isCorrect
                    ? <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                    : <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                  }
                </div>
                <div className="text-xs space-y-1">
                  <p className="text-gray-500 dark:text-gray-400">
                    Your answer: <span className={`font-semibold ${q.isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'}`}>
                      {q.userAnswer !== undefined
                        ? (q.options ? `${q.userAnswer}. ${q.options[q.userAnswer] || ''}` : q.userAnswer)
                        : 'Not answered'}
                    </span>
                  </p>
                  {!q.isCorrect && (
                    <p className="text-gray-500 dark:text-gray-400">
                      Correct: <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                        {q.correct_answer || q.answer}
                        {q.options && q.correct_answer ? `. ${q.options[q.correct_answer]}` : ''}
                      </span>
                    </p>
                  )}
                  {q.explanation && (
                    <p className="text-gray-500 dark:text-gray-400 mt-1">💡 {q.explanation}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pb-6">
          <button
            onClick={() => { setView('list'); fetchData(); }}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors font-medium"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Quizzes
          </button>
          <button
            onClick={() => launchQuiz(activeQuiz)}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary-600 hover:bg-primary-700 text-white transition-colors font-medium shadow-lg shadow-primary-500/20"
          >
            <RefreshCw className="w-4 h-4" /> Retry Quiz
          </button>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // MAIN LIST VIEW
  // ─────────────────────────────────────────────
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
            Quiz Generator
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Upload notes or textbooks, extract topics with AI, generate smart quizzes.
          </p>
        </div>
        <button onClick={() => setShowUploadModal(true)} className="btn-primary flex items-center gap-2 shadow-lg shadow-primary-500/20">
          <Upload className="w-4 h-4" />
          Upload Document
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Documents Panel */}
        <div className="glass-card rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5 flex items-center gap-2">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg blur-md opacity-50 animate-pulse-slow" />
              <FileText className="w-5 h-5 text-blue-600 relative" />
            </div>
            Uploaded Documents
          </h2>
          {documents.length > 0 ? (
            <div className="space-y-3">
              {documents.map((doc, index) => {
                const docTopics = doc.topics ? (() => { try { return JSON.parse(doc.topics); } catch(e) { return []; } })() : [];
                return (
                  <div 
                    key={doc.id} 
                    className="group relative p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 border border-gray-200/50 dark:border-gray-700/30 hover:border-primary-400/60 hover:shadow-xl hover:shadow-primary-500/20 transition-all duration-300 card-hover animate-fade-in"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-500/0 via-primary-500/5 to-primary-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    <div className="relative flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{doc.original_name}</h3>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3 text-amber-500" />
                            {doc.chunks || 0} chunks
                          </span>
                          <span>·</span>
                          <span>{(doc.text_length / 1000).toFixed(1)}k chars</span>
                        </div>
                        {docTopics.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {docTopics.slice(0, 3).map((t, ti) => (
                              <span 
                                key={ti} 
                                className="px-2 py-0.5 text-[10px] bg-gradient-to-r from-primary-50 to-indigo-50 dark:from-primary-950/30 dark:to-indigo-950/30 text-primary-700 dark:text-primary-400 rounded-full font-medium border border-primary-100 dark:border-primary-900/50 hover:scale-110 transition-transform cursor-default"
                              >
                                {typeof t === 'object' ? t.topic : t}
                              </span>
                            ))}
                            {docTopics.length > 3 && (
                              <span className="px-2 py-0.5 text-[10px] bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                                +{docTopics.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => openQuizModal(doc)}
                        className="shrink-0 relative flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white text-xs font-semibold transition-all duration-300 shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 hover:scale-105 btn-glow"
                      >
                        <Zap className="w-3.5 h-3.5 animate-pulse" /> Generate
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-to-br from-gray-50/50 to-white/50 dark:from-gray-900/10 dark:to-gray-900/5 hover:border-primary-400/50 transition-colors duration-300">
              <div className="relative inline-block">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full blur-xl opacity-30 animate-pulse-slow" />
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3 relative animate-bounce" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">Upload a PDF, DOCX, or TXT file</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">AI will extract topics and generate quizzes from your content</p>
            </div>
          )}
        </div>

        {/* Quizzes Panel */}
        <div className="glass-card rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5 flex items-center gap-2">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg blur-md opacity-50 animate-pulse-slow" />
              <BookOpen className="w-5 h-5 text-orange-600 relative" />
            </div>
            Generated Quizzes
          </h2>
          {quizzes.length > 0 ? (
            <div className="space-y-3">
              {quizzes.map((quiz, index) => (
                <div
                  key={quiz.id}
                  className="group relative p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 border border-gray-200/50 dark:border-gray-700/30 hover:border-primary-400/60 hover:shadow-xl hover:shadow-primary-500/20 transition-all duration-300 card-hover animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/0 via-indigo-500/5 to-indigo-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${quiz.difficulty === 'easy' ? 'bg-emerald-500' : quiz.difficulty === 'medium' ? 'bg-amber-500' : 'bg-rose-500'} animate-pulse`} />
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{quiz.title}</h3>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                          <BookOpen className="w-3 h-3" />
                          {quiz.num_questions} questions
                        </span>
                        <span className={`px-2 py-0.5 text-[10px] rounded-full font-semibold capitalize ${DIFFICULTY_COLORS[quiz.difficulty] || DIFFICULTY_COLORS.medium} border border-current`}>
                          {quiz.difficulty}
                        </span>
                        <span className="text-xs bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-600 text-gray-600 dark:text-gray-400 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-600">
                          {quiz.quiz_type === 'mcq' ? 'Multiple Choice' : 'Fill in Blank'}
                        </span>
                      </div>
                      {quiz.topic && (
                        <p className="text-xs text-gray-400 mt-1 truncate flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-primary-500" />
                          {quiz.topic}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleOpenExistingQuiz(quiz)}
                      className="shrink-0 relative flex items-center gap-1.5 px-3 py-2 rounded-xl border-2 border-primary-500 text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/20 text-xs font-semibold transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-primary-500/25 btn-glow"
                    >
                      <Sparkles className="w-3.5 h-3.5 animate-pulse" /> Take Quiz
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/10 dark:bg-gray-900/5">
              <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-500 dark:text-gray-400 font-medium">No quizzes generated yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Generate a quiz from an uploaded document to get started</p>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-slide-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Upload className="w-5 h-5 text-primary-600" /> Upload Study Document
              </h2>
              <button onClick={() => setShowUploadModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleFileUpload} className="space-y-4">
              <div 
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-8 text-center hover:border-primary-500 transition-colors cursor-pointer relative"
                onClick={() => document.getElementById('quiz-file-input').click()}
              >
                <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {file ? file.name : 'Click to select or drag & drop'}
                </p>
                <input
                  id="quiz-file-input"
                  type="file"
                  onChange={e => setFile(e.target.files[0])}
                  accept=".pdf,.docx,.pptx,.txt"
                  className="hidden"
                  required
                />
                <p className="text-xs text-gray-400 dark:text-gray-500">PDF, DOCX, TXT up to 50MB</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowUploadModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={uploading || !file} className="flex-1 px-4 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20">
                  {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</> : <><Upload className="w-4 h-4" /> Upload & Extract</>}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Generate Quiz Modal */}
      {showQuizModal && selectedDoc && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-slide-in">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary-600" /> Configure Quiz
              </h2>
              <button onClick={() => setShowQuizModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerateQuiz} className="space-y-4">
              <div className="p-3 bg-primary-50 dark:bg-primary-950/30 border border-primary-200 dark:border-primary-800/50 rounded-xl">
                <p className="text-sm font-medium text-primary-700 dark:text-primary-300 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> {selectedDoc.original_name}
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Topic to Test</label>
                {topicFilter?.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {topicFilter.map((t, i) => {
                      const topicName = typeof t === 'object' ? t.topic : t;
                      return (
                        <button
                          type="button"
                          key={i}
                          onClick={() => setQuizForm(f => ({ ...f, topic: topicName }))}
                          className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-all ${
                            quizForm.topic === topicName
                              ? 'bg-primary-600 border-primary-600 text-white'
                              : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-primary-500 hover:text-primary-600'
                          }`}
                        >
                          {topicName}
                        </button>
                      );
                    })}
                  </div>
                )}
                <input
                  type="text"
                  value={quizForm.topic}
                  onChange={e => setQuizForm({ ...quizForm, topic: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none"
                  placeholder="e.g. Machine Learning, Photosynthesis..."
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">No. of Questions</label>
                  <input
                    type="number" min="1" max="20"
                    value={quizForm.numQuestions}
                    onChange={e => setQuizForm({ ...quizForm, numQuestions: parseInt(e.target.value) })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Difficulty</label>
                  <select
                    value={quizForm.difficulty}
                    onChange={e => setQuizForm({ ...quizForm, difficulty: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 outline-none"
                  >
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Quiz Format</label>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { val: 'mcq', label: 'Multiple Choice', icon: '🔵' },
                    { val: 'fill_blank', label: 'Fill in the Blank', icon: '✏️' }
                  ].map(opt => (
                    <button
                      type="button"
                      key={opt.val}
                      onClick={() => setQuizForm({ ...quizForm, quizType: opt.val })}
                      className={`p-3 rounded-xl border-2 text-sm font-medium transition-all text-center ${
                        quizForm.quizType === opt.val
                          ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/30 text-primary-700 dark:text-primary-300'
                          : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400'
                      }`}
                    >
                      <span className="text-lg">{opt.icon}</span>
                      <p className="mt-1 text-xs">{opt.label}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowQuizModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={generating}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20"
                >
                  {generating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Generating Quiz...</>
                  ) : (
                    <><Zap className="w-4 h-4" /> Generate & Start</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
