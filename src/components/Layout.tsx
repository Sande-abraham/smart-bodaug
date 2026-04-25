import React from 'react';
import { LogOut, User, MapPin, LayoutDashboard, History, Lightbulb, Navigation } from 'lucide-react';
import { motion } from 'motion/react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { cn } from '../lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Layout({ children, activeTab, setActiveTab }: LayoutProps) {
  const tabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'optimize', label: 'New Trip', icon: Navigation },
    { id: 'history', label: 'Logbook', icon: History },
    { id: 'insights', label: 'Intel', icon: Lightbulb },
  ];

  return (
    <div className="min-h-screen bg-bg-main flex flex-col font-sans selection:bg-brand-yellow selection:text-black">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md p-4 sticky top-0 z-50 flex justify-between items-center border-b border-gray-100 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-brand-yellow rounded-xl flex items-center justify-center">
            <Navigation className="w-5 h-5 text-black" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">
            BodaOptimizer
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setActiveTab('profile')}
            className="w-10 h-10 rounded-2xl border-2 border-brand-yellow/30 overflow-hidden bg-white shadow-sm flex items-center justify-center hover:border-brand-yellow transition-all"
          >
            <User className="w-6 h-6 text-gray-400" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-lg mx-auto w-full px-4 pt-6 pb-32">
        {children}
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 p-4 z-50 pointer-events-none">
        <div className="max-w-lg mx-auto bg-brand-black/90 backdrop-blur-lg rounded-[2.5rem] flex justify-around items-center h-20 shadow-2xl pointer-events-auto border border-white/10 px-4">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "relative flex flex-col items-center justify-center gap-1 transition-all duration-300 w-16 h-16 rounded-3xl",
                  isActive 
                    ? "text-brand-yellow translate-y-[-4px]" 
                    : "text-gray-500 hover:text-white"
                )}
              >
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="absolute inset-0 bg-white/5 rounded-3xl"
                  />
                )}
                <tab.icon className={cn("w-6 h-6 relative z-10", isActive && "stroke-[2.5px]")} />
                <span className="text-[10px] font-bold uppercase tracking-wider relative z-10">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
