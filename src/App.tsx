import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AdminDashboard from './components/AdminDashboard';
import UserDashboard from './components/UserDashboard';
import { Login, Signup, ForgotPassword, ResetPassword } from './components/Auth';
import { Library, User, ShieldCheck, LogOut, Loader2 } from 'lucide-react';
import { LibraryService } from './services/LibraryService';

function AppContent() {
  const { user, loading, logout } = useAuth();
  const [authView, setAuthView] = useState<'login' | 'signup' | 'forgot-password' | 'reset-password'>('login');
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [libraryName, setLibraryName] = useState('SLMS');

  useEffect(() => {
    // Check for reset token in URL
    const urlParams = new URLSearchParams(window.location.search);
    const token = urlParams.get('token');
    if (token) {
      setResetToken(token);
      setAuthView('reset-password');
      // Clean up URL without reload
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    const fetchSettings = async () => {
      try {
        const settings = await LibraryService.getSettings();
        if (settings && settings.libraryName) {
          setLibraryName(settings.libraryName);
        }
      } catch (error) {
        console.error('Failed to fetch library name:', error);
      }
    };
    fetchSettings();

    // Listen for library name changes from AdminDashboard
    (window as any).onLibraryNameChange = (newName: string) => {
      setLibraryName(newName);
    };

    return () => {
      delete (window as any).onLibraryNameChange;
    };
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 className="animate-spin text-blue-600" size={48} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
        {authView === 'signup' ? (
          <Signup onToggleLogin={() => setAuthView('login')} />
        ) : authView === 'forgot-password' ? (
          <ForgotPassword onToggleLogin={() => setAuthView('login')} />
        ) : authView === 'reset-password' && resetToken ? (
          <ResetPassword token={resetToken} onComplete={() => setAuthView('login')} />
        ) : (
          <Login 
            onToggleSignup={() => setAuthView('signup')} 
            onToggleForgotPassword={() => setAuthView('forgot-password')}
          />
        )}
      </div>
    );
  }

  const role = user.role;

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Header */}
      <header className="bg-[#2c3e50] text-white px-6 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-3">
          <div className="bg-white/10 p-1.5 rounded">
            <Library size={24} />
          </div>
          <h1 className="text-xl font-semibold tracking-tight">{libraryName}</h1>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 text-sm text-slate-300">
            {role === 'admin' ? <ShieldCheck size={16} /> : <User size={16} />}
            <span>Welcome, {user.displayName || user.username || user.email || 'User'} ({role})</span>
          </div>
          <button 
            onClick={logout}
            className="flex items-center gap-2 text-sm hover:text-red-400 transition-colors"
          >
            <LogOut size={16} />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-[1400px] mx-auto">
        {role === 'admin' ? (
          <AdminDashboard />
        ) : role === 'user' ? (
          <UserDashboard />
        ) : (
          <div className="text-center p-12 bg-white rounded-xl shadow-sm border border-slate-100">
            <h2 className="text-xl font-semibold text-slate-800">Access Denied</h2>
            <p className="text-slate-500 mt-2">Your account does not have a valid role assigned. Please contact the administrator.</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
