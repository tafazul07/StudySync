import { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import FileUpload from '../components/FileUpload.jsx';
import DeadlineList from '../components/DeadlineList.jsx';
import toast from 'react-hot-toast';
import { Clock, CheckCircle, AlertCircle } from 'lucide-react';

function Dashboard() {
  const [stats, setStats] = useState({ total: 0, upcoming: 0, completed: 0 });
  const [recentDeadlines, setRecentDeadlines] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
  }, []);

  async function fetchStats() {
    try {
      const [deadlinesRes, plansRes] = await Promise.all([
        api.get('/deadlines'),
        api.get('/study-plans')
      ]);

      const deadlines = deadlinesRes.data.data;
      setStats({
        total: deadlines.length,
        upcoming: deadlines.filter(d => !d.completed && new Date(d.due_date) > new Date()).length,
        completed: deadlines.filter(d => d.completed).length
      });
      setRecentDeadlines(deadlines.slice(0, 5));
    } catch (err) {
      toast.error('Failed to load stats');
    } finally {
      setLoading(false);
    }
  }

  if (loading) return <div className="container"><p>Loading...</p></div>;

  return (
    <div>
      <h1 style={{ marginBottom: '24px' }}>Dashboard</h1>

      <div className="grid" style={{ marginBottom: '32px' }}>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Clock size={32} color="#3498db" />
          <div>
            <h3>{stats.upcoming}</h3>
            <p style={{ color: '#7f8c8d' }}>Upcoming Deadlines</p>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <CheckCircle size={32} color="#27ae60" />
          <div>
            <h3>{stats.completed}</h3>
            <p style={{ color: '#7f8c8d' }}>Completed</p>
          </div>
        </div>
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <AlertCircle size={32} color="#e74c3c" />
          <div>
            <h3>{stats.total}</h3>
            <p style={{ color: '#7f8c8d' }}>Total Deadlines</p>
          </div>
        </div>
      </div>

      <div className="grid">
        <div>
          <FileUpload onSuccess={fetchStats} />
        </div>
        <div>
          <DeadlineList deadlines={recentDeadlines} onUpdate={fetchStats} />
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
