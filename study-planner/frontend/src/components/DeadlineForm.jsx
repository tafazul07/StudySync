import { useState } from 'react';
import { api } from '../services/api.js';
import toast from 'react-hot-toast';

function DeadlineForm({ studyPlanId, onSuccess }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      await api.post('/deadlines', {
        study_plan_id: studyPlanId,
        title,
        description,
        due_date: dueDate,
        email,
        phone: phone || null
      });
      toast.success('Deadline added!');
      setTitle('');
      setDescription('');
      setDueDate('');
      setEmail('');
      setPhone('');
      onSuccess();
    } catch {
      toast.error('Failed to add deadline');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <h3>Add Custom Deadline</h3>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows="2"
        />
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          required
        />
        <input
          type="email"
          placeholder="Email for reminders"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="tel"
          placeholder="Phone for SMS (optional)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%' }}>
          {loading ? 'Adding...' : 'Add Deadline'}
        </button>
      </form>
    </div>
  );
}

export default DeadlineForm;
