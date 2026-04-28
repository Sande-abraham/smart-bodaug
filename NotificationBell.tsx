import React, { useState } from 'react';
import { signInWithPopup, signInAnonymously } from 'firebase/auth';
import { auth, googleProvider } from '../firebase';
import { MapPin, ShieldCheck, Zap, TrendingUp, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function Auth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleLogin = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error: any) {
      // Don't log expected cancelations
      if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        console.error("Login failed:", error);
      }
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleGuestLogin = async () => {
    if (isAuthenticating) return;
    setIsAuthenticating(true);
    try {
      await signInAnonymously(auth);
    } catch (error) {
      console.error("Guest login failed:", error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen bg-yellow-400 flex flex-col items-center justify-center p-6 text-black">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md space-y-8 text-center"
      >
        <div className="flex flex-col items-center gap-4">
          <div className="bg-black p-4 rounded-3xl shadow-2xl">
            <MapPin className="text-yellow-400 w-12 h-12" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tighter">BodaSmart</h1>
          <p className="text-lg font-medium opacity-80">Optimize Fuel. Maximize Profit.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 py-8">
          <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm flex flex-col items-center gap-2">
            <Zap className="w-6 h-6" />
            <span className="text-xs font-bold uppercase tracking-widest">AI Route</span>
          </div>
          <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm flex flex-col items-center gap-2">
            <TrendingUp className="w-6 h-6" />
            <span className="text-xs font-bold uppercase tracking-widest">Profit Max</span>
          </div>
          <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm flex flex-col items-center gap-2">
            <ShieldCheck className="w-6 h-6" />
            <span className="text-xs font-bold uppercase tracking-widest">Secure</span>
          </div>
          <div className="bg-white/20 p-4 rounded-2xl backdrop-blur-sm flex flex-col items-center gap-2">
            <MapPin className="w-6 h-6" />
            <span className="text-xs font-bold uppercase tracking-widest">Live Map</span>
          </div>
        </div>

        <div className="space-y-4">
          <button
            onClick={handleLogin}
            disabled={isAuthenticating}
            className="w-full bg-black text-yellow-400 py-4 px-6 rounded-2xl font-bold text-lg shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isAuthenticating ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
                Continue with Google
              </>
            )}
          </button>

          <button
            onClick={handleGuestLogin}
            disabled={isAuthenticating}
            className="w-full bg-white text-black py-4 px-6 rounded-2xl font-bold text-lg shadow-md border-2 border-black/5 hover:bg-gray-50 active:scale-[0.98] transition-all disabled:opacity-70"
          >
            {isAuthenticating ? 'Processing...' : 'Try Demo Account'}
          </button>
        </div>

        <p className="text-xs font-medium opacity-60">
          By continuing, you agree to optimize your boda-boda business.
        </p>
      </motion.div>
    </div>
  );
}
