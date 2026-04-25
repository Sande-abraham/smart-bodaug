import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, updateDoc, doc, deleteDoc, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Bell, X, Check, Info, AlertTriangle, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

import { Notification } from '../types';

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', auth.currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const notifs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.read).length);
    });

    return () => unsub();
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await updateDoc(doc(db, 'notifications', id), { read: true });
    } catch (err) {
      console.error(err);
    }
  };

  const deleteNotif = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'notifications', id));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center relative shadow-sm active:scale-95 transition-all"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-white">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <div 
              className="fixed inset-0 z-[100]" 
              onClick={() => setIsOpen(false)} 
            />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="absolute right-0 mt-2 w-80 bg-white rounded-[24px] shadow-2xl border border-gray-100 z-[101] overflow-hidden"
            >
              <div className="p-4 border-b flex items-center justify-between bg-gray-50/50">
                <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Notifications</h3>
                {unreadCount > 0 && (
                  <button 
                    onClick={() => notifications.filter(n => !n.read).forEach(n => markAsRead(n.id))}
                    className="text-[9px] font-black text-blue-600 uppercase hover:underline"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-[400px] overflow-y-auto no-scrollbar">
                {notifications.length > 0 ? (
                  notifications.map((n) => (
                    <div 
                      key={n.id}
                      className={cn(
                        "p-4 border-b border-gray-50 flex gap-3 transition-colors relative group",
                        !n.read ? "bg-blue-50/30" : "bg-white"
                      )}
                    >
                       <div className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center shrink-0",
                        n.type === 'SYSTEM' ? "bg-blue-100 text-blue-600" :
                        n.type === 'RIDER_APPLICATION' ? "bg-purple-100 text-purple-600" :
                        n.type === 'LOYALTY' ? "bg-orange-100 text-orange-600" :
                        "bg-green-100 text-green-600"
                      )}>
                        {n.type === 'LOYALTY' ? <AlertTriangle className="w-4 h-4" /> :
                         n.type === 'RIDER_APPLICATION' ? <ShieldCheck className="w-4 h-4" /> :
                         <Info className="w-4 h-4" />}
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-gray-900 leading-tight">{n.title}</p>
                        <p className="text-[10px] font-bold text-gray-500 leading-snug mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-[8px] font-black text-gray-300 uppercase mt-1 tracking-widest">
                          {format(new Date(n.createdAt), 'MMM d, h:mm a')}
                        </p>
                      </div>

                      <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                         {!n.read && (
                           <button onClick={() => markAsRead(n.id)} className="p-1 text-blue-500 hover:bg-blue-100 rounded-lg">
                             <Check className="w-3 h-3" />
                           </button>
                         )}
                         <button onClick={() => deleteNotif(n.id)} className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg">
                           <X className="w-3 h-3" />
                         </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-12 text-center text-gray-300">
                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Clean inbox</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
