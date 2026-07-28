import { useState, useEffect } from 'react';
import { Routes, Route, Link, useLocation, Navigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Calendar, 
  MessageSquare, 
  BookOpen, 
  Shield, 
  Video, 
  FileEdit,
  Search,
  Menu,
  X,
  Moon,
  Sun,
  Sparkles,
  Flame,
  LogOut,
  User,
  ChevronDown,
  Bot
} from 'lucide-react';
import { useAuth } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Dashboard from './pages/Dashboard';
import StudyPlanner from './pages/StudyPlanner';
import CollaborationEditor from './pages/CollaborationEditor';
import QuizGenerator from './pages/QuizGenerator';
import SecureVault from './pages/SecureVault';
import WebRTC from './pages/WebRTC';
import PdfEditor from './pages/PdfEditor';
import PdfRAG from './pages/PdfRAG';
import Chatbot from './pages/Chatbot';
import VoiceWidget from './components/VoiceWidget';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, color: 'from-blue-500 to-cyan-500' },
  { name: 'Focus Flow', href: '/planner', icon: Calendar, color: 'from-emerald-500 to-teal-500' },
  { name: 'Brain Sync', href: '/collaboration', icon: MessageSquare, color: 'from-purple-500 to-pink-500' },
  { name: 'Quiz Forge', href: '/quiz', icon: BookOpen, color: 'from-orange-500 to-amber-500' },
  { name: 'Sync Vault', href: '/vault', icon: Shield, color: 'from-rose-500 to-red-500' },
  { name: 'Sync Meet', href: '/webrtc', icon: Video, color: 'from-indigo-500 to-violet-500' },
  { name: 'Doc Mind', href: '/pdf-editor', icon: FileEdit, color: 'from-sky-500 to-blue-500' },
  { name: 'Paper Mind', href: '/pdf-rag', icon: Search, color: 'from-fuchsia-500 to-purple-500' },
  { name: 'Sync AI', href: '/chatbot', icon: Bot, color: 'from-violet-500 to-purple-600' },
];

function ParticleBackground() {
  const particles = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 5,
    size: Math.random() * 4 + 2,
  }));

  return (
    <div className="particle-bg">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: `${p.left}%`,
            top: `${p.top}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

function UserMenu({ user, logout }) {
  const [open, setOpen] = useState(false);

  const initials = user?.fullName
    ? user.fullName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() || '?';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-all group"
      >
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shadow-md">
          {initials}
        </div>
        <div className="hidden sm:block text-left">
          <div className="text-xs font-semibold text-gray-800 dark:text-gray-100 leading-none">
            {user?.fullName || 'User'}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{user?.role}</div>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-52 bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200/50 dark:border-gray-700/50 z-50 animate-scale-in overflow-hidden">
            <div className="p-3 border-b border-gray-100 dark:border-gray-700">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {user?.fullName || 'User'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{user?.email}</div>
            </div>
            <div className="p-1">
              <button
                onClick={() => { setOpen(false); logout(); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    // Persist dark mode in localStorage
    const saved = localStorage.getItem('darkMode');
    return saved === 'true';
  });
  const [pageTransition, setPageTransition] = useState(false);
  const location = useLocation();
  const { user, logout } = useAuth();

  // Apply dark mode class on mount and toggle
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('darkMode', String(next));
  };

  useEffect(() => {
    setPageTransition(true);
    const timer = setTimeout(() => setPageTransition(false), 500);
    return () => clearTimeout(timer);
  }, [location.pathname]);

  const currentPage = navigation.find((item) => item.href === location.pathname);

  return (
    <div className={`min-h-screen ${darkMode ? 'dark' : ''}`}>
      <ParticleBackground />
      <div className="flex relative z-10">
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-72 glass-card transform transition-all duration-500 ease-out lg:translate-x-0 lg:static lg:inset-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex flex-col h-full">
            {/* Logo */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200/50 dark:border-gray-700/50">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-indigo-500 rounded-xl blur-lg opacity-50 animate-pulse-slow" />
                  <div className="relative bg-gradient-to-br from-primary-600 to-indigo-600 p-2 rounded-xl">
                    <Sparkles className="w-6 h-6 text-white" />
                  </div>
                </div>
                <h1 className="text-2xl font-extrabold gradient-text">StudySync</h1>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`group relative flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 overflow-hidden ${
                      isActive
                        ? 'bg-gradient-to-r text-white shadow-lg transform scale-105'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 hover:scale-102'
                    }`}
                  >
                    {isActive && (
                      <div className={`absolute inset-0 bg-gradient-to-r ${item.color} opacity-100`} />
                    )}
                    <div className={`relative flex items-center gap-3 ${isActive ? 'text-white' : ''}`}>
                      <div className={`relative ${isActive ? 'animate-pulse-slow' : 'group-hover:scale-110 transition-transform'}`}>
                        {isActive && (
                          <div className={`absolute inset-0 bg-gradient-to-r ${item.color} rounded-lg blur-md opacity-50`} />
                        )}
                        <Icon className={`w-5 h-5 relative ${isActive ? 'text-white' : 'text-gray-600 dark:text-gray-400 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors'}`} />
                      </div>
                      <span className={`font-semibold ${isActive ? 'text-white' : 'group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors'}`}>
                        {item.name}
                      </span>
                    </div>
                    {isActive && (
                      <div className="absolute right-2 w-2 h-2 bg-white rounded-full animate-bounce" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Dark mode + user info at bottom */}
            <div className="p-4 border-t border-gray-200/50 dark:border-gray-700/50 space-y-2">
              <button
                onClick={toggleDarkMode}
                className="group relative flex items-center gap-3 w-full px-4 py-3 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-100/50 dark:hover:bg-gray-800/50 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-3">
                  {darkMode ? (
                    <>
                      <Sun className="w-5 h-5 text-amber-500 group-hover:rotate-180 transition-transform duration-500" />
                      <span className="font-medium">Light Mode</span>
                    </>
                  ) : (
                    <>
                      <Moon className="w-5 h-5 text-indigo-500 group-hover:rotate-180 transition-transform duration-500" />
                      <span className="font-medium">Dark Mode</span>
                    </>
                  )}
                </div>
              </button>

              {/* Sidebar logout */}
              <button
                onClick={logout}
                className="group relative flex items-center gap-3 w-full px-4 py-3 rounded-xl text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-300"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-medium">Sign Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 flex flex-col min-h-screen">
          {/* Header */}
          <header className="glass-card sticky top-0 z-30 px-6 py-4 border-b border-gray-200/50 dark:border-gray-700/50">
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-lg text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-all"
              >
                <Menu className="w-6 h-6" />
              </button>
              <div className="flex items-center gap-3">
                {currentPage && (
                  <div className={`relative p-2 rounded-xl bg-gradient-to-br ${currentPage.color}`}>
                    <div className="absolute inset-0 bg-white/20 rounded-xl animate-pulse-slow" />
                    <currentPage.icon className="w-6 h-6 text-white relative" />
                  </div>
                )}
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 text-shadow">
                  {currentPage?.name || 'Dashboard'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 rounded-full bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                  <Flame className="w-4 h-4 text-emerald-500 animate-pulse" />
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Pro</span>
                </div>
                <UserMenu user={user} logout={logout} />
              </div>
            </div>
          </header>

          {/* Page content */}
          <main className={`flex-1 p-6 overflow-auto ${pageTransition ? 'animate-fade-in' : ''}`}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/planner" element={<StudyPlanner />} />
              <Route path="/collaboration" element={<CollaborationEditor />} />
              <Route path="/quiz" element={<QuizGenerator />} />
              <Route path="/vault" element={<SecureVault />} />
              <Route path="/webrtc" element={<WebRTC />} />
              <Route path="/pdf-editor" element={<PdfEditor />} />
              <Route path="/pdf-rag" element={<PdfRAG />} />
              <Route path="/chatbot" element={<Chatbot />} />
            </Routes>
          </main>
          {/* Voice Control Widget */}
          <VoiceWidget />
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Protected app shell */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
