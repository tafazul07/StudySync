import { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, FileText, X, Sparkles, Clock, Target, Flame, Upload } from 'lucide-react';
import { apiFetch } from '../services/api';
import { useVoiceAction } from '../hooks/useVoiceControl';

export default function StudyPlanner() {
  const [studyPlans, setStudyPlans] = useState([]);
  const [deadlines, setDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    preferences: '{}',
    userEmail: ''
  });
  const [submitting, setSubmitting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  // Voice actions for Focus Flow
  useVoiceAction('create_plan', (data) => {
    setShowModal(true);
    if (data.subject) {
      setFormData(prev => ({ ...prev, title: data.subject }));
    }
  });

  useVoiceAction('upload', (data) => {
    if (!data.targetRoute || data.targetRoute === '/planner') {
      setShowModal(true);
    }
  });

  useVoiceAction('show_deadlines', () => {
    // Scroll to deadlines section if it exists
    const deadlinesEl = document.getElementById('deadlines-section');
    if (deadlinesEl) {
      deadlinesEl.scrollIntoView({ behavior: 'smooth' });
    }
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [plansRes, deadlinesRes] = await Promise.all([
        apiFetch('/api/study-plans').then(r => r.json()),
        apiFetch('/api/deadlines').then(r => r.json())
      ]);
      setStudyPlans(plansRes.data || plansRes.study_plans || []);
      setDeadlines(deadlinesRes.data || deadlinesRes.deadlines || []);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown'
    ];
    if (!allowedTypes.includes(file.type)) {
      alert('Unsupported file type. Please upload a PDF, DOCX, TXT, or MD file.');
      e.target.value = '';
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      alert('File is too large. Maximum size is 25 MB.');
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!selectedFile && !formData.content.trim()) {
      alert('Please either upload a file or enter text content to create a study plan.');
      return;
    }

    setSubmitting(true);
    try {
      const formDataToSend = new FormData();
      formDataToSend.append('title', formData.title);
      formDataToSend.append('content', formData.content);
      formDataToSend.append('preferences', formData.preferences);
      formDataToSend.append('userEmail', formData.userEmail);

      if (selectedFile) {
        formDataToSend.append('file', selectedFile);
      }

      const res = await apiFetch('/api/study-plans', {
        method: 'POST',
        body: formDataToSend
      });
      const data = await res.json();
      
      if (data.success) {
        setShowModal(false);
        setFormData({ title: '', content: '', preferences: '{}', userEmail: '' });
        setSelectedFile(null);
        fetchData();
      } else {
        alert(data.error || 'Failed to create study plan');
      }
    } catch (error) {
      console.error('Error creating study plan:', error);
      alert(error.message || 'Error creating study plan');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePlan = async (id) => {
    if (!confirm('Are you sure you want to delete this study plan?')) return;
    try {
      const res = await apiFetch(`/api/study-plans/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error('Delete failed:', data.error || res.statusText);
      }
    } catch (error) {
      console.error('Error deleting study plan:', error);
    } finally {
      // Always refresh the list to remove stale entries
      fetchData();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur-xl opacity-50 animate-pulse-slow" />
          <div className="spinner relative" />
        </div>
        <span className="text-gray-500 dark:text-gray-400 font-medium animate-pulse">Loading your study plans...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold gradient-text">Study Planner</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Organize your learning journey with AI-powered study plans</p>
        </div>
        <button onClick={() => setShowModal(true)} className="btn-primary flex items-center gap-2 shadow-lg shadow-primary-500/20">
          <Sparkles className="w-4 h-4" />
          New Plan
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Study Plans */}
        <div className="glass-card rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 animate-slide-up" style={{ animationDelay: '0.1s' }}>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5 flex items-center gap-2">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg blur-md opacity-50 animate-pulse-slow" />
              <Target className="w-5 h-5 text-emerald-600 relative" />
            </div>
            Study Plans
          </h2>
          {studyPlans.length > 0 ? (
            <div className="space-y-3">
              {studyPlans.map((plan, index) => (
                <div 
                  key={plan.id} 
                  className="group relative p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 border border-gray-200/50 dark:border-gray-700/30 hover:border-emerald-400/60 hover:shadow-xl hover:shadow-emerald-500/20 transition-all duration-300 card-hover animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-lg blur-md opacity-30 group-hover:opacity-50 transition-opacity" />
                        <FileText className="w-5 h-5 text-emerald-600 relative mt-0.5" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{plan.title}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(plan.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <button 
                      onClick={() => handleDeletePlan(plan.id)} 
                      className="relative p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all group-hover:scale-110"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-to-br from-gray-50/50 to-white/50 dark:from-gray-900/10 dark:to-gray-900/5">
              <div className="relative inline-block mb-3">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full blur-xl opacity-30 animate-pulse-slow" />
                <Target className="w-12 h-12 text-gray-400 mx-auto relative animate-bounce" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">No study plans yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Create your first AI-powered study plan</p>
            </div>
          )}
        </div>

        {/* Deadlines */}
        <div className="glass-card rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 animate-slide-up" style={{ animationDelay: '0.2s' }}>
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-5 flex items-center gap-2">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg blur-md opacity-50 animate-pulse-slow" />
              <Calendar className="w-5 h-5 text-orange-600 relative" />
            </div>
            Upcoming Deadlines
          </h2>
          {deadlines.length > 0 ? (
            <div className="space-y-3">
              {deadlines.slice(0, 5).map((deadline, index) => (
                <div 
                  key={deadline.id} 
                  className="group relative p-4 rounded-xl bg-gradient-to-br from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 border border-gray-200/50 dark:border-gray-700/30 hover:border-orange-400/60 hover:shadow-xl hover:shadow-orange-500/20 transition-all duration-300 card-hover animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-orange-500/0 via-orange-500/5 to-orange-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative flex items-center gap-3">
                    <div className="relative">
                      <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg blur-md opacity-30 group-hover:opacity-50 transition-opacity" />
                      <Calendar className="w-5 h-5 text-orange-600 relative" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors">{deadline.title}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Due: {new Date(deadline.due_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-semibold rounded-full border transition-all ${
                      deadline.status === 'pending' 
                        ? 'bg-gradient-to-r from-amber-100 to-yellow-100 text-amber-800 border-amber-200' :
                      deadline.status === 'completed' 
                        ? 'bg-gradient-to-r from-emerald-100 to-green-100 text-emerald-800 border-emerald-200' :
                        'bg-gradient-to-r from-rose-100 to-red-100 text-rose-800 border-rose-200'
                    }`}>
                      {deadline.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-to-br from-gray-50/50 to-white/50 dark:from-gray-900/10 dark:to-gray-900/5">
              <div className="relative inline-block mb-3">
                <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-full blur-xl opacity-30 animate-pulse-slow" />
                <Calendar className="w-12 h-12 text-gray-400 mx-auto relative animate-bounce" />
              </div>
              <p className="text-gray-500 dark:text-gray-400 font-medium">No deadlines yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Track your important dates</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Study Plan Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
          <div className="glass-card rounded-2xl p-6 w-full max-w-lg mx-4 border border-gray-200 dark:border-gray-700 shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold gradient-text flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary-600" />
                Create Study Plan
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Plan Title</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus"
                  placeholder="e.g. Biology Final Exam Prep"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Upload File <span className="text-gray-400 font-normal">(PDF, DOCX, TXT — max 25 MB)</span>
                </label>
                <div className="relative">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    onChange={handleFileChange}
                    className="hidden"
                    id="file-upload"
                  />
                  <label
                    htmlFor="file-upload"
                    className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 cursor-pointer transition-all bg-gray-50 dark:bg-gray-800/50 hover:bg-primary-50 dark:hover:bg-primary-900/10"
                  >
                    <Upload className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {selectedFile ? selectedFile.name : 'Click to choose a file...'}
                    </span>
                  </label>
                  {selectedFile && (
                    <button
                      type="button"
                      onClick={() => { setSelectedFile(null); document.getElementById('file-upload').value = ''; }}
                      className="absolute top-1/2 right-3 -translate-y-1/2 p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                  Content / Notes <span className="text-gray-400 font-normal">(or paste text directly)</span>
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus"
                  rows={4}
                  placeholder={selectedFile ? 'Optional — add any additional notes or preferences...' : 'Enter your study content or paste text here (at least 50 characters)...'}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Email (optional)</label>
                <input
                  type="email"
                  value={formData.userEmail}
                  onChange={(e) => setFormData({ ...formData, userEmail: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-4 focus:ring-primary-500/20 focus:border-primary-500 outline-none transition-all input-focus"
                  placeholder="your@email.com"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 text-white disabled:opacity-50 transition-all font-semibold shadow-lg shadow-primary-500/25 hover:shadow-primary-500/40 btn-glow flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <div className="spinner w-4 h-4 border-2" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Create Plan
                    </>
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
