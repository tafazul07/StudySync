import { api } from '../services/api.js';
import toast from 'react-hot-toast';
import { CheckCircle, Trash2, Bell } from 'lucide-react';

function DeadlineList({ deadlines, onUpdate }) {
  const toggleComplete = async (id, current) => {
    try {
      await api.patch(`/deadlines/${id}`, { completed: !current });
      toast.success('Updated!');
      onUpdate();
    } catch {
      toast.error('Failed to update');
    }
  };

  const deleteDeadline = async (id) => {
    if (!confirm('Delete this deadline?')) return;
    try {
      await api.delete(`/deadlines/${id}`);
      toast.success('Deleted');
      onUpdate();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const getStatus = (deadline) => {
    if (deadline.completed) return { class: 'status-completed', text: 'Completed' };
    if (new Date(deadline.due_date) < new Date()) return { class: 'status-overdue', text: 'Overdue' };
    return { class: 'status-upcoming', text: 'Upcoming' };
  };

  return (
    <div className="card">
      <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Bell size={20} /> Recent Deadlines
      </h2>

      {deadlines.length === 0 ? (
        <p style={{ color: '#7f8c8d', textAlign: 'center', padding: '20px' }}>
          No deadlines yet. Create a study plan to get started!
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {deadlines.map(d => {
            const status = getStatus(d);
            return (
              <div key={d.id} style={{
                padding: '16px',
                borderRadius: '8px',
                border: '1px solid #eee',
                background: d.completed ? '#f8f9fa' : 'white'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ 
                      textDecoration: d.completed ? 'line-through' : 'none',
                      color: d.completed ? '#7f8c8d' : '#2c3e50'
                    }}>
                      {d.title}
                    </h4>
                    <p style={{ fontSize: '13px', color: '#7f8c8d', marginTop: '4px' }}>
                      Due: {new Date(d.due_date).toLocaleString()}
                    </p>
                    {d.phone && (
                      <p style={{ fontSize: '12px', color: '#3498db', marginTop: '2px' }}>
                        SMS reminders enabled
                      </p>
                    )}
                  </div>
                  <span className={`status-badge ${status.class}`}>{status.text}</span>
                </div>

                <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                  <button
                    className="btn btn-success"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    onClick={() => toggleComplete(d.id, d.completed)}
                  >
                    <CheckCircle size={14} style={{ marginRight: '4px' }} />
                    {d.completed ? 'Undo' : 'Complete'}
                  </button>
                  <button
                    className="btn btn-danger"
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    onClick={() => deleteDeadline(d.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DeadlineList;
