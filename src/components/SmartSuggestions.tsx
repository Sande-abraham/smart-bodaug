import React, { useState, useEffect } from 'react';
import { getSmartSuggestions, getTrafficAlerts, getFuelPriceAlerts } from '../services/geminiService';
import { Trip, TrafficAlert, FuelPriceAlert } from '../types';
import { Lightbulb, Sparkles, Loader2, AlertTriangle, CheckCircle2, MapPin, RefreshCw, Fuel, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useGeolocation } from '../hooks/useGeolocation';
import { cn } from '../lib/utils';

export default function SmartSuggestions({ trips }: { trips: Trip[] }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<TrafficAlert[]>([]);
  const [fuelAlerts, setFuelAlerts] = useState<FuelPriceAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingTraffic, setLoadingTraffic] = useState(false);
  const [loadingFuel, setLoadingFuel] = useState(false);
  const { location } = useGeolocation();

  const fetchTraffic = async () => {
    setLoadingTraffic(true);
    try {
      const res = await getTrafficAlerts(location);
      setAlerts(res);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingTraffic(false);
    }
  };

  const fetchFuel = async () => {
    setLoadingFuel(true);
    try {
      const res = await getFuelPriceAlerts(location);
      setFuelAlerts(res);
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingFuel(false);
    }
  };

  const refreshAll = () => {
    fetchTraffic();
    fetchFuel();
  };

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (trips.length === 0) return;
      setLoading(true);
      try {
        const res = await getSmartSuggestions(trips.slice(0, 5));
        setSuggestions(res);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchSuggestions();
  }, [trips]);

  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 300000);
    return () => clearInterval(interval);
  }, [location?.latitude, location?.longitude]);

  if (trips.length === 0) {
    return (
      <div className="card-premium flex flex-col items-center justify-center space-y-4 text-center p-12">
        <div className="bg-brand-yellow/10 p-4 rounded-full">
          <Sparkles className="w-8 h-8 text-brand-yellow" />
        </div>
        <h3 className="text-xl font-bold tracking-tight">AI Insights Waiting</h3>
        <p className="text-sm text-gray-500 max-w-[200px]">Complete a few trips to unlock smart suggestions for your business.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <header className="flex justify-between items-end">
        <div className="space-y-1">
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">Field Intel</h2>
          <p className="text-gray-500 font-medium">Real-time alerts for Kampala</p>
        </div>
        <button 
          onClick={refreshAll}
          disabled={loadingTraffic || loadingFuel}
          className="p-3 bg-white rounded-2xl shadow-sm border border-gray-100 hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className={cn("w-5 h-5 text-gray-400", (loadingTraffic || loadingFuel) && "animate-spin")} />
        </button>
      </header>

      {/* AI Insights Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-yellow rounded-lg flex items-center justify-center">
            <Lightbulb className="w-5 h-5 text-black" />
          </div>
          <h3 className="font-bold text-gray-900">Optimization Tips</h3>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="card-premium flex justify-center p-8">
              <Loader2 className="w-8 h-8 animate-spin text-brand-yellow" />
            </div>
          ) : (
            suggestions.map((suggestion, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="card-premium !p-6 flex items-start gap-4 border-l-4 border-l-brand-yellow"
              >
                <div className="bg-brand-yellow/10 p-2 rounded-xl shrink-0">
                  <Sparkles className="w-5 h-5 text-brand-yellow" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-gray-800 leading-relaxed">{suggestion}</p>
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      {/* Fuel and Traffic Alerts */}
      <div className="grid grid-cols-1 gap-6">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center">
              <Fuel className="w-5 h-5 text-brand-blue" />
            </div>
            <h3 className="font-bold text-gray-900">Best Pump Prices</h3>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {loadingFuel && fuelAlerts.length === 0 ? (
              <div className="card-premium flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
            ) : (
              fuelAlerts.map((fuel, idx) => (
                <motion.div key={idx} className="card-premium !p-4 flex items-center justify-between">
                  <div className="space-y-1">
                    <h4 className="font-bold text-gray-900">{fuel.station}</h4>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{fuel.distance} away</span>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {fuel.trend === 'up' ? <TrendingUp className="w-3 h-3 text-traffic-red" /> : 
                       fuel.trend === 'down' ? <TrendingDown className="w-3 h-3 text-traffic-green" /> : 
                       <Minus className="w-3 h-3 text-gray-400" />}
                      <p className="text-lg font-black text-gray-900">{fuel.price.toLocaleString()} <span className="text-[10px] text-gray-400">UGX</span></p>
                    </div>
                  </div>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-traffic-red" />
            </div>
            <h3 className="font-bold text-gray-900">Live Traffic Jams</h3>
          </div>
          
          <div className="space-y-3">
            {loadingTraffic && alerts.length === 0 ? (
              <div className="card-premium flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin text-gray-300" /></div>
            ) : (
              alerts.map((alert, idx) => (
                <motion.div
                  key={idx}
                  className={cn(
                    "card-premium !p-5 border-l-4",
                    alert.intensity === 'high' ? "border-l-traffic-red" : 
                    alert.intensity === 'medium' ? "border-l-traffic-amber" : 
                    "border-l-traffic-green"
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-bold text-gray-900">{alert.location}</h4>
                    <span className={cn(
                      "text-[8px] font-black uppercase tracking-wider px-2 py-1 rounded-lg",
                      alert.intensity === 'high' ? "bg-red-50 text-traffic-red" : "bg-gray-50 text-gray-500"
                    )}>
                      {alert.condition}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-gray-500">{alert.action}</p>
                </motion.div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
