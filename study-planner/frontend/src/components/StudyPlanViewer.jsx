import { useState } from 'react';
import { api } from '../services/api.js';
import toast from 'react-hot-toast';
import { Trash2, Calendar, Clock, BookOpen, Target } from 'lucide-react';

function StudyPlanViewer({ plan, onDelete }) {
  const [activeTab, setActiveTab] = useState('schedule');
  const planContent = plan.plan_content;

  const addDeadline = async (milestone) => {
    try {
      await api.post('/deadlines', {
        study_plan_id: plan.id,
        title: milestone.title,
        description: milestone.description,
        due_date: milestone.targetDate,
        email: prompt('Enter email for reminders:') || ''
      });
      toast.success('Deadline added!');
    } catch {
      toast.error('Failed to add deadline');
    }
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
        <div>
          <h2>{planContent.title}</h2>
          <p style={{ color: '#7f8c8d', marginTop: '4px' }}>{planContent.summary}</p>
        </div>
        <button className="btn btn-danger" onClick={onDelete}>
          <Trash2 size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '12px' }}>
        {['schedule', 'milestones', 'resources'].map(tab => (
          <button
            key={tab}
            className="btn"
            style={{
              background: activeTab === tab ? '#3498db' : '#ecf0f1',
              color: activeTab === tab ? 'white' : '#2c3e50'
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'schedule' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={16} color="#3498db" /> {planContent.totalDays} days
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <BookOpen size={16} color="#27ae60" /> {planContent.dailySchedule?.length} sessions
            </span>
          </div>

          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            {planContent.dailySchedule?.map((day, idx) => (
              <div key={idx} style={{
                padding: '12px',
                borderRadius: '8px',
                background: idx % 2 === 0 ? '#f8f9fa' : 'white',
                marginBottom: '8px',
                border: '1px solid #eee'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <strong>Day {day.day}</strong>
                  <span style={{ color: '#7f8c8d', fontSize: '13px' }}>{day.date}</span>
                </div>
                <p style={{ fontSize: '14px', marginBottom: '4px' }}>
                  <strong>Topics:</strong> {day.topics?.join(', ')}
                </p>
                <p style={{ fontSize: '13px', color: '#7f8c8d' }}>
                  <Clock size={12} style={{ display: 'inline' }} /> {day.hours} hours
                </p>
                <ul style={{ marginTop: '6px', paddingLeft: '20px', fontSize: '13px' }}>
                  {day.tasks?.map((task, tidx) => (
                    <li key={tidx}>{task}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'milestones' && (
        <div>
          {planContent.milestones?.map((m, idx) => (
            <div key={idx} style={{
              padding: '16px',
              border: '1px solid #eee',
              borderRadius: '8px',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Target size={18} color="#e74c3c" /> {m.title}
                </h4>
                <button
                  className="btn btn-primary"
                  style={{ padding: '6px 12px', fontSize: '12px' }}
                  onClick={() => addDeadline(m)}
                >
                  <Calendar size={12} style={{ marginRight: '4px' }} />
                  Add Reminder
                </button>
              </div>
              <p style={{ color: '#7f8c8d', fontSize: '13px', marginTop: '4px' }}>
                Target: {m.targetDate}
              </p>
              <p style={{ fontSize: '14px', marginTop: '6px' }}>{m.description}</p>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'resources' && (
        <ul style={{ paddingLeft: '20px' }}>
          {planContent.resources?.map((r, idx) => (
            <li key={idx} style={{ padding: '8px 0', borderBottom: '1px solid #eee' }}>
              {r}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default StudyPlanViewer;
