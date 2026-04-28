import React, { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, setDoc, addDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile, RideRequest, RideStatus, RiderApplication, RideType, VerificationStatus } from '../types';
import { ShieldCheck, UserCheck, UserX, Clock, Search, Map as MapIcon, Trash2, Bell, AlertTriangle, Plus, FileText, X, CheckCircle2, Bike } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { format } from 'date-fns';

import { useAuth } from '../context/AuthContext';

export function AdminPanel() {
  const { profile, user: authUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeRides, setActiveRides] = useState<RideRequest[]>([]);
  const [applications, setApplications] = useState<RiderApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'admins' | 'all' | 'live'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchSuggestions, setSearchSuggestions] = useState<UserProfile[]>([]);
  const [showAddRider, setShowAddRider] = useState(false);
  const [newRider, setNewRider] = useState({
    displayName: '',
    email: '',
    phone: '',
    nationalId: '',
    drivingPermit: '',
    bikeNumber: '',
    bodaType: RideType.STANDARD as RideType
  });

  useEffect(() => {
    // Listen to ALL users
    const unsubUsers = onSnapshot(query(collection(db, 'users')), (snap) => {
      setUsers(snap.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      setLoading(false);
    });

    // Listen to Rider Applications
    const unsubApps = onSnapshot(query(collection(db, 'rider_applications'), where('status', '==', 'PENDING')), (snap) => {
      setApplications(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RiderApplication)));
    });

    // Listen to internal/active rides for live tracking
    const unsubRides = onSnapshot(
      query(
        collection(db, 'rides'), 
        where('status', 'in', ['accepted', 'arrived', 'started'])
      ), 
      (snap) => {
        setActiveRides(snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as RideRequest)));
      }
    );

    return () => {
      unsubUsers();
      unsubApps();
      unsubRides();
    };
  }, []);

  useEffect(() => {
    if (searchTerm.length > 1) {
      const suggestions = users.filter(u => 
        (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.phoneNumber || '').includes(searchTerm) ||
        (u.numberPlate || '').toLowerCase().includes(searchTerm.toLowerCase())
      ).slice(0, 5);
      setSearchSuggestions(suggestions);
    } else {
      setSearchSuggestions([]);
    }
  }, [searchTerm, users]);

  // Admin Access Guard
  if (profile?.role !== 'admin' && authUser?.email !== 'abrahamsande256@gmail.com') {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-white rounded-[40px] m-4">
        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mb-6">
          <AlertTriangle className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">Access Restricted</h2>
        <p className="mt-2 text-gray-500 font-bold max-w-xs uppercase text-[10px] tracking-widest">
          Administrative clearance required to view this terminal.
        </p>
      </div>
    );
  }

  const handleApproveApp = async (app: RiderApplication, approve: boolean) => {
    try {
      // 1. Update Application status
      await updateDoc(doc(db, 'rider_applications', app.id!), {
        status: approve ? 'APPROVED' : 'REJECTED',
        reviewedBy: 'ADMIN', // Simple for now
        reviewedAt: new Date().toISOString()
      });

      // 2. Update User role and status
      await updateDoc(doc(db, 'users', app.userId), {
        role: approve ? 'rider' : 'customer',
        status: approve ? 'active' : 'declined',
        isApproved: approve,
        bikeType: app.bodaType,
        numberPlate: app.bikeNumber,
        verification_status: approve ? 'approved' : 'rejected',
        role_requested: null
      });

      // 3. Notify User
      await addDoc(collection(db, 'notifications'), {
        userId: app.userId,
        title: approve ? 'Application Approved!' : 'Application Rejected',
        message: approve 
          ? 'Welcome to BodaSmart! Your rider application has been approved. Switch to online to start earning.'
          : 'Unfortunately, your rider application was not approved at this time.',
        type: approve ? 'success' : 'error',
        read: false,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Approval error:", err);
    }
  };

  const handleAddRider = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // In a real app we'd use Firebase Auth to create the user
      // For this POC, we'll just create the user document
      // which assumes they might sign in later or we handle auth separately
      const tempId = `RIDER_${Math.random().toString(36).substr(2, 9)}`;
      
      const riderProfile: UserProfile = {
        uid: tempId,
        email: newRider.email,
        displayName: newRider.displayName,
        role: 'rider',
        status: 'active',
        isApproved: true,
        phoneNumber: newRider.phone,
        numberPlate: newRider.bikeNumber,
        isOnline: false,
        isOnTrip: false, // Explicitly set to false for discovery
        bikeType: newRider.bodaType,
        createdAt: new Date().toISOString(),
        walletBalance: 0,
        earnings: 0
      };

      await setDoc(doc(db, 'users', tempId), riderProfile);

      // Create approved application entry
      await addDoc(collection(db, 'rider_applications'), {
        userId: tempId,
        userName: newRider.displayName,
        userEmail: newRider.email,
        nationalId: newRider.nationalId,
        drivingPermit: newRider.drivingPermit,
        bikeNumber: newRider.bikeNumber,
        bodaType: newRider.bodaType,
        status: 'APPROVED',
        createdAt: new Date().toISOString()
      });

      setShowAddRider(false);
      setNewRider({ displayName: '', email: '', phone: '', nationalId: '', drivingPermit: '', bikeNumber: '', bodaType: RideType.STANDARD });
    } catch (err) {
      console.error("Add rider error:", err);
    }
  };

  const handleRoleUpdate = async (uid: string, role: 'admin' | 'customer' | 'rider') => {
    try {
      await updateDoc(doc(db, 'users', uid), { 
        role, 
        status: 'active',
        role_requested: null,
        verification_status: 'approved'
      });
    } catch (err) {
      console.error("Error updating role:", err);
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (!window.confirm("Are you sure you want to PERMANENTLY delete this user? This cannot be undone.")) return;
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (err) {
      console.error("Error deleting user:", err);
    }
  };

  const handleUpgradeApproval = async (uid: string, approve: boolean) => {
    try {
      const user = users.find(u => u.uid === uid);
      if (!user) return;

      const requestedRole = user.role_requested || 'rider';

      if (approve) {
        await updateDoc(doc(db, 'users', uid), {
          role: requestedRole,
          role_requested: null,
          verification_status: 'approved',
          isApproved: true,
          status: 'active'
        });
        
        await addDoc(collection(db, 'notifications'), {
          userId: uid,
          title: 'Upgrade Approved!',
          message: `Your request to become a ${requestedRole} has been approved.`,
          type: 'success',
          read: false,
          createdAt: new Date().toISOString()
        });
      } else {
        await updateDoc(doc(db, 'users', uid), {
          status: 'active',
          role_requested: null,
          verification_status: 'rejected'
        });

        await addDoc(collection(db, 'notifications'), {
          userId: uid,
          title: 'Upgrade Rejected',
          message: `Your request to become a ${requestedRole} was not approved.`,
          type: 'error',
          read: false,
          createdAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error("Upgrade approval error:", err);
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = (u.displayName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (u.phoneNumber || '').includes(searchTerm) ||
                         (u.numberPlate || '').toLowerCase().includes(searchTerm.toLowerCase());
    if (!matchesSearch) return false;

    if (activeTab === 'pending') return u.verification_status === 'pending' || u.status === 'pending';
    if (activeTab === 'approved') return u.role === 'rider' && u.isApproved && u.status === 'active';
    if (activeTab === 'admins') return u.role === 'admin';
    return true; 
  });

  const pendingUpgrades = users.filter(u => 
    (u.verification_status === 'pending' || u.status === 'pending') && 
    u.role !== 'admin' && 
    u.role !== 'rider'
  );

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto mb-20 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tighter flex items-center gap-2">
            <ShieldCheck className="w-7 h-7 text-brand-yellow" />
            Admin Control
          </h1>
          <p className="text-gray-400 font-bold text-[10px] uppercase tracking-widest">Platform Management</p>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowAddRider(true)}
            className="px-4 py-2 bg-black text-brand-yellow rounded-xl font-black text-[10px] uppercase flex items-center gap-2 shadow-lg active:scale-95 transition-all"
          >
            <Plus className="w-4 h-4" /> Add Rider
          </button>
          
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
            {(['pending', 'approved', 'admins', 'all', 'live'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all whitespace-nowrap relative",
                  activeTab === t ? "bg-white shadow-sm text-black" : "text-gray-400 hover:text-gray-600"
                )}
              >
                {t === 'pending' && (applications.length > 0 || pendingUpgrades.length > 0) && (
                  <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-600 text-white text-[9px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm animate-bounce">
                    {applications.length + pendingUpgrades.length}
                  </span>
                )}
                {t === 'pending' ? 'Approvals' : t === 'approved' ? 'Riders' : t === 'live' ? 'Live Map' : t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {(applications.length > 0 || pendingUpgrades.length > 0) && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-brand-black text-brand-yellow p-4 rounded-[24px] flex items-center justify-between shadow-xl"
        >
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-brand-yellow rounded-xl flex items-center justify-center text-black shrink-0">
                <Bell className="w-5 h-5" />
             </div>
             <div>
                <p className="text-sm font-black uppercase tracking-tight">Pending Approval Tasks</p>
                <p className="text-[10px] font-bold text-brand-yellow/60 uppercase">
                  {applications.length} Applications & {pendingUpgrades.length} Role Upgrades
                </p>
             </div>
          </div>
          <button 
            onClick={() => setActiveTab('pending')}
            className="px-6 py-2 bg-brand-yellow text-black rounded-xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-all"
          >
            Review Now
          </button>
        </motion.div>
      )}

      <AnimatePresence>
        {showAddRider && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowAddRider(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl relative z-[201] overflow-hidden border-4 border-black"
            >
              <div className="p-6 border-b bg-gray-50 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-black text-black tracking-tight uppercase">Manually Register Rider</h3>
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Instant Platform Activation</p>
                </div>
                <button 
                  onClick={() => setShowAddRider(false)}
                  className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center text-gray-400 hover:text-black transition-colors shadow-sm"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddRider} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Full Name</label>
                    <input 
                      required
                      type="text" 
                      value={newRider.displayName}
                      onChange={e => setNewRider({...newRider, displayName: e.target.value})}
                      className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm outline-none focus:border-brand-yellow transition-all" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Email Address</label>
                    <input 
                      required
                      type="email" 
                      value={newRider.email}
                      onChange={e => setNewRider({...newRider, email: e.target.value})}
                      className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm outline-none focus:border-brand-yellow transition-all" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Phone Number</label>
                    <input 
                      required
                      type="tel" 
                      value={newRider.phone}
                      onChange={e => setNewRider({...newRider, phone: e.target.value})}
                      className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm outline-none focus:border-brand-yellow transition-all" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Boda Type</label>
                    <select 
                      value={newRider.bodaType}
                      onChange={e => setNewRider({...newRider, bodaType: e.target.value as RideType})}
                      className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm outline-none focus:border-brand-yellow transition-all appearance-none"
                    >
                      <option value={RideType.ECONOMY}>Economy</option>
                      <option value={RideType.STANDARD}>Standard</option>
                      <option value={RideType.PREMIUM}>Premium</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                   <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">National ID</label>
                      <input 
                        required
                        type="text" 
                        value={newRider.nationalId}
                        onChange={e => setNewRider({...newRider, nationalId: e.target.value.toUpperCase()})}
                        className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm outline-none focus:border-brand-yellow transition-all" 
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Driving Permit</label>
                      <input 
                        required
                        type="text" 
                        value={newRider.drivingPermit}
                        onChange={e => setNewRider({...newRider, drivingPermit: e.target.value.toUpperCase()})}
                        className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm outline-none focus:border-brand-yellow transition-all" 
                      />
                   </div>
                   <div className="space-y-1">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Bike Plate</label>
                      <input 
                        required
                        type="text" 
                        value={newRider.bikeNumber}
                        onChange={e => setNewRider({...newRider, bikeNumber: e.target.value.toUpperCase()})}
                        placeholder="UEX 000Z"
                        className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-black text-sm outline-none focus:border-brand-yellow transition-all" 
                      />
                   </div>
                </div>

                <button 
                  type="submit"
                  className="w-full bg-black text-brand-yellow py-4 rounded-2xl font-black uppercase text-sm shadow-xl active:scale-95 transition-all mt-4"
                >
                  Confirm Registration
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {activeTab === 'pending' ? (
           <motion.div
            key="pending-approvals"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
           >
              {/* External Applications */}
              {applications.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">Direct Rider Applications</h4>
                  {applications.map(app => (
                    <div key={app.id} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-brand-yellow/30 transition-all group overflow-hidden relative">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-brand-yellow" />
                      
                      <div className="flex items-center gap-5">
                         <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${app.userId}`} alt="avatar" />
                         </div>
                         <div>
                            <h3 className="text-lg font-black text-gray-900 leading-none">{app.userName}</h3>
                            <p className="text-xs font-bold text-gray-400 mt-1">{app.userEmail}</p>
                            <div className="flex gap-2 mt-2">
                               <div className="flex items-center gap-1 bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight">
                                  <FileText className="w-3 h-3" /> ID: {app.nationalId}
                               </div>
                               <div className="flex items-center gap-1 bg-green-50 text-green-600 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight">
                                  <ShieldCheck className="w-3 h-3" /> Permit: {app.drivingPermit}
                               </div>
                               <div className="flex items-center gap-1 bg-purple-50 text-purple-600 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight">
                                  <Bike className="w-3 h-3" /> {app.bikeNumber}
                               </div>
                            </div>
                         </div>
                      </div>

                      <div className="flex items-center gap-3">
                         <div className="text-right hidden sm:block mr-2">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">Submitted</p>
                            <p className="text-xs font-bold text-gray-900 mt-1">{format(new Date(app.createdAt), 'MMM d, p')}</p>
                         </div>
                         <button 
                          onClick={() => handleApproveApp(app, false)}
                          className="w-10 h-10 rounded-full border border-red-100 text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors active:scale-90"
                         >
                           <X className="w-5 h-5" />
                         </button>
                         <button 
                          onClick={() => handleApproveApp(app, true)}
                          className="px-6 py-3 bg-brand-yellow text-black rounded-2xl font-black text-xs uppercase shadow-lg shadow-brand-yellow/20 active:scale-95 transition-all flex items-center gap-2"
                         >
                           <CheckCircle2 className="w-4 h-4" /> Approve Rider
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Role Upgrades (Internal) */}
              {pendingUpgrades.length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-4">Role Upgrade Requests</h4>
                  {pendingUpgrades.map(user => (
                    <div key={user.uid} className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-brand-yellow/30 transition-all group overflow-hidden relative">
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-orange-500" />
                      
                      <div className="flex items-center gap-5">
                         <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                            <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} alt="avatar" />
                         </div>
                         <div>
                            <h3 className="text-lg font-black text-gray-900 leading-none">{user.displayName}</h3>
                            <p className="text-xs font-bold text-gray-400 mt-1">{user.email}</p>
                            <div className="flex gap-2 mt-2">
                               <div className="flex items-center gap-1.5 bg-orange-50 text-orange-600 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight animate-pulse">
                                  <Clock className="w-3 h-3" /> Requested: {user.role_requested || 'RIDER'}
                               </div>
                               {user.numberPlate && (
                                 <div className="flex items-center gap-1 bg-purple-50 text-purple-600 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight">
                                    <Bike className="w-3 h-3" /> {user.numberPlate}
                                 </div>
                               )}
                            </div>
                         </div>
                      </div>

                      <div className="flex items-center gap-3">
                         <button 
                          onClick={() => handleUpgradeApproval(user.uid, false)}
                          className="w-10 h-10 rounded-full border border-red-100 text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors active:scale-90"
                         >
                           <X className="w-5 h-5" />
                         </button>
                         <button 
                          onClick={() => handleUpgradeApproval(user.uid, true)}
                          className="px-6 py-3 bg-brand-yellow text-black rounded-2xl font-black text-xs uppercase shadow-lg shadow-brand-yellow/20 active:scale-95 transition-all flex items-center gap-2"
                         >
                           <CheckCircle2 className="w-4 h-4" /> Approve Upgrade
                         </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {applications.length === 0 && pendingUpgrades.length === 0 && (
                <div className="text-center py-20 bg-gray-50 rounded-[40px] border-2 border-dashed border-gray-100">
                  <div className="w-16 h-16 bg-white rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                    <UserCheck className="w-8 h-8 text-gray-200" />
                  </div>
                  <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest">Everything Approved</h3>
                  <p className="text-xs font-bold text-gray-400 mt-1">No pending rider applications or upgrades</p>
                </div>
              )}
           </motion.div>
        ) : activeTab === 'live' ? (
          <motion.div
            key="live-map"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="card-premium !p-6 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-brand-yellow rounded-2xl flex items-center justify-center mb-3">
                  <UserCheck className="w-6 h-6 text-black" />
                </div>
                <h4 className="text-2xl font-black">{users.filter(u => u.role === 'rider' && u.isApproved && u.isOnline).length}</h4>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Online Riders</p>
              </div>
              <div className="card-premium !p-6 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-green-500 rounded-2xl flex items-center justify-center mb-3 text-white">
                  <MapIcon className="w-6 h-6" />
                </div>
                <h4 className="text-2xl font-black">{activeRides.length}</h4>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Active Trips</p>
              </div>
              <div className="card-premium !p-6 flex flex-col items-center justify-center text-center">
                <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center mb-3 text-white">
                  <Bell className="w-6 h-6" />
                </div>
                <h4 className="text-2xl font-black">{users.filter(u => u.role === 'rider' && !u.isApproved).length}</h4>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Approval Requests</p>
              </div>
            </div>

            <div className="card-premium !p-0 overflow-hidden min-h-[400px] flex flex-col">
              <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <MapIcon className="w-4 h-4 text-brand-yellow" />
                  Live Operational View
                </h3>
                <span className="flex items-center gap-1.5">
                   <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                   <span className="text-[9px] font-black text-gray-400 uppercase">Live Update</span>
                </span>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto max-h-[500px] space-y-3">
                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2">Active Deployments</h4>
                {activeRides.length > 0 ? activeRides.map(ride => (
                  <div key={ride.id} className="p-4 rounded-2xl bg-white border border-gray-100 shadow-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center shrink-0">
                         <img src="https://img.icons8.com/color/48/motorcycle.png" className="w-6 h-6" alt="boda" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-gray-900">{(ride as any).riderName || 'Rider'}</p>
                        <p className="text-[10px] font-medium text-gray-400 truncate max-w-[150px]">To: {ride.destination}</p>
                      </div>
                    </div>
                    <div className="text-right">
                       <span className={cn(
                         "px-2 py-0.5 rounded-md text-[8px] font-black uppercase",
                         ride.status === RideStatus.TRIP_STARTED ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                       )}>
                         {ride.status.replace('_', ' ')}
                       </span>
                       <p className="text-[10px] font-black text-gray-900 mt-1">{ride.fare.toLocaleString()} UGX</p>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-12 text-gray-300">
                    <Clock className="w-8 h-8 mx-auto mb-2 opacity-20" />
                    <p className="text-[10px] font-black uppercase tracking-widest">No active trips currently</p>
                  </div>
                )}

                <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 pt-4">Online & Available</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                   {users.filter(u => u.role === 'rider' && u.isApproved && u.isOnline).map(rider => (
                     <div key={rider.uid} className="p-3 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand-yellow flex items-center justify-center overflow-hidden border border-black/5">
                           <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${rider.uid}`} alt="rider" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-xs text-gray-900 truncate">{rider.displayName}</p>
                          <p className="text-[9px] font-black text-green-600 uppercase">Available</p>
                        </div>
                     </div>
                   ))}
                </div>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="user-list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <div className="relative group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-brand-yellow transition-colors" />
              <input 
                type="text"
                placeholder="Search by name, phone, plate, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white border-2 border-gray-100 rounded-xl font-bold text-sm focus:border-brand-yellow outline-none transition-all shadow-sm"
              />
              
              <AnimatePresence>
                {searchSuggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden"
                  >
                    <div className="p-2">
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-3 py-2">Quick Suggestions</p>
                      {searchSuggestions.map(u => (
                        <button
                          key={u.uid}
                          onClick={() => setSearchTerm(u.displayName || u.email)}
                          className="w-full text-left p-3 hover:bg-gray-50 rounded-xl flex items-center justify-between group transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                              <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${u.uid}`} alt="avatar" />
                            </div>
                            <div>
                              <p className="text-sm font-black text-gray-900 leading-none">{u.displayName}</p>
                              <p className="text-[10px] font-bold text-gray-400 mt-1">{u.email}</p>
                            </div>
                          </div>
                          <span className="text-[9px] font-black uppercase text-gray-300 group-hover:text-brand-yellow transition-colors">{u.role}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="grid gap-3">
              <AnimatePresence mode="popLayout">
                {filteredUsers.length > 0 ? (
                  filteredUsers.slice(0, 50).map((user) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.98 }}
                      key={user.uid}
                      className="bg-white p-4 rounded-[24px] border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-brand-yellow/30 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden border border-gray-100 relative">
                          <img 
                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user.uid}`} 
                            alt="avatar" 
                            className="w-full h-full object-cover"
                          />
                          {user.isOnline && (
                            <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-black text-base text-gray-900 leading-none">{user.displayName}</h3>
                            {user.email === 'abrahamsande256@gmail.com' && (
                              <span className="bg-brand-black text-brand-yellow text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase">Owner</span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-gray-400 mt-1">{user.email}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <select 
                              value={user.role}
                              onChange={(e) => handleRoleUpdate(user.uid, e.target.value as any)}
                              className={cn(
                                "px-2 py-0.5 rounded-md text-[8px] font-black uppercase border outline-none appearance-none cursor-pointer",
                                user.role === 'admin' ? "bg-black text-brand-yellow border-black" :
                                user.role === 'rider' ? "bg-blue-50 text-blue-600 border-blue-100" :
                                "bg-gray-50 text-gray-500 border-gray-100"
                              )}
                            >
                              <option value="customer">Customer</option>
                              <option value="rider">Rider</option>
                              <option value="admin">Admin</option>
                            </select>

                            {user.verification_status === 'pending' && user.role_requested && (
                              <div className="flex items-center gap-1.5 bg-orange-50 text-orange-600 px-2 py-0.5 rounded-md border border-orange-100 animate-pulse">
                                <Clock className="w-2.5 h-2.5" />
                                <span className="text-[8px] font-black uppercase">Requested {user.role_requested}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {user.email !== 'abrahamsande256@gmail.com' && (
                          <>
                            {user.verification_status === 'pending' && user.role_requested && (
                              <div className="flex items-center gap-2 bg-orange-50 p-1.5 rounded-2xl border border-orange-200">
                                <button
                                  onClick={() => handleUpgradeApproval(user.uid, false)}
                                  className="w-8 h-8 rounded-xl bg-white text-red-500 flex items-center justify-center hover:bg-red-50 transition-colors shadow-sm"
                                  title="Reject"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleUpgradeApproval(user.uid, true)}
                                  className="px-4 h-8 bg-brand-yellow text-black rounded-xl font-black text-[9px] uppercase shadow-sm flex items-center gap-2 active:scale-95 transition-all"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                                </button>
                              </div>
                            )}

                            {user.status === 'suspended' ? (
                               <button
                                onClick={() => updateDoc(doc(db, 'users', user.uid), { status: 'active' })}
                                className="px-3 py-1.5 bg-green-500 text-white rounded-xl font-black text-[9px] uppercase active:scale-95 transition-all shadow-md"
                              >
                                Reactive Account
                              </button>
                            ) : (
                              <button
                                onClick={() => updateDoc(doc(db, 'users', user.uid), { status: 'suspended' })}
                                className="px-3 py-1.5 bg-red-100 text-red-600 rounded-xl font-black text-[9px] uppercase active:scale-95 transition-all"
                              >
                                Suspend
                              </button>
                            )}
                            
                            <button
                              onClick={() => handleDeleteUser(user.uid)}
                              className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                              title="Delete User"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-center py-16 bg-gray-50 rounded-[32px] border-2 border-dashed border-gray-100"
                  >
                    <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="font-black text-gray-400 uppercase text-[10px] tracking-widest">No users in this view</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
