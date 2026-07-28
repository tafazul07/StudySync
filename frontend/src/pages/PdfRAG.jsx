import { useState, useRef } from 'react';
import { Search, Upload, MessageSquare, Sparkles, Loader2, Send, FileText, CheckCircle, AlertCircle, Bot, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { apiFetch } from '../services/api';
import { useVoiceAction } from '../hooks/useVoiceControl';

export default function PdfRAG() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [error, setError] = useState('');

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Upload a PDF first, then ask me anything about it!' }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  // Search state
  const [searchInput, setSearchInput] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const fileInputRef = useRef(null);

  // Voice action for upload
  useVoiceAction('upload', (data) => {
    if (!data.targetRoute || data.targetRoute === '/pdf-rag') {
      fileInputRef.current?.click();
    }
  });

  // Handle pending voice upload from navigation
  useEffect(() => {
    const pendingUpload = sessionStorage.getItem('pendingVoiceUpload');
    if (pendingUpload) {
      try {
        const data = JSON.parse(pendingUpload);
        if (!data.targetRoute || data.targetRoute === '/pdf-rag') {
          setTimeout(() => fileInputRef.current?.click(), 100);
        }
        sessionStorage.removeItem('pendingVoiceUpload');
      } catch (e) {
        sessionStorage.removeItem('pendingVoiceUpload');
      }
    }
  }, []);

  const handleFileUpload = async (e) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setUploading(true);
    setError('');
    setUploadSuccess(false);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      // Proxy route /api/pdf goes to Python RAG backend
      const res = await apiFetch('/api/pdf/upload', {
        method: 'POST',
        body: formData
      });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(text || 'Invalid response from server');
      }
      
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to process PDF');

      setUploadSuccess(true);
      setMessages([{ role: 'assistant', content: `I've successfully analyzed "${selectedFile.name}". What would you like to know?` }]);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Make sure the Python RAG server is running on port 8000.');
      setFile(null);
    } finally {
      setUploading(false);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!chatInput.trim() || !uploadSuccess || isTyping) return;

    const userMessage = chatInput.trim();
    setChatInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsTyping(true);
    
    // Auto scroll
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);

    try {
      const res = await apiFetch('/api/query/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMessage })
      });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(text || 'Invalid response from server');
      }
      
      if (!res.ok) throw new Error(data.error || data.message || 'Failed to get answer');

      setMessages(prev => [...prev, { role: 'assistant', content: data.answer || data.response || 'I processed your request.' }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error: ' + err.message }]);
    } finally {
      setIsTyping(false);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleSearchSubmit = async (e) => {
    e.preventDefault();
    if (!searchInput.trim() || !uploadSuccess || isSearching) return;

    setIsSearching(true);
    setHasSearched(true);
    
    try {
      const res = await apiFetch(`/api/search/web?query=${encodeURIComponent(searchInput.trim())}&limit=4`, {
        method: 'GET'
      });
      
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(text || 'Invalid response from server');
      }
      
      if (!res.ok) throw new Error(data.error || data.message || 'Search failed');

      setSearchResults(data.results || data.chunks || []);
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-fuchsia-500" />
            Document AI (RAG)
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Upload a PDF to instantly chat with it and run semantic searches.</p>
        </div>
        
        <div className="relative">
          <input 
            type="file" 
            accept=".pdf" 
            id="pdf-upload" 
            ref={fileInputRef}
            className="hidden" 
            onChange={handleFileUpload}
            disabled={uploading}
          />
          <label 
            htmlFor="pdf-upload" 
            className={`btn-primary flex items-center gap-2 cursor-pointer shadow-lg shadow-fuchsia-500/20 ${uploading ? 'opacity-70 pointer-events-none' : ''}`}
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing PDF...</>
            ) : uploadSuccess ? (
              <><CheckCircle className="w-4 h-4" /> Change PDF</>
            ) : (
              <><Upload className="w-4 h-4" /> Upload PDF</>
            )}
          </label>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 shrink-0">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        {/* Chat Interface */}
        <div className="glass-card rounded-2xl border border-gray-200/50 dark:border-gray-700/50 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-fuchsia-500 to-purple-600 rounded-lg">
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">AI Assistant</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Ask questions about your uploaded document</p>
            </div>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  msg.role === 'user' 
                    ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400'
                    : 'bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div className={`p-3 rounded-2xl ${
                  msg.role === 'user'
                    ? 'bg-blue-500 text-white rounded-tr-sm'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-tl-sm'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex gap-3 max-w-[85%]">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="p-4 rounded-2xl bg-gray-100 dark:bg-gray-800 rounded-tl-sm flex gap-1.5 items-center">
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <div className="w-2 h-2 rounded-full bg-gray-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-white/50 dark:bg-gray-900/50 border-t border-gray-200/50 dark:border-gray-700/50">
            <form onSubmit={handleChatSubmit} className="relative">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                disabled={!uploadSuccess || isTyping}
                placeholder={uploadSuccess ? "Ask a question..." : "Upload a PDF first..."}
                className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-fuchsia-500 disabled:opacity-50 transition-all"
              />
              <button 
                type="submit"
                disabled={!chatInput.trim() || !uploadSuccess || isTyping}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-fuchsia-500 hover:bg-fuchsia-50 dark:hover:bg-fuchsia-500/10 disabled:opacity-40 transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          </div>
        </div>

        {/* Semantic Search Interface */}
        <div className="glass-card rounded-2xl border border-gray-200/50 dark:border-gray-700/50 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50 bg-gray-50/50 dark:bg-gray-800/30 flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
              <Search className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-gray-100">Semantic Search</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Find specific excerpts based on meaning</p>
            </div>
          </div>
          
          <div className="p-4 border-b border-gray-200/50 dark:border-gray-700/50">
            <form onSubmit={handleSearchSubmit} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  disabled={!uploadSuccess || isSearching}
                  placeholder="Search by meaning or concept..."
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-all text-sm"
                />
              </div>
              <button 
                type="submit"
                disabled={!searchInput.trim() || !uploadSuccess || isSearching}
                className="px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors text-sm font-medium flex items-center gap-2"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
            </form>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4">
            {!hasSearched ? (
              <div className="h-full flex flex-col items-center justify-center text-center opacity-60">
                <Search className="w-12 h-12 text-gray-400 mb-3" />
                <p className="text-gray-500 dark:text-gray-400 font-medium">No searches yet</p>
                <p className="text-xs text-gray-400 mt-1">Enter a query above to find relevant excerpts from the PDF</p>
              </div>
            ) : searchResults.length > 0 ? (
              <div className="space-y-4">
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Top Results</p>
                {searchResults.map((res, i) => (
                  <div key={i} className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200/50 dark:border-gray-700/50 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-blue-500" />
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">Match {i + 1}</span>
                      {res.score && (
                        <span className="ml-auto text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded-full font-medium">
                          {(res.score * 100).toFixed(1)}% relevance
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                      {res.text || res.content || res}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-500 dark:text-gray-400">No highly relevant results found.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
