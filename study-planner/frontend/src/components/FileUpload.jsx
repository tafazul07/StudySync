import { useState } from 'react';
import { api } from '../services/api.js';
import toast from 'react-hot-toast';
import { Upload, FileText } from 'lucide-react';

function FileUpload({ onSuccess }) {
  const [file, setFile] = useState(null);
  const [email, setEmail] = useState('');
  const [hoursPerDay, setHoursPerDay] = useState('4');
  const [examDate, setExamDate] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file && !e.target.content?.value) {
      toast.error('Please upload a file or enter content');
      return;
    }

    setLoading(true);
    const formData = new FormData();
    if (file) formData.append('file', file);
    formData.append('title', file?.name || 'Study Plan');
    formData.append('userEmail', email);
    formData.append('preferences', JSON.stringify({
      hoursPerDay,
      examDate
    }));
    if (e.target.content?.value) formData.append('content', e.target.content.value);

    try {
      await api.post('/study-plans', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Study plan created successfully!');
      setFile(null);
      setEmail('');
      onSuccess();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create plan');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Upload size={20} /> Create Study Plan
      </h2>

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '14px' }}>
            Upload File (PDF, DOCX, TXT)
          </label>
          <div style={{
            border: '2px dashed #ddd',
            borderRadius: '8px',
            padding: '20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: '#fafafa'
          }} onClick={() => document.getElementById('file-input').click()}>
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <FileText size={20} color="#3498db" />
                <span>{file.name}</span>
              </div>
            ) : (
              <p style={{ color: '#7f8c8d' }}>Click to upload or drag & drop</p>
            )}
            <input
              id="file-input"
              type="file"
              accept=".pdf,.docx,.txt,.md"
              style={{ display: 'none' }}
              onChange={(e) => setFile(e.target.files[0])}
            />
          </div>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', marginBottom: '6px', fontWeight: 600, fontSize: '14px' }}>
            Or paste content directly
          </label>
          <textarea
            name="content"
            rows="3"
            placeholder="Paste your study material here..."
            style={{ resize: 'vertical' }}
          />
        </div>

        <input
          type="email"
          placeholder="Your email (for plan & reminders)"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <input
            type="number"
            placeholder="Hours/day"
            value={hoursPerDay}
            onChange={(e) => setHoursPerDay(e.target.value)}
          />
          <input
            type="date"
            placeholder="Target/Exam date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
          />
        </div>

        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Generating Plan...' : 'Generate Study Plan'}
        </button>
      </form>
    </div>
  );
}

export default FileUpload;
