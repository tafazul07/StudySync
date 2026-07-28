// ===== BRAIN SYNC - Collaborative Editor =====
// Uses Import Map with BARE SPECIFIERS to ensure single Yjs instance
// CRITICAL: All imports must use bare specifiers (e.g., 'yjs') NOT full URLs

import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCursor from '@tiptap/extension-collaboration-cursor';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// ===== CONFIG =====
const API_URL = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:1234';
const COLORS = ['#e91e63','#9c27b0','#673ab7','#3f51b5','#2196f3','#009688','#ff9800','#ff5722','#795548','#607d8b'];

const ME = {
    id: Math.floor(Math.random() * 100000),
    name: 'User ' + Math.floor(Math.random() * 1000),
    color: COLORS[Math.floor(Math.random() * COLORS.length)]
};

// ===== STATE =====
let editor = null;
let provider = null;
let ydoc = null;
let docId = null;
let saveTimer = null;
let permissions = {};
let currentVersionId = null;

// ===== DOM HELPERS =====
function $(sel) { return document.querySelector(sel); }
function setStatus(text, type = 'normal') {
    const el = $('#save-status');
    el.textContent = text;
    el.classList.add('show');
    el.className = 'bs-save-status show ' + (type === 'error' ? 'error' : type === 'saving' ? 'saving' : '');
}
function hideStatus() { setTimeout(() => $('#save-status').classList.remove('show'), 2000); }
function setLoadingDetail(text) { const el = $('#loading-detail'); if (el) el.textContent = text; }
function showEditor() {
    $('#editor-loading').style.display = 'none';
    $('#editor').style.display = 'block';
    $('#editor-error').style.display = 'none';
}
function showError(title, message, detail = '') {
    $('#editor-loading').style.display = 'none';
    $('#editor').style.display = 'none';
    const err = $('#editor-error');
    err.style.display = 'flex';
    err.querySelector('h3').textContent = title;
    $('#error-message').textContent = message;
    $('#error-detail').textContent = detail;
}
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===== PARAGRAPH ID EXTENSION =====
const ParagraphId = Extension.create({
    name: 'paragraphId',
    addGlobalAttributes() {
        return [{
            types: ['paragraph'],
            attributes: {
                id: {
                    default: null,
                    parseHTML: el => el.getAttribute('data-id'),
                    renderHTML: attrs => attrs.id ? { 'data-id': attrs.id } : {}
                }
            }
        }];
    }
});

// ===== INIT =====
async function init() {
    setStatus('Loading...');
    setLoadingDetail('Initializing modules...');

    try {
        // Verify Yjs is loaded correctly (single instance check)
        console.log('Yjs instance check:', Y.Doc ? 'OK' : 'FAIL', 'Shared Types:', !!Y.Text);

        // STEP 1: Get/create document
        setLoadingDetail('Setting up document...');
        const urlParams = new URLSearchParams(window.location.search);
        docId = urlParams.get('doc');

        if (!docId) {
            const res = await fetch(`${API_URL}/documents`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: 'Untitled document' })
            });
            if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
            const doc = await res.json();
            docId = doc.id;
            window.history.replaceState({}, '', `?doc=${docId}`);
        }

        // STEP 2: Load metadata
        setLoadingDetail('Loading document info...');
        await loadDocList();
        const docsRes = await fetch(`${API_URL}/documents`);
        const docs = await docsRes.json();
        const current = docs.find(d => d.id === docId);
        if (current) {
            $('#doc-title').value = current.title;
        }

        // STEP 3: Load permissions
        setLoadingDetail('Loading permissions...');
        await loadPermissions();

        // STEP 4: Setup Yjs document
        setLoadingDetail('Preparing real-time sync...');
        ydoc = new Y.Doc();

        // Load persisted content
        try {
            const contentRes = await fetch(`${API_URL}/documents/${docId}/content`);
            const contentData = await contentRes.json();
            if (contentData.update) {
                const binary = Uint8Array.from(atob(contentData.update), c => c.charCodeAt(0));
                Y.applyUpdate(ydoc, binary);
            }
        } catch (e) {
            console.log('No persisted content, starting fresh');
        }

        // STEP 5: Connect Yjs WebSocket
        setLoadingDetail('Connecting to collaboration server...');
        let useCollab = false;

        try {
            provider = new WebsocketProvider(WS_URL, docId, ydoc);

            await new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    reject(new Error('Yjs connection timeout (5s)'));
                }, 5000);

                provider.on('status', event => {
                    console.log('Yjs status:', event.status);
                    if (event.status === 'connected') {
                        clearTimeout(timer);
                        resolve();
                    }
                });
            });

            useCollab = true;
            setStatus('Collaboration connected');
        } catch (wsErr) {
            console.warn('Yjs WebSocket unavailable, running solo mode:', wsErr.message);
            provider = null;
        }

        // STEP 6: Build TipTap editor
        setLoadingDetail('Starting editor...');
        const extensions = [
            StarterKit.configure({ 
                history: !useCollab,
                heading: { levels: [1, 2, 3] }
            }),
            ParagraphId
        ];

        if (useCollab && provider) {
            extensions.push(
                Collaboration.configure({ document: ydoc }),
                CollaborationCursor.configure({
                    provider: provider,
                    user: { name: ME.name, color: ME.color }
                })
            );
        }

        editor = new Editor({
            element: $('#editor'),
            extensions: extensions,
            onUpdate: () => {
                setStatus('Saving...', 'saving');
                debouncedSave();
                updateToolbarState();
                ensureParagraphIds();
                updateTOC();
            },
            onSelectionUpdate: () => {
                updateToolbarState();
            },
            onCreate: () => {
                showEditor();
                ensureParagraphIds();
                updateTOC();
            }
        });

        // STEP 7: Setup UI
        setupToolbar();
        setupSidebar();
        setupComments();
        setupPermissions();
        setupAI();
        setupTitle();
        setupTOC();
        setupVersions();
        setupKeyboardShortcuts();

        // Show user avatar
        const avatarDiv = document.createElement('div');
        avatarDiv.className = 'bs-avatar';
        avatarDiv.style.background = ME.color;
        avatarDiv.textContent = ME.name.charAt(0).toUpperCase();
        avatarDiv.title = ME.name;
        $('#user-avatars').appendChild(avatarDiv);

        // Auto-save loop
        setInterval(() => saveDocument(), 10000);
        window.addEventListener('beforeunload', () => saveDocument(true));

        setStatus('All changes saved');
        hideStatus();

    } catch (err) {
        console.error('Initialization failed:', err);
        showError('Editor failed to load', err.message || 'Unknown error', err.stack || '');
        setStatus('Error', 'error');
    }
}

// ===== PARAGRAPH IDs =====
function ensureParagraphIds() {
    if (!editor) return;
    const tr = editor.state.tr;
    let modified = false;

    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'paragraph' && !node.attrs.id) {
            const id = 'para-' + Math.random().toString(36).substr(2, 9);
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, id });
            modified = true;
        }
    });

    if (modified) editor.view.dispatch(tr);
}

function getSelectedParagraphId() {
    if (!editor) return null;
    const { from } = editor.state.selection;
    let paraId = null;

    editor.state.doc.nodesBetween(from, from + 1, (node) => {
        if (node.type.name === 'paragraph' && node.attrs.id) {
            paraId = node.attrs.id;
            return false;
        }
    });
    return paraId;
}

// ===== TOOLBAR =====
function setupToolbar() {
    document.querySelectorAll('.bs-toolbar [data-cmd]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (!editor) return;
            const cmd = btn.dataset.cmd;
            const level = btn.dataset.level ? parseInt(btn.dataset.level) : null;
            const chain = editor.chain().focus();

            switch(cmd) {
                case 'bold': chain.toggleBold(); break;
                case 'italic': chain.toggleItalic(); break;
                case 'underline': chain.toggleUnderline(); break;
                case 'strike': chain.toggleStrike(); break;
                case 'code': chain.toggleCode(); break;
                case 'heading': chain.toggleHeading({ level }); break;
                case 'bulletList': chain.toggleBulletList(); break;
                case 'orderedList': chain.toggleOrderedList(); break;
                case 'blockquote': chain.toggleBlockquote(); break;
                case 'undo': chain.undo(); break;
                case 'redo': chain.redo(); break;
            }
            chain.run();
        });
    });
}

function updateToolbarState() {
    if (!editor) return;
    document.querySelectorAll('.bs-toolbar [data-cmd]').forEach(btn => {
        const cmd = btn.dataset.cmd;
        const level = btn.dataset.level ? parseInt(btn.dataset.level) : null;
        let isActive = false;

        switch(cmd) {
            case 'bold': isActive = editor.isActive('bold'); break;
            case 'italic': isActive = editor.isActive('italic'); break;
            case 'underline': isActive = editor.isActive('underline'); break;
            case 'strike': isActive = editor.isActive('strike'); break;
            case 'code': isActive = editor.isActive('code'); break;
            case 'heading': isActive = editor.isActive('heading', { level }); break;
            case 'bulletList': isActive = editor.isActive('bulletList'); break;
            case 'orderedList': isActive = editor.isActive('orderedList'); break;
            case 'blockquote': isActive = editor.isActive('blockquote'); break;
        }
        btn.classList.toggle('active', isActive);
    });
}

// ===== TITLE =====
function setupTitle() {
    const input = $('#doc-title');
    let debounce;
    input.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(async () => {
            await fetch(`${API_URL}/documents/${docId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: input.value })
            });
            loadDocList();
        }, 500);
    });
}

// ===== DOC LIST =====
async function loadDocList() {
    try {
        const res = await fetch(`${API_URL}/documents`);
        if (!res.ok) throw new Error(`API ${res.status}`);
        const docs = await res.json();
        const list = $('#docs-list');

        if (docs.length === 0) {
            list.innerHTML = '<p class="bs-empty">No documents yet</p>';
            return;
        }

        list.innerHTML = docs.map(d => `
            <li class="${d.id === docId ? 'active' : ''}" data-id="${d.id}">
                <a href="?doc=${d.id}">${escapeHtml(d.title || 'Untitled')}</a>
                <div class="bs-doc-actions">
                    <small>${new Date(d.updated_at).toLocaleDateString()}</small>
                    <button class="bs-btn-delete" data-id="${d.id}" title="Delete document">🗑️</button>
                </div>
            </li>
        `).join('');

        // Attach delete handlers
        list.querySelectorAll('.bs-btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                deleteDocument(btn.dataset.id);
            });
        });
    } catch (e) {
        console.error('Docs load failed', e);
        $('#docs-list').innerHTML = '<p class="bs-empty">Failed to load documents</p>';
    }
}

async function deleteDocument(id) {
    if (!confirm('Are you sure you want to delete this document? This cannot be undone.')) return;

    try {
        const res = await fetch(`${API_URL}/documents/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error(`Delete failed: ${res.status}`);

        // If we deleted the current document, redirect to a new one
        if (id === docId) {
            window.location.href = '/';
        } else {
            loadDocList();
        }
    } catch (err) {
        alert('Failed to delete document: ' + err.message);
    }
}

function setupSidebar() {
    $('#btn-new-doc').addEventListener('click', async () => {
        const res = await fetch(`${API_URL}/documents`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'Untitled document' })
        });
        const doc = await res.json();
        window.location.href = `?doc=${doc.id}`;
    });
}

// ===== SAVE =====
function debouncedSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDocument(), 2000);
}

async function saveDocument(immediate = false) {
    if (!ydoc || !docId) return;
    try {
        const update = Y.encodeStateAsUpdate(ydoc);
        const base64 = btoa(String.fromCharCode(...update));

        const res = await fetch(`${API_URL}/documents/${docId}/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ update: base64 })
        });

        if (!res.ok) throw new Error(`Save failed: ${res.status}`);
        setStatus('All changes saved');
        hideStatus();
        $('#cloud-status').textContent = '☁️';
    } catch (e) {
        setStatus('Save failed', 'error');
        $('#cloud-status').textContent = '⚠️';
        console.error('Save failed', e);
    }
}

// ===== TABLE OF CONTENTS =====
function setupTOC() {
    $('#btn-toc-toggle').addEventListener('click', () => {
        const panel = $('#toc-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    $('#menu-toc').addEventListener('click', () => {
        const panel = $('#toc-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
}

function updateTOC() {
    if (!editor) return;
    const tocContent = $('#toc-content');
    const headings = [];

    editor.state.doc.descendants((node, pos) => {
        if (node.type.name === 'heading') {
            const text = node.textContent || '(Empty heading)';
            headings.push({ level: node.attrs.level, text, pos });
        }
    });

    if (headings.length === 0) {
        tocContent.innerHTML = '<p class="bs-empty">No headings yet. Add H1, H2, or H3.</p>';
        return;
    }

    tocContent.innerHTML = headings.map(h => `
        <div class="bs-toc-item h${h.level}" data-pos="${h.pos}">${escapeHtml(textTruncate(h.text, 35))}</div>
    `).join('');

    tocContent.querySelectorAll('.bs-toc-item').forEach(item => {
        item.addEventListener('click', () => {
            const pos = parseInt(item.dataset.pos);
            editor.chain().focus().setTextSelection(pos + 1).run();
            item.style.background = '#e8f0fe';
            setTimeout(() => item.style.background = '', 300);
        });
    });
}

function textTruncate(text, max) {
    return text.length > max ? text.substring(0, max) + '...' : text;
}

// ===== COMMENTS =====
function setupComments() {
    $('#btn-comment').addEventListener('click', async () => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from === to) {
            alert('Select text first to attach a comment.');
            return;
        }
        const content = prompt('Enter your comment:');
        if (!content) return;

        const paraId = getSelectedParagraphId() || `pos-${from}`;
        await fetch(`${API_URL}/documents/${docId}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paragraph_id: paraId, content })
        });
        loadComments();
    });
}

async function loadComments() {
    try {
        const res = await fetch(`${API_URL}/documents/${docId}/comments`);
        const comments = await res.json();
        const list = $('#comments-list');

        if (comments.length === 0) {
            list.innerHTML = '<p class="bs-empty">Select text and click 💬 to add a comment</p>';
            return;
        }

        list.innerHTML = comments.map(c => `
            <div class="bs-comment-card ${c.resolved ? 'resolved' : ''}">
                <small>${new Date(c.created_at).toLocaleString()}</small>
                <p>${escapeHtml(c.content)}</p>
                ${!c.resolved ? `<div class="bs-comment-actions"><button onclick="resolveComment(${c.id})" class="bs-btn-secondary">Resolve</button></div>` : ''}
            </div>
        `).join('');
    } catch (e) {
        console.error('Comments load failed', e);
    }
}

window.resolveComment = async function(id) {
    await fetch(`${API_URL}/comments/${id}/resolve`, { method: 'PATCH' });
    loadComments();
};

// ===== PERMISSIONS =====
async function loadPermissions() {
    try {
        const res = await fetch(`${API_URL}/documents/${docId}/permissions`);
        permissions = await res.json();
        applyPermissionStyles();
    } catch (e) {
        console.error('Permissions load failed', e);
    }
}

function setupPermissions() {
    $('#btn-permission').addEventListener('click', async () => {
        const paraId = getSelectedParagraphId();
        if (!paraId) {
            alert('Click inside a paragraph first.');
            return;
        }
        const current = permissions[paraId]?.[ME.id] || 'edit';
        const newPerm = prompt(`Set permission for this paragraph\nCurrent: ${current}\nOptions: read, edit, none`, current);
        if (!newPerm || !['read', 'edit', 'none'].includes(newPerm)) return;

        await fetch(`${API_URL}/documents/${docId}/permissions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paragraph_id: paraId, user_id: ME.id, permission_type: newPerm })
        });

        if (!permissions[paraId]) permissions[paraId] = {};
        permissions[paraId][ME.id] = newPerm;
        applyPermissionStyles();
    });
}

function applyPermissionStyles() {
    document.querySelectorAll('.ProseMirror p[data-id]').forEach(el => {
        const id = el.getAttribute('data-id');
        const perm = permissions[id]?.[ME.id] || 'edit';
        el.setAttribute('data-permission', perm);
    });
}

// ===== AI (Backend Proxy) =====
function setupAI() {
    const aiPanel = $('#ai-panel');
    const toggleBtn = $('#btn-ai-toggle');

    toggleBtn.addEventListener('click', () => {
        const isHidden = aiPanel.style.display === 'none';
        aiPanel.style.display = isHidden ? 'block' : 'none';
        toggleBtn.classList.toggle('active', isHidden);
    });

    $('#btn-ai-generate').addEventListener('click', () => callAI('generate'));
    $('#btn-ai-improve').addEventListener('click', () => callAI('improve'));
    $('#btn-ai-summarize').addEventListener('click', () => callAI('summarize'));
}

async function callAI(mode) {
    let promptText = $('#ai-prompt').value.trim();
    const responseBox = $('#ai-response');

    if (mode === 'improve' || mode === 'summarize') {
        const selected = editor?.state.doc.textBetween(
            editor.state.selection.from,
            editor.state.selection.to,
            '\n'
        );
        if (!selected) {
            responseBox.innerHTML = '<span style="color:#d93025">Select text first.</span>';
            responseBox.classList.add('show');
            return;
        }
        promptText = mode === 'improve'
            ? `Improve this writing professionally: "${selected}"`
            : `Summarize this concisely: "${selected}"`;
    }

    if (!promptText) {
        responseBox.innerHTML = '<span style="color:#d93025">Enter a prompt first.</span>';
        responseBox.classList.add('show');
        return;
    }

    responseBox.innerHTML = '<em style="color:var(--text-secondary)">Brain Sync AI is thinking...</em>';
    responseBox.classList.add('show');

    try {
        const res = await fetch(`${API_URL}/ai/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [{ role: 'user', content: promptText }],
                model: 'openai/gpt-4o-mini'
            })
        });

        const data = await res.json();

        if (!res.ok) {
            responseBox.innerHTML = `<span style="color:#d93025">${escapeHtml(data.error || 'AI service unavailable')}</span>`;
            return;
        }

        const text = data.choices?.[0]?.message?.content || 'No response.';

        responseBox.innerHTML = `<div style="margin-bottom:10px;">${escapeHtml(text)}</div>
            <button id="btn-insert-ai" class="bs-btn-secondary">Insert into document</button>`;

        $('#btn-insert-ai').addEventListener('click', () => {
            editor?.chain().focus().insertContent(text.replace(/\n/g, '<br>')).run();
            responseBox.innerHTML += '<br><em style="color:#188038">✓ Inserted</em>';
        });
    } catch (err) {
        responseBox.innerHTML = `<span style="color:#d93025">Error: ${escapeHtml(err.message)}</span>`;
    }
}

// ===== VERSION HISTORY =====
function setupVersions() {
    $('#menu-versions').addEventListener('click', () => {
        const panel = $('#versions-panel');
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) loadVersions();
    });

    $('#btn-save-version').addEventListener('click', () => {
        $('#version-modal').style.display = 'flex';
        $('#version-name').value = '';
        $('#version-name').focus();
    });

    document.querySelectorAll('.bs-modal-close').forEach(btn => {
        btn.addEventListener('click', closeModals);
    });

    $('#btn-cancel-version').addEventListener('click', closeModals);
    $('#btn-close-preview').addEventListener('click', closeModals);
    $('#btn-confirm-version').addEventListener('click', saveVersion);
    $('#btn-restore-version').addEventListener('click', restoreVersion);

    document.querySelectorAll('.bs-modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModals();
        });
    });
}

function closeModals() {
    document.querySelectorAll('.bs-modal').forEach(m => m.style.display = 'none');
}

async function saveVersion() {
    const name = $('#version-name').value.trim();
    if (!name) { alert('Please enter a version name'); return; }
    if (!ydoc || !docId) return;

    try {
        const update = Y.encodeStateAsUpdate(ydoc);
        const base64 = btoa(String.fromCharCode(...update));

        const res = await fetch(`${API_URL}/documents/${docId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ update: base64, title: name, change_summary: 'Manual save' })
        });

        if (!res.ok) throw new Error(`API ${res.status}`);
        closeModals();
        loadVersions();
        setStatus('Version saved');
        hideStatus();
    } catch (err) {
        alert('Failed to save version: ' + err.message);
    }
}

async function loadVersions() {
    try {
        const res = await fetch(`${API_URL}/documents/${docId}/versions`);
        const versions = await res.json();
        const list = $('#versions-list');

        if (versions.length === 0) {
            list.innerHTML = '<p class="bs-empty">No saved versions</p>';
            return;
        }

        list.innerHTML = versions.map(v => `
            <div class="bs-version-item" data-id="${v.id}">
                <div class="v-num">Version ${v.version_number}</div>
                <div class="v-title">${escapeHtml(v.title || 'Untitled')}</div>
                <div class="v-meta">${escapeHtml(v.change_summary)} • ${new Date(v.created_at).toLocaleString()}</div>
                <div class="v-actions">
                    <button class="bs-btn-secondary btn-preview" data-id="${v.id}">Preview</button>
                    <button class="bs-btn-secondary btn-restore" data-id="${v.id}">Restore</button>
                </div>
            </div>
        `).join('');

        list.querySelectorAll('.btn-preview').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                previewVersion(parseInt(btn.dataset.id));
            });
        });

        list.querySelectorAll('.btn-restore').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                currentVersionId = parseInt(btn.dataset.id);
                if (confirm('Restore this version? Current content will be overwritten.')) {
                    restoreVersion();
                }
            });
        });
    } catch (e) {
        console.error('Versions load failed', e);
    }
}

async function previewVersion(versionId) {
    try {
        const res = await fetch(`${API_URL}/documents/${docId}/versions/${versionId}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const tempDoc = new Y.Doc();
        const binary = Uint8Array.from(atob(data.update), c => c.charCodeAt(0));
        Y.applyUpdate(tempDoc, binary);
        const previewText = tempDoc.getText('default').toString() || '[Empty document]';

        $('#preview-title').textContent = `Version ${data.version_number}: ${data.title || 'Untitled'}`;
        $('#preview-meta').textContent = `${data.change_summary} • Saved on ${new Date(data.created_at).toLocaleString()}`;
        $('#preview-body').innerHTML = escapeHtml(previewText).replace(/\n/g, '<br>');
        $('#preview-modal').style.display = 'flex';

        currentVersionId = versionId;
    } catch (e) {
        alert('Preview failed: ' + e.message);
    }
}

async function restoreVersion() {
    if (!currentVersionId) return;
    try {
        const res = await fetch(`${API_URL}/documents/${docId}/restore`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ version_id: currentVersionId })
        });
        if (!res.ok) throw new Error('Restore failed');
        closeModals();
        alert('Version restored! Reloading...');
        window.location.reload();
    } catch (e) {
        alert('Restore failed: ' + e.message);
    }
}

// ===== KEYBOARD SHORTCUTS =====
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            $('#btn-save-version').click();
        }
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
            e.preventDefault();
            $('#btn-comment').click();
        }
    });
}

// ===== START =====
init();
