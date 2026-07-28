// ==================== CONFIG ====================
const CONFIG = {
  API_BASE: '',
  DEFAULT_MODEL: localStorage.getItem('selectedModel') || 'openrouter/auto',
  MAX_FILE_SIZE: 10 * 1024 * 1024
};

// ==================== STATE ====================
const state = {
  conversations: [],
  currentId: null,
  messages: [],
  isStreaming: false,
  selectedModel: CONFIG.DEFAULT_MODEL,
  sidebarOpen: window.innerWidth > 768,
  models: [],
  uploadedFiles: [],
  searchQuery: ''
};

// ==================== DOM ====================
const $ = sel => document.querySelector(sel);
const $$ = sel => document.querySelectorAll(sel);

// ==================== API ====================
const api = {
  async request(endpoint, options = {}) {
    const res = await fetch(`${CONFIG.API_BASE}${endpoint}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  },

  getConversations() { return api.request('/api/conversations'); },
  createConversation(data) { return api.request('/api/conversations', { method: 'POST', body: JSON.stringify(data) }); },
  deleteConversation(id) { return api.request(`/api/conversations/${id}`, { method: 'DELETE' }); },
  getMessages(convId) { return api.request(`/api/conversations/${convId}`); },
  saveMessage(convId, data) { return api.request(`/api/conversations/${convId}/messages`, { method: 'POST', body: JSON.stringify(data) }); },
  updateConversation(id, data) { return api.request(`/api/conversations/${id}`, { method: 'PATCH', body: JSON.stringify(data) }); },

  async getModels() {
    return api.request('/api/models?free=true');
  },

  async streamChat(messages, model, onDelta, onDone, onError) {
    const response = await fetch(`${CONFIG.API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, model })
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Chat failed' }));
      throw new Error(err.error);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') {
            onDone(fullContent);
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            fullContent += delta;
            onDelta(delta, fullContent, parsed);
          } catch (e) {}
        }
      }
      onDone(fullContent);
    } catch (error) {
      onError(error);
      throw error;
    }
  }
};

// ==================== UI ====================
const ui = {
  init() {
    marked.setOptions({ breaks: true, gfm: true, headerIds: false, mangle: false });
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    this.setupMessageActions();
    this.loadInitialData();
  },

  async loadInitialData() {
    try {
      const [conversations, models] = await Promise.all([
        api.getConversations(),
        api.getModels().catch(() => ({ data: [] }))
      ]);
      state.conversations = conversations;
      state.models = models.data || [];
      this.renderSidebar();
    } catch (error) {
      this.showToast('Failed to load data: ' + error.message, 'error');
    }
  },

  renderSidebar() {
    const list = $('#conversation-list');
    const filtered = state.conversations.filter(c =>
      (c.title || '').toLowerCase().includes(state.searchQuery.toLowerCase())
    );

    if (!filtered.length) {
      list.innerHTML = '<div class="empty-state">No conversations yet</div>';
      lucide.createIcons();
      return;
    }

    list.innerHTML = filtered.map(conv => `
      <div class="conversation-item ${conv.id === state.currentId ? 'active' : ''}" data-id="${conv.id}">
        <div class="conv-info">
          <i data-lucide="message-square"></i>
          <span class="conv-title">${escapeHtml(conv.title || 'Untitled')}</span>
        </div>
        <div class="conv-meta">
          <span class="conv-time">${formatTime(conv.updated_at)}</span>
          <button class="delete-conv-btn" data-id="${conv.id}" title="Delete">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
    `).join('');

    lucide.createIcons();

    $$('.conversation-item').forEach(el => {
      el.addEventListener('click', (e) => {
        if (e.target.closest('.delete-conv-btn')) return;
        loadConversation(parseInt(el.dataset.id));
      });
    });

    $$('.delete-conv-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteConversation(parseInt(btn.dataset.id));
      });
    });
  },

  renderMessages() {
    const area = $('#chat-area');
    const welcome = $('#welcome-screen');

    if (!state.currentId || !state.messages.length) {
      area.classList.add('hidden');
      welcome.classList.remove('hidden');
      return;
    }

    welcome.classList.add('hidden');
    area.classList.remove('hidden');

    area.innerHTML = state.messages.map((msg, i) => this.createMessageHTML(msg, i)).join('');

    area.querySelectorAll('pre code').forEach(block => {
      Prism.highlightElement(block);
      this.addCopyButton(block.parentElement);
    });

    lucide.createIcons();
    this.scrollToBottom();
  },

  createMessageHTML(msg, index) {
    const isUser = msg.role === 'user';
    let contentHtml;

    if (typeof msg.content === 'string') {
      contentHtml = marked.parse(msg.content);
    } else if (Array.isArray(msg.content)) {
      const textParts = msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      const imageParts = msg.content.filter(c => c.type === 'image_url');
      contentHtml = marked.parse(textParts);
      imageParts.forEach(img => {
        contentHtml += `<img src="${escapeHtml(img.image_url?.url || '')}" alt="Uploaded image" style="max-width:300px;border-radius:8px;margin-top:8px;">`;
      });
    } else {
      contentHtml = marked.parse(String(msg.content));
    }

    return `
      <div class="message ${msg.role}" data-index="${index}">
        <div class="message-avatar">
          ${isUser
            ? '<div class="avatar-user"><i data-lucide="user"></i></div>'
            : '<div class="avatar-ai"><i data-lucide="bot"></i></div>'}
        </div>
        <div class="message-body">
          <div class="message-content">${contentHtml}</div>
          <div class="message-actions">
            <button class="action-btn copy-msg" data-index="${index}" title="Copy">
              <i data-lucide="copy"></i>
            </button>
            ${!isUser ? `
              <button class="action-btn regenerate-msg" data-index="${index}" title="Regenerate">
                <i data-lucide="refresh-cw"></i>
              </button>
            ` : ''}
            <button class="action-btn delete-msg" data-index="${index}" title="Delete">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
          ${msg.model && !isUser ? `<div class="message-meta">via ${escapeHtml(msg.model)}</div>` : ''}
        </div>
      </div>
    `;
  },

  addStreamingMessage() {
    const area = $('#chat-area');
    const welcome = $('#welcome-screen');
    welcome.classList.add('hidden');
    area.classList.remove('hidden');

    const div = document.createElement('div');
    div.className = 'message assistant streaming';
    div.id = 'streaming-message';
    div.innerHTML = `
      <div class="message-avatar">
        <div class="avatar-ai"><i data-lucide="bot"></i></div>
      </div>
      <div class="message-body">
        <div class="message-content"><span class="cursor">▋</span></div>
      </div>
    `;
    area.appendChild(div);
    lucide.createIcons();
    this.scrollToBottom();
    return div;
  },

  updateStreamingMessage(content) {
    const el = $('#streaming-message .message-content');
    if (el) {
      el.innerHTML = escapeHtml(content).replace(/\n/g, '<br>') + '<span class="cursor">▋</span>';
      this.scrollToBottom();
    }
  },

  finalizeStreamingMessage(content) {
    const el = $('#streaming-message');
    if (!el) return;

    el.removeAttribute('id');
    el.classList.remove('streaming');
    const contentEl = el.querySelector('.message-content');
    contentEl.innerHTML = marked.parse(content);

    contentEl.querySelectorAll('pre code').forEach(block => {
      Prism.highlightElement(block);
      this.addCopyButton(block.parentElement);
    });

    const body = el.querySelector('.message-body');
    const existingActions = body.querySelector('.message-actions');
    if (existingActions) existingActions.remove();

    const actions = document.createElement('div');
    actions.className = 'message-actions';
    const idx = state.messages.length;
    actions.innerHTML = `
      <button class="action-btn copy-msg" data-index="${idx}" title="Copy"><i data-lucide="copy"></i></button>
      <button class="action-btn regenerate-msg" data-index="${idx}" title="Regenerate"><i data-lucide="refresh-cw"></i></button>
      <button class="action-btn delete-msg" data-index="${idx}" title="Delete"><i data-lucide="trash-2"></i></button>
    `;
    body.appendChild(actions);

    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = `via ${state.selectedModel}`;
    body.appendChild(meta);

    lucide.createIcons();
  },

  addCopyButton(pre) {
    if (pre.querySelector('.copy-code-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-code-btn';
    btn.innerHTML = '<i data-lucide="copy"></i>';
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code').textContent;
      await navigator.clipboard.writeText(code);
      btn.innerHTML = '<i data-lucide="check"></i>';
      lucide.createIcons();
      setTimeout(() => {
        btn.innerHTML = '<i data-lucide="copy"></i>';
        lucide.createIcons();
      }, 2000);
    });
    pre.appendChild(btn);
    lucide.createIcons();
  },

  showTyping() {
    $('#typing-indicator').classList.remove('hidden');
    this.scrollToBottom();
  },

  hideTyping() {
    $('#typing-indicator').classList.add('hidden');
  },

  scrollToBottom() {
    const container = $('#chat-container');
    container.scrollTop = container.scrollHeight;
  },

  toggleSidebar() {
    state.sidebarOpen = !state.sidebarOpen;
    $('#sidebar').classList.toggle('open', state.sidebarOpen);
    $('#sidebar-overlay').classList.toggle('show', state.sidebarOpen);
  },

  showToast(message, type = 'info') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  setupEventListeners() {
    $('#sidebar-toggle').addEventListener('click', () => this.toggleSidebar());
    $('#sidebar-overlay').addEventListener('click', () => this.toggleSidebar());
    $('#new-chat-btn').addEventListener('click', () => startNewChat());

    $('#model-select').addEventListener('change', (e) => {
      state.selectedModel = e.target.value;
      localStorage.setItem('selectedModel', e.target.value);
    });

    $('#refresh-models').addEventListener('click', async () => {
      try {
        const data = await api.getModels();
        state.models = data.data || [];
        this.showToast(`Loaded ${state.models.length} free models`, 'success');
      } catch (err) {
        this.showToast('Failed to refresh models', 'error');
      }
    });

    $('#search-conversations').addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      this.renderSidebar();
    });

    $('#send-btn').addEventListener('click', () => handleSend());
    $('#message-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    });

    $('#message-input').addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 200) + 'px';
      $('#send-btn').disabled = !this.value.trim();
      $('#char-count').textContent = `${this.value.length}/4000`;
    });

    $('#attach-btn').addEventListener('click', () => $('#file-input').click());
    $('#file-input').addEventListener('change', handleFileSelect);

    const dropZone = $('#chat-container');
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
      dropZone.addEventListener(ev, preventDefaults, false);
    });
    dropZone.addEventListener('drop', handleDrop, false);

    $$('.prompt-card').forEach(card => {
      card.addEventListener('click', () => {
        $('#message-input').value = card.dataset.prompt;
        $('#message-input').dispatchEvent(new Event('input'));
        handleSend();
      });
    });

    $('#export-chat').addEventListener('click', exportChat);

    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) {
        state.sidebarOpen = true;
        $('#sidebar').classList.add('open');
        $('#sidebar-overlay').classList.remove('show');
      }
    });
  },

  setupMessageActions() {
    $('#chat-area').addEventListener('click', async (e) => {
      const btn = e.target.closest('.action-btn');
      if (!btn) return;

      const msgEl = btn.closest('.message');
      const index = parseInt(msgEl.dataset.index);
      const msg = state.messages[index];
      if (!msg) return;

      if (btn.classList.contains('copy-msg')) {
        const text = typeof msg.content === 'string'
          ? msg.content
          : msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
        await navigator.clipboard.writeText(text);
        this.showToast('Copied to clipboard', 'success');
      } else if (btn.classList.contains('regenerate-msg')) {
        regenerateFrom(index);
      } else if (btn.classList.contains('delete-msg')) {
        state.messages.splice(index, 1);
        this.renderMessages();
      }
    });
  },

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key.toLowerCase()) {
          case 'n':
            e.preventDefault();
            startNewChat();
            break;
          case 'k':
            e.preventDefault();
            $('#search-conversations').focus();
            break;
          case '/':
            e.preventDefault();
            $('#message-input').focus();
            break;
        }
      }
      if (e.key === 'Escape') {
        if (state.sidebarOpen && window.innerWidth <= 768) this.toggleSidebar();
      }
    });
  }
};

// ==================== ACTIONS ====================
async function startNewChat() {
  state.currentId = null;
  state.messages = [];
  state.uploadedFiles = [];
  ui.renderMessages();
  $('#message-input').value = '';
  $('#message-input').style.height = 'auto';
  $('#send-btn').disabled = true;
  if (window.innerWidth <= 768) {
    state.sidebarOpen = false;
    $('#sidebar').classList.remove('open');
    $('#sidebar-overlay').classList.remove('show');
  }
}

async function loadConversation(id) {
  try {
    const data = await api.getMessages(id);
    state.currentId = id;
    state.messages = data.messages.map(m => ({ ...m, content: parseContent(m.content) }));
    state.selectedModel = data.model || state.selectedModel;
    $('#model-select').value = state.selectedModel;
    ui.renderMessages();
    if (window.innerWidth <= 768) ui.toggleSidebar();
  } catch (error) {
    ui.showToast('Failed to load conversation', 'error');
  }
}

async function deleteConversation(id) {
  if (!confirm('Delete this conversation permanently?')) return;
  try {
    await api.deleteConversation(id);
    state.conversations = state.conversations.filter(c => c.id !== id);
    if (state.currentId === id) startNewChat();
    ui.renderSidebar();
    ui.showToast('Conversation deleted', 'success');
  } catch (error) {
    ui.showToast('Failed to delete', 'error');
  }
}

async function handleSend() {
  const input = $('#message-input');
  const text = input.value.trim();
  if (!text || state.isStreaming) return;

  if (!state.currentId) {
    try {
      const conv = await api.createConversation({
        title: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
        model: state.selectedModel
      });
      state.currentId = conv.id;
      state.conversations.unshift(conv);
      ui.renderSidebar();
    } catch (error) {
      ui.showToast('Failed to create conversation', 'error');
      return;
    }
  }

  let userContent = text;
  const imageFiles = state.uploadedFiles.filter(f => f.base64);
  const otherFiles = state.uploadedFiles.filter(f => !f.base64);

  if (imageFiles.length) {
    userContent = [{ type: 'text', text }];
    imageFiles.forEach(f => {
      userContent.push({ type: 'image_url', image_url: { url: f.base64 } });
    });
    otherFiles.forEach(f => {
      userContent[0].text += `\n[Attached file: ${f.name}]`;
    });
  } else if (otherFiles.length) {
    const refs = otherFiles.map(f => `[Attached file: ${f.name}]`).join('\n');
    userContent = text + '\n\n' + refs;
  }

  const userMsg = { role: 'user', content: userContent };
  state.messages.push(userMsg);
  ui.renderMessages();

  await api.saveMessage(state.currentId, {
    role: 'user',
    content: typeof userContent === 'string' ? userContent : JSON.stringify(userContent),
    model: state.selectedModel
  });

  input.value = '';
  input.style.height = 'auto';
  $('#send-btn').disabled = true;
  $('#char-count').textContent = '0/4000';
  state.uploadedFiles = [];
  updateFilePreview();

  const apiMessages = state.messages.map(m => ({ role: m.role, content: m.content }));

  state.isStreaming = true;
  ui.showTyping();

  let streamingEl = null;

  try {
    await api.streamChat(
      apiMessages,
      state.selectedModel,
      (delta, accumulated) => {
        if (!streamingEl) {
          ui.hideTyping();
          streamingEl = ui.addStreamingMessage();
        }
        ui.updateStreamingMessage(accumulated);
      },
      async (finalContent) => {
        state.isStreaming = false;
        ui.hideTyping();
        ui.finalizeStreamingMessage(finalContent);

        const assistantMsg = { role: 'assistant', content: finalContent, model: state.selectedModel };
        state.messages.push(assistantMsg);

        await api.saveMessage(state.currentId, {
          role: 'assistant',
          content: finalContent,
          model: state.selectedModel
        });

        if (state.messages.length === 2) {
          const title = text.slice(0, 50) + (text.length > 50 ? '...' : '');
          await api.updateConversation(state.currentId, { title });
          const conv = state.conversations.find(c => c.id === state.currentId);
          if (conv) { conv.title = title; ui.renderSidebar(); }
        }
      },
      (error) => {
        state.isStreaming = false;
        ui.hideTyping();
        ui.showToast('Response failed: ' + error.message, 'error');
      }
    );
  } catch (error) {
    state.isStreaming = false;
    ui.hideTyping();
    ui.showToast(error.message, 'error');
  }
}

async function regenerateFrom(index) {
  state.messages = state.messages.slice(0, index);
  ui.renderMessages();

  const apiMessages = state.messages.map(m => ({ role: m.role, content: m.content }));

  state.isStreaming = true;
  ui.showTyping();

  let streamingEl = null;

  try {
    await api.streamChat(
      apiMessages,
      state.selectedModel,
      (delta, accumulated) => {
        if (!streamingEl) {
          ui.hideTyping();
          streamingEl = ui.addStreamingMessage();
        }
        ui.updateStreamingMessage(accumulated);
      },
      async (finalContent) => {
        state.isStreaming = false;
        ui.hideTyping();
        ui.finalizeStreamingMessage(finalContent);

        const assistantMsg = { role: 'assistant', content: finalContent, model: state.selectedModel };
        state.messages.push(assistantMsg);

        await api.saveMessage(state.currentId, {
          role: 'assistant',
          content: finalContent,
          model: state.selectedModel
        });
      },
      (error) => {
        state.isStreaming = false;
        ui.hideTyping();
        ui.showToast('Regeneration failed: ' + error.message, 'error');
      }
    );
  } catch (error) {
    state.isStreaming = false;
    ui.hideTyping();
  }
}

async function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > CONFIG.MAX_FILE_SIZE) {
    ui.showToast('File too large (max 10MB)', 'error');
    return;
  }

  if (file.type.startsWith('image/')) {
    const base64 = await fileToBase64(file);
    state.uploadedFiles.push({ name: file.name, type: file.type, base64 });
  } else {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('conversationId', state.currentId || '');
    try {
      const res = await fetch(`${CONFIG.API_BASE}/api/upload`, { method: 'POST', body: formData });
      const data = await res.json();
      state.uploadedFiles.push({ name: file.name, type: file.type, url: data.url });
    } catch (error) {
      ui.showToast('Upload failed', 'error');
    }
  }

  updateFilePreview();
  e.target.value = '';
}

function handleDrop(e) {
  const files = e.dataTransfer.files;
  if (files.length) {
    $('#file-input').files = files;
    $('#file-input').dispatchEvent(new Event('change'));
  }
}

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

function updateFilePreview() {
  const existing = $('.file-preview');
  if (existing) existing.remove();
  if (!state.uploadedFiles.length) return;

  const preview = document.createElement('div');
  preview.className = 'file-preview';
  preview.innerHTML = state.uploadedFiles.map((f, i) => `
    <div class="file-chip">
      <i data-lucide="${f.type?.startsWith('image/') ? 'image' : 'file-text'}"></i>
      <span>${escapeHtml(f.name)}</span>
      <button onclick="window.removeFile(${i})"><i data-lucide="x"></i></button>
    </div>
  `).join('');

  $('#input-area').insertBefore(preview, $('.input-wrapper'));
  lucide.createIcons();
}

window.removeFile = function(index) {
  state.uploadedFiles.splice(index, 1);
  updateFilePreview();
};

function exportChat() {
  if (!state.messages.length) {
    ui.showToast('Nothing to export', 'warning');
    return;
  }
  const markdown = state.messages.map(m => {
    const content = typeof m.content === 'string'
      ? m.content
      : m.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
    return `## ${m.role === 'user' ? 'You' : 'Assistant'}\n\n${content}\n`;
  }).join('\n---\n\n');

  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chat-${state.currentId || 'export'}-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
  ui.showToast('Chat exported', 'success');
}

// ==================== UTILITIES ====================
function escapeHtml(str) {
  if (str == null) return '';
  if (typeof str !== 'string') return String(str);
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function parseContent(content) {
  if (typeof content !== 'string') return content;
  try {
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return content;
}

function formatTime(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const now = new Date();
  const diff = (now - date) / 1000;
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return date.toLocaleDateString();
}

function fileToBase64(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

// ==================== INIT ====================
document.addEventListener('DOMContentLoaded', () => ui.init());