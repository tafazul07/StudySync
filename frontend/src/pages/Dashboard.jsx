import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  Calendar, 
  MessageSquare, 
  BookOpen, 
  Shield, 
  Video, 
  FileEdit,
  Search,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  Crown,
  Sparkles,
  Bell,
  Award,
  Target,
  Zap,
  Flame,
  Star,
  Bot
} from 'lucide-react';
import { gsap } from 'gsap';
import { apiFetch } from '../services/api';

export default function Dashboard() {
  const [stats, setStats] = useState({
    studyPlans: 0,
    deadlines: 0,
    documents: 0,
    quizzes: 0,
    vaults: 0,
    rooms: 0,
    conversations: 0
  });
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [greeting, setGreeting] = useState('');
  
  // Refs for GSAP animations
  const welcomeRef = useRef(null);
  const statsRef = useRef(null);
  const modulesRef = useRef(null);
  const activityRef = useRef(null);
  const ownershipRef = useRef(null);
  const rightsRef = useRef(null);
  const greetingRef = useRef(null);
  const bellRef = useRef(null);
  const achievementRef = useRef(null);
  const quoteRef = useRef(null);

  useEffect(() => {
    fetchDashboardData();
    setGreetingBasedOnTime();
  }, []);

  const setGreetingBasedOnTime = () => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  };

  useEffect(() => {
    if (!loading) {
      // Animate greeting
      gsap.fromTo(greetingRef.current,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
      );

      // Animate bell
      gsap.fromTo(bellRef.current,
        { opacity: 0, scale: 0, rotation: -180 },
        { opacity: 1, scale: 1, rotation: 0, duration: 0.5, ease: 'elastic.out(1, 0.5)', delay: 0.2 }
      );

      // Animate welcome section
      gsap.fromTo(welcomeRef.current, 
        { opacity: 0, y: -30 },
        { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', delay: 0.3 }
      );

      // Animate stats cards with stagger
      gsap.fromTo(statsRef.current.children,
        { opacity: 0, y: 30, scale: 0.9 },
        { opacity: 1, y: 0, scale: 1, duration: 0.6, stagger: 0.1, ease: 'back.out(1.7)', delay: 0.4 }
      );

      // Animate achievement section
      gsap.fromTo(achievementRef.current,
        { opacity: 0, x: -50 },
        { opacity: 1, x: 0, duration: 0.7, ease: 'power3.out', delay: 0.6 }
      );

      // Animate module cards with stagger
      gsap.fromTo(modulesRef.current.children,
        { opacity: 0, y: 50, rotationX: -10 },
        { opacity: 1, y: 0, rotationX: 0, duration: 0.7, stagger: 0.08, ease: 'power2.out', delay: 0.7 }
      );

      // Animate quote section
      gsap.fromTo(quoteRef.current,
        { opacity: 0, y: 30 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', delay: 0.9 }
      );

      // Animate activity section
      gsap.fromTo(activityRef.current,
        { opacity: 0, x: -30 },
        { opacity: 1, x: 0, duration: 0.6, ease: 'power3.out', delay: 1 }
      );

      // Animate ownership badge
      gsap.fromTo(ownershipRef.current,
        { opacity: 0, scale: 0 },
        { opacity: 1, scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)', delay: 1.1 }
      );

      // Animate rights banner
      gsap.fromTo(rightsRef.current,
        { opacity: 0, x: 100 },
        { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out', delay: 1.2 }
      );
    }
  }, [loading]);

  const fetchDashboardData = async () => {
    try {
      // Fetch data from all modules
      const [plansRes, deadlinesRes, docsRes, quizzesRes, vaultsRes, roomsRes, chatbotRes] = await Promise.all([
        apiFetch('/api/study-plans').then(r => r.json()).catch(() => ({ data: [] })),
        apiFetch('/api/deadlines').then(r => r.json()).catch(() => ({ data: [] })),
        apiFetch('/api/documents').then(r => r.json()).catch(() => []),
        apiFetch('/api/quizzes').then(r => r.json()).catch(() => ({ quizzes: [] })),
        apiFetch('/api/vaults/list').then(r => r.json()).catch(() => []),
        apiFetch('/api/webrtc/rooms').then(r => r.json()).catch(() => ({ rooms: [] })),
        apiFetch('/api/chatbot/conversations').then(r => r.json()).catch(() => [])
      ]);

      const docs = Array.isArray(docsRes) ? docsRes : (docsRes.documents || []);
      const vaults = Array.isArray(vaultsRes) ? vaultsRes : [];

      setStats({
        studyPlans: plansRes.data?.length || 0,
        deadlines: deadlinesRes.data?.length || 0,
        documents: docs.length || 0,
        quizzes: quizzesRes.quizzes?.length || 0,
        vaults: vaults.length || 0,
        rooms: roomsRes.rooms?.length || 0,
        conversations: Array.isArray(chatbotRes) ? chatbotRes.length : 0
      });

      // Combine recent activity from all modules
      const activities = [
        ...(plansRes.data || []).slice(0, 3).map(p => ({
          type: 'study-plan',
          title: p.title,
          time: p.created_at,
          icon: Calendar
        })),
        ...docs.slice(0, 3).map(d => ({
          type: 'document',
          title: d.original_name || d.title,
          time: d.created_at,
          icon: FileEdit
        })),
        ...(quizzesRes.quizzes || []).slice(0, 3).map(q => ({
          type: 'quiz',
          title: q.title,
          time: q.created_at,
          icon: BookOpen
        }))
      ].sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 6);

      setRecentActivity(activities);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const modules = [
    {
      name: 'Focus Flow',
      description: 'Create and manage study plans with deadlines',
      icon: Calendar,
      count: stats.studyPlans,
      href: '/planner',
      color: 'from-blue-500 to-blue-600'
    },
    {
      name: 'Brain Sync',
      description: 'Real-time collaborative document editing',
      icon: MessageSquare,
      count: stats.documents,
      href: '/collaboration',
      color: 'from-purple-500 to-purple-600'
    },
    {
      name: 'Quiz Forge',
      description: 'Generate quizzes from uploaded documents',
      icon: BookOpen,
      count: stats.quizzes,
      href: '/quiz',
      color: 'from-green-500 to-green-600'
    },
    {
      name: 'Sync Vault',
      description: 'Secure file sharing with encryption',
      icon: Shield,
      count: stats.vaults,
      href: '/vault',
      color: 'from-yellow-500 to-yellow-600'
    },
    {
      name: 'Sync Meet',
      description: 'Video conferencing for study groups',
      icon: Video,
      count: stats.rooms,
      href: '/webrtc',
      color: 'from-red-500 to-red-600'
    },
    {
      name: 'Doc Mind',
      description: 'Edit and annotate PDF documents',
      icon: FileEdit,
      count: 0,
      href: '/pdf-editor',
      color: 'from-indigo-500 to-indigo-600'
    },
    {
      name: 'Paper Mind',
      description: 'AI-powered PDF search and Q&A',
      icon: Search,
      count: 0,
      href: '/pdf-rag',
      color: 'from-pink-500 to-pink-600'
    },
    {
      name: 'Sync AI',
      description: 'Chat with AI powered by top models',
      icon: Bot,
      count: stats.conversations,
      href: '/chatbot',
      color: 'from-violet-500 to-purple-600'
    }
  ];

  const formatTime = (time) => {
    const date = new Date(time);
    const now = new Date();
    const diff = now - date;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Greeting Header */}
      <div className="flex items-center justify-between">
        <div ref={greetingRef} className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-indigo-500 rounded-full blur-xl opacity-30 animate-pulse-slow" />
            <div className="relative w-12 h-12 bg-gradient-to-br from-primary-500 to-indigo-600 rounded-full flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold gradient-text">{greeting}!</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Ready to achieve your learning goals</p>
          </div>
        </div>
        <div ref={bellRef} className="relative cursor-pointer group">
          <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-orange-400 rounded-full blur-md opacity-0 group-hover:opacity-50 transition-opacity" />
          <div className="relative w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center">
            <span className="text-[8px] font-bold text-white">3</span>
          </div>
        </div>
      </div>

      {/* Welcome Section */}
      <div ref={welcomeRef} className="glass-card rounded-2xl p-8 bg-gradient-to-r from-primary-500 to-indigo-600 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent animate-shimmer" />
        <div className="absolute -right-20 -top-20 w-60 h-60 bg-white/10 rounded-full blur-3xl animate-pulse-slow" />
        <div className="absolute -left-20 -bottom-20 w-60 h-60 bg-white/10 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '0.5s' }} />
        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Welcome to StudySync</h1>
              <p className="text-primary-100">Your unified learning platform for collaborative study</p>
            </div>
            {/* Ownership Badge */}
            <div ref={ownershipRef} className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-amber-400 to-yellow-400 rounded-full blur-xl opacity-50 animate-pulse-slow" />
              <div className="relative flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-bold shadow-lg">
                <Crown className="w-5 h-5 animate-bounce" />
                <span>Owner</span>
                <Sparkles className="w-4 h-4 animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Achievement Section */}
      <div ref={achievementRef} className="glass-card rounded-2xl p-6 border border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full blur-md opacity-30 animate-pulse" />
            <div className="relative w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center shadow-lg">
              <Award className="w-8 h-8 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
              Learning Streak
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">You're on a 7-day streak! Keep it up!</p>
            <div className="flex items-center gap-1 mt-2">
              {[...Array(7)].map((_, i) => (
                <Star key={i} className="w-4 h-4 text-amber-500 fill-amber-500" />
              ))}
              <Star className="w-4 h-4 text-gray-300" />
              <Star className="w-4 h-4 text-gray-300" />
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-extrabold gradient-text">7</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">days</div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div ref={statsRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="glass-card rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl hover:shadow-primary-500/20 transition-all duration-300 card-hover">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Study Plans</h3>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg blur-md opacity-30" />
              <Calendar className="w-6 h-6 text-blue-600 relative" />
            </div>
          </div>
          <p className="text-4xl font-extrabold gradient-text">{stats.studyPlans}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Active plans</p>
        </div>

        <div className="glass-card rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl hover:shadow-orange-500/20 transition-all duration-300 card-hover">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Deadlines</h3>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-orange-500 to-amber-500 rounded-lg blur-md opacity-30" />
              <Clock className="w-6 h-6 text-orange-600 relative" />
            </div>
          </div>
          <p className="text-4xl font-extrabold gradient-text">{stats.deadlines}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Upcoming tasks</p>
        </div>

        <div className="glass-card rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl hover:shadow-emerald-500/20 transition-all duration-300 card-hover">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Quizzes</h3>
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-green-500 rounded-lg blur-md opacity-30" />
              <BookOpen className="w-6 h-6 text-emerald-600 relative" />
            </div>
          </div>
          <p className="text-4xl font-extrabold gradient-text">{stats.quizzes}</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Generated quizzes</p>
        </div>
      </div>

      {/* Module Cards */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary-600" />
          Quick Access
        </h2>
        <div ref={modulesRef} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {modules.map((module) => {
            const Icon = module.icon;
            return (
              <Link
                key={module.name}
                to={module.href}
                className="glass-card rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50 hover:shadow-xl hover:shadow-primary-500/20 transition-all duration-300 card-hover group"
              >
                <div className={`relative w-12 h-12 rounded-xl bg-gradient-to-br ${module.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 shadow-lg`}>
                  <div className="absolute inset-0 bg-white/20 rounded-xl animate-pulse-slow" />
                  <Icon className="w-6 h-6 text-white relative" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{module.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{module.description}</p>
                {module.count > 0 && (
                  <div className="flex items-center gap-2 text-sm text-primary-600 dark:text-primary-400 font-semibold">
                    <TrendingUp className="w-4 h-4" />
                    <span>{module.count} items</span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Motivational Quote */}
      <div ref={quoteRef} className="glass-card rounded-2xl p-8 border border-gray-200/50 dark:border-gray-700/50 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-full blur-2xl" />
        <div className="relative z-10 text-center">
          <div className="inline-block mb-4">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full blur-md opacity-30 animate-pulse" />
              <div className="relative w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
                <Target className="w-6 h-6 text-white" />
              </div>
            </div>
          </div>
          <blockquote className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            "The beautiful thing about learning is that no one can take it away from you."
          </blockquote>
          <p className="text-sm text-gray-600 dark:text-gray-400">— B.B. King</p>
          <div className="flex items-center justify-center gap-2 mt-6">
            <Zap className="w-4 h-4 text-amber-500 animate-pulse" />
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">Keep pushing forward!</span>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div ref={activityRef} className="glass-card rounded-xl p-6 border border-gray-200/50 dark:border-gray-700/50">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
          <Clock className="w-6 h-6 text-primary-600" />
          Recent Activity
        </h2>
        {recentActivity.length > 0 ? (
          <div className="space-y-4">
            {recentActivity.map((activity, index) => {
              const Icon = activity.icon;
              return (
                <div
                  key={index}
                  className="flex items-center gap-4 p-4 rounded-xl bg-gradient-to-r from-gray-50 to-white dark:from-gray-800/50 dark:to-gray-800/30 border border-gray-200/50 dark:border-gray-700/30 hover:border-primary-400/60 hover:shadow-lg hover:shadow-primary-500/20 transition-all duration-300 group"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary-500 to-indigo-500 rounded-full blur-md opacity-30 group-hover:opacity-50 transition-opacity" />
                    <div className="relative w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 group-hover:text-primary-600 dark:group-hover:text-primary-400 transition-colors">{activity.title}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{activity.type.replace('-', ' ')}</p>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{formatTime(activity.time)}</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl bg-gradient-to-br from-gray-50/50 to-white/50 dark:from-gray-900/10 dark:to-gray-900/5">
            <div className="relative inline-block mb-3">
              <div className="absolute inset-0 bg-gradient-to-r from-gray-400 to-gray-500 rounded-full blur-xl opacity-30 animate-pulse-slow" />
              <AlertCircle className="w-12 h-12 text-gray-400 mx-auto relative" />
            </div>
            <p className="text-gray-500 dark:text-gray-400 font-medium">No recent activity</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Start using the modules to see your activity here</p>
          </div>
        )}
      </div>

      {/* Rights Banner */}
      <div ref={rightsRef} className="glass-card rounded-2xl p-6 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent animate-shimmer" />
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl animate-pulse-slow" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-2xl animate-pulse-slow" style={{ animationDelay: '0.5s' }} />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-white/30 rounded-full blur-md animate-pulse" />
              <div className="relative w-14 h-14 bg-white/20 rounded-full flex items-center justify-center backdrop-blur-sm">
                <Shield className="w-8 h-8 text-white" />
              </div>
            </div>
            <div>
              <h3 className="text-xl font-bold">All Rights Reserved</h3>
              <p className="text-emerald-100 text-sm">© 2026 StudySync. Your data is protected with enterprise-grade security.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/20 backdrop-blur-sm border border-white/30">
            <CheckCircle className="w-5 h-5" />
            <span className="font-semibold text-sm">Secure & Private</span>
          </div>
        </div>
      </div>
    </div>
  );
}
