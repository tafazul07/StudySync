import { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Plus, 
  FileText, 
  Users, 
  X, 
  ArrowLeft, 
  Save, 
  Sparkles, 
  History, 
  ShieldCheck, 
  Edit3, 
  Eye, 
  Trash2, 
  Send,
  Loader2,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { apiFetch } from '../services/api';
import { useVoiceAction } from '../hooks/useVoiceControl';

export default function CollaborationEditor() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ title: '', content: '' });
  const [submitting, setSubmitting] = useState(false);

  // Voice actions for Brain Sync
  useVoiceAction('new_document', () => {
    setShowModal(true);
  });

  useVoiceAction('upload', (data) => {
    if (!data.targetRoute || data.targetRoute === '/collaboration') {
      setShowModal(true);
    }
  });

  // Handle pending voice upload from navigation
  useEffect(() => {
    const pendingUpload = sessionStorage.getItem('pendingVoiceUpload');
    if (pendingUpload) {
      try {
        const data = JSON.parse(pendingUpload);
        if (!data.targetRoute || data.targetRoute === '/collaboration') {
          setShowModal(true);
        }
        sessionStorage.removeItem('pendingVoiceUpload');
      } catch (e) {
        sessionStorage.removeItem('pendingVoiceUpload');
      }
    }
  }, []);

  // Document Workspace State
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [editorTitle, setEditorTitle] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [workspaceMode, setWorkspaceMode] = useState('edit'); // 'edit' | 'preview'
  const [activeTab, setActiveTab] = useState('ai'); // 'ai' | 'versions' | 'comments' | 'permissions'
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saved' | 'saving' | 'error'

  // Versions State
  const [versions, setVersions] = useState([]);
  const [versionTitle, setVersionTitle] = useState('');
  const [versionSummary, setVersionSummary] = useState('');
  const [creatingVersion, setCreatingVersion] = useState(false);

  // Comments State
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentCategory, setCommentCategory] = useState('general'); // 'general' or paragraph index e.g., '0', '1'

  // Permissions State
  const [permissions, setPermissions] = useState({});
  const [targetUser, setTargetUser] = useState('');
  const [permissionLevel, setPermissionLevel] = useState('view');
  const [selectedParaPerm, setSelectedParaPerm] = useState(0);
  const [shares, setShares] = useState([]);
  const [loadingShares, setLoadingShares] = useState(false);

  // AI Assistant State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiModel, setAiModel] = useState('openai/gpt-4o-mini');
  const [aiOutput, setAiOutput] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);

  // Simulated live collaborative users
  const [activeUsers] = useState([
    { name: 'You', color: 'bg-sky-500 border-sky-200 text-white', init: 'U' },
    { name: 'Sarah Miller', color: 'bg-emerald-500 border-emerald-200 text-white', init: 'SM' },
    { name: 'Alex Patel', color: 'bg-violet-500 border-violet-200 text-white', init: 'AP' }
  ]);

  // Decoders / Encoders
  const decodeBase64 = (str) => {
    try {
      return decodeURIComponent(escape(atob(str)));
    } catch (e) {
      return atob(str);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Debounced auto-save hook
  useEffect(() => {
    if (!selectedDoc) return;
    
    // Don't auto-save on initial load
    if (editorContent === selectedDoc.content && editorTitle === selectedDoc.title) {
      return;
    }

    setSaveStatus('saving');
    const delayDebounceFn = setTimeout(() => {
      saveDocument(editorTitle, editorContent);
    }, 1500);

    return () => clearTimeout(delayDebounceFn);
  }, [editorContent, editorTitle]);

  const fetchDocuments = async () => {
    try {
      const res = await apiFetch('/api/documents');
      const data = await res.json();
      setDocuments(Array.isArray(data) ? data : data.documents || []);
    } catch (error) {
      console.error('Failed to fetch documents:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setShowModal(false);
        setFormData({ title: '', content: '' });
        fetchDocuments();
      } else {
        alert('Failed to create document');
      }
    } catch (error) {
      console.error('Error creating document:', error);
      alert('Error creating document');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteDoc = async (id) => {
    if (!confirm('Are you sure you want to delete this document?')) return;
    try {
      const res = await apiFetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedDoc?.id === id) {
          setSelectedDoc(null);
        }
        fetchDocuments();
      } else {
        alert('Failed to delete document');
      }
    } catch (error) {
      console.error('Error deleting document:', error);
    }
  };

  const openDocument = (doc) => {
    setSelectedDoc(doc);
    setEditorTitle(doc.title);
    setEditorContent(doc.content);
    setWorkspaceMode('edit');
    setSaveStatus('saved');
    setAiOutput('');
    setAiPrompt('');

    // Fetch related records
    fetchVersions(doc.id);
    fetchComments(doc.id);
    fetchPermissions(doc.id);
    fetchShares(doc.id);
  };

  const saveDocument = async (titleToSave, contentToSave) => {
    if (!selectedDoc) return;
    setSaveStatus('saving');
    try {
      const patchRes = await apiFetch(`/api/documents/${selectedDoc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: titleToSave, content: contentToSave })
      });

      // Maintain consistency with binary update records
      const base64Content = btoa(unescape(encodeURIComponent(contentToSave)));
      await apiFetch(`/api/documents/${selectedDoc.id}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ update: base64Content })
      });

      if (patchRes.ok) {
        setSaveStatus('saved');
        setDocuments(prev => prev.map(d => d.id === selectedDoc.id ? { ...d, title: titleToSave, content: contentToSave } : d));
      } else {
        setSaveStatus('error');
      }
    } catch (e) {
      console.error('Failed saving document:', e);
      setSaveStatus('error');
    }
  };

  // Versions Panel Integration
  const fetchVersions = async (docId) => {
    try {
      const res = await apiFetch(`/api/documents/${docId}/versions`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data || []);
      }
    } catch (e) {
      console.error('Failed fetching versions:', e);
    }
  };

  const handleCreateVersion = async (e) => {
    e.preventDefault();
    if (!selectedDoc || !versionTitle.trim()) return;
    setCreatingVersion(true);
    try {
      const base64Content = btoa(unescape(encodeURIComponent(editorContent)));
      const res = await apiFetch(`/api/documents/${selectedDoc.id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update: base64Content,
          title: versionTitle,
          change_summary: versionSummary
        })
      });
      if (res.ok) {
        setVersionTitle('');
        setVersionSummary('');
        fetchVersions(selectedDoc.id);
      } else {
        alert('Failed to save version checkpoint.');
      }
    } catch (e) {
      console.error('Failed to create version:', e);
    } finally {
      setCreatingVersion(false);
    }
  };

  const handleRestoreVersion = async (ver) => {
    if (!selectedDoc || !confirm(`Are you sure you want to restore "${ver.title}" content? Your current changes will be overwritten.`)) return;
    setSaveStatus('saving');
    try {
      const res = await apiFetch(`/api/documents/${selectedDoc.id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: ver.id })
      });
      if (res.ok) {
        const contentRes = await apiFetch(`/api/documents/${selectedDoc.id}/content`);
        const contentData = await contentRes.json();
        if (contentData.update) {
          const decoded = decodeBase64(contentData.update);
          setEditorContent(decoded);
          await saveDocument(editorTitle, decoded);
          alert('Document successfully restored!');
        }
      }
    } catch (e) {
      console.error('Restore failed:', e);
    }
  };

  // Comments Panel Integration
  const fetchComments = async (docId) => {
    try {
      const res = await apiFetch(`/api/documents/${docId}/comments`);
      if (res.ok) {
        const data = await res.json();
        setComments(data || []);
      }
    } catch (e) {
      console.error('Failed fetching comments:', e);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!selectedDoc || !newComment.trim()) return;
    try {
      const res = await apiFetch(`/api/documents/${selectedDoc.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paragraph_id: commentCategory,
          content: newComment
        })
      });
      if (res.ok) {
        setNewComment('');
        fetchComments(selectedDoc.id);
      }
    } catch (e) {
      console.error('Comment save failed:', e);
    }
  };

  // Permissions Panel Integration
  const fetchPermissions = async (docId) => {
    try {
      const res = await apiFetch(`/api/documents/${docId}/permissions`);
      if (res.ok) {
        const data = await res.json();
        setPermissions(data || {});
      }
    } catch (e) {
      console.error('Failed fetching permissions:', e);
    }
  };

  const fetchShares = async (docId) => {
    setLoadingShares(true);
    try {
      const res = await apiFetch(`/api/documents/${docId}/shares`);
      if (res.ok) {
        const data = await res.json();
        setShares(data.shares || []);
      }
    } catch (e) {
      console.error('Failed fetching shares:', e);
    } finally {
      setLoadingShares(false);
    }
  };

  const handleSavePermission = async (e) => {
    e.preventDefault();
    if (!selectedDoc) return;
    try {
      const res = await apiFetch(`/api/documents/${selectedDoc.id}/permissions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paragraph_index: selectedParaPerm,
          user_id: targetUser,
          permission: permissionLevel
        })
      });
      if (res.ok) {
        fetchPermissions(selectedDoc.id);
        alert(`Successfully set ${permissionLevel} permission for ${targetUser} on paragraph ${selectedParaPerm + 1}`);
      }
    } catch (e) {
      console.error('Permission save failed:', e);
    }
  };

  const handleShareDocument = async (e) => {
    e.preventDefault();
    if (!selectedDoc || !targetUser.trim()) return;
    try {
      const res = await apiFetch(`/api/documents/${selectedDoc.id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetUser.trim(),
          permission: permissionLevel
        })
      });
      const data = await res.json();
      if (res.ok) {
        setTargetUser('');
        fetchShares(selectedDoc.id);
        alert('Document shared successfully!');
      } else {
        alert(data.error || 'Failed to share document');
      }
    } catch (e) {
      console.error('Share failed:', e);
      alert('Failed to share document');
    }
  };

  const handleRemoveShare = async (shareId) => {
    if (!confirm('Remove this user\'s access to the document?')) return;
    try {
      const res = await apiFetch(`/api/documents/${selectedDoc.id}/shares/${shareId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchShares(selectedDoc.id);
      }
    } catch (e) {
      console.error('Remove share failed:', e);
    }
  };

  // AI Assistant Integration
  const handleGenerateAI = async (promptOverride) => {
    const promptText = promptOverride || aiPrompt;
    if (!promptText.trim()) return;
    setAiGenerating(true);
    setAiOutput('');
    try {
      const messages = [
        { role: 'system', content: 'You are a professional educational writing assistant. Help users write clean, descriptive, educational texts. Generate response text based on the instructions.' },
        { role: 'user', content: promptText }
      ];
      const res = await apiFetch('/api/documents/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          model: aiModel
        })
      });
      const data = await res.json();
      if (res.ok && data.choices?.[0]?.message?.content) {
        setAiOutput(data.choices[0].message.content);
      } else {
        setAiOutput(`Failed to generate: ${data.error || 'OpenRouter API error'}`);
      }
    } catch (e) {
      console.error('AI generation failed:', e);
      setAiOutput('AI model failed to respond. Check server logs.');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleInsertAI = (mode) => {
    if (!aiOutput) return;
    if (mode === 'append') {
      setEditorContent(prev => prev + '\n\n' + aiOutput);
    } else {
      const textarea = document.getElementById('doc-textarea');
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = textarea.value;
        setEditorContent(text.substring(0, start) + aiOutput + text.substring(end));
      } else {
        setEditorContent(prev => prev + '\n\n' + aiOutput);
      }
    }
    setAiOutput('');
  };

  // Render Paragraphs helper for preview & comment interaction
  const getParagraphsList = () => {
    if (!editorContent) return [];
    return editorContent.split('\n').map((p, idx) => ({ text: p, idx }));
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary-600" />
        <span className="text-gray-500 dark:text-gray-400 font-medium">Loading workspace documents...</span>
      </div>
    );
  }

  // LIST VIEW
  if (!selectedDoc) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100">
              Collaboration Editor
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-1">
              Work together in real-time, generate curriculum with AI, track version checkpoints, and add paragraph feedback.
            </p>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 shadow-lg shadow-primary-500/20 hover:scale-102 transform transition-all duration-200">
            <Plus className="w-5 h-5" />
            New Document
          </button>
        </div>

        <div className="glass rounded-2xl p-6 shadow-sm border border-gray-200/50 dark:border-gray-700/50">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary-600" />
            Active Documents
          </h2>

          {documents.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {documents.map(doc => (
                <div 
                  key={doc.id} 
                  onClick={() => openDocument(doc)}
                  className="group relative p-5 rounded-xl bg-gray-50/50 dark:bg-gray-800/40 border border-gray-200/40 dark:border-gray-700/30 hover:border-primary-500/60 dark:hover:border-primary-500/60 hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex justify-between items-start">
                      <div className="p-2.5 rounded-lg bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400">
                        <FileText className="w-6 h-6" />
                      </div>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDoc(doc.id);
                        }} 
                        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                        title="Delete Document"
                      >
                        <Trash2 className="w-4.5 h-4.5" />
                      </button>
                    </div>

                    <div className="mt-4">
                      <h3 className="font-semibold text-lg text-gray-900 dark:text-gray-100 group-hover:text-primary-600 transition-colors line-clamp-1">
                        {doc.title}
                      </h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 line-clamp-2">
                        {doc.content || 'Empty document. Open to add notes.'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-gray-200/50 dark:border-gray-700/30 flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                    <span>Created {new Date(doc.created_at).toLocaleDateString()}</span>
                    <div className="flex items-center gap-1.5 font-medium text-primary-600 dark:text-primary-400">
                      <Users className="w-3.5 h-3.5" />
                      <span>Collaborative</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/20 dark:bg-gray-900/10">
              <MessageSquare className="w-16 h-16 text-gray-400 mx-auto mb-4 animate-pulse" />
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">No collaborative documents</h3>
              <p className="text-gray-500 dark:text-gray-400 max-w-sm mx-auto mt-2">
                Launch a collaborative notepad to work concurrently, run AI prompts, and provide feedback.
              </p>
              <button 
                onClick={() => setShowModal(true)} 
                className="mt-6 btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" /> Create Document
              </button>
            </div>
          )}
        </div>

        {/* Create Document Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-slide-in">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                  <FileText className="w-6 h-6 text-primary-600" />
                  New Document
                </h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Document Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                    placeholder="e.g. History Lesson Outline"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Initial Content</label>
                  <textarea
                    value={formData.content}
                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                    rows={6}
                    placeholder="Provide context or start writing your study document here..."
                  />
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 transition-colors font-medium flex items-center justify-center gap-2 shadow-lg shadow-primary-500/20"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating...
                      </>
                    ) : 'Create Document'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // WORKSPACE / EDITOR VIEW
  return (
    <div className="h-[calc(100vh-130px)] flex flex-col -m-6 animate-fade-in overflow-hidden">
      {/* Workspace Header */}
      <div className="px-6 py-4 glass border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center justify-between gap-4 z-10">
        <div className="flex items-center gap-4 flex-1 min-w-[200px]">
          <button 
            onClick={() => { setSelectedDoc(null); fetchDocuments(); }}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all flex items-center justify-center"
            title="Back to list"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="flex-1">
            <input 
              type="text" 
              value={editorTitle}
              onChange={(e) => setEditorTitle(e.target.value)}
              className="w-full bg-transparent text-xl font-bold border-b border-transparent hover:border-gray-300 focus:border-primary-500 outline-none text-gray-900 dark:text-gray-100 py-0.5 transition-all"
              placeholder="Untitled Document"
            />
            
            {/* Status indicator */}
            <div className="flex items-center gap-2 mt-0.5 text-xs">
              {saveStatus === 'saved' && (
                <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> All changes saved
                </span>
              )}
              {saveStatus === 'saving' && (
                <span className="text-primary-600 dark:text-primary-400 flex items-center gap-1">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving changes...
                </span>
              )}
              {saveStatus === 'error' && (
                <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1 font-semibold">
                  Error auto-saving!
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Collaborators list */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center -space-x-3">
            {activeUsers.map((user, i) => (
              <div 
                key={i} 
                className={`relative group`}
                title={`${user.name} (active)`}
              >
                <div className={`absolute inset-0 rounded-full animate-ping opacity-75 ${user.color.replace('text-', 'bg-').replace('bg-', 'bg-')}`} />
                <div className={`relative w-10 h-10 rounded-full border-3 border-white dark:border-gray-900 flex items-center justify-center text-xs font-bold ${user.color} shadow-lg transform hover:scale-110 transition-all duration-300 cursor-pointer`}>
                  {user.init}
                </div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white dark:border-gray-900 animate-pulse" />
              </div>
            ))}
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full blur-md opacity-50 animate-pulse-slow" />
              <div className="relative w-10 h-10 rounded-full border-3 border-white dark:border-gray-900 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-xs font-bold text-white shadow-lg">
                +2
              </div>
            </div>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/30">
            <div className="relative">
              <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-75" />
              <div className="relative w-2 h-2 bg-emerald-500 rounded-full" />
            </div>
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Live</span>
          </div>

          {/* Edit / Preview tabs */}
          <div className="bg-gray-100 dark:bg-gray-800 p-0.5 rounded-lg flex border border-gray-200 dark:border-gray-700/50 shadow-sm">
            <button 
              onClick={() => setWorkspaceMode('edit')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                workspaceMode === 'edit' 
                  ? 'bg-white dark:bg-gray-700 shadow text-primary-600 dark:text-primary-400' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              Edit
            </button>
            <button 
              onClick={() => setWorkspaceMode('preview')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                workspaceMode === 'preview' 
                  ? 'bg-white dark:bg-gray-700 shadow text-primary-600 dark:text-primary-400' 
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
              }`}
            >
              <Eye className="w-4 h-4" />
              Preview & Feedback
            </button>
          </div>

          <button 
            onClick={() => handleDeleteDoc(selectedDoc.id)}
            className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-950/20 text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            title="Delete Document"
          >
            <Trash2 className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      {/* Main split-screen panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Area (Left 2/3) */}
        <div className="flex-1 flex flex-col p-6 overflow-y-auto bg-gray-50/30 dark:bg-gray-900/5 bg-[radial-gradient(#0ea5e910_1px,transparent_1px)] [background-size:24px_24px]">
          {workspaceMode === 'edit' ? (
            <textarea
              id="doc-textarea"
              value={editorContent}
              onChange={(e) => setEditorContent(e.target.value)}
              className="flex-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700/80 rounded-xl p-6 text-gray-800 dark:text-gray-200 font-mono text-sm leading-relaxed focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500 outline-none shadow-sm transition-all resize-none"
              placeholder="Start drafting your collaborative document..."
            />
          ) : (
            <div className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-6 text-gray-800 dark:text-gray-200 shadow-sm overflow-y-auto">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6 border-b pb-4">
                {editorTitle || 'Untitled Document'}
              </h2>
              
              {getParagraphsList().length > 0 ? (
                <div className="space-y-4">
                  {getParagraphsList().map((para, i) => (
                    <div 
                      key={i} 
                      className="group relative pl-4 border-l-2 border-transparent hover:border-primary-500/50 transition-colors py-1.5"
                    >
                      <span className="absolute -left-6 top-2 text-xs font-mono text-gray-300 dark:text-gray-600 select-none">
                        #{i + 1}
                      </span>
                      <p className="leading-relaxed whitespace-pre-wrap">{para.text}</p>
                      
                      {/* Paragraph-specific action overlays */}
                      <div className="absolute right-2 top-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 bg-white dark:bg-gray-800 pl-2 rounded-lg shadow-sm border dark:border-gray-700/50">
                        <button 
                          onClick={() => {
                            setCommentCategory(i.toString());
                            setActiveTab('comments');
                          }}
                          className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                          title="Comment on paragraph"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => {
                            setSelectedParaPerm(i);
                            setActiveTab('permissions');
                          }}
                          className="p-1.5 text-gray-500 hover:text-primary-600 hover:bg-gray-50 dark:hover:bg-gray-700 rounded"
                          title="Paragraph permissions"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500 font-mono">
                  No text content to display. Click 'Edit' to draft content.
                </div>
              )}
            </div>
          )}
        </div>

        {/* Adv Sidebar Area (Right 1/3) */}
        <div className="w-80 md:w-96 border-l border-gray-200 dark:border-gray-700 glass flex flex-col overflow-hidden">
          {/* Side tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 text-xs font-semibold bg-gray-50/50 dark:bg-gray-800/50">
            <button 
              onClick={() => setActiveTab('ai')}
              className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1 ${
                activeTab === 'ai' 
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400 font-bold bg-white dark:bg-gray-800/40' 
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              AI Assistant
            </button>
            <button 
              onClick={() => setActiveTab('versions')}
              className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1 ${
                activeTab === 'versions' 
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400 font-bold bg-white dark:bg-gray-800/40' 
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              Versions
            </button>
            <button 
              onClick={() => setActiveTab('comments')}
              className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1 ${
                activeTab === 'comments' 
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400 font-bold bg-white dark:bg-gray-800/40' 
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Feedback
            </button>
            <button 
              onClick={() => setActiveTab('permissions')}
              className={`flex-1 py-3 text-center border-b-2 transition-all flex items-center justify-center gap-1 ${
                activeTab === 'permissions' 
                  ? 'border-primary-500 text-primary-600 dark:text-primary-400 font-bold bg-white dark:bg-gray-800/40' 
                  : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-300'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Access
            </button>
          </div>

          {/* Scrollable Tab Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {/* AI ASSISTANT */}
            {activeTab === 'ai' && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">AI Co-Author</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Choose your model, write custom prompts, or select helper templates.</p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Model Selection</label>
                    <select 
                      value={aiModel} 
                      onChange={(e) => setAiModel(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200"
                    >
                      <option value="openai/gpt-4o-mini">GPT-4o Mini (Default)</option>
                      <option value="meta-llama/llama-3.1-8b-instruct">Llama 3.1 8B (Free)</option>
                      <option value="google/gemini-pro">Gemini Pro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Your Instruction</label>
                    <textarea 
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200 resize-none"
                      placeholder="e.g. Write a brief introductory paragraph about photosynthesis..."
                    />
                  </div>

                  <button
                    onClick={() => handleGenerateAI()}
                    disabled={aiGenerating || !aiPrompt.trim()}
                    className="w-full btn-primary py-2 text-xs flex items-center justify-center gap-1.5"
                  >
                    {aiGenerating ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" /> Generate
                      </>
                    )}
                  </button>
                </div>

                <div className="border-t pt-4">
                  <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Preset Templates</h4>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => {
                        setAiPrompt("Generate a clean 3-part study outline for the topic of: " + (editorTitle || 'Study Notes'));
                        handleGenerateAI("Generate a clean 3-part study outline for the topic of: " + (editorTitle || 'Study Notes'));
                      }}
                      className="p-2 border border-gray-200 dark:border-gray-700 hover:border-primary-500 text-left rounded-lg text-[10px] text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 transition-colors"
                    >
                      📚 Generate Study Outline
                    </button>
                    <button 
                      onClick={() => {
                        if (!editorContent.trim()) return alert("Write some document text first to summarize!");
                        setAiPrompt(`Provide a concise TL;DR summary for the following text:\n\n${editorContent}`);
                        handleGenerateAI(`Provide a concise TL;DR summary for the following text:\n\n${editorContent}`);
                      }}
                      className="p-2 border border-gray-200 dark:border-gray-700 hover:border-primary-500 text-left rounded-lg text-[10px] text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 transition-colors"
                    >
                      📝 Summarize Text
                    </button>
                    <button 
                      onClick={() => {
                        if (!editorContent.trim()) return alert("Write some text first!");
                        setAiPrompt(`Fix grammar, syntax errors, and spelling in the following text:\n\n${editorContent}`);
                        handleGenerateAI(`Fix grammar, spelling, and readability in the following text:\n\n${editorContent}`);
                      }}
                      className="p-2 border border-gray-200 dark:border-gray-700 hover:border-primary-500 text-left rounded-lg text-[10px] text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 transition-colors"
                    >
                      ✍️ Fix Grammar & Spelling
                    </button>
                    <button 
                      onClick={() => {
                        setAiPrompt("Write 5 helpful study review questions based on the topic: " + (editorTitle || 'Study Notes'));
                        handleGenerateAI("Write 5 helpful study review questions based on the topic: " + (editorTitle || 'Study Notes'));
                      }}
                      className="p-2 border border-gray-200 dark:border-gray-700 hover:border-primary-500 text-left rounded-lg text-[10px] text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 transition-colors"
                    >
                      ❓ Review Questions
                    </button>
                  </div>
                </div>

                {aiOutput && (
                  <div className="border-t pt-4 space-y-3">
                    <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100">AI Response</h4>
                    <div className="p-3 border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg text-xs font-mono whitespace-pre-wrap max-h-48 overflow-y-auto text-gray-800 dark:text-gray-200">
                      {aiOutput}
                    </div>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleInsertAI('insert')}
                        className="flex-1 bg-primary-50 hover:bg-primary-100 border border-primary-200 text-primary-700 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-colors"
                      >
                        Insert at Cursor
                      </button>
                      <button 
                        onClick={() => handleInsertAI('append')}
                        className="flex-1 bg-gray-100 hover:bg-gray-200 border border-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:border-gray-600 dark:text-gray-200 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-colors"
                      >
                        Append to End
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* VERSION CONTROL */}
            {activeTab === 'versions' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Document Checkpoints</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Save incremental versions of your work and restore to them at any time.</p>
                </div>

                {/* Create Checkpoint Form */}
                <form onSubmit={handleCreateVersion} className="p-3.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/40 space-y-3">
                  <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200">Create Checkpoint</h4>
                  <div className="space-y-2">
                    <input 
                      type="text" 
                      required
                      value={versionTitle}
                      onChange={(e) => setVersionTitle(e.target.value)}
                      placeholder="Version Name (e.g. Draft 1)"
                      className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200"
                    />
                    <input 
                      type="text" 
                      value={versionSummary}
                      onChange={(e) => setVersionSummary(e.target.value)}
                      placeholder="Summary of changes (optional)"
                      className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200"
                    />
                  </div>
                  <button 
                    type="submit" 
                    disabled={creatingVersion || !versionTitle.trim()}
                    className="w-full btn-primary py-1.5 text-xs font-medium flex items-center justify-center gap-1.5"
                  >
                    {creatingVersion ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" /> Save Checkpoint
                      </>
                    )}
                  </button>
                </form>

                {/* Checkpoint list */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300">Previous Versions</h4>
                  {versions.length > 0 ? (
                    <div className="space-y-2.5">
                      {versions.map(ver => (
                        <div key={ver.id} className="p-3 border border-gray-200/50 dark:border-gray-700/50 bg-white dark:bg-gray-800/20 rounded-lg text-xs space-y-2 hover:border-primary-500/30 transition-colors">
                          <div className="flex justify-between items-start">
                            <div>
                              <h5 className="font-bold text-gray-900 dark:text-gray-100">{ver.title}</h5>
                              <p className="text-[10px] text-gray-400 mt-0.5">{new Date(ver.created_at).toLocaleString()}</p>
                            </div>
                            <button 
                              onClick={() => handleRestoreVersion(ver)}
                              className="px-2 py-1 rounded bg-primary-50 hover:bg-primary-100 text-primary-700 text-[10px] font-semibold transition-colors"
                            >
                              Restore
                            </button>
                          </div>
                          {ver.change_summary && (
                            <p className="text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-1.5 rounded text-[11px]">
                              {ver.change_summary}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-[11px] border border-dashed rounded-lg bg-gray-50/10 dark:bg-gray-900/5">
                      No versions checkpoints saved yet.
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* COMMENTS & FEEDBACK */}
            {activeTab === 'comments' && (
              <div className="space-y-5">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Feedback & Comments</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Read feedback or place sticky comments on specific paragraphs.</p>
                </div>

                {/* Comment Filter/Category */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Feedback Category</label>
                  <select 
                    value={commentCategory}
                    onChange={(e) => setCommentCategory(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200"
                  >
                    <option value="general">Global Document Comments</option>
                    {getParagraphsList().map((p, idx) => (
                      <option key={idx} value={idx.toString()}>Paragraph #{idx + 1}</option>
                    ))}
                  </select>
                </div>

                {/* Comments List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-700 dark:text-gray-300">
                    {commentCategory === 'general' ? 'General Comments' : `Paragraph #${parseInt(commentCategory) + 1} Comments`}
                  </h4>
                  
                  {comments.filter(c => c.paragraph_id === commentCategory).length > 0 ? (
                    <div className="space-y-2.5 max-h-64 overflow-y-auto">
                      {comments.filter(c => c.paragraph_id === commentCategory).map(comm => (
                        <div key={comm.id} className="p-3 border border-gray-150 dark:border-gray-800 rounded-lg bg-gray-50/40 dark:bg-gray-900/10 text-xs space-y-1.5">
                          <div className="flex justify-between items-center text-[10px] text-gray-400">
                            <span className="font-semibold text-primary-600 dark:text-primary-400">Collaborator {comm.user_id}</span>
                            <span>{new Date(comm.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="text-gray-700 dark:text-gray-300">{comm.content}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-400 dark:text-gray-500 text-[11px] border border-dashed rounded-lg bg-gray-50/10 dark:bg-gray-900/5">
                      No comments recorded in this category.
                    </div>
                  )}
                </div>

                {/* Add Comment Form */}
                <form onSubmit={handleAddComment} className="flex gap-2">
                  <input 
                    type="text" 
                    required
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder={commentCategory === 'general' ? "Add document feedback..." : `Comment on paragraph #${parseInt(commentCategory) + 1}...`}
                    className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200"
                  />
                  <button 
                    type="submit" 
                    disabled={!newComment.trim()}
                    className="p-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors flex items-center justify-center"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </form>
              </div>
            )}

            {/* PARAGRAPH PERMISSIONS */}
            {activeTab === 'permissions' && (
              <div className="space-y-6">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-gray-100 text-sm">Access Permissions</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Share document with users and control editing authorization.</p>
                </div>

                {/* Share Document Form */}
                <div className="p-3.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/40 space-y-3.5">
                  <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200">Share with User</h4>
                  
                  <form onSubmit={handleShareDocument} className="space-y-2.5">
                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">User Email</label>
                      <input 
                        type="email"
                        value={targetUser}
                        onChange={(e) => setTargetUser(e.target.value)}
                        placeholder="user@example.com"
                        className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Permission Level</label>
                      <select 
                        value={permissionLevel}
                        onChange={(e) => setPermissionLevel(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200"
                      >
                        <option value="view">View Only</option>
                        <option value="edit">Can Edit</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      className="w-full px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Share Document
                    </button>
                  </form>
                </div>

                {/* Shared Users List */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200">People with Access</h4>
                  
                  {loadingShares ? (
                    <div className="text-center py-4 text-gray-400 text-xs">Loading...</div>
                  ) : shares.length > 0 ? (
                    <div className="space-y-2">
                      {shares.map((share) => (
                        <div key={share.id} className="flex items-center justify-between p-2.5 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-indigo-500 flex items-center justify-center text-white text-xs font-bold">
                              {share.full_name?.charAt(0) || 'U'}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{share.full_name}</p>
                              <p className="text-[10px] text-gray-400">{share.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 text-[10px] rounded-full font-medium ${
                              share.permission === 'edit' 
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' 
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                              {share.permission === 'edit' ? 'Can Edit' : 'View Only'}
                            </span>
                            <button
                              onClick={() => handleRemoveShare(share.id)}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded transition-colors"
                              title="Remove access"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-4 text-gray-400 text-xs border border-dashed rounded-lg bg-gray-50/10 dark:bg-gray-900/5">
                      No users shared yet. Add someone above.
                    </div>
                  )}
                </div>

                {/* Paragraph-level Permissions (Advanced) */}
                <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 mb-3">Paragraph-Level Permissions (Advanced)</h4>
                  
                  <form onSubmit={handleSavePermission} className="p-3.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/40 space-y-3.5">
                    <div className="space-y-2.5">
                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Target Paragraph</label>
                        <select 
                          value={selectedParaPerm}
                          onChange={(e) => setSelectedParaPerm(parseInt(e.target.value))}
                          className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200"
                        >
                          {getParagraphsList().map((p, idx) => (
                            <option key={idx} value={idx}>Paragraph #{idx + 1}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Collaborator</label>
                        <select 
                          value={targetUser}
                          onChange={(e) => setTargetUser(e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200"
                        >
                          <option value="">Select a shared user...</option>
                          {shares.map((share) => (
                            <option key={share.id} value={share.email}>{share.full_name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-gray-500 dark:text-gray-400 mb-1">Permission</label>
                        <select 
                          value={permissionLevel}
                          onChange={(e) => setPermissionLevel(e.target.value)}
                          className="w-full px-3 py-1.5 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-xs rounded-lg outline-none text-gray-800 dark:text-gray-200"
                        >
                          <option value="read">Read Only</option>
                          <option value="write">Can Edit</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full px-3 py-2 bg-gray-600 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition-colors"
                    >
                      Set Paragraph Permission
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
