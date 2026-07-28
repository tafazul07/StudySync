import { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import StudyPlanViewer from '../components/StudyPlanViewer.jsx';
import toast from 'react-hot-toast';

function StudyPlanPage() {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPlans();
  }, []);

  async function fetchPlans() {
    try {
      const res = await api.get('/study-plans');
      setPlans(res.data.data);
    } catch {
      toast.error('Failed to load plans');
    } finally {
      setLoading(false);
    }
  }

  async function deletePlan(id) {
    if (!confirm('Delete this study plan?')) return;
    try {
      await api.delete(`/study-plans/${id}`);
      toast.success('Deleted');
      setSelectedPlan(null);
      fetchPlans();
    } catch {
      toast.error('Failed to delete');
    }
  }

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      <h1>My Study Plans</h1>

      <div className="grid">
        <div>
          {plans.length === 0 ? (
            <div className="card">
              <p style={{ color: '#7f8c8d', textAlign: 'center' }}>
                No study plans yet. Create one from the Dashboard!
              </p>
            </div>
          ) : (
            plans.map(plan => (
              <div
                key={plan.id}
                className="card"
                style={{
                  cursor: 'pointer',
                  borderLeft: selectedPlan?.id === plan.id ? '4px solid #3498db' : '4px solid transparent'
                }}
                onClick={() => setSelectedPlan(plan)}
              >
                <h3>{plan.title}</h3>
                <p style={{ fontSize: '13px', color: '#7f8c8d' }}>
                  Created: {new Date(plan.created_at).toLocaleDateString()}
                </p>
                <p style={{ fontSize: '13px', color: '#7f8c8d' }}>
                  File: {plan.original_filename || 'Text input'}
                </p>
              </div>
            ))
          )}
        </div>

        <div>
          {selectedPlan && (
            <StudyPlanViewer plan={selectedPlan} onDelete={() => deletePlan(selectedPlan.id)} />
          )}
        </div>
      </div>
    </div>
  );
}

export default StudyPlanPage;
