import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, db } from '../firebase';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({ user: null, profile: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      
      // Clear previous profile listener if it exists
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (u) {
        setLoading(true);
        // Listen for profile changes
        unsubProfile = onSnapshot(doc(db, 'users', u.uid), async (snap) => {
          if (snap.exists()) {
            const data = { ...snap.data(), uid: snap.id } as UserProfile;
            const isSuperAdminEmail = u.email === 'abrahamsande256@gmail.com';
            
            if (isSuperAdminEmail && (data.role !== 'admin' || !data.isApproved)) {
              // Self-healing for admin role
              const { updateDoc, doc: fireDoc } = await import('firebase/firestore');
              await updateDoc(fireDoc(db, 'users', u.uid), {
                role: 'admin',
                isApproved: true
              });
              setProfile({ ...data, role: 'admin', isApproved: true });
            } else if (u.email === 'gamamediaug@gmail.com' && (!data.isApproved || data.role !== 'rider')) {
              // Self-healing for primary test rider
              const { updateDoc, doc: fireDoc } = await import('firebase/firestore');
              await updateDoc(fireDoc(db, 'users', u.uid), {
                role: 'rider',
                isApproved: true,
                isOnline: data.isOnline ?? false,
                isOnTrip: data.isOnTrip ?? false
              });
              setProfile({ ...data, role: 'rider', isApproved: true });
            } else {
              setProfile(data);
            }
          } else {
            const isAdmin = u.email === 'abrahamsande256@gmail.com';
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || '',
              displayName: u.displayName || 'User',
              role: isAdmin ? 'admin' : 'customer', // Default role
              status: 'active',   // Default status
              isApproved: isAdmin ? true : false,
              walletBalance: 50000, // Starting demo balance
              earnings: 0,
              createdAt: new Date().toISOString()
            };
            try {
              const { setDoc, doc } = await import('firebase/firestore');
              await setDoc(doc(db, 'users', u.uid), newProfile);
              setProfile(newProfile);
            } catch (err) {
              console.error("Error creating profile:", err);
            }
          }
          setLoading(false);
        }, (error) => {
          console.error("Profile listener error:", error);
          setLoading(false);
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
