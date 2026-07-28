import { Routes, Route, Link } from 'react-router-dom';
import Dashboard from './pages/Dashboard.jsx';
import StudyPlanPage from './pages/StudyPlanPage.jsx';
import { BookOpen, Calendar, Home } from 'lucide-react';

function App() {
  return (
    <div>
      <nav style={{
        background: '#2c3e50',
        padding: '16px 24px',
        display: 'flex',
        gap: '24px',
        alignItems: 'center'
      }}>
        <Link to="/" style={{ color: 'white', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BookOpen size={20} /> Study Planner
        </Link>
        <Link to="/" style={{ color: '#bdc3c7', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
          <Home size={16} /> Dashboard
        </Link>
        <Link to="/plans" style={{ color: '#bdc3c7', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}>
          <Calendar size={16} /> My Plans
        </Link>
      </nav>

      <div className="container">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/plans" element={<StudyPlanPage />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
