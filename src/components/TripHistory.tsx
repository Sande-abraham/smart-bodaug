import React from 'react';
import { Trip } from '../types';
import { History, MapPin, Navigation, Banknote, Fuel, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { motion } from 'motion/react';

export default function TripHistory({ trips }: { trips: Trip[] }) {
  if (trips.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-gray-300 space-y-4">
        <div className="w-16 h-16 bg-gray-50 rounded-3xl flex items-center justify-center">
          <History className="w-8 h-8 opacity-20" />
        </div>
        <p className="font-bold uppercase tracking-widest text-xs">No records found</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="space-y-0.5">
        <h2 className="text-2xl font-black text-gray-900 tracking-tight">Logbook</h2>
        <p className="text-gray-500 text-sm font-medium">Your recent operations</p>
      </header>

      <div className="space-y-3">
        {trips.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((trip, idx) => (
          <motion.div
            key={trip.id || idx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05 }}
            className="card-premium space-y-3 relative overflow-hidden group hover:border-brand-yellow/50"
          >
            <div className="flex justify-between items-start">
              <div className="space-y-2 flex-1 min-w-0">
                <div className="flex items-center gap-2 text-gray-400">
                  <Calendar className="w-3 h-3 text-brand-yellow" />
                  <span className="text-[9px] font-bold uppercase tracking-wider">
                    {format(parseISO(trip.timestamp), 'MMM d, HH:mm')}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-gray-200" />
                    <p className="text-xs font-bold text-gray-500 truncate">{trip.startPoint}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-1 h-1 rounded-full bg-brand-yellow" />
                    <p className="text-xs font-bold text-gray-900 truncate">{trip.endPoint}</p>
                  </div>
                </div>
              </div>
              <div className="text-right ml-4">
                <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1 leading-none">Profit</p>
                <div className="bg-green-50 text-traffic-green px-2 py-1 rounded-lg font-bold border border-green-100">
                  <span className="text-xs font-black">+{(Number(trip.profit) || 0).toLocaleString()}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-50">
              <div className="space-y-0.5">
                <span className="text-[7px] font-bold text-gray-400 uppercase tracking-widest leading-none">Dist</span>
                <p className="text-lg font-black text-gray-900 leading-none">{trip.distance}<span className="text-[9px] ml-0.5 text-gray-400">km</span></p>
              </div>
              <div className="space-y-0.5">
                <span className="text-[7px] font-bold text-gray-400 uppercase tracking-widest leading-none">Fuel</span>
                <p className="text-lg font-black text-gray-900 leading-none">{trip.fuelUsed.toFixed(1)}<span className="text-[9px] ml-0.5 text-gray-400">L</span></p>
              </div>
              <div className="space-y-0.5 text-right">
                <span className="text-[7px] font-bold text-gray-400 uppercase tracking-widest leading-none">Fare</span>
                <p className="text-lg font-black text-brand-blue leading-none">{(Number(trip.fare) || 0).toLocaleString()}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
