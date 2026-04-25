import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { Rider, UserProfile, UserRole, UserStatus } from '../types';
import { User, Bike, Fuel, Droplets, CheckCircle2, Loader2, Star, Clock, AlertTriangle, ShieldCheck } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import RoleSelection from './RoleSelection';

export default function Profile({ onComplete }: { onComplete?: () => void }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'role' | 'details'>('role');
  const [profile, setProfile] = useState<Rider & { isApproved?: boolean }>({
    uid: auth.currentUser?.uid || '',
    email: auth.currentUser?.email || '',
    displayName: auth.currentUser?.displayName || '',
    role: 'customer',
    status: 'active',
    phoneNumber: '',
    bikeType: 'Bajaj Boxer BM150',
    numberPlate: '',
    fuelConsumptionRate: 0.03, // 3L per 100km
    tankCapacity: 11,
    rating: 4.8, 
    createdAt: new Date().toISOString(),
    isApproved: false,
    isOnline: false,
    walletBalance: 0,
    earnings: 0
  });

  useEffect(() => {
    const fetchProfile = async () => {
      if (!auth.currentUser) return;
      try {
        const docRef = doc(db, 'users', auth.currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data() as Rider;
          setProfile(data);
          setStep('details');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser.uid}`);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleRoleSelect = (role: UserRole) => {
    if (role === 'rider') {
      setProfile(prev => ({ ...prev, role, isApproved: prev.isApproved ?? false }));
      setStep('details');
    } else {
      saveProfile({ ...profile, role });
    }
  };

  const saveProfile = async (updatedProfile: Rider & { nationalId?: string, drivingPermit?: string }) => {
    if (!auth.currentUser) return;
    setSaving(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser.uid);
      
      // If applying for rider, create or update application
      if (updatedProfile.role === 'rider' && !updatedProfile.isApproved) {
        // Update user status to pending with explicit request fields
        const userUpdate = { 
          ...updatedProfile, 
          status: 'pending' as UserStatus,
          role: 'customer' as UserRole, // Stay customer until approved
          role_requested: 'rider' as UserRole,
          verification_status: 'pending' as const
        };
        await setDoc(userRef, userUpdate);

        // Check if application already exists
        const appsRef = collection(db, 'rider_applications');
        const qApps = query(appsRef, where('userId', '==', auth.currentUser.uid), where('status', '==', 'PENDING'));
        const existingApps = await getDocs(qApps);

        const applicationData = {
          userId: auth.currentUser.uid,
          userName: updatedProfile.displayName,
          userEmail: updatedProfile.email,
          nationalId: updatedProfile.nationalId || '',
          drivingPermit: updatedProfile.drivingPermit || '',
          bikeNumber: updatedProfile.numberPlate || '',
          bodaType: 'STANDARD', // Default to standard
          status: 'PENDING',
          createdAt: new Date().toISOString()
        };

        if (existingApps.empty) {
          await addDoc(appsRef, applicationData);
        } else {
          const appDoc = existingApps.docs[0];
          await setDoc(doc(db, 'rider_applications', appDoc.id), {
            ...applicationData,
            createdAt: appDoc.data().createdAt // Keep original date
          });
        }

        // Notify admins
        const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
        const adminsSnap = await getDocs(adminsQuery);
        
        let adminIds = adminsSnap.docs.map(d => d.id);
        
        // Ensure super admin is included if they are the only ones
        const superAdminEmail = 'abrahamsande256@gmail.com';
        if (!adminIds.length) {
          const superAdminSnap = await getDocs(query(collection(db, 'users'), where('email', '==', superAdminEmail)));
          if (!superAdminSnap.empty) {
            adminIds.push(superAdminSnap.docs[0].id);
          }
        }

        for (const adminId of Array.from(new Set(adminIds))) {
          await addDoc(collection(db, 'notifications'), {
            userId: adminId,
            title: 'New Rider Application',
            message: `${updatedProfile.displayName} has applied to be a rider.`,
            type: 'RIDER_APPLICATION',
            data: { appId: auth.currentUser.uid },
            read: false,
            createdAt: new Date().toISOString()
          });
        }
      } else {
        await setDoc(userRef, updatedProfile);
      }

      setProfile(updatedProfile as any);
      onComplete?.();
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${auth.currentUser.uid}`);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveProfile(profile);
  };

  if (loading) return <div className="flex justify-center p-12 text-gray-400 font-bold">Initializing profile...</div>;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <AnimatePresence mode="wait">
        {step === 'role' ? (
          <motion.div
            key="role-step"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
          >
            <RoleSelection onSelect={handleRoleSelect} />
          </motion.div>
        ) : (
          <motion.div
            key="details-step"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <header className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                  {profile.role === 'rider' ? 'Rider Details' : 'Account Details'}
                </h2>
                <p className="text-gray-500 text-sm font-medium">Manage your configuration</p>
              </div>
              {profile.role === 'rider' && (
                 <div className="text-right">
                    {profile.isApproved ? (
                      <span className="bg-green-50 text-green-600 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border border-green-100 shadow-sm animate-in zoom-in">
                        <CheckCircle2 className="w-3 h-3" /> Approved
                      </span>
                    ) : (
                      <span className="bg-brand-black text-brand-yellow px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 shadow-lg animate-pulse">
                        <Clock className="w-3 h-3" /> Pending
                      </span>
                    )}
                 </div>
              )}
            </header>

            {profile.role === 'rider' && !profile.isApproved && (
               <div className="bg-brand-yellow/10 p-4 rounded-2xl border-2 border-brand-yellow/20 flex gap-4">
                  <div className="w-10 h-10 bg-brand-yellow rounded-xl flex items-center justify-center text-black shrink-0">
                     <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-black text-sm text-gray-900">Application Under Review</h4>
                    <p className="text-xs font-bold text-gray-600 leading-tight mt-1">
                      Admins are currently reviewing your machine details. You will be notified once approved to take rides.
                    </p>
                  </div>
               </div>
            )}

            <div className="card-premium !p-4">
              <form onSubmit={handleSave} className="space-y-6">
                {profile.role === 'rider' ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                          <Bike className="w-3 h-3 text-brand-yellow" /> Vehicle Model
                        </label>
                        <select
                          value={profile.bikeType}
                          onChange={(e) => setProfile({ ...profile, bikeType: e.target.value })}
                          className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm text-gray-900 focus:bg-white focus:border-brand-yellow outline-none transition-all appearance-none cursor-pointer"
                        >
                          <option>Bajaj Boxer BM150</option>
                          <option>TVS HLX 125</option>
                          <option>Honda Ace CB125</option>
                          <option>Yamaha Crux</option>
                          <option>Other / Custom</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                          <User className="w-3 h-3 text-brand-yellow" /> Phone Number
                        </label>
                        <input
                          type="tel"
                          value={profile.phoneNumber}
                          onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })}
                          placeholder="+256 700 000 000"
                          className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm text-gray-900 focus:bg-white focus:border-brand-yellow outline-none transition-all"
                          required
                        />
                      </div>
                    </div>

                    {!profile.isApproved && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">National ID Number</label>
                          <input
                            type="text"
                            value={(profile as any).nationalId || ''}
                            onChange={(e) => setProfile({ ...profile, [ 'nationalId' as any]: e.target.value.toUpperCase() })}
                            placeholder="CM1234567890"
                            className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm text-gray-900 focus:bg-white focus:border-brand-yellow outline-none transition-all"
                            required={!profile.isApproved}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Driving Permit Number</label>
                          <input
                            type="text"
                            value={(profile as any).drivingPermit || ''}
                            onChange={(e) => setProfile({ ...profile, ['drivingPermit' as any]: e.target.value.toUpperCase() })}
                            placeholder="DP1234567890"
                            className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm text-gray-900 focus:bg-white focus:border-brand-yellow outline-none transition-all"
                            required={!profile.isApproved}
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                        <Bike className="w-3 h-3 text-brand-yellow" /> Number Plate
                      </label>
                      <input
                        type="text"
                        value={profile.numberPlate}
                        onChange={(e) => setProfile({ ...profile, numberPlate: e.target.value.toUpperCase() })}
                        placeholder="UEX 000Z"
                        className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-black text-lg text-gray-900 focus:bg-white focus:border-brand-yellow outline-none transition-all"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                          <Fuel className="w-3 h-3 text-traffic-amber" /> Liters/km
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          value={isNaN(profile.fuelConsumptionRate) ? '' : profile.fuelConsumptionRate}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setProfile({ ...profile, fuelConsumptionRate: isNaN(val) ? 0 : val });
                          }}
                          className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-black text-xl text-gray-900 focus:bg-white focus:border-brand-yellow outline-none transition-all"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-2">
                          <Droplets className="w-3 h-3 text-brand-blue" /> Tank (L)
                        </label>
                        <input
                          type="number"
                          value={isNaN(profile.tankCapacity) ? '' : profile.tankCapacity}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setProfile({ ...profile, tankCapacity: isNaN(val) ? 0 : val });
                          }}
                          className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-black text-xl text-gray-900 focus:bg-white focus:border-brand-yellow outline-none transition-all"
                          required
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Display Name</label>
                      <input
                        type="text"
                        value={profile.displayName}
                        onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                        className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm text-gray-900 focus:bg-white focus:border-brand-yellow outline-none transition-all"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-gray-400">Phone Number</label>
                      <input
                        type="tel"
                        value={profile.phoneNumber}
                        onChange={(e) => setProfile({ ...profile, phoneNumber: e.target.value })}
                        placeholder="+256 700 000 000"
                        className="w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 font-bold text-sm text-gray-900 focus:bg-white focus:border-brand-yellow outline-none transition-all"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full bg-brand-black text-brand-yellow py-4 rounded-xl font-black text-sm uppercase shadow-xl hover:scale-[1.02] active:scale-95 transition-all"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : (
                    profile.role === 'rider' && !profile.isApproved ? "Update Application" : "Save Changes"
                  )}
                </button>
              </form>
            </div>

            <div className="card-premium !bg-gray-50 !border-dashed border-gray-200 !p-4 space-y-3">
              <div className="flex justify-between items-center text-[9px] font-bold">
                 <div className="flex items-center gap-2">
                   <ShieldCheck className="w-3.5 h-3.5 text-brand-yellow" />
                   <span className="text-gray-400 uppercase tracking-widest">Account Status</span>
                 </div>
                 <span className={cn(
                   "px-1.5 py-0.5 rounded-md text-white uppercase",
                   profile.status === 'active' ? "bg-green-500" : "bg-red-500"
                 )}>{profile.status}</span>
              </div>
              <div className="flex justify-between items-center text-[9px] font-bold">
                <span className="text-gray-400">CURRENT ROLE:</span>
                <span className="text-brand-yellow bg-black px-1.5 py-0.5 rounded-md uppercase">{profile.role}</span>
              </div>
              <div className="flex justify-between items-center text-[9px] font-bold">
                <span className="text-gray-400">JOINED ON:</span>
                <span className="text-gray-900">{format(new Date(profile.createdAt), 'MMM d, yyyy')}</span>
              </div>
              <button 
                onClick={() => setStep('role')}
                className="w-full text-[9px] font-black text-gray-400 hover:text-gray-900 transition-colors uppercase tracking-widest pt-1 border-t border-gray-100 mt-2"
              >
                Switch Access Mode
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
