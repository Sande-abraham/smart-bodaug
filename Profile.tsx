import React, { useMemo, useState } from 'react';
import { Trip, DailySummary } from '../types';
import { TrendingUp, Fuel, Banknote, History, LayoutDashboard, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { motion } from 'motion/react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { format, parseISO, startOfDay, isSameDay } from 'date-fns';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle } from 'lucide-react';

export default function Dashboard({ trips }: { trips: Trip[] }) {
  const { profile } = useAuth();
  const [isOnline, setIsOnline] = useState<boolean>(profile?.isOnline ?? true);

  const summary = useMemo(() => {
    const today = new Date();
    const todayTrips = trips.filter(t => isSameDay(parseISO(t.timestamp), today));
    
    return {
      totalTrips: todayTrips.length,
      totalFuelUsed: todayTrips.reduce((acc, t) => acc + (Number(t.fuelUsed) || 0), 0),
      totalEarnings: todayTrips.reduce((acc, t) => acc + (Number(t.fare) || 0), 0),
      totalProfit: todayTrips.reduce((acc, t) => acc + (Number(t.profit) || 0), 0),
      efficiencyScore: 94
    };
  }, [trips]);

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i);
      return format(d, 'yyyy-MM-dd');
    }).reverse();

    return last7Days.map(date => {
      const dayTrips = trips.filter(t => format(parseISO(t.timestamp), 'yyyy-MM-dd') === date);
      return {
        name: format(parseISO(date), 'EEE'),
        profit: dayTrips.reduce((acc, t) => acc + (Number(t.profit) || 0), 0),
      };
    });
  }, [trips]);
  
  if (profile?.role !== 'rider') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-white rounded-[40px]">
        <div className="w-20 h-20 bg-orange-50 text-orange-500 rounded-3xl flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Rider Terminal Only</h2>
        <p className="mt-2 text-gray-500 font-bold max-w-xs uppercase text-[10px] tracking-widest">
          Please apply to become a rider to access the operational hub.
        </p>
      </div>
    );
  }

  const toggleOnline = async () => {
    const nextStatus = !isOnline;
    setIsOnline(nextStatus);
    if (profile) {
      try {
        const { updateDoc, doc } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        await updateDoc(doc(db, 'users', profile.uid), { isOnline: nextStatus });
      } catch (err) {
        console.error("Error updating status:", err);
      }
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <header className="flex items-center justify-between">
        <div className="space-y-0.5">
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Driver Hub</h2>
          <p className="text-gray-500 font-bold uppercase text-[9px] tracking-widest leading-none">
            {format(new Date(), 'EEEE, do MMMM')}
          </p>
        </div>
        <button 
          onClick={toggleOnline}
          className={cn(
            "px-4 py-2 rounded-xl font-black text-xs transition-all shadow-xl active:scale-95",
            isOnline 
              ? "bg-green-500 text-white shadow-green-200" 
              : "bg-gray-200 text-gray-500"
          )}
        >
          {isOnline ? 'ONLINE' : 'OFFLINE'}
        </button>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-black text-brand-yellow p-3 rounded-2xl flex flex-col justify-between h-32 shadow-2xl overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-20 h-20 bg-brand-yellow/10 rounded-full -mr-8 -mt-8"></div>
          <div className="bg-brand-yellow/20 w-8 h-8 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-brand-yellow" />
          </div>
          <div>
            <p className="text-[9px] font-black text-brand-yellow/60 uppercase tracking-widest">Boda Wallet</p>
            <p className="text-xl font-black">{(profile?.earnings || 0).toLocaleString()}<span className="text-[10px] ml-1">UGX</span></p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white p-3 rounded-2xl flex flex-col justify-between h-32 shadow-xl border-2 border-gray-50"
        >
          <div className="bg-blue-50 w-8 h-8 rounded-lg flex items-center justify-center">
            <LayoutDashboard className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Efficiency</p>
            <p className="text-xl font-black text-gray-900">{summary.efficiencyScore}%</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white p-3 rounded-2xl flex flex-col justify-between h-32 shadow-xl border-2 border-gray-50"
        >
          <div className="bg-orange-50 w-8 h-8 rounded-lg flex items-center justify-center">
            <Fuel className="w-4 h-4 text-orange-500" />
          </div>
          <div>
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Fuel Used</p>
            <p className="text-xl font-black text-gray-900">{summary.totalFuelUsed.toFixed(1)}L</p>
          </div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-brand-yellow p-3 rounded-2xl flex flex-col justify-between h-32 shadow-xl border-2 border-black/5"
        >
          <div className="bg-black w-8 h-8 rounded-lg flex items-center justify-center">
            <History className="w-4 h-4 text-brand-yellow" />
          </div>
          <div>
            <p className="text-[9px] font-black text-black/40 uppercase tracking-widest">Net Profit</p>
            <p className="text-xl font-black text-black">{summary.totalProfit.toLocaleString()}</p>
          </div>
        </motion.div>
      </div>

      <div className="card-premium space-y-4">
        <h3 className="text-base font-bold text-gray-900">Profit Trend</h3>
        <div className="h-[180px] w-full -ml-3 relative" style={{ minHeight: '180px' }}>
          <ResponsiveContainer width="100%" height="100%" minHeight={180}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FFD700" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#FFD700" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 10, fontWeight: 700, fill: '#94a3b8' }}
              />
              <YAxis hide />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '16px',
                  border: 'none',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="profit" 
                stroke="#FFD700" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorProfit)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
