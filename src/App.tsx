import React, { useState, useEffect } from 'react';
import RouteOptimizer from './components/RouteOptimizer';
import { Sidebar } from './components/Sidebar';
import { Menu, Bell, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Auth from './components/Auth';
import TripHistory from './components/TripHistory';
import Dashboard from './components/Dashboard';
import { AdminPanel } from './components/AdminPanel';
import RiderApplicationForm from './components/RiderApplicationForm';
import { NotificationBell } from './components/NotificationBell';
import Profile from './components/Profile';
import { auth, db } from './firebase';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [activeView, setActiveView] = useState('booking');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [hasSetInitialView, setHasSetInitialView] = useState(false);

  // Initial View Redirection (Only once on login)
  useEffect(() => {
    if (profile && !hasSetInitialView) {
      const isSuperAdmin = user?.email === 'abrahamsande256@gmail.com';
      if (profile.role === 'admin' || isSuperAdmin) {
        setActiveView('admin');
      } else if (profile.role === 'rider') {
        setActiveView('dashboard');
      }
      setHasSetInitialView(true);
    }
  }, [profile, hasSetInitialView, user?.email]);

  // Security & Route Guards
  useEffect(() => {
    if (profile) {
      const isSuperAdmin = user?.email === 'abrahamsande256@gmail.com';
      const isAdmin = profile.role === 'admin' || isSuperAdmin;
      const isRider = profile.role === 'rider';

      // 1. Cross-route guards (prevent unauthorized access)
      if (activeView === 'admin' && !isAdmin) setActiveView('booking');
      if (activeView === 'dashboard' && !isRider) setActiveView('booking');
      if (activeView === 'apply-rider' && (isRider || isAdmin)) setActiveView('booking');

      // 2. Status guards
      if (profile.status === 'pending' && activeView !== 'apply-rider' && activeView !== 'profile') {
        setActiveView('apply-rider');
      }

      // 3. Super Admin Role Correction
      if (isSuperAdmin && profile.role !== 'admin') {
        const fixRole = async () => {
           const { doc, updateDoc } = await import('firebase/firestore');
           await updateDoc(doc(db, 'users', user.uid), { role: 'admin' });
        };
        fixRole().catch(console.error);
      }
    }
  }, [profile?.role, profile?.status, activeView, user?.email]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-brand-yellow">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-black rounded-[24px] flex items-center justify-center animate-bounce shadow-xl">
             <span className="text-brand-yellow font-black text-3xl">B</span>
          </div>
          <p className="font-black text-black">BODA SMART</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        onNavigate={setActiveView}
        activeView={activeView}
      />

      <header className="fixed top-0 left-0 right-0 h-[64px] bg-white/80 backdrop-blur-md border-b border-gray-100 px-6 flex items-center justify-between z-40">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Menu className="w-6 h-6 text-black" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-lg font-black tracking-tighter leading-none">BODA SMART</h1>
            <span className="text-[10px] font-bold text-green-500 uppercase flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
              Live in Kampala
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <NotificationBell />
          <button 
            onClick={() => setActiveView('profile')}
            className="flex items-center gap-3 active:scale-95 transition-all"
          >
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-black text-gray-400 uppercase leading-none tracking-tighter">
                {profile?.role === 'rider' ? 'Earnings' : 'Balance'}
              </p>
              <p className="text-xs font-black text-gray-900 leading-none mt-1">
                {(profile?.role === 'rider' ? profile?.earnings : profile?.walletBalance || 0)?.toLocaleString()}
              </p>
            </div>
            <div className="w-9 h-9 bg-brand-yellow rounded-xl border-2 border-black flex items-center justify-center overflow-hidden shadow-sm shrink-0">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt="avatar" />
            </div>
          </button>
        </div>
      </header>

      <main className="pt-[64px] flex-1 relative overflow-hidden">
        {activeView === 'booking' && <RouteOptimizer rider={profile as any} />}
        {activeView === 'dashboard' && <Dashboard trips={[]} />}
        {activeView === 'admin' && <AdminPanel />}
        {activeView === 'apply-rider' && <RiderApplicationForm />}
        {activeView === 'logbook' && (
          <div className="h-full overflow-y-auto p-4 bg-white">
            <TripHistory trips={[]} />
          </div>
        )}
        {activeView === 'profile' && (
          <div className="h-full overflow-y-auto p-4 bg-white">
            <div className="max-w-xl mx-auto py-8">
              <Profile onComplete={() => setActiveView(profile?.role === 'rider' ? 'dashboard' : 'booking')} />
              <div className="mt-12 pt-8 border-t border-gray-100 flex flex-col items-center">
                 <button 
                  onClick={() => auth.signOut()}
                  className="px-8 py-4 bg-black text-brand-yellow rounded-2xl font-black shadow-lg flex items-center gap-2 hover:bg-gray-900 transition-colors"
                >
                  <LogOut className="w-5 h-5" /> LOGOUT SYSTEM
                </button>
                <p className="mt-4 text-[10px] font-black text-gray-300 uppercase tracking-widest">BodaSmart Security Protocol v1.4</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;
