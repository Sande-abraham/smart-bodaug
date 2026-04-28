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
import { Toaster, toast } from 'react-hot-toast';
import { query, collection, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { RideRequest, RideStatus } from './types';
import AcceptRideModal from './components/AcceptRideModal';
import { auth, db } from './firebase';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [activeView, setActiveView] = useState('booking');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [hasSetInitialView, setHasSetInitialView] = useState(false);
  const [incomingRequest, setIncomingRequest] = useState<RideRequest | null>(null);

  // Global Rider Request Listener
  useEffect(() => {
    if (!profile || profile.role !== 'rider' || !profile.isOnline || profile.isOnTrip) {
      setIncomingRequest(null);
      return;
    }

    const q = query(
      collection(db, 'rides'),
      where('riderId', '==', profile.uid),
      where('status', '==', RideStatus.REQUESTED)
    );

    const unsub = onSnapshot(q, (snap) => {
      console.log(`RIDER NOTIF: Snapshot update. Found ${snap.docs.length} pending requests`);
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as RideRequest));
        // Sort by timestamp if multiple, take latest
        docs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const req = docs[0];
        
        setIncomingRequest(prev => {
          if (prev?.id !== req.id) {
            toast.success("🚨 NEW RIDE REQUEST!", { duration: 10000 });
            return req;
          }
          return prev;
        });
      } else {
        setIncomingRequest(null);
      }
    }, (error) => {
      console.error("RIDER NOTIF Error:", error);
    });

    return () => unsub();
  }, [profile?.uid, profile?.role, profile?.isOnline, profile?.isOnTrip]);

  const handleAcceptRide = async () => {
    if (!incomingRequest || !profile) return;
    try {
      await updateDoc(doc(db, 'rides', incomingRequest.id!), {
        status: RideStatus.ACCEPTED,
        acceptedAt: new Date().toISOString()
      });
      await updateDoc(doc(db, 'users', profile.uid), { isOnTrip: true });
      setIncomingRequest(null);
      setActiveView('booking'); // Switch to map/booking view where route optimization is
      toast.success("Ride Accepted! Go to pickup.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to accept ride.");
    }
  };

  const handleDeclineRide = async () => {
    if (!incomingRequest || !profile) return;
    try {
      const { arrayUnion, updateDoc, doc: fireDoc } = await import('firebase/firestore');
      await updateDoc(fireDoc(db, 'rides', incomingRequest.id!), {
        riderId: null,
        rejectedRiders: arrayUnion(profile.uid)
      });
      setIncomingRequest(null);
      toast.error("Ride declined.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to decline ride.");
    }
  };

  // Initial View Redirection (Only once on login)
  useEffect(() => {
    if (profile && !hasSetInitialView) {
      const isSuperAdmin = user?.email === 'abrahamsande256@gmail.com';
      if (profile.role === 'rider') {
        setActiveView('dashboard');
      } else if (profile.role === 'admin' || isSuperAdmin) {
        setActiveView('admin');
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

      // 2. Status guards (Bypassed for testing)
      if (profile.status === 'pending' && activeView === 'apply-rider') {
        // Allow them to stay here if they want, but don't force it
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
      <Toaster position="top-center" />
      {incomingRequest && (
        <AcceptRideModal 
          request={incomingRequest}
          onAccept={handleAcceptRide}
          onDecline={handleDeclineRide}
        />
      )}
      <Sidebar 
        isOpen={isSidebarOpen} 
        onClose={() => setIsSidebarOpen(false)} 
        onNavigate={setActiveView}
        activeView={activeView}
      />

      <header className="fixed top-0 left-0 right-0 h-[48px] bg-white/95 backdrop-blur-md border-b border-gray-100 px-3 flex items-center justify-between z-40">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-1 -ml-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Menu className="w-4 h-4 text-black" />
          </button>
          <div className="flex flex-col">
            <h1 className="text-sm font-black tracking-tighter leading-none">BODA SMART</h1>
            <span className="text-[7px] font-bold text-green-500 uppercase flex items-center gap-1">
              <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse"></span>
              Kampala Live
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button 
            onClick={() => setActiveView('profile')}
            className="flex items-center gap-2 active:scale-95 transition-all text-left"
          >
            <div className="text-right hidden xs:block">
              <p className="text-[7px] font-black text-gray-400 uppercase leading-none tracking-tighter">
                {profile?.role === 'rider' ? 'Earnings' : 'Wallet'}
              </p>
              <p className="text-[9px] font-black text-gray-900 leading-none mt-0.5">
                {(profile?.role === 'rider' ? profile?.earnings : profile?.walletBalance || 0)?.toLocaleString()}
              </p>
            </div>
            <div className="w-7 h-7 bg-brand-yellow rounded-lg border border-black flex items-center justify-center overflow-hidden shadow-sm shrink-0">
              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt="avatar" />
            </div>
          </button>
        </div>
      </header>

      <main className="pt-[48px] flex-1 relative overflow-hidden">
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
