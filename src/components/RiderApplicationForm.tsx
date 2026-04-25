import React, { useState } from 'react';
import { doc, updateDoc, collection, addDoc, query, where, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import { Bike, FileText, CheckCircle, ArrowRight, Shield } from 'lucide-react';
import { motion } from 'motion/react';
import { RideType } from '../types';

export default function RiderApplicationForm({ onComplete }: { onComplete?: () => void }) {
  const { profile } = useAuth();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    nationalId: '',
    drivingPermit: '',
    bikePlate: '',
    phoneNumber: '',
    bodaType: 'STANDARD' as RideType
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!profile) return;
    setSubmitting(true);
    try {
      // 1. Update user to pending status with upgrade fields
      await updateDoc(doc(db, 'users', profile.uid), {
        status: 'pending',
        role_requested: 'rider',
        verification_status: 'pending',
        phoneNumber: formData.phoneNumber,
        numberPlate: formData.bikePlate,
        bikeType: formData.bodaType
      });

      // 2. Create rider application record
      await addDoc(collection(db, 'rider_applications'), {
        userId: profile.uid,
        userName: profile.displayName,
        userEmail: profile.email,
        nationalId: formData.nationalId,
        drivingPermit: formData.drivingPermit,
        bikeNumber: formData.bikePlate,
        bodaType: formData.bodaType,
        status: 'PENDING',
        createdAt: new Date().toISOString()
      });

      // 3. Notify admins
      const adminsQuery = query(collection(db, 'users'), where('role', '==', 'admin'));
      const adminsSnap = await getDocs(adminsQuery);
      
      let adminIds = adminsSnap.docs.map(d => d.id);
      
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
          message: `${profile.displayName} has applied to be a rider.`,
          type: 'RIDER_APPLICATION',
          data: { appId: profile.uid },
          read: false,
          createdAt: new Date().toISOString()
        });
      }

      setStep(3); // Success step
      if (onComplete) setTimeout(onComplete, 3000);
    } catch (err) {
      console.error("Submission error:", err);
      setSubmitting(false);
    }
  };

  if (profile?.status === 'pending') {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-[calc(100vh-200px)]">
        <div className="w-24 h-24 bg-brand-yellow rounded-[40px] flex items-center justify-center mb-6 shadow-2xl animate-bounce">
          <Shield className="w-10 h-10 text-black" />
        </div>
        <h2 className="text-3xl font-black text-black mb-4 tracking-tighter uppercase italic">Verification Pending</h2>
        <p className="text-gray-500 font-bold max-w-sm">
          Your application is being reviewed by the BodaSmart team. We'll notify you once you're approved to start riding!
        </p>
        <button 
          onClick={async () => {
            setSubmitting(true);
            try {
              await updateDoc(doc(db, 'users', profile.uid), { 
                status: 'active', 
                role_requested: null, 
                verification_status: null 
              });
              window.location.reload(); 
            } catch (err) {
              console.error(err);
              setSubmitting(false);
            }
          }}
          disabled={submitting}
          className="mt-8 text-xs font-black text-gray-300 hover:text-black uppercase tracking-widest border-b border-transparent hover:border-black transition-all"
        >
          Something wrong? Reset application
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6 space-y-8 animate-in fade-in slide-in-from-bottom-4">
      <div className="space-y-2">
        <div className="w-16 h-16 bg-black rounded-[24px] flex items-center justify-center text-brand-yellow mb-4 shadow-xl">
          <Bike className="w-10 h-10" />
        </div>
        <h2 className="text-4xl font-black text-black leading-none tracking-tighter">BECOME A RIDER</h2>
        <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest leading-none">Maximize your earnings in Kampala</p>
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div className="space-y-4">
             <div>
               <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block">Phone Number</label>
               <input 
                type="tel" 
                placeholder="+256 7xx xxxxxx"
                className="w-full bg-white p-5 rounded-2xl border-2 border-gray-100 font-bold outline-none focus:border-brand-yellow transition-all"
                value={formData.phoneNumber}
                onChange={(e) => setFormData({...formData, phoneNumber: e.target.value})}
               />
             </div>
             <div>
               <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block">National ID Number</label>
               <input 
                type="text" 
                placeholder="CM1234567890"
                className="w-full bg-white p-5 rounded-2xl border-2 border-gray-100 font-bold outline-none focus:border-brand-yellow transition-all"
                value={formData.nationalId}
                onChange={(e) => setFormData({...formData, nationalId: e.target.value})}
               />
             </div>
          </div>
          <button 
            onClick={() => setStep(2)}
            disabled={!formData.phoneNumber || !formData.nationalId}
            className="w-full bg-black text-brand-yellow py-6 rounded-[32px] font-black text-xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            NEXT STEP <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div className="space-y-4">
             <div>
                <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block">Driving Permit No.</label>
                <input 
                  type="text" 
                  placeholder="D1234567"
                  className="w-full bg-white p-5 rounded-2xl border-2 border-gray-100 font-bold outline-none focus:border-brand-yellow transition-all"
                  value={formData.drivingPermit}
                  onChange={(e) => setFormData({...formData, drivingPermit: e.target.value})}
                />
             </div>
             <div>
                <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block">Bike Number Plate</label>
                <input 
                  type="text" 
                  placeholder="UEX 000Z"
                  className="w-full bg-white p-5 rounded-2xl border-2 border-gray-100 font-bold outline-none focus:border-brand-yellow transition-all"
                  value={formData.bikePlate}
                  onChange={(e) => setFormData({...formData, bikePlate: e.target.value.toUpperCase()})}
                />
             </div>
             <div>
                <label className="text-[10px] font-black uppercase text-gray-400 mb-2 block">Boda Type</label>
                <select 
                  className="w-full bg-white p-5 rounded-2xl border-2 border-gray-100 font-bold outline-none focus:border-brand-yellow transition-all appearance-none"
                  value={formData.bodaType}
                  onChange={(e) => setFormData({...formData, bodaType: e.target.value as RideType})}
                >
                   <option value={RideType.ECONOMY}>Economy</option>
                   <option value={RideType.STANDARD}>Standard</option>
                   <option value={RideType.PREMIUM}>Premium</option>
                </select>
             </div>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => setStep(1)}
              className="flex-1 bg-gray-100 text-black py-6 rounded-[32px] font-black text-xl shadow-sm"
            >
              BACK
            </button>
            <button 
              onClick={handleSubmit}
              disabled={submitting || !formData.drivingPermit || !formData.bikePlate}
              className="flex-[2] bg-black text-brand-yellow py-6 rounded-[32px] font-black text-xl shadow-xl flex items-center justify-center gap-3 disabled:opacity-50"
            >
              {submitting ? 'SUBMITTING...' : 'FINISH'} 
              <CheckCircle className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="text-center py-12 space-y-6">
          <div className="w-24 h-24 bg-green-500 rounded-[40px] flex items-center justify-center mx-auto shadow-2xl">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
          <div className="space-y-2">
            <h3 className="text-3xl font-black text-black">APPLICATION SENT</h3>
            <p className="text-gray-400 font-bold uppercase text-xs tracking-widest">We are reviewing your profile</p>
          </div>
        </div>
      )}
    </div>
  );
}
