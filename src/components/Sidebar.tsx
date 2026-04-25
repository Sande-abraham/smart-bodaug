import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, User, Navigation, Book, Shield, Settings, LogOut, Bike, ShieldCheck, LayoutDashboard } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebase';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  activeView: string;
}

export function Sidebar({ isOpen, onClose, onNavigate, activeView }: SidebarProps) {
  const { profile, user: authUser } = useAuth();

  const customerItems = [
    { id: 'booking', label: 'Book Ride', icon: Navigation },
    { id: 'logbook', label: 'My Trips', icon: Book },
    { id: 'apply-rider', label: 'Become a Rider', icon: Bike },
  ];

  const riderItems = [
    { id: 'dashboard', label: 'Rider Dashboard', icon: LayoutDashboard },
    { id: 'booking', label: 'Book Ride', icon: Navigation },
    { id: 'logbook', label: 'Trip History', icon: Book },
  ];

  const adminItems = [
    { id: 'admin', label: 'Admin Panel', icon: ShieldCheck },
    { id: 'booking', label: 'Book Ride', icon: Navigation },
    { id: 'all-trips', label: 'All Trips', icon: Book },
    { id: 'users', label: 'Riders & Clients', icon: User },
  ];

  const menuItems = profile?.role === 'admin' ? adminItems : 
                    profile?.role === 'rider' ? riderItems : 
                    customerItems;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 left-0 w-80 bg-white z-[60] shadow-2xl flex flex-col"
          >
            <div className="p-8 bg-brand-yellow">
              <div className="flex items-center justify-between mb-8">
                <div className="w-12 h-12 bg-black rounded-2xl flex items-center justify-center text-brand-yellow font-black text-xl">
                  B
                </div>
                <button 
                  onClick={onClose}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <X className="w-6 h-6 text-black" />
                </button>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white rounded-2xl border-2 border-black/5 flex items-center justify-center overflow-hidden">
                  <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="avatar" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-black text-lg text-black leading-none">{profile?.displayName || 'User'}</p>
                    {authUser?.email === 'abrahamsande256@gmail.com' && (
                      <span className="bg-black text-brand-yellow text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">Owner</span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-black/60">UGX {(profile?.earnings || 0).toLocaleString()} Balance</p>
                </div>
              </div>
            </div>

            <div className="flex-1 p-4 overflow-y-auto">
              <div className="grid gap-2">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        onNavigate(item.id);
                        onClose();
                      }}
                      className={cn(
                        "w-full flex items-center gap-4 p-4 rounded-2xl font-black text-sm transition-all",
                        activeView === item.id 
                          ? "bg-brand-yellow text-black" 
                          : "text-gray-500 hover:bg-gray-50"
                      )}
                    >
                      <Icon className="w-5 h-5" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-gray-100 space-y-2">
              <button 
                onClick={async () => {
                  try {
                    await auth.signOut();
                    onClose();
                  } catch (err) {
                    console.error("Logout error:", err);
                  }
                }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl font-black text-sm text-red-500 hover:bg-red-50 transition-all"
              >
                <LogOut className="w-5 h-5" />
                Logout
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
