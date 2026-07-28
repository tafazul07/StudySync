// ===== API Configuration =====
const API_URL = 'http://localhost:3000/api';

// ===== State =====
let currentDocId = null;
let currentQuiz = null;
let currentQuizType = 'mcq';
let userAnswers = {};
let documents = [];

// ===== Chart Instances =====
let trendsChartInstance = null;
let topicChartInstance = null;

// ===== DOM Elements =====
const elements = {
    // Navigation
    navBtns: document.querySelectorAll('.nav-btn'),
    views: document.querySelectorAll('.view'),

    // Upload
    dropZone: document.getElementById('dropZone'),
    fileInput: document.getElementById('fileInput'),
    uploadProgress: document.getElementById('uploadProgress'),
    progressBar: document.getElementById('progressBar'),
    uploadStatus: document.getElementById('uploadStatus'),
    uploadResult: document.getElementById('uploadResult'),
    documentsContainer: document.getElementById('documentsContainer'),

    // Generate
    docSelect: document.getElementById('docSelect'),
    typeBtns: document.querySelectorAll('.type-btn'),
    topicInput: document.getElementById('topicInput'),
    numQuestions: document.getElementById('numQuestions'),
    difficulty: document.getElementById('difficulty'),
    generateBtn: document.getElementById('generateBtn'),
    topicsContainer: document.getElementById('topicsContainer'),
    topicBadgesList: document.getElementById('topicBadgesList'),

    // Quiz
    quizTitle: document.getElementById('quizTitle'),
    quizMeta: document.getElementById('quizMeta'),
    quizContainer: document.getElementById('quizContainer'),
    quizScore: document.getElementById('quizScore'),
    scoreValue: document.getElementById('scoreValue'),
    totalValue: document.getElementById('totalValue'),
    retryBtn: document.getElementById('retryBtn'),
    newQuizBtn: document.getElementById('newQuizBtn'),
    checkAllBtn: document.getElementById('checkAllBtn'),
    weakTopicsCard: document.getElementById('weakTopicsCard'),
    weakTopicsList: document.getElementById('weakTopicsList'),

    // History
    historyList: document.getElementById('historyList'),

    // Analytics
    analyticAttempts: document.getElementById('analyticAttempts'),
    analyticAvgScore: document.getElementById('analyticAvgScore'),
    analyticDocs: document.getElementById('analyticDocs'),
    analyticWeakTopic: document.getElementById('analyticWeakTopic'),
    analyticsTableBody: document.getElementById('analyticsTableBody'),

    // Status
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    ollamaBadge: document.getElementById('ollamaBadge'),
    ollamaDetails: document.getElementById('ollamaDetails'),
    dbBadge: document.getElementById('dbBadge'),
    dbDetails: document.getElementById('dbDetails'),
    modelsBadge: document.getElementById('modelsBadge'),
    modelsDetails: document.getElementById('modelsDetails'),

    // Loading
    loadingOverlay: document.getElementById('loadingOverlay'),
    loadingTip: document.getElementById('loadingTip'),

    // Toast
    toastContainer: document.getElementById('toastContainer')
};

// ===== Loading Tips =====
const loadingTips = [
    'Smaller chunks = faster generation',
    'Specific topics give better results',
    'Llama 3.3 runs in the cloud for lightning fast answers',
    'MCQ generation is faster than fill-in-blanks',
    'First upload takes longer due to embedding calculation'
];

// ===== Initialization =====
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initUpload();
    initGenerate();
    initQuizActions();
    checkHealth();
    loadDocuments();

    // Rotate loading tips
    setInterval(() => {
        if (elements.loadingTip) {
            elements.loadingTip.textContent = loadingTips[Math.floor(Math.random() * loadingTips.length)];
        }
    }, 5000);
});

// ===== Navigation =====
function initNavigation() {
    elements.navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);

            elements.navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function switchView(viewName) {
    elements.views.forEach(view => view.classList.remove('active'));

    const targetView = document.getElementById(viewName + 'View');
    if (targetView) {
        targetView.classList.add('active');
    }

    // Special handling for quiz view
    if (viewName === 'quiz' && !currentQuiz) {
        switchView('generate');
        showToast('Generate a quiz first!', 'warning');
    }

    // View specific updates
    if (viewName === 'history') {
        loadHistory();
    } else if (viewName === 'analytics') {
        loadAnalytics();
    }
}

// ===== Upload =====
function initUpload() {
    elements.dropZone.addEventListener('click', () => elements.fileInput.click());

    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length) handleFile(e.target.files[0]);
    });

    elements.dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropZone.classList.add('dragover');
    });

    elements.dropZone.addEventListener('dragleave', () => {
        elements.dropZone.classList.remove('dragover');
    });

    elements.dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length) handleFile(files[0]);
    });
}

async function handleFile(file) {
    const validTypes = ['.pdf', '.docx', '.pptx', '.txt'];
    const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();

    if (!validTypes.includes(ext)) {
        showToast('Only PDF, DOCX, PPTX, and TXT files allowed', 'error');
        return;
    }

    elements.uploadProgress.classList.remove('hidden');
    elements.uploadResult.classList.add('hidden');
    updateProgress(10, 'Uploading file...');

    const formData = new FormData();
    formData.append('file', file);

    try {
        updateProgress(30, 'Uploading to server...');

        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        updateProgress(65, 'Analyzing concepts & extracting topics...');

        const data = await response.json();

        if (data.success) {
            updateProgress(100, 'Complete!');

            const embeddedCount = data.embedded !== undefined ? data.embedded : data.chunks;

            elements.uploadResult.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <span style="font-size:2rem;">✅</span>
                    <div>
                        <strong style="font-size:1.1rem;">Upload Successful!</strong>
                        <p style="color:var(--text-muted);margin-top:2px;">${file.name}</p>
                    </div>
                </div>
                <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px;">
                    <div style="background:rgba(0,212,255,0.1);padding:12px;border-radius:8px;text-align:center;">
                        <div style="font-size:1.3rem;font-weight:700;color:var(--accent-cyan);">${data.chunks}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">Chunks</div>
                    </div>
                    <div style="background:rgba(0,255,136,0.1);padding:12px;border-radius:8px;text-align:center;">
                        <div style="font-size:1.3rem;font-weight:700;color:var(--accent-green);">${embeddedCount}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">Embedded</div>
                    </div>
                    <div style="background:rgba(123,44,191,0.1);padding:12px;border-radius:8px;text-align:center;">
                        <div style="font-size:1.3rem;font-weight:700;color:var(--accent-purple);">${(data.textLength / 1000).toFixed(1)}K</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">Characters</div>
                    </div>
                </div>
                <p style="margin-top:12px;color:var(--text-muted);font-size:0.9rem;">
                    <strong>Preview:</strong> ${data.preview}
                </p>
            `;
            elements.uploadResult.classList.remove('hidden');

            showToast('Document uploaded and topics extracted!', 'success');

            await loadDocuments();

            setTimeout(() => {
                document.querySelector('[data-view="generate"]').click();
            }, 1000);

        } else {
            throw new Error(data.error || 'Upload failed');
        }
    } catch (error) {
        elements.uploadResult.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:2rem;">❌</span>
                <div>
                    <strong style="color:var(--accent-red);">Upload Failed</strong>
                    <p style="color:var(--text-muted);margin-top:4px;">${error.message}</p>
                </div>
            </div>
        `;
        elements.uploadResult.classList.add('error');
        elements.uploadResult.classList.remove('hidden');
        showToast(error.message, 'error');
    } finally {
        setTimeout(() => elements.uploadProgress.classList.add('hidden'), 1500);
        elements.fileInput.value = '';
    }
}

function updateProgress(percent, status) {
    elements.progressBar.style.width = percent + '%';
    elements.uploadStatus.textContent = status;
}

// ===== Document Management =====
async function loadDocuments() {
    try {
        const response = await fetch(`${API_URL}/upload/documents`);
        const data = await response.json();

        documents = data.documents || [];
        renderDocuments();
        updateDocSelect();

    } catch (error) {
        console.error('Failed to load documents:', error);
    }
}

function renderDocuments() {
    if (documents.length === 0) {
        elements.documentsContainer.innerHTML = '<p class="empty-state">No documents uploaded yet</p>';
        return;
    }

    const fileIcons = {
        pdf: '📄',
        docx: '📝',
        pptx: '📊',
        txt: '📃'
    };

    elements.documentsContainer.innerHTML = documents.map(doc => `
        <div class="doc-item ${doc.id === currentDocId ? 'selected' : ''}" data-id="${doc.id}" onclick="selectDocument(${doc.id})">
            <div class="doc-info">
                <span class="doc-icon">${fileIcons[doc.file_type] || '📄'}</span>
                <div class="doc-meta">
                    <h4>${escapeHtml(doc.original_name)}</h4>
                    <small>${doc.file_type.toUpperCase()} • ${formatDate(doc.created_at)}</small>
                </div>
            </div>
            <div class="doc-actions">
                <button class="doc-btn" onclick="event.stopPropagation();deleteDocument(${doc.id})">🗑️</button>
            </div>
        </div>
    `).join('');
}

function updateDocSelect() {
    elements.docSelect.innerHTML = '<option value="">-- Choose a document --</option>' +
        documents.map(doc => `<option value="${doc.id}">${escapeHtml(doc.original_name)}</option>`).join('');

    if (currentDocId) {
        elements.docSelect.value = currentDocId;
        renderTopicBadgesForDoc(currentDocId);
    } else if (documents.length === 1) {
        elements.docSelect.value = documents[0].id;
        currentDocId = documents[0].id;
        renderTopicBadgesForDoc(currentDocId);
    } else {
        renderTopicBadgesForDoc(null);
    }

    updateGenerateButton();
}

function selectDocument(id) {
    currentDocId = id;
    renderDocuments();
    elements.docSelect.value = id;
    renderTopicBadgesForDoc(id);
    updateGenerateButton();
    showToast('Document selected', 'success');
}

function renderTopicBadgesForDoc(docId) {
    if (!docId) {
        elements.topicsContainer.style.display = 'none';
        elements.topicBadgesList.innerHTML = '';
        return;
    }

    const doc = documents.find(d => d.id === parseInt(docId));
    if (doc && doc.topics && doc.topics.length > 0) {
        elements.topicsContainer.style.display = 'block';
        elements.topicBadgesList.innerHTML = doc.topics.map(t => `
            <div class="topic-badge" title="${escapeHtml(t.description)}" onclick="selectTopicBadge(this, '${escapeHtml(t.topic).replace(/'/g, "\\'")}')">
                <span>🏷️</span>
                <strong>${escapeHtml(t.topic)}</strong>
            </div>
        `).join('');
    } else {
        elements.topicsContainer.style.display = 'none';
        elements.topicBadgesList.innerHTML = '';
    }
}

function selectTopicBadge(element, topicName) {
    elements.topicBadgesList.querySelectorAll('.topic-badge').forEach(b => b.classList.remove('active'));
    element.classList.add('active');
    elements.topicInput.value = topicName;
    updateGenerateButton();
    showToast(`Topic selected: ${topicName}`, 'info');
}

async function deleteDocument(id) {
    if (!confirm('Delete this document? All associated chunks and quizzes will be removed.')) return;

    try {
        await fetch(`${API_URL}/upload/documents/${id}`, { method: 'DELETE' });
        showToast('Document deleted', 'success');

        if (currentDocId === id) {
            currentDocId = null;
            elements.docSelect.value = '';
            renderTopicBadgesForDoc(null);
        }

        await loadDocuments();
        updateGenerateButton();
    } catch (error) {
        showToast('Failed to delete document', 'error');
    }
}

// ===== Generate Quiz =====
function initGenerate() {
    elements.typeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.typeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentQuizType = btn.dataset.type;
        });
    });

    elements.docSelect.addEventListener('change', (e) => {
        currentDocId = e.target.value ? parseInt(e.target.value) : null;
        renderTopicBadgesForDoc(currentDocId);
        updateGenerateButton();
    });

    elements.generateBtn.addEventListener('click', generateQuiz);
    elements.topicInput.addEventListener('input', updateGenerateButton);
}

function updateGenerateButton() {
    const hasDoc = currentDocId !== null;
    const hasTopic = elements.topicInput.value.trim().length > 0;
    elements.generateBtn.disabled = !(hasDoc && hasTopic);
}

async function generateQuiz() {
    const topic = elements.topicInput.value.trim();
    const numQuestions = parseInt(elements.numQuestions.value);
    const difficulty = elements.difficulty.value;

    if (!currentDocId || !topic) return;

    elements.loadingOverlay.classList.remove('hidden');
    elements.generateBtn.disabled = true;

    try {
        const response = await fetch(`${API_URL}/quiz/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                docId: currentDocId,
                topic,
                numQuestions,
                quizType: currentQuizType,
                difficulty
            })
        });

        const data = await response.json();

        if (data.success) {
            currentQuiz = data.quiz;
            userAnswers = {};
            displayQuiz(data.quiz, data.meta);
            switchView('quiz');
            showToast(`Quiz generated in ${data.meta.generationTime}!`, 'success');
        } else {
            throw new Error(data.error || 'Failed to generate quiz');
        }
    } catch (error) {
        showToast(error.message, 'error');
        console.error('Quiz generation error:', error);
    } finally {
        elements.loadingOverlay.classList.add('hidden');
        elements.generateBtn.disabled = false;
    }
}

// ===== Display Quiz =====
function displayQuiz(quizData, meta) {
    elements.quizTitle.textContent = quizData.quiz.title || 'Generated Quiz';
    elements.quizMeta.textContent = `${meta.quizType === 'mcq' ? 'Multiple Choice' : 'Fill in the Blanks'} • Topic: ${meta.topic} • ${(meta.difficulty || 'medium').toUpperCase()}`;

    elements.quizScore.classList.add('hidden');
    elements.weakTopicsCard.classList.add('hidden');
    elements.quizContainer.innerHTML = '';

    quizData.quiz.questions.forEach((q, index) => {
        const card = document.createElement('div');
        card.className = 'question-card';
        card.dataset.index = index;
        card.dataset.subtopic = q.subtopic || 'General Concepts';

        if (meta.quizType === 'mcq') {
            card.innerHTML = renderMCQ(q, index);
        } else {
            card.innerHTML = renderFillBlank(q, index);
        }

        elements.quizContainer.appendChild(card);
    });

    elements.totalValue.textContent = quizData.quiz.questions.length;
    elements.scoreValue.textContent = '0';
}

function renderMCQ(q, index) {
    const subtopic = q.subtopic || 'General Concepts';
    return `
        <div class="question-header">
            <div class="question-number">${index + 1}</div>
            <div style="flex:1;">
                <div class="question-text">${escapeHtml(q.question)}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Concept: ${escapeHtml(subtopic)}</div>
            </div>
        </div>
        <div class="options-list" data-correct="${q.correct_answer}" data-answered="false">
            ${['A', 'B', 'C', 'D'].map(key => `
                <div class="option-item" data-key="${key}" onclick="selectOption(this, ${index})">
                    <div class="option-key">${key}</div>
                    <div class="option-text">${escapeHtml(q.options[key])}</div>
                </div>
            `).join('')}
        </div>
        <div class="explanation hidden" id="exp-${index}">
            <strong>✓ Correct Answer: ${q.correct_answer}</strong><br>
            <p style="margin-top:4px; margin-bottom:12px;">${escapeHtml(q.explanation || 'No explanation provided.')}</p>
            <div style="display:flex; gap:10px;">
                <button class="adaptive-hint-btn" onclick="revealContextHint(this, ${index})">💡 Review Document Context</button>
                <button class="adaptive-helper-btn" onclick="generateHelperQuestion(this, ${index}, '${escapeHtml(subtopic).replace(/'/g, "\\'")}')">🧩 Simpler Helper Question</button>
            </div>
            <div class="helper-context-box hidden" style="margin-top:12px; padding:12px; background:rgba(0,212,255,0.05); border-left:3px solid var(--accent-cyan); border-radius:4px; font-size:0.85rem; line-height:1.5;"></div>
            <div class="helper-card hidden" id="helper-card-${index}"></div>
        </div>
    `;
}

function renderFillBlank(q, index) {
    const subtopic = q.subtopic || 'General Concepts';
    const questionWithBlank = escapeHtml(q.question).replace(
        '_____',
        `<input type="text" class="blank-input" id="blank-${index}" placeholder="Type answer..." onkeydown="if(event.key==='Enter')checkBlank(${index}, '${escapeHtml(q.answer).replace(/'/g, "\'")}')">`
    );

    return `
        <div class="question-header">
            <div class="question-number">${index + 1}</div>
            <div style="flex:1;">
                <div class="question-text">${questionWithBlank}</div>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">Concept: ${escapeHtml(subtopic)}</div>
            </div>
        </div>
        ${q.hint ? `<div style="margin-left:48px;margin-bottom:12px;color:var(--text-muted);font-size:0.9rem;">💡 Hint: ${escapeHtml(q.hint)}</div>` : ''}
        <button class="check-btn" onclick="checkBlank(${index}, '${escapeHtml(q.answer).replace(/'/g, "\'")}')">Check Answer</button>
        <div class="explanation hidden" id="exp-${index}">
            <strong>✓ Correct Answer: ${escapeHtml(q.answer)}</strong>
            <p style="margin-top:8px; margin-bottom:12px; line-height:1.4;">Verify this keyword matches document findings.</p>
            <div style="display:flex; gap:10px;">
                <button class="adaptive-hint-btn" onclick="revealContextHint(this, ${index})">💡 Review Document Context</button>
                <button class="adaptive-helper-btn" onclick="generateHelperQuestion(this, ${index}, '${escapeHtml(subtopic).replace(/'/g, "\\'")}')">🧩 Simpler Helper Question</button>
            </div>
            <div class="helper-context-box hidden" style="margin-top:12px; padding:12px; background:rgba(0,212,255,0.05); border-left:3px solid var(--accent-cyan); border-radius:4px; font-size:0.85rem; line-height:1.5;"></div>
            <div class="helper-card hidden" id="helper-card-${index}"></div>
        </div>
    `;
}

// ===== Adaptive Helper Logic =====
function revealContextHint(button, index) {
    const card = button.closest('.question-card');
    const hintBox = card.querySelector('.helper-context-box');
    if (!hintBox) return;

    button.disabled = true;
    hintBox.classList.remove('hidden');
    hintBox.innerHTML = '🔍 Scanning document context chunks...';

    setTimeout(async () => {
        try {
            if (!currentDocId) {
                hintBox.innerHTML = 'ℹ️ Review the main document description details.';
                return;
            }
            const response = await fetch(`${API_URL}/upload/documents/${currentDocId}`);
            const data = await response.json();
            const doc = data.document;
            if (doc && doc.preview) {
                hintBox.innerHTML = `💡 <strong>Context Source Fragment:</strong> "...${escapeHtml(doc.preview)}..."`;
            } else {
                hintBox.innerHTML = 'ℹ️ Focus on concepts defined in the question explanation above.';
            }
        } catch (err) {
            hintBox.innerHTML = 'ℹ️ Unable to load context from backend.';
        }
    }, 700);
}

async function generateHelperQuestion(button, index, subtopic) {
    const helperCard = document.getElementById(`helper-card-${index}`);
    if (!helperCard) return;

    button.disabled = true;
    button.textContent = '⏳ Loading Helper...';
    helperCard.classList.remove('hidden');
    helperCard.innerHTML = `
        <div style="text-align:center; padding:16px;">
            <div class="btn-spinner" style="display:inline-block; font-size:1.5rem; margin-bottom:8px;">⏳</div>
            <p style="font-size:0.85rem; color:var(--text-secondary);">Creating a simpler Concept Builder question on "${escapeHtml(subtopic)}"...</p>
        </div>
    `;

    try {
        const response = await fetch(`${API_URL}/quiz/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                docId: currentDocId,
                topic: subtopic,
                numQuestions: 1,
                quizType: 'mcq',
                difficulty: 'easy'
            })
        });

        const data = await response.json();
        if (data.success && data.quiz && data.quiz.quiz.questions.length > 0) {
            const hq = data.quiz.quiz.questions[0];
            helperCard.innerHTML = `
                <div style="border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <strong style="color:var(--accent-cyan); font-size:0.9rem;">🧩 Concept Builder Question (Easy)</strong>
                    <span class="helper-close" onclick="this.closest('.helper-card').classList.add('hidden')">✖</span>
                </div>
                <div style="font-size:0.9rem; margin-bottom:10px; line-height:1.4;">${escapeHtml(hq.question)}</div>
                <div style="display:flex; flex-direction:column; gap:6px; margin-left:12px;">
                    ${['A', 'B', 'C', 'D'].map(key => `
                        <div class="option-item" style="padding:8px 12px; font-size:0.85rem;" onclick="checkHelperOption(this, '${key}', '${hq.correct_answer}', '${escapeHtml(hq.explanation).replace(/'/g, "\\'")}')">
                            <span style="font-weight:700; margin-right:8px;">${key}</span>
                            <span>${escapeHtml(hq.options[key])}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="helper-explanation hidden" style="margin-top:10px; padding:8px; background:rgba(0,255,136,0.08); border-left:3px solid var(--accent-green); border-radius:4px; font-size:0.85rem;"></div>
            `;
            button.textContent = '🧩 Helper Generated';
        } else {
            throw new Error('Helper generator returned empty quiz.');
        }
    } catch (err) {
        helperCard.innerHTML = `<p style="color:var(--accent-red); font-size:0.85rem; text-align:center;">Failed to generate helper question: ${escapeHtml(err.message)}</p>`;
        button.textContent = '❌ Try Again';
        button.disabled = false;
    }
}

function checkHelperOption(element, selectedKey, correctKey, explanation) {
    const parent = element.parentElement;
    const items = parent.querySelectorAll('.option-item');
    items.forEach(item => {
        item.style.pointerEvents = 'none';
        item.style.opacity = '0.7';
    });

    if (selectedKey === correctKey) {
        element.style.borderColor = 'var(--accent-green)';
        element.style.background = 'rgba(0, 255, 136, 0.15)';
        element.style.opacity = '1';
    } else {
        element.style.borderColor = 'var(--accent-red)';
        element.style.background = 'rgba(255, 71, 87, 0.15)';
        element.style.opacity = '1';
        items.forEach(item => {
            if (item.innerText.startsWith(correctKey)) {
                item.style.borderColor = 'var(--accent-green)';
                item.style.background = 'rgba(0, 255, 136, 0.15)';
                item.style.opacity = '1';
            }
        });
    }

    const expBox = parent.nextElementSibling;
    if (expBox) {
        expBox.innerHTML = `<strong>✓ Answer: ${correctKey}</strong><br>${explanation}`;
        expBox.classList.remove('hidden');
    }
}

// ===== Quiz Interaction =====
function selectOption(element, questionIndex) {
    const optionsContainer = element.parentElement;
    if (optionsContainer.dataset.answered === 'true') return;

    const correctKey = optionsContainer.dataset.correct;
    const selectedKey = element.dataset.key;
    const allOptions = optionsContainer.querySelectorAll('.option-item');

    optionsContainer.dataset.answered = 'true';
    userAnswers[questionIndex] = selectedKey;

    element.classList.add('selected');

    allOptions.forEach(opt => {
        opt.classList.add('disabled');
        if (opt.dataset.key === correctKey) {
            opt.classList.add('correct');
        } else if (opt.dataset.key === selectedKey && selectedKey !== correctKey) {
            opt.classList.add('wrong');
        }
    });

    document.getElementById(`exp-${questionIndex}`).classList.remove('hidden');
    updateScore();
}

function checkBlank(index, correctAnswer) {
    const input = document.getElementById(`blank-${index}`);
    if (!input || input.disabled) return;

    const userAnswer = input.value.trim().toLowerCase();
    const correct = correctAnswer.toLowerCase();

    const isCorrect = userAnswer === correct || 
                      correct.includes(userAnswer) && userAnswer.length > 2 ||
                      userAnswer.includes(correct) && correct.length > 2 ||
                      levenshteinDistance(userAnswer, correct) <= 2;

    input.classList.add(isCorrect ? 'correct' : 'wrong');
    input.disabled = true;

    const btn = input.closest('.question-card').querySelector('.check-btn');
    if (btn) btn.style.display = 'none';

    document.getElementById(`exp-${index}`).classList.remove('hidden');

    userAnswers[index] = isCorrect ? 'correct' : 'wrong';
    updateScore();
}

function updateScore() {
    const cards = document.querySelectorAll('.question-card');
    let correct = 0;
    let answered = 0;

    const subtopicStats = {};

    cards.forEach((card, index) => {
        const subtopic = card.dataset.subtopic || 'General Concepts';
        if (!subtopicStats[subtopic]) {
            subtopicStats[subtopic] = { correct: 0, total: 0 };
        }
        subtopicStats[subtopic].total++;

        let isCorrect = false;
        let isAnswered = false;

        if (currentQuizType === 'mcq') {
            const optionsContainer = card.querySelector('.options-list');
            if (optionsContainer && optionsContainer.dataset.answered === 'true') {
                isAnswered = true;
                answered++;
                const selected = card.querySelector('.option-item.selected');
                if (selected && selected.dataset.key === optionsContainer.dataset.correct) {
                    isCorrect = true;
                    correct++;
                }
            }
        } else {
            const input = card.querySelector('.blank-input');
            if (input && input.disabled) {
                isAnswered = true;
                answered++;
                if (input.classList.contains('correct')) {
                    isCorrect = true;
                    correct++;
                }
            }
        }

        if (isCorrect) {
            subtopicStats[subtopic].correct++;
        }
    });

    if (answered === cards.length) {
        elements.quizScore.classList.remove('hidden');
        elements.scoreValue.textContent = correct;
        elements.totalValue.textContent = cards.length;

        const percentage = (correct / cards.length * 100).toFixed(0);
        let message = '';
        if (percentage >= 80) message = '🎉 Excellent!';
        else if (percentage >= 60) message = '👍 Good job!';
        else if (percentage >= 40) message = '💪 Keep practicing!';
        else message = '📚 Review the material!';

        showToast(`${message} You scored ${correct}/${cards.length} (${percentage}%)`, 'success');

        const subtopicBreakdown = Object.keys(subtopicStats).map(name => {
            const stats = subtopicStats[name];
            return {
                subtopic: name,
                correct: stats.correct,
                total: stats.total,
                percentage: Math.round((stats.correct / stats.total) * 100)
            };
        });

        // Render Weak Topic Analysis
        elements.weakTopicsList.innerHTML = subtopicBreakdown.map(sub => {
            let barClass = 'good';
            if (sub.percentage < 40) barClass = 'danger';
            else if (sub.percentage < 70) barClass = 'warn';

            return `
                <div class="weak-topic-row">
                    <div class="weak-topic-info">
                        <div class="weak-topic-name">${escapeHtml(sub.subtopic)}</div>
                        <div class="weak-topic-percentage">${sub.correct}/${sub.total} correct (${sub.percentage}%)</div>
                    </div>
                    <div class="weak-topic-bar-wrapper">
                        <div class="weak-topic-bar ${barClass}" style="width: ${sub.percentage}%;"></div>
                    </div>
                </div>
            `;
        }).join('');
        elements.weakTopicsCard.classList.remove('hidden');

        // Log attempt to backend
        submitQuizAttempt(correct, cards.length, subtopicBreakdown);
    }
}

async function submitQuizAttempt(score, totalQuestions, subtopicBreakdown) {
    try {
        const topic = elements.topicInput.value.trim();
        const difficulty = elements.difficulty.value;
        
        await fetch(`${API_URL}/quiz/submit-attempt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                docId: currentDocId,
                topic,
                quizType: currentQuizType,
                difficulty,
                totalQuestions,
                score,
                subtopicBreakdown
            })
        });
        console.log('✅ Attempt saved for analytics.');
    } catch (err) {
        console.warn('Failed to submit attempt statistics:', err);
    }
}

// Simple Levenshtein distance for fuzzy matching
function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

// ===== Quiz Actions =====
function initQuizActions() {
    elements.retryBtn.addEventListener('click', () => {
        if (currentQuiz) {
            userAnswers = {};
            displayQuiz(currentQuiz, {
                quizType: currentQuizType,
                topic: elements.topicInput.value,
                difficulty: elements.difficulty.value,
                numQuestions: currentQuiz.quiz.questions.length
            });
        }
    });

    elements.newQuizBtn.addEventListener('click', () => {
        currentQuiz = null;
        userAnswers = {};
        switchView('generate');
    });

    elements.checkAllBtn.addEventListener('click', () => {
        if (currentQuizType === 'fill_blank') {
            currentQuiz.quiz.questions.forEach((q, i) => {
                const input = document.getElementById(`blank-${i}`);
                if (input && !input.disabled) {
                    checkBlank(i, q.answer);
                }
            });
        }
    });
}

// ===== History Panel =====
async function loadHistory() {
    try {
        const response = await fetch(`${API_URL}/quiz`);
        const data = await response.json();
        const quizzes = data.quizzes || [];

        if (quizzes.length === 0) {
            elements.historyList.innerHTML = '<p class="empty-state">No quizzes generated yet</p>';
            return;
        }

        elements.historyList.innerHTML = quizzes.map(q => {
            const dateStr = q.created_at ? formatDate(q.created_at) : 'Unknown Date';
            return `
                <div class="history-item" onclick="retakeQuiz(${q.id})">
                    <div class="history-info">
                        <h4>${escapeHtml(q.questions.quiz.title || q.topic)}</h4>
                        <div class="history-meta">
                            <span class="history-badge ${q.quiz_type}">${q.quiz_type === 'mcq' ? 'MCQ' : 'Fill In Blank'}</span>
                            <span>🎯 Topic: ${escapeHtml(q.topic)}</span>
                            <span>Difficulty: ${(q.difficulty || 'medium').toUpperCase()}</span>
                            <span>📅 ${dateStr}</span>
                        </div>
                    </div>
                    <button class="action-btn secondary" style="padding: 8px 16px;">Retake 🔄</button>
                </div>
            `;
        }).join('');

    } catch (error) {
        console.error('Failed to load history:', error);
        elements.historyList.innerHTML = '<p class="empty-state" style="color:var(--accent-red);">Failed to load history</p>';
    }
}

async function retakeQuiz(id) {
    try {
        const response = await fetch(`${API_URL}/quiz/${id}`);
        const data = await response.json();

        if (data.quiz) {
            currentQuiz = data.quiz.questions;
            currentQuizType = data.quiz.quiz_type;
            currentDocId = data.quiz.doc_id;
            userAnswers = {};

            elements.topicInput.value = data.quiz.topic;
            elements.difficulty.value = data.quiz.difficulty || 'medium';
            elements.docSelect.value = currentDocId || '';

            displayQuiz(currentQuiz, {
                quizType: data.quiz.quiz_type,
                topic: data.quiz.topic,
                difficulty: data.quiz.difficulty || 'medium',
                numQuestions: currentQuiz.quiz.questions.length
            });

            switchView('quiz');

            elements.navBtns.forEach(btn => btn.classList.remove('active'));
            document.querySelector('[data-view="generate"]').classList.add('active');

            showToast('Loading quiz template...', 'success');
        } else {
            showToast('Quiz template not found', 'error');
        }
    } catch (error) {
        showToast('Error loading quiz template', 'error');
    }
}

// ===== Analytics Panel =====
async function loadAnalytics() {
    try {
        const response = await fetch(`${API_URL}/quiz/analytics`);
        const data = await response.json();

        if (!data.success) {
            showToast('Failed to load analytics data', 'error');
            return;
        }

        elements.analyticAttempts.textContent = data.summary.totalAttempts;
        elements.analyticAvgScore.textContent = data.summary.averageScore;
        elements.analyticDocs.textContent = data.summary.activeDocs;
        elements.analyticWeakTopic.textContent = data.summary.topWeakTopic;
        elements.analyticWeakTopic.title = data.summary.topWeakTopic;

        const attempts = data.recentAttempts || [];
        if (attempts.length === 0) {
            elements.analyticsTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="empty-state" style="text-align: center;">No quiz attempts logged yet.</td>
                </tr>
            `;
        } else {
            elements.analyticsTableBody.innerHTML = attempts.map(a => {
                const dateStr = a.created_at ? formatDate(a.created_at) : 'Unknown';
                const percentage = Math.round((a.score / a.totalQuestions) * 100);
                let scoreClass = 'text-green';
                if (percentage < 40) scoreClass = 'text-red';
                else if (percentage < 70) scoreClass = 'text-yellow';

                return `
                    <tr>
                        <td>${dateStr}</td>
                        <td>Document #${a.docId || 'N/A'}</td>
                        <td>${escapeHtml(a.topic)}</td>
                        <td><span class="difficulty-badge ${a.difficulty || 'medium'}">${(a.difficulty || 'medium').toUpperCase()}</span></td>
                        <td>${a.quizType === 'mcq' ? 'MCQ' : 'Fill In Blank'}</td>
                        <td><strong class="${scoreClass}">${a.score}/${a.totalQuestions} (${percentage}%)</strong></td>
                    </tr>
                `;
            }).join('');
        }

        renderCharts(data.trends, data.topicMastery);

    } catch (error) {
        console.error('Error loading analytics:', error);
        showToast('Error loading analytics dashboard', 'error');
    }
}

function renderCharts(trends, topicMastery) {
    const trendsCanvas = document.getElementById('trendsChart');
    const topicCanvas = document.getElementById('topicChart');

    if (!trendsCanvas || !topicCanvas) return;

    const trendsCtx = trendsCanvas.getContext('2d');
    const topicCtx = topicCanvas.getContext('2d');

    if (trendsChartInstance) trendsChartInstance.destroy();
    if (topicChartInstance) topicChartInstance.destroy();

    const trendsLabels = trends.map(t => t.date);
    const trendsData = trends.map(t => t.score);

    trendsChartInstance = new Chart(trendsCtx, {
        type: 'line',
        data: {
            labels: trendsLabels.length > 0 ? trendsLabels : ['No Attempts'],
            datasets: [{
                label: 'Score (%)',
                data: trendsData.length > 0 ? trendsData : [0],
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });

    const masteryLabels = topicMastery.map(t => t.subtopic);
    const masteryData = topicMastery.map(t => t.percentage);

    topicChartInstance = new Chart(topicCtx, {
        type: 'bar',
        data: {
            labels: masteryLabels.length > 0 ? masteryLabels : ['No Concepts'],
            datasets: [{
                label: 'Mastery (%)',
                data: masteryData.length > 0 ? masteryData : [0],
                backgroundColor: 'rgba(123, 44, 191, 0.6)',
                borderColor: '#7b2cbf',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { min: 0, max: 100, grid: { color: 'rgba(255,255,255,0.05)' } },
                x: { grid: { display: false } }
            }
        }
    });
}

// ===== Health Check =====
async function checkHealth() {
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();

        if (data.status === 'ok' || data.status === 'missing_api_key') {
            const online = data.status === 'ok';
            elements.statusDot.classList.add(online ? 'online' : 'offline');
            elements.statusDot.classList.remove(online ? 'offline' : 'online');
            elements.statusText.textContent = online ? 'Online' : 'Config Error';

            elements.ollamaBadge.textContent = online ? 'Active' : 'Key Missing';
            elements.ollamaBadge.className = `status-badge ${online ? 'online' : 'offline'}`;
            elements.ollamaDetails.textContent = online ? 'Connected to OpenRouter' : 'Set OPENROUTER_API_KEY in .env';

            elements.dbBadge.textContent = 'Active';
            elements.dbBadge.className = 'status-badge online';
            elements.dbDetails.textContent = data.storage;

            elements.modelsBadge.textContent = 'Ready';
            elements.modelsBadge.className = 'status-badge online';
            elements.modelsDetails.textContent = `Model: ${data.openrouter.model}`;
        } else {
            throw new Error(data.message || 'System status check failed');
        }
    } catch (error) {
        elements.statusDot.className = 'status-dot offline';
        elements.statusText.textContent = 'Offline';

        elements.ollamaBadge.textContent = 'Offline';
        elements.ollamaBadge.className = 'status-badge offline';
        elements.ollamaDetails.textContent = error.message;

        elements.dbBadge.textContent = 'Unknown';
        elements.dbBadge.className = 'status-badge warning';
        elements.dbDetails.textContent = 'Unable to access JSON database';

        elements.modelsBadge.textContent = 'Unknown';
        elements.modelsBadge.className = 'status-badge warning';
        elements.modelsDetails.textContent = 'Verify backend server connection';
    }
}

// ===== Toast Notifications =====
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type]}</span>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;

    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// ===== Utility Functions =====
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}