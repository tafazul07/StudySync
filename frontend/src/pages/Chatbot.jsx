import { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Send, 
  Paperclip, 
  Trash2, 
  Copy, 
  RefreshCw,
  Search,
  Bot,
  User,
  Sparkles,
  Download,
  X,
  Check,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useVoiceAction } from '../hooks/useVoiceControl';

export default function Chatbot() {
  const [conversations, setConversations] = useState([]);
  const [currentConvId, setCurrentConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => {
    return localStorage.getItem('chatbotModel') || 'openrouter/auto';
  });
  const [models, setModels] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  // Voice actions for Sync AI
  useVoiceAction('new_chat', () => {
    createNewChat();
  });

  useVoiceAction('ask_ai', (data) => {
    if (data.question) {
      setInput(data.question);
      // Trigger send after a small delay to allow state update
      setTimeout(() => {
        setInput('');
        handleSendWithText(data.question);
      }, 100);
    }
  });

  // Load initial data
  useEffect(() => {
    loadConversations();
    loadModels();
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadConversations = async () => {
    try {
      const res = await apiFetch('/api/chatbot/conversations');
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async () => {
    try {
      const res = await apiFetch('/api/chatbot/models?free=true');
      if (res.ok) {
        const data = await res.json();
        setModels(data.data || []);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    }
  };

  const loadConversation = async (id) => {
    try {
      const res = await apiFetch(`/api/chatbot/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentConvId(id);
        setMessages(data.messages || []);
        setSelectedModel(data.model || selectedModel);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  const createNewChat = async () => {
    setCurrentConvId(null);
    setMessages([]);
    setInput('');
    setUploadedFiles([]);
  };

  const deleteConversation = async (id, e) => {
    e.stopPropagation();
    if (!confirm('Delete this conversation?')) return;
    
    try {
      const res = await apiFetch(`/api/chatbot/conversations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setConversations(conversations.filter(c => c.id !== id));
        if (currentConvId === id) {
          createNewChat();
        }
      }
    } catch (error) {
      console.error('Failed to delete conversation:', error);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;
    await handleSendWithText(input);
    setInput('');
  };

  const handleSendWithText = async (text) => {
    if (!text?.trim() || isStreaming) return;

    let convId = currentConvId;

    // Create conversation if none exists
    if (!convId) {
      try {
        const res = await apiFetch('/api/chatbot/conversations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: text.slice(0, 50) + (text.length > 50 ? '...' : ''),
            model: selectedModel
          })
        });
        
        if (res.ok) {
          const data = await res.json();
          convId = data.id;
          setCurrentConvId(convId);
          setConversations([data, ...conversations]);
        } else {
          return;
        }
      } catch (error) {
        console.error('Failed to create conversation:', error);
        return;
      }
    }

    // Prepare user content
    let userContent = text;
    if (uploadedFiles.length > 0) {
      const imageFiles = uploadedFiles.filter(f => f.type?.startsWith('image/'));
      if (imageFiles.length > 0) {
        userContent = [{ type: 'text', text: text }];
        for (const file of imageFiles) {
          if (file.base64) {
            userContent.push({ type: 'image_url', image_url: { url: file.base64 } });
          }
        }
      }
    }

    const userMsg = { role: 'user', content: userContent };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setUploadedFiles([]);

    // Save user message
    await apiFetch(`/api/chatbot/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'user',
        content: typeof userContent === 'string' ? userContent : JSON.stringify(userContent),
        model: selectedModel
      })
    });

    // Stream response
    setIsStreaming(true);
    let assistantContent = '';

    try {
      const response = await fetch('/api/chatbot/chat', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
          model: selectedModel
        })
      });

      if (!response.ok) {
        throw new Error('Chat request failed');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          
          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            assistantContent += delta;
            setMessages([...newMessages, { role: 'assistant', content: assistantContent }]);
          } catch (e) {}
        }
      }

      // Save assistant message
      await apiFetch(`/api/chatbot/conversations/${convId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'assistant',
          content: assistantContent,
          model: selectedModel
        })
      });

      // Update conversation title if first message
      if (newMessages.length === 1) {
        const title = input.slice(0, 50) + (input.length > 50 ? '...' : '');
        await apiFetch(`/api/chatbot/conversations/${convId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title })
        });
        
        setConversations(conversations.map(c => 
          c.id === convId ? { ...c, title } : c
        ));
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages([...newMessages, { 
        role: 'assistant', 
        content: 'Sorry, I encountered an error. Please try again.' 
      }]);
    } finally {
      setIsStreaming(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      alert('File too large (max 10MB)');
      return;
    }

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setUploadedFiles([...uploadedFiles, { 
          name: file.name, 
          type: file.type, 
          base64: e.target.result 
        }]);
      };
      reader.readAsDataURL(file);
    } else {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('conversationId', currentConvId || '');
      
      try {
        const res = await apiFetch('/api/chatbot/upload', {
          method: 'POST',
          body: formData
        });
        
        if (res.ok) {
          const data = await res.json();
          setUploadedFiles([...uploadedFiles, { 
            name: file.name, 
            type: file.type, 
            url: data.url 
          }]);
        }
      } catch (error) {
        console.error('Upload failed:', error);
      }
    }
    
    e.target.value = '';
  };

  const removeFile = (index) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const exportChat = () => {
    if (!messages.length) return;
    
    const markdown = messages.map(m => {
      const content = typeof m.content === 'string' 
        ? m.content 
        : m.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
      return `## ${m.role === 'user' ? 'You' : 'Assistant'}\n\n${content}\n`;
    }).join('\n---\n\n');

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-${currentConvId || 'export'}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredConversations = conversations.filter(c =>
    (c.title || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Sidebar */}
      <div className="w-72 glass-card rounded-xl border border-gray-200/50 dark:border-gray-700/50 flex flex-col">
        <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50">
          <button
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-primary-500 to-indigo-600 text-white font-medium hover:shadow-lg hover:shadow-primary-500/30 transition-all"
          >
            <Plus className="w-4 h-4" />
            New Chat
          </button>
        </div>

        <div className="p-3 border-b border-gray-200/50 dark:border-gray-700/50">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search chats..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredConversations.length === 0 ? (
            <div className="text-center py-8 text-gray-400 text-sm">
              No conversations yet
            </div>
          ) : (
            filteredConversations.map(conv => (
              <div
                key={conv.id}
                onClick={() => loadConversation(conv.id)}
                className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all ${
                  currentConvId === conv.id
                    ? 'bg-gradient-to-r from-primary-500/10 to-indigo-500/10 border border-primary-500/30'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800 border border-transparent'
                }`}
              >
                <MessageSquare className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <span className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate">
                  {conv.title || 'Untitled'}
                </span>
                <button
                  onClick={(e) => deleteConversation(conv.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-all"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 glass-card rounded-xl border border-gray-200/50 dark:border-gray-700/50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-indigo-500 rounded-lg blur-md opacity-30" />
              <div className="relative bg-gradient-to-br from-primary-500 to-indigo-600 p-2 rounded-lg">
                <Bot className="w-5 h-5 text-white" />
              </div>
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 dark:text-gray-100">AI Assistant</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Powered by OpenRouter</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                localStorage.setItem('chatbotModel', e.target.value);
              }}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:border-primary-500 transition-colors"
            >
              <option value="openrouter/auto">⚡ Auto (Best)</option>
              <option value="google/gemini-2.5-flash-lite:free">🔮 Gemini 2.5 Flash Lite</option>
              <option value="meta-llama/llama-4-maverick:free">🦙 Llama 4 Maverick</option>
              <option value="deepseek/deepseek-chat-v3-0324:free">🐋 DeepSeek V3</option>
              <option value="qwen/qwen3-235b-a22b:free">🌐 Qwen3 235B</option>
              <option value="mistralai/mistral-small-3.2-24b-instruct:free">🌪️ Mistral Small 3.2</option>
            </select>
            
            <button
              onClick={exportChat}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Export chat"
            >
              <Download className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-md">
                <div className="relative inline-block mb-6">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-indigo-500 rounded-full blur-xl opacity-30 animate-pulse" />
                  <div className="relative w-16 h-16 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-full flex items-center justify-center mx-auto">
                    <Sparkles className="w-8 h-8 text-white" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  How can I help you today?
                </h3>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
                  Ask me anything - I'm powered by the best AI models
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: '💡', text: 'Explain a complex topic' },
                    { icon: '💻', text: 'Write some code' },
                    { icon: '✍️', text: 'Help me write' },
                    { icon: '🎯', text: 'Brainstorm ideas' }
                  ].map((prompt, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(prompt.text)}
                      className="p-3 text-left text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors border border-gray-200 dark:border-gray-700"
                    >
                      <span className="text-lg mb-1 block">{prompt.icon}</span>
                      <span className="text-gray-700 dark:text-gray-300">{prompt.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <div key={i} className="flex gap-4 animate-fade-in">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-primary-500 to-indigo-600'
                      : 'bg-gradient-to-br from-gray-600 to-gray-700'
                  }`}>
                    {msg.role === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      {typeof msg.content === 'string' ? (
                        <div className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">
                          {msg.content}
                        </div>
                      ) : (
                        <div className="text-gray-900 dark:text-gray-100">
                          {msg.content.filter(c => c.type === 'text').map((c, j) => (
                            <div key={j}>{c.text}</div>
                          ))}
                          {msg.content.filter(c => c.type === 'image_url').map((c, j) => (
                            <img 
                              key={j} 
                              src={c.image_url?.url} 
                              alt="Uploaded" 
                              className="max-w-xs rounded-lg mt-2"
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => copyToClipboard(typeof msg.content === 'string' ? msg.content : msg.content.filter(c => c.type === 'text').map(c => c.text).join('\n'))}
                          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                          title="Copy"
                        >
                          <Copy className="w-3.5 h-3.5 text-gray-400" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
              {isStreaming && (
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center">
                    <Bot className="w-4 h-4 text-white" />
                  </div>
                  <div className="flex-1">
                    <div className="flex gap-1">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200/50 dark:border-gray-700/50 p-4">
          {uploadedFiles.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {uploadedFiles.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-sm"
                >
                  <Paperclip className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-700 dark:text-gray-300">{file.name}</span>
                  <button onClick={() => removeFile(i)} className="hover:text-red-500 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="Attach file"
            >
              <Paperclip className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,.txt,.pdf"
              onChange={handleFileSelect}
              className="hidden"
            />
            
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Message the AI assistant..."
                rows={1}
                className="w-full px-4 py-3 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:border-primary-500 transition-colors resize-none"
                style={{ minHeight: '48px', maxHeight: '200px' }}
              />
            </div>

            <button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              className="px-6 py-3 bg-gradient-to-r from-primary-500 to-indigo-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-primary-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span>Press Enter to send, Shift+Enter for new line</span>
            <span>{input.length}/4000</span>
          </div>
        </div>
      </div>
    </div>
  );
}
