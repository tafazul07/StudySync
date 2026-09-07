import { useState, useEffect } from 'react';
import { Shield, Plus, Lock, FileText, X, Sparkles, Key, AlertTriangle, Eye, EyeOff, Upload, Download, Copy, Check, Search, Trash2, FolderOpen, ArrowLeft } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useVoiceAction } from '../hooks/useVoiceControl';

export default function SecureVault() {
  const [vaults, setVaults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [showFileModal, setShowFileModal] = useState(false);
  const [showCreatedModal, setShowCreatedModal] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [showFilesModal, setShowFilesModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Forms
  const [vaultForm, setVaultForm] = useState({ name: '', description: '', password: '' });
  const [fileForm, setFileForm] = useState({ vaultToken: '', password: '', file: null });
  const [shareForm, setShareForm] = useState({ file: null, maxDownloads: 5 });
  const [deleteForm, setDeleteForm] = useState({ vaultToken: '', password: '' });

  // Created vault info
  const [createdVault, setCreatedVault] = useState(null);
  const [copiedField, setCopiedField] = useState(null);

  // Share
  const [shareUrl, setShareUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Access vault flow
  const [accessStep, setAccessStep] = useState('search'); // 'search' | 'credentials' | 'files'
  const [accessForm, setAccessForm] = useState({ vaultId: '', vaultToken: '', password: '' });
  const [foundVault, setFoundVault] = useState(null);
  const [accessedVault, setAccessedVault] = useState(null);
  const [accessError, setAccessError] = useState('');

  // View vault files (owner)
  const [viewingVault, setViewingVault] = useState(null);
  const [vaultFiles, setVaultFiles] = useState([]);

  const [submitting, setSubmitting] = useState(false);

  // Voice actions for Sync Vault
  useVoiceAction('create_vault', (data) => {
    setShowVaultModal(true);
    if (data.name) {
      setVaultForm(prev => ({ ...prev, name: data.name }));
    }
  });

  useVoiceAction('upload', (data) => {
    if (!data.targetRoute || data.targetRoute === '/vault') {
      setShowFileModal(true);
    }
  });

  // Handle pending voice upload from navigation
  useEffect(() => {
    const pendingUpload = sessionStorage.getItem('pendingVoiceUpload');
    if (pendingUpload) {
      try {
        const data = JSON.parse(pendingUpload);
        if (!data.targetRoute || data.targetRoute === '/vault') {
          setShowFileModal(true);
        }
        sessionStorage.removeItem('pendingVoiceUpload');
      } catch (e) {
        sessionStorage.removeItem('pendingVoiceUpload');
      }
    }
  }, []);

  useEffect(() => {
    fetchVaults();
  }, []);

  const fetchVaults = async () => {
    try {
      const res = await apiFetch('/api/vaults/list');
      const data = await res.json();
      setVaults(data || []);
    } catch (error) {
      console.error('Failed to fetch vaults:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text, field) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // === Create Vault ===
  const handleCreateVault = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/vaults/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(vaultForm)
      });
      const data = await res.json();
      if (data.success || data.vault) {
        setShowVaultModal(false);
        setVaultForm({ name: '', description: '', password: '' });
        setCreatedVault(data.vault);
        setShowCreatedModal(true);
        fetchVaults();
      } else {
        alert(data.error || 'Failed to create vault');
      }
    } catch (error) {
      console.error('Error creating vault:', error);
      alert('Error creating vault');
    } finally {
      setSubmitting(false);
    }
  };

  // === Upload File to Vault ===
  const handleUploadFile = async (e) => {
    e.preventDefault();
    if (!fileForm.file || !fileForm.vaultToken || !fileForm.password) {
      alert('Please select a vault, enter password, and choose a file');
      return;
    }
    setSubmitting(true);
    const formData = new FormData();
    formData.append('file', fileForm.file);
    formData.append('password', fileForm.password);
    try {
      const res = await apiFetch(`/api/vaults/${fileForm.vaultToken}/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setShowFileModal(false);
        setFileForm({ vaultToken: '', password: '', file: null });
        fetchVaults();
        if (viewingVault) fetchVaultFiles(viewingVault);
        alert('File uploaded successfully to vault!');
      } else {
        alert(data.error || 'Failed to upload file');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error uploading file: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // === View Files in Vault (Owner) ===
  const fetchVaultFiles = async (vault) => {
    try {
      const res = await apiFetch(`/api/vaults/${vault.id}/files`);
      const data = await res.json();
      setVaultFiles(data || []);
    } catch (error) {
      console.error('Error fetching vault files:', error);
      setVaultFiles([]);
    }
  };

  const handleViewFiles = (vault) => {
    setViewingVault(vault);
    fetchVaultFiles(vault);
    setShowFilesModal(true);
  };

  // === Download File from Vault ===
  const handleDownloadFile = async (fileToken, fileName) => {
    try {
      const res = await apiFetch(`/api/vaults/vault-file/${fileToken}`);
      if (!res.ok) throw new Error('Unable to download this file');

      const blobUrl = URL.createObjectURL(await res.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Error downloading vault file:', error);
      alert(error.message || 'Unable to download this file');
    }
  };

  // === Delete Vault ===
  const handleDeleteVault = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/vaults/${viewingVault?.vault_token || deleteForm.vaultToken}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deleteForm.password })
      });
      const data = await res.json();
      if (data.success) {
        setShowDeleteModal(false);
        setDeleteForm({ vaultToken: '', password: '' });
        setShowFilesModal(false);
        setViewingVault(null);
        fetchVaults();
        alert('Vault deleted permanently');
      } else {
        alert(data.error || 'Failed to delete vault');
      }
    } catch (error) {
      console.error('Error deleting vault:', error);
      alert('Error deleting vault: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  // === Quick Share (non-vault) ===
  const handleShareFile = async (e) => {
    e.preventDefault();
    if (!shareForm.file) {
      alert('Please select a file');
      return;
    }
    setSubmitting(true);
    const formData = new FormData();
    formData.append('file', shareForm.file);
    formData.append('maxDownloads', shareForm.maxDownloads);
    try {
      const res = await apiFetch('/api/vaults/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setShareUrl(data.file.shareUrl);
        setShareForm({ file: null, maxDownloads: 5 });
        alert('File uploaded! Share link generated.');
      } else {
        alert(data.error || 'Failed to upload file');
      }
    } catch (error) {
      console.error('Error sharing file:', error);
      alert('Error sharing file: ' + error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const copyShareUrl = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // === Access Vault Flow (Another User) ===
  const handleSearchVault = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setAccessError('');
    try {
      const res = await apiFetch(`/api/vaults/find/${accessForm.vaultId}`);
      const data = await res.json();
      if (data.success) {
        setFoundVault(data.vault);
        setAccessStep('credentials');
      } else {
        setAccessError(data.error || 'Vault not found');
      }
    } catch (error) {
      setAccessError('Vault not found. Please check the Vault ID.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAccessVault = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setAccessError('');
    try {
      const res = await apiFetch(`/api/vaults/access/${accessForm.vaultId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vaultToken: accessForm.vaultToken, password: accessForm.password })
      });
      const data = await res.json();
      if (data.success) {
        setAccessedVault(data.vault);
        setAccessStep('files');
      } else {
        setAccessError(data.error || 'Access denied');
      }
    } catch (error) {
      setAccessError('Access failed. Check your token and password.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAccessFlow = () => {
    setAccessStep('search');
    setAccessForm({ vaultId: '', vaultToken: '', password: '' });
    setFoundVault(null);
    setAccessedVault(null);
    setAccessError('');
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-rose-500 to-red-500 rounded-full blur-xl opacity-50 animate-pulse-slow" />
          <div className="spinner relative" />
        </div>
        <span className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">Securing your vaults...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-extrabold gradient-text">Secure Vault</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Military-grade encryption for your sensitive files</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => { resetAccessFlow(); setShowAccessModal(true); }} className="btn-primary flex items-center gap-2 shadow-lg shadow-primary-500/20">
            <Search className="w-4 h-4" />
            Access Vault
          </button>
          <button onClick={() => setShowVaultModal(true)} className="btn-primary flex items-center gap-2 shadow-lg shadow-primary-500/20">
            <Shield className="w-4 h-4" />
            Create Vault
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Vaults */}
        <div className="glass-card rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-rose-500 to-red-500 rounded-lg blur-md opacity-50 animate-pulse-slow" />
                <Shield className="w-5 h-5 text-rose-600 relative" />
              </div>
              Your Vaults
            </h2>
          </div>
          {vaults.length > 0 ? (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
              {vaults.map((vault, index) => (
                <div key={vault.id} className="group relative p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 border border-gray-200/50 dark:border-gray-700/30 hover:border-rose-400/60 hover:shadow-xl hover:shadow-rose-500/20 transition-all duration-300 card-hover animate-fade-in" style={{ animationDelay: `${index * 0.1}s` }}>
                  <div className="relative flex items-start gap-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-rose-500 to-red-500 rounded-lg blur-md opacity-30 group-hover:opacity-50 transition-opacity" />
                      <Shield className="w-5 h-5 text-rose-600 relative mt-0.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-rose-600 dark:group-hover:text-rose-400 transition-colors">{vault.name}</h3>
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gradient-to-r from-rose-100 to-red-100 text-rose-700 text-[10px] font-semibold border border-rose-200">
                          <Lock className="w-2.5 h-2.5" />
                          Encrypted
                        </div>
                      </div>
                      {vault.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{vault.description}</p>}

                      {/* Vault ID — shareable */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Vault ID:</span>
                        <code className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-mono truncate max-w-[180px]">{vault.id}</code>
                        <button onClick={() => copyText(vault.id, `id-${vault.id}`)} className="text-gray-400 hover:text-rose-500 transition-colors flex-shrink-0">
                          {copiedField === `id-${vault.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      {/* Vault Token — shareable */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">Token:</span>
                        <code className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded font-mono truncate max-w-[180px]">{vault.vault_token}</code>
                        <button onClick={() => copyText(vault.vault_token, `token-${vault.id}`)} className="text-gray-400 hover:text-rose-500 transition-colors flex-shrink-0">
                          {copiedField === `token-${vault.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <FileText className="w-3 h-3" />
                        <span>{vault.file_count || 0} files</span>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => handleViewFiles(vault)} className="text-xs px-3 py-1.5 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-all flex items-center gap-1">
                          <FolderOpen className="w-3.5 h-3.5" />
                          View Files
                        </button>
                        <button onClick={() => { setFileForm({ ...fileForm, vaultToken: vault.vault_token }); setShowFileModal(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all flex items-center gap-1">
                          <Upload className="w-3.5 h-3.5" />
                          Upload
                        </button>
                        <button onClick={() => { setViewingVault(vault); setDeleteForm({ vaultToken: vault.vault_token, password: '' }); setShowDeleteModal(true); }} className="text-xs px-3 py-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-all flex items-center gap-1">
                          <Trash2 className="w-3.5 h-3.5" />
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-to-br from-gray-50/50 to-white/50 dark:from-gray-900/10 dark:to-gray-900/5">
              <div className="relative inline-block mb-3">
                <div className="absolute inset-0 bg-gradient-to-r from-rose-500 to-red-500 rounded-full blur-xl opacity-30 animate-pulse-slow" />
                <Shield className="w-12 h-12 text-gray-400 mx-auto relative animate-bounce" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">No vaults yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create your first secure vault</p>
            </div>
          )}
        </div>

        {/* Quick Share */}
        <div className="glass-card rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg blur-md opacity-50 animate-pulse-slow" />
                <FileText className="w-5 h-5 text-emerald-600 relative" />
              </div>
              Quick Share
            </h2>
            {shareUrl && <button onClick={() => setShareUrl('')} className="text-sm px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all flex items-center gap-1">
              <Upload className="w-3.5 h-3.5" />
              New Share
            </button>}
          </div>
          {shareUrl ? (
            <div className="p-4 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Your share link is ready:</p>
              <div className="flex gap-2">
                <input type="text" value={shareUrl} readOnly className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-emerald-300 dark:border-emerald-600 text-sm text-gray-700 dark:text-gray-300" />
                <button onClick={copyShareUrl} className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-all flex items-center gap-1">
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleShareFile} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Select File</label>
                <input type="file" onChange={(e) => setShareForm({ ...shareForm, file: e.target.files[0] })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Max Downloads</label>
                <input type="number" value={shareForm.maxDownloads} onChange={(e) => setShareForm({ ...shareForm, maxDownloads: parseInt(e.target.value) })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm" min="1" required />
              </div>
              <button type="submit" disabled={submitting} className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white disabled:opacity-50 transition-all font-semibold shadow-lg shadow-emerald-500/25 hover:shadow-emerald-500/40 btn-glow flex items-center justify-center gap-2">
                {submitting ? (<><div className="spinner w-4 h-4 border-2" />Uploading...</>) : (<><Upload className="w-4 h-4" />Generate Share Link</>)}
              </button>
            </form>
          )}
        </div>
      </div>

      {/* === Create Vault Modal === */}
      {showVaultModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="glass-card rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold gradient-text flex items-center gap-2"><Shield className="w-5 h-5 text-rose-600" />Create Secure Vault</h2>
              <button onClick={() => setShowVaultModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleCreateVault} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vault Name</label>
                <input type="text" value={vaultForm.name} onChange={(e) => setVaultForm({ ...vaultForm, name: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus" placeholder="e.g. Financial Documents" required />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Description</label>
                <textarea value={vaultForm.description} onChange={(e) => setVaultForm({ ...vaultForm, description: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus" rows={3} placeholder="Describe the purpose of this vault..." />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={vaultForm.password} onChange={(e) => setVaultForm({ ...vaultForm, password: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus pr-12" placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-gray-400"><AlertTriangle className="w-3 h-3 text-amber-500" /><span>Use a strong password for maximum security</span></div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowVaultModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all font-semibold">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white disabled:opacity-50 transition-all font-semibold shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 btn-glow flex items-center justify-center gap-2">
                  {submitting ? (<><div className="spinner w-4 h-4 border-2" />Creating...</>) : (<><Shield className="w-4 h-4" />Create Vault</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === Vault Created Success Modal === */}
      {showCreatedModal && createdVault && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="glass-card rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold gradient-text flex items-center gap-2"><Check className="w-5 h-5 text-emerald-500" />Vault Created!</h2>
              <button onClick={() => setShowCreatedModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"><X className="w-6 h-6" /></button>
            </div>
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">Your vault <strong className="text-gray-900 dark:text-gray-100">"{createdVault.name}"</strong> has been created. Share the following credentials with anyone you want to access this vault:</p>

              <div className="p-4 rounded-xl bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20 border border-rose-200 dark:border-rose-700 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-rose-700 dark:text-rose-400 mb-1">Vault ID</label>
                  <div className="flex gap-2">
                    <input type="text" value={createdVault.id} readOnly className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-rose-300 dark:border-rose-600 text-sm text-gray-700 dark:text-gray-300 font-mono" />
                    <button onClick={() => copyText(createdVault.id, 'created-id')} className="px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-all flex items-center gap-1">{copiedField === 'created-id' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-rose-700 dark:text-rose-400 mb-1">Vault Token</label>
                  <div className="flex gap-2">
                    <input type="text" value={createdVault.token} readOnly className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-rose-300 dark:border-rose-600 text-sm text-gray-700 dark:text-gray-300 font-mono" />
                    <button onClick={() => copyText(createdVault.token, 'created-token')} className="px-3 py-2 rounded-lg bg-rose-600 text-white hover:bg-rose-700 transition-all flex items-center gap-1">{copiedField === 'created-token' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</button>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700">
                <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 dark:text-amber-400">The other user will need <strong>both</strong> the Vault ID and Vault Token, plus the password you set, to access this vault. Save these credentials securely — you won't see the token again in full after closing this dialog.</p>
              </div>

              <button onClick={() => setShowCreatedModal(false)} className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white transition-all font-semibold shadow-lg shadow-rose-500/25 btn-glow">Done</button>
            </div>
          </div>
        </div>
      )}

      {/* === Upload to Vault Modal === */}
      {showFileModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="glass-card rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold gradient-text flex items-center gap-2"><Upload className="w-5 h-5 text-rose-600" />Upload to Vault</h2>
              <button onClick={() => setShowFileModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleUploadFile} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Select Vault</label>
                <select value={fileForm.vaultToken} onChange={(e) => setFileForm({ ...fileForm, vaultToken: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus" required>
                  <option value="">Choose a vault...</option>
                  {vaults.map((vault) => (<option key={vault.id} value={vault.vault_token}>{vault.name}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vault Password</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={fileForm.password} onChange={(e) => setFileForm({ ...fileForm, password: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus pr-12" placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Select File</label>
                <input type="file" onChange={(e) => setFileForm({ ...fileForm, file: e.target.files[0] })} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus" required />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowFileModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all font-semibold">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white disabled:opacity-50 transition-all font-semibold shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 btn-glow flex items-center justify-center gap-2">
                  {submitting ? (<><div className="spinner w-4 h-4 border-2" />Uploading...</>) : (<><Upload className="w-4 h-4" />Upload to Vault</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === View Vault Files Modal (Owner) === */}
      {showFilesModal && viewingVault && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="glass-card rounded-2xl p-6 w-full max-w-2xl mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold gradient-text flex items-center gap-2"><FolderOpen className="w-5 h-5 text-rose-600" />{viewingVault.name} — Files</h2>
              <button onClick={() => { setShowFilesModal(false); setViewingVault(null); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"><X className="w-6 h-6" /></button>
            </div>
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {vaultFiles.length > 0 ? (
                vaultFiles.map((file) => (
                  <div key={file.id} className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 border border-gray-200/50 dark:border-gray-700/30 hover:border-rose-400/60 transition-all">
                    <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
                    </div>
                    <button onClick={() => handleDownloadFile(file.fileToken, file.name)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all flex items-center gap-1 flex-shrink-0">
                      <Download className="w-3.5 h-3.5" />Download
                    </button>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500 dark:text-gray-400">No files in this vault yet</p>
                  <button onClick={() => { setShowFilesModal(false); setFileForm({ ...fileForm, vaultToken: viewingVault.vault_token }); setShowFileModal(true); }} className="mt-3 text-sm px-4 py-2 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-all flex items-center gap-1 mx-auto">
                    <Upload className="w-4 h-4" />Upload First File
                  </button>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setFileForm({ ...fileForm, vaultToken: viewingVault.vault_token }); setShowFilesModal(false); setShowFileModal(true); }} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white transition-all font-semibold flex items-center justify-center gap-2">
                <Upload className="w-4 h-4" />Upload More
              </button>
              <button onClick={() => { setShowFilesModal(false); setViewingVault(null); }} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all font-semibold">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* === Delete Vault Modal === */}
      {showDeleteModal && viewingVault && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="glass-card rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-red-600 flex items-center gap-2"><AlertTriangle className="w-5 h-5" />Delete Vault</h2>
              <button onClick={() => setShowDeleteModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"><X className="w-6 h-6" /></button>
            </div>
            <form onSubmit={handleDeleteVault} className="space-y-4">
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700">
                <p className="text-sm text-red-700 dark:text-red-400">Are you sure you want to delete <strong>{viewingVault.name}</strong>? This will permanently delete all files in this vault. This action cannot be undone.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Enter Vault Password to Confirm</label>
                <div className="relative">
                  <input type={showPassword ? 'text' : 'password'} value={deleteForm.password} onChange={(e) => setDeleteForm({ ...deleteForm, password: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus pr-12" placeholder="••••••••" required />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowDeleteModal(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all font-semibold">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white disabled:opacity-50 transition-all font-semibold shadow-lg shadow-red-500/25 flex items-center justify-center gap-2">
                  {submitting ? (<><div className="spinner w-4 h-4 border-2" />Deleting...</>) : (<><Trash2 className="w-4 h-4" />Delete Permanently</>)}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* === Access Vault Modal (Another User) === */}
      {showAccessModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="glass-card rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold gradient-text flex items-center gap-2"><Search className="w-5 h-5 text-rose-600" />Access Vault</h2>
              <button onClick={() => { setShowAccessModal(false); resetAccessFlow(); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"><X className="w-6 h-6" /></button>
            </div>

            {/* Step 1: Search by Vault ID */}
            {accessStep === 'search' && (
              <form onSubmit={handleSearchVault} className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">Enter the Vault ID that was shared with you to find the vault.</p>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vault ID</label>
                  <input type="text" value={accessForm.vaultId} onChange={(e) => setAccessForm({ ...accessForm, vaultId: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus font-mono text-sm" placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000" required />
                </div>
                {accessError && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700"><p className="text-sm text-red-600 dark:text-red-400">{accessError}</p></div>}
                <button type="submit" disabled={submitting} className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white disabled:opacity-50 transition-all font-semibold shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2">
                  {submitting ? (<><div className="spinner w-4 h-4 border-2" />Searching...</>) : (<><Search className="w-4 h-4" />Search Vault</>)}
                </button>
              </form>
            )}

            {/* Step 2: Enter Token + Password */}
            {accessStep === 'credentials' && foundVault && (
              <form onSubmit={handleAccessVault} className="space-y-4">
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">Vault found: <strong>{foundVault.name}</strong></p>
                  {foundVault.description && <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">{foundVault.description}</p>}
                </div>
                <button type="button" onClick={() => setAccessStep('search')} className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"><ArrowLeft className="w-3 h-3" />Search different vault</button>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Vault Token</label>
                  <input type="text" value={accessForm.vaultToken} onChange={(e) => setAccessForm({ ...accessForm, vaultToken: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus font-mono text-sm" placeholder="Enter vault token" required />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Password</label>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} value={accessForm.password} onChange={(e) => setAccessForm({ ...accessForm, password: e.target.value })} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus pr-12" placeholder="••••••••" required />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">{showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                  </div>
                </div>
                {accessError && <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700"><p className="text-sm text-red-600 dark:text-red-400">{accessError}</p></div>}
                <button type="submit" disabled={submitting} className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white disabled:opacity-50 transition-all font-semibold shadow-lg shadow-rose-500/25 flex items-center justify-center gap-2">
                  {submitting ? (<><div className="spinner w-4 h-4 border-2" />Verifying...</>) : (<><Key className="w-4 h-4" />Access Vault</>)}
                </button>
              </form>
            )}

            {/* Step 3: View Files in Accessed Vault */}
            {accessStep === 'files' && accessedVault && (
              <div className="space-y-4">
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700">
                  <p className="text-sm text-emerald-700 dark:text-emerald-400">Access granted to: <strong>{accessedVault.name}</strong></p>
                  <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">{accessedVault.files?.length || 0} files available</p>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {accessedVault.files?.length > 0 ? (
                    accessedVault.files.map((file) => (
                      <div key={file.id} className="flex items-center gap-3 p-3 rounded-xl bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 border border-gray-200/50 dark:border-gray-700/30">
                        <FileText className="w-5 h-5 text-gray-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
                        </div>
                        <button onClick={() => handleDownloadFile(file.fileToken, file.name)} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/50 transition-all flex items-center gap-1 flex-shrink-0">
                          <Download className="w-3.5 h-3.5" />Download
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6"><FileText className="w-8 h-8 text-gray-300 mx-auto mb-2" /><p className="text-sm text-gray-500 dark:text-gray-400">No files in this vault</p></div>
                  )}
                </div>
                <button onClick={() => { setShowAccessModal(false); resetAccessFlow(); }} className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all font-semibold">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
