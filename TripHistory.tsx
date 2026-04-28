import React, { useState, useEffect, useRef } from 'react';
import { getRouteOptimization, getDestinationSuggestions } from '../services/geminiService';
import { RideStatus, RideType, Rider, RouteOptimizationResult, Trip, RideRequest, UserProfile, GeoLocation } from '../types';
import { MapPin, Navigation, Banknote, Clock, ShieldCheck, Search, ChevronRight, X, Map as MapIcon, Loader2, Locate, Compass, TrendingUp, AlertTriangle, Plus, Minus, ArrowUp, ArrowUpRight, ArrowUpLeft, RotateCw, AlertCircle, Zap, ArrowRight, Menu, Car, CircleCheck, ArrowLeft, Fuel } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, updateDoc, doc, getDoc } from 'firebase/firestore';
import { useGeolocation } from '../hooks/useGeolocation';
import { cn } from '../lib/utils';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useAuth } from '../context/AuthContext';

// Leaflet setup
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  map.setView(center, zoom);
  return null;
}

export default function RouteOptimizer({ rider }: { rider: Rider }) {
  const { profile, loading: authLoading } = useAuth();
  const [start, setStart] = useState('John Kiyingi Rd, Kampala');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteOptimizationResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [fare, setFare] = useState<number>(6800);
  const [isNavigating, setIsNavigating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet'>('cash');
  const [activeRide, setActiveRide] = useState<RideRequest | null>(null);
  const [uiStep, setUiStep] = useState<'idle' | 'searching' | 'preview' | 'active'>('idle');
  const [requestStatus, setRequestStatus] = useState<'idle' | 'searching' | 'matched' | 'ongoing'>('idle');
  const [rideType, setRideType] = useState<RideType>(RideType.STANDARD);
  const [endSuggestions, setEndSuggestions] = useState<string[]>([]);
  const [lastTrip, setLastTrip] = useState<Trip | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'info' | 'success' | 'warning'} | null>(null);
  const [riderMapPos, setRiderMapPos] = useState<[number, number] | null>(null);
  const [hasLoyaltyDiscount, setHasLoyaltyDiscount] = useState(true);
  const [findRiderTimeout, setFindRiderTimeout] = useState<NodeJS.Timeout | null>(null);

  const mapRef = useRef<L.Map>(null);

  const { location } = useGeolocation();

  const isValidPos = (pos: any): pos is [number, number] => {
    return Array.isArray(pos) && pos.length === 2 && 
           typeof pos[0] === 'number' && typeof pos[1] === 'number' && 
           !isNaN(pos[0]) && !isNaN(pos[1]);
  };

  const mapCenter: [number, number] = [0.2983, 32.6015]; // Kansanga KIU Center

  const rideTypes = [
    { id: RideType.ECONOMY, label: 'Economy', icon: '🏍️', priceMul: 0.8, color: 'bg-green-500' },
    { id: RideType.STANDARD, label: 'Standard', icon: '🔵', priceMul: 1.0, color: 'bg-blue-500' },
    { id: RideType.PREMIUM, label: 'Premium', icon: '🏍️✨', priceMul: 1.5, color: 'bg-purple-600' },
  ];

  // Trigger Notification helper
  const notify = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  const getCurrentPosition = (): Promise<[number, number]> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation not supported"));
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    });
  };

  const calculateDistance = (p1: [number, number] | number, p2: [number, number] | number, p3?: number, p4?: number) => {
    let lat1, lon1, lat2, lon2;
    if (Array.isArray(p1) && Array.isArray(p2)) {
      [lat1, lon1] = p1;
      [lat2, lon2] = p2;
    } else if (typeof p1 === 'number' && typeof p2 === 'number' && typeof p3 === 'number' && typeof p4 === 'number') {
      lat1 = p1; lon1 = p2; lat2 = p3; lon2 = p4;
    } else return 0;

    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const activeRoute = result ? (selectedRouteIndex === 0 ? result.best_route : (result.alternative_routes?.[selectedRouteIndex - 1] || result.best_route)) : null;

  const getETA = () => {
    if (!activeRide || !mapCenter) return null;
    const riderPos = riderMapPos || mapCenter;
    const target = activeRide.status === RideStatus.ACCEPTED ? activeRide.pickupCoords : activeRide.destCoords;
    const dist = calculateDistance(riderPos, target);
    
    // Check traffic level from route data if available
    const trafficSurcharge = activeRide.routeData?.best_route?.traffic_level?.toLowerCase() === 'heavy' ? 1.5 : 1.0;
    
    // Rough estimate: 2-3 mins per km in Kampala plus traffic factor
    return Math.max(1, Math.ceil(dist * 2.5 * trafficSurcharge));
  };

  // Sync UI Step with active ride
  useEffect(() => {
    if (activeRide && (activeRide.status === RideStatus.ACCEPTED || activeRide.status === RideStatus.ARRIVED || activeRide.status === RideStatus.TRIP_STARTED)) {
      setUiStep('active');
    } else if (result) {
      setUiStep('preview');
    } else if (uiStep !== 'searching' && requestStatus !== 'searching') {
      setUiStep('idle');
    }
  }, [!!activeRide, !!result, uiStep, requestStatus, activeRide?.status]);

  // Handle back button logically
  const handleBack = () => {
    setUiStep('idle');
    setResult(null);
    if (requestStatus === 'searching' && activeRide?.id) {
       // Silently cancel if they just "searched"
       updateDoc(doc(db, 'rides', activeRide.id), { status: RideStatus.CANCELLED });
    }
  };

  // Update fare when route selection changes
  useEffect(() => {
    if (!result) return;
    const activeRoute = selectedRouteIndex === 0 ? result.best_route : result.alternative_routes[selectedRouteIndex - 1];
    
    // Formula: Fare = Base Fare + (Distance in KM × Price per KM)
    const baseFare = 2000;
    const perKmRate = 1000;
    const distance = activeRoute.distance || result.distance || 0;
    
    const typeMul = rideTypes.find(t => t.id === rideType)?.priceMul || 1.0;
    let calculatedFare = (baseFare + (distance * perKmRate)) * typeMul;
    
    // AI Efficiency/Traffic surcharge (optional small extra)
    if (activeRoute.traffic_level?.toLowerCase() === 'heavy') calculatedFare *= 1.1;
    
    setFare(Math.round(calculatedFare / 100) * 100); // Round to nearest 100 UGX
  }, [selectedRouteIndex, result, rideType]);

  // Loyalty Logic: Check if user has 3+ rides in last 7 days
  useEffect(() => {
    if (profile?.role !== 'customer') return;
    
    // If they already have rides remaining, just enable the flag
    if (profile.loyaltyRidesRemaining && profile.loyaltyRidesRemaining > 0) {
      setHasLoyaltyDiscount(true);
      return;
    }

    const checkLoyalty = async () => {
      try {
        const { getDocs, query, collection, where, updateDoc, doc } = await import('firebase/firestore');
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const q = query(
          collection(db, 'rides'),
          where('customerId', '==', profile.uid),
          where('status', '==', RideStatus.COMPLETED),
          where('timestamp', '>=', sevenDaysAgo.toISOString())
        );
        
        const snap = await getDocs(q);
        if (snap.size >= 3) {
          // Grant 2 discounted rides
          await updateDoc(doc(db, 'users', profile.uid), {
            loyaltyRidesRemaining: 2
          });
          setHasLoyaltyDiscount(true);
          notify("Congratulations! You've unlocked a 35% Loyalty Discount for your next 2 rides!", "success");
        }
      } catch (err) {
        console.error("Loyalty check error:", err);
      }
    };
    
    if (!profile.loyaltyRidesRemaining || profile.loyaltyRidesRemaining === 0) {
      checkLoyalty();
    }
  }, [profile?.uid, profile?.role, profile?.loyaltyRidesRemaining]);


  // Bi-directional location updates
  useEffect(() => {
    if (!profile || !profile.uid || !location) return;

    // Condition to sync: 
    // 1. If Rider is Online
    // 2. If Customer has an ACTIVE trip (ACCEPTED, ARRIVED, TRIP_STARTED)
    const isRiderOnline = profile.role === 'rider' && profile.isOnline;
    const isCustomerOnTrip = profile.role === 'customer' && activeRide && 
      [RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.TRIP_STARTED].includes(activeRide.status);

    if (!isRiderOnline && !isCustomerOnTrip) return;

    const currentPos: [number, number] = [location.latitude, location.longitude];

    const syncLocation = async () => {
      try {
        const { updateDoc, doc: fireDoc } = await import('firebase/firestore');
        await updateDoc(fireDoc(db, 'users', profile.uid), {
          lastKnownLocation: currentPos,
          lastLocationUpdate: new Date().toISOString()
        });
      } catch (err) {
        console.error("Sync location error:", err);
      }
    };

    const interval = setInterval(syncLocation, 5000);
    syncLocation(); // Immediate sync

    return () => clearInterval(interval);
  }, [profile?.uid, profile?.role, profile?.isOnline, location, activeRide?.status]);

  // Bi-directional location listening
  useEffect(() => {
    if (!profile || !activeRide) {
      setRiderMapPos(null);
      return;
    }

    // Determine whose location to watch
    // If I'm the customer, I watch the rider.
    // If I'm the rider, I watch the customer.
    const targetId = profile.role === 'customer' ? activeRide.riderId : activeRide.customerId;
    
    if (!targetId || ![RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.TRIP_STARTED].includes(activeRide.status)) {
      setRiderMapPos(null);
      return;
    }

    const unsubTargetPos = onSnapshot(doc(db, 'users', targetId), (snap) => {
      if (snap.exists()) {
        const tData = snap.data();
        if (tData.lastKnownLocation) {
          setRiderMapPos(tData.lastKnownLocation);
        }
      }
    });

    return () => unsubTargetPos();
  }, [profile?.uid, profile?.role, activeRide?.id, activeRide?.status, activeRide?.riderId, activeRide?.customerId]);


  const customIcon = L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div class="relative">
        <div class="w-10 h-10 bg-black rounded-2xl flex items-center justify-center border-2 border-brand-yellow shadow-2xl">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-brand-yellow">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
            <circle cx="12" cy="9" r="2.5" fill="currentColor"/>
          </svg>
        </div>
        <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-black rotate-45 border-r-2 border-b-2 border-brand-yellow"></div>
      </div>
    `,
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });


  // Listen for active ride if user is customer or rider
  useEffect(() => {
    if (!profile) return;
    
    // For riders, active ride is only after acceptance
    // For customers, active ride starts from REQUESTED
    const statuses = profile.role === 'customer' 
      ? [RideStatus.REQUESTED, RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.TRIP_STARTED]
      : [RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.TRIP_STARTED];

    const field = profile.role === 'customer' ? 'customerId' : 'riderId';
    const q = query(
      collection(db, 'rides'), 
      where(field, '==', profile.uid),
      where('status', 'in', statuses)
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as RideRequest));
        docs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const ride = docs[0];

        // Stale check
        const now = new Date().getTime();
        const rideTime = new Date(ride.timestamp).getTime();
        if ((now - rideTime) > 1800000 && ride.status === RideStatus.REQUESTED) { // 30 mins
           setActiveRide(null);
           setRequestStatus('idle');
           return;
        }
        
        if (profile.role === 'customer' && activeRide?.status !== ride.status) {
          if (ride.status === RideStatus.ACCEPTED) notify("Rider has accepted your request!", "success");
          if (ride.status === RideStatus.ARRIVED) notify("Your rider has arrived!", "info");
          if (ride.status === RideStatus.TRIP_STARTED) notify("Trip started!", "success");
        }

        setActiveRide(ride);
        setRequestStatus(ride.status === RideStatus.REQUESTED ? 'searching' : 
                         ride.status === RideStatus.ACCEPTED ? 'matched' : 'ongoing');
        if (ride.status === RideStatus.TRIP_STARTED) setIsNavigating(true);
      } else {
        setActiveRide(null);
        setIsNavigating(false);
        if (requestStatus !== 'searching') setRequestStatus('idle');
      }
    }, (err) => {
      console.error("Active Ride Listener Error:", err);
    });

    return () => unsub();
  }, [profile?.uid, profile?.role]);




  const toggleOnline = async () => {
    if (!profile) return;
    try {
      const isNowOnline = !profile.isOnline;
      const updateData: any = {
        isOnline: isNowOnline,
        isOnTrip: false,
        lastLocationUpdate: new Date().toISOString()
      };

      // Ensure location is updated when going online
      if (isNowOnline) {
        const coords = await getCurrentPosition().catch(() => null);
        if (coords) {
          updateData.lastKnownLocation = coords;
        } else if (!profile.lastKnownLocation) {
          // Fallback to random Kampala location if no GPS and no previous location
          updateData.lastKnownLocation = [0.3476 + (Math.random() - 0.5) * 0.01, 32.5825 + (Math.random() - 0.5) * 0.01];
        }
      }

      await updateDoc(doc(db, 'users', profile.uid), updateData);
      notify(isNowOnline ? "You are now Online! Waiting for requests..." : "You are now Offline", isNowOnline ? "success" : "info");
    } catch (err) {
      console.error("Toggle online error:", err);
    }
  };


  // Automatic Matchmaking Logic (Customer Side) - Unified
  useEffect(() => {
    if (profile?.role !== 'customer' || !activeRide || activeRide.status !== RideStatus.REQUESTED || activeRide.riderId) {
      return;
    }

    const matchInterval = setTimeout(() => {
      console.log("MATCHING Recovery: Searching for nearest rider...");
      attemptMatch(activeRide.id!, activeRide.pickupCoords, activeRide.rejectedRiders || []);
    }, 5000); // 5s recovery if manual attempt failed

    return () => clearTimeout(matchInterval);
  }, [profile?.role, activeRide?.id, activeRide?.status, activeRide?.riderId]);


  // Arrival Detection Logic (Rider Side)
  useEffect(() => {
    if (profile?.role !== 'rider' || !activeRide || activeRide.status !== RideStatus.ACCEPTED) return;
    
    // Use real location if available
    const currentLoc: [number, number] | null = location ? [location.latitude, location.longitude] : null;
    if (!currentLoc) return;

    const pickup = activeRide.pickupCoords;
    const dist = calculateDistance(currentLoc, pickup);

    if (dist < 0.1) { // 100 meters
      const autoArrive = async () => {
        try {
          const { updateDoc, doc: fireDoc } = await import('firebase/firestore');
          await updateDoc(fireDoc(db, 'rides', activeRide.id!), {
            status: RideStatus.ARRIVED
          });
          notify("You have arrived at the pickup location!", "success");
        } catch (err) {
          console.error("Auto-arrive error:", err);
        }
      };
      autoArrive();
    }
  }, [profile?.role, activeRide?.id, activeRide?.status, location, activeRide?.pickupCoords]);

  const handleRequestRide = async () => {
    if (!profile || !result) return;
    setRequestStatus('searching');
    
    try {
      const activeRoute = selectedRouteIndex === 0 ? result.best_route : result.alternative_routes[selectedRouteIndex - 1];
      const baseFare = 2000;
      const perKmRate = 1000;
      const distance = activeRoute.distance || result.distance || 0;
      
      const typeMul = rideTypes.find(t => t.id === rideType)?.priceMul || 1.0;
      let calculatedFare = (baseFare + (distance * perKmRate)) * typeMul;
      
      const finalFare = Math.round(calculatedFare / 100) * 100;
      const discountedFare = hasLoyaltyDiscount ? Math.round(finalFare * 0.65) : finalFare;

      const rideData: any = {
        customerId: profile.uid,
        customerName: profile.displayName,
        customerPhone: profile.phoneNumber || '',
        status: RideStatus.REQUESTED,
        pickup: start,
        destination: end,
        pickupCoords: mapCenter,
        destCoords: activeRoute.waypoints?.[activeRoute.waypoints.length - 1] || [0.3476, 32.5825],
        rideType: rideType,
        paymentMethod: paymentMethod,
        fare: discountedFare,
        baseFare: baseFare,
        distanceFare: distance * perKmRate,
        estTime: activeRoute.time_minutes || 0,
        estDistance: activeRoute.distance || 0,
        timestamp: new Date().toISOString(),
        rejectedRiders: [],
        routeData: {
          suggestions: result.suggestions,
          best_route: {
            ...result.best_route,
            waypoints: result.best_route.waypoints.map(w => ({ lat: w[0], lng: w[1] }))
          },
          alternative_routes: result.alternative_routes.map(r => ({
            ...r,
            waypoints: r.waypoints.map(w => ({ lat: w[0], lng: w[1] }))
          })),
          navigation_steps: result.navigation_steps,
          distance: result.distance
        }
      };

      const docRef = await addDoc(collection(db, 'rides'), rideData);
      notify("Booking request sent! Finding nearest rider...", "success");
      
      // Start matching logic
      attemptMatch(docRef.id, mapCenter, []);
    } catch (err) {
      console.error("Booking failed:", err);
      notify("Failed to book ride", "warning");
      setRequestStatus('idle');
    }
  };

  const attemptMatch = async (rideId: string, pickup: [number, number], excludedRiders: string[]) => {
    // Clear any existing timeout for this match cycle if we had one
    if (findRiderTimeout) clearTimeout(findRiderTimeout);
    
    const { getDocs, query, collection, where } = await import('firebase/firestore');
    
    try {
      const q = query(
        collection(db, 'users'),
        where('role', '==', 'rider'),
        where('isOnline', '==', true)
      );

      const snap = await getDocs(q);
      const riders = snap.docs
        .map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile))
        .filter(r => r.role === 'rider' && r.isOnTrip !== true && !excludedRiders.includes(r.uid));

      if (riders.length === 0) {
        const { updateDoc, doc: fireDoc } = await import('firebase/firestore');
        await updateDoc(fireDoc(db, 'rides', rideId), { status: RideStatus.CANCELLED });
        setRequestStatus('idle');
        notify("No riders available nearby. Please try again later.", "warning");
        return;
      }
      
      const sorted = riders.sort((a, b) => {
        if (!a.lastKnownLocation || !b.lastKnownLocation) return 0;
        return calculateDistance(pickup, a.lastKnownLocation) - calculateDistance(pickup, b.lastKnownLocation);
      });

      const nearestRider = sorted[0];
      const { updateDoc, doc: fireDoc, getDoc } = await import('firebase/firestore');
      
      await updateDoc(fireDoc(db, 'rides', rideId), {
        riderId: nearestRider.uid,
        riderName: nearestRider.displayName,
        riderPhone: nearestRider.phoneNumber || ''
      });

      const timeout = setTimeout(async () => {
        const rideSnap = await getDoc(fireDoc(db, 'rides', rideId));
        const ride = rideSnap.data() as RideRequest;
        if (ride && ride.status === RideStatus.REQUESTED && ride.riderId === nearestRider.uid) {
          // Rider didn't accept, try next
          attemptMatch(rideId, pickup, [...excludedRiders, nearestRider.uid]);
        }
      }, 30000); 
      
      setFindRiderTimeout(timeout);
    } catch (err) {
      console.error("Matching error:", err);
    }
  };


  const handleDeclineRequest = async () => {
    if (!profile) return;
    if (findRiderTimeout) clearTimeout(findRiderTimeout);
    // Logic moved...
  };

  const handleStartTrip = async () => {
    if (profile?.role !== 'rider' || !activeRide?.id) return;
    try {
      await updateDoc(doc(db, 'rides', activeRide.id), {
        status: RideStatus.TRIP_STARTED
      });
      await updateDoc(doc(db, 'users', profile.uid), {
        isOnTrip: true
      });
      notify("Trip started! Optimize your route.", "success");
    } catch (err) {
      console.error("Start trip error:", err);
    }
  };

  const handleEndTrip = async () => {
    if (!activeRide?.id || !profile) return;
    setSaving(true);
    try {
      const { updateDoc, doc, getDoc } = await import('firebase/firestore');
      
      const rideSnap = await getDoc(doc(db, 'rides', activeRide.id));
      const rideData = rideSnap.data() as RideRequest;

      // Complete the ride
      await updateDoc(doc(db, 'rides', activeRide.id), {
        status: RideStatus.COMPLETED
      });

      // Update Rider Trip Status
      await updateDoc(doc(db, 'users', profile.uid), {
        isOnTrip: false
      });

      // Transaction logic
      if (rideData.paymentMethod === 'wallet') {
        // Update Rider Earnings
        const riderSnap = await getDoc(doc(db, 'users', profile.uid));
        const rData = riderSnap.data();
        await updateDoc(doc(db, 'users', profile.uid), {
          earnings: (rData?.earnings || 0) + rideData.fare
        });

        // Update Customer Balance
        const customerSnap = await getDoc(doc(db, 'users', rideData.customerId));
        const cData = customerSnap.data();
        const customerUpdates: any = {
          walletBalance: Math.max(0, (cData?.walletBalance || 0) - rideData.fare)
        };
        
        // Decrement loyalty if used
        if (cData?.loyaltyRidesRemaining && cData.loyaltyRidesRemaining > 0) {
          customerUpdates.loyaltyRidesRemaining = cData.loyaltyRidesRemaining - 1;
        }

        await updateDoc(doc(db, 'users', rideData.customerId), customerUpdates);
      }

      notify("Ride completed successfully!", "success");
      setSaving(false);
      setShowSummary(true);
      setIsNavigating(false);
      setRequestStatus('idle');
      setResult(null);
    } catch (err) {
      console.error("End trip error:", err);
      setSaving(false);
      notify("Error saving trip data", "warning");
    }
  };
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [isAiSearching, setIsAiSearching] = useState(false);
  const [localSuggestions, setLocalSuggestions] = useState<string[]>([]);
  const [recentDestinations, setRecentDestinations] = useState<string[]>(["Texas Lounge, Recently Visited", "Mukwano Mall, Recently Visited", "Kisekka Market, Kampala, Uganda"]);
  const [smartMode, setSmartMode] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [showRerouteAlert, setShowRerouteAlert] = useState(false);

  useEffect(() => {
    if (isNavigating) {
      const timer = setTimeout(() => {
        setShowRerouteAlert(true);
      }, 10000); // Show after 10s of trip
      return () => clearTimeout(timer);
    }
  }, [isNavigating]);

  const handleSwitchRoute = () => {
    setSelectedRouteIndex(0); // Switch back to 'best fuel' if not selected
    setShowRerouteAlert(false);
  };
  const [zoom, setZoom] = useState(15);
  const [landmarks] = useState([
    { name: "Kampala International University", position: [0.2983, 32.6015] as [number, number], type: 'edu' },
    { name: "Texas Lounge", position: [0.3015, 32.6035] as [number, number], type: 'food' },
    { name: "Kansanga Market", position: [0.2975, 32.5970] as [number, number], type: 'market' },
    { name: "Rubis Kansanga", position: [0.2955, 32.6025] as [number, number], type: 'fuel' },
    { name: "UK Mall", position: [0.2935, 32.6055] as [number, number], type: 'mall' },
    { name: "Meza & Salt", position: [0.3005, 32.6025] as [number, number], type: 'food' },
    { name: "Makerere University", position: [0.3347, 32.5676] as [number, number], type: 'edu' },
    { name: "Acacia Mall", position: [0.3364, 32.5857] as [number, number], type: 'mall' },
    { name: "Mulago Hospital", position: [0.3382, 32.5761] as [number, number], type: 'medical' },
    { name: "Old Taxi Park", position: [0.3136, 32.5830] as [number, number], type: 'transport' },
  ]);

  const [onlineRiders, setOnlineRiders] = useState<UserProfile[]>([]);

  // Listen for all online riders (for customers)
  useEffect(() => {
    if (profile?.role !== 'customer') return;
    const q = query(
      collection(db, 'users'),
      where('role', '==', 'rider'),
      where('isOnline', '==', true)
    );
    const unsub = onSnapshot(q, (snap) => {
      const riders = snap.docs
        .map(d => ({ uid: d.id, ...d.data() } as UserProfile))
        .filter(u => u.role === 'rider');
      setOnlineRiders(riders);
    }, (error) => {
      console.error("MAP: Online Riders list error:", error);
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsub();
  }, [profile?.role, profile?.uid]);

  const [dummyRiders] = useState(() => {
    return Array.from({ length: 5 }).map((_, i) => ({
      id: `dummy-${i}`,
      rotation: Math.random() * 360,
      position: [
        0.3476 + (Math.random() - 0.5) * 0.02,
        32.5825 + (Math.random() - 0.5) * 0.02
      ] as [number, number]
    }));
  });
  const searchTimeout = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (result) {
      setZoom(15);
    }
  }, [result]);

  useEffect(() => {
    if (isNavigating) {
      setZoom(18);
    }
  }, [isNavigating]);

  useEffect(() => {
    if (location && !start) {
      setStart(`${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
    }
  }, [location]);

  useEffect(() => {
    if (!end || end.length < 1) {
      setEndSuggestions([]);
      setLocalSuggestions([]);
      return;
    }

    // Instant local fallback
    const instantSugs = [
      "Ntinda Complex", "Kiwatule Trading Center", "Makerere University", 
      "Kikoni Proper", "Texas Lounge", "Mukwano Mall", "Acacia Mall", 
      "Village Mall", "Garden City Mall", "Freedom City Mall", 
      "Kyambogo University", "Mulago Hospital", "Bweyogere Market", 
      "Kireka", "Munyonyo Resort", "Ggaba Beach", "Kalerwe Market", 
      "Wandegeya Parking", "Kabiriti", "Kisseka Market", "Texas Lounge"
    ]
      .filter(s => s.toLowerCase().includes(end.toLowerCase()))
      .map(s => `${s}, Kampala`);
    setLocalSuggestions(instantSugs);

    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    setIsAiSearching(true);
    searchTimeout.current = setTimeout(async () => {
      try {
        const sugs = await getDestinationSuggestions(end, location);
        if (sugs && sugs.length > 0) {
          setEndSuggestions(sugs);
        }
      } catch (e) {
        console.warn("Suggestion fetch failed", e);
      } finally {
        setIsAiSearching(false);
      }
    }, 400);
    return () => clearTimeout(searchTimeout.current!);
  }, [end]);

  const [optimizationError, setOptimizationError] = useState<string | null>(null);

  const handleOptimize = async (targetEnd: string) => {
    const finalStart = start || `${mapCenter[0]}, ${mapCenter[1]}`;
    if (!finalStart || !targetEnd) return;
    
    setEnd(targetEnd);
    setLoading(true);
    setResult(null);
    setOptimizationError(null);
    setIsNavigating(false);
    setShowSuggestions(false);
    
    try {
      const res = await getRouteOptimization(finalStart, targetEnd, rider);
      setResult(res);
      setSelectedRouteIndex(0); // Reset to best fuel
    } catch (error: any) {
      console.error("Optimization failed:", error);
      
      const isApiKeyError = error.status === 401 || error.status === 400 || error.code === 'API_KEY_INVALID';
      
      if (isApiKeyError) {
        setOptimizationError("Gemini API Key is invalid or missing. Using offline estimation mode.");
      } else {
        setOptimizationError(error.message || "Route calculation failed. Using basic estimation.");
      }
      
      // FALLBACK: Allow booking even if AI fails
      setResult({
        suggestions: ["Direct", "Alternative"],
        best_route: {
          description: "Direct Path (Offline Mode)",
          time_minutes: 15,
          distance: 3.5,
          fuel_litres: 0.15,
          cost: 4500,
          reason: isApiKeyError ? "Using offline logic because API key is invalid." : "Showing direct route estimation while AI service is busy.",
          suggested_fare_range: { min: 4000, max: 5000 },
          waypoints: [[mapCenter[0], mapCenter[1]], [mapCenter[0] + 0.01, mapCenter[1] + 0.01]]
        },
        alternative_routes: [],
        navigation_steps: ["Head toward destination"],
        distance: 3.5
      });
      setSelectedRouteIndex(0);
    } finally {
      setLoading(false);
    }
  };

  const handleStartNavigation = () => {
    setIsNavigating(true);
  };

  const handleCompleteTrip = async () => {
    if (!result || !auth.currentUser) return;
    setSaving(true);
    const activeRoute = selectedRouteIndex === 0 ? result.best_route : result.alternative_routes[selectedRouteIndex - 1];
    try {
      const trip: Trip = {
        uid: auth.currentUser.uid,
        distance: activeRoute.distance || result.distance || 0,
        fuelUsed: activeRoute.fuel_litres,
        fuelCost: activeRoute.cost,
        fare: fare,
        profit: fare - activeRoute.cost,
        startPoint: start,
        endPoint: end,
        timestamp: new Date().toISOString(),
      };
      await addDoc(collection(db, 'trips'), trip);
      setLastTrip(trip);
      setShowSummary(true);
      setResult(null);
      setIsNavigating(false);
      setEnd('');
      setFare(0);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'trips');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 top-[48px] overflow-hidden">
      {/* Map Background */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={mapCenter} zoom={zoom} zoomControl={false} className="h-full w-full" ref={mapRef}>
          {onlineRiders.length === 0 && profile?.role === 'customer' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white px-4 py-2 rounded-full shadow-2xl border-2 border-red-100 flex items-center gap-2 animate-bounce">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
              <span className="text-[10px] font-black uppercase tracking-widest text-red-600">No Boda Riders Available Nearby</span>
            </div>
          )}
          <TileLayer 
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png" 
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          {isValidPos(mapCenter) && <ChangeView center={mapCenter} zoom={zoom} />}
          
          {/* Current User Marker */}
          {location && isValidPos([location.latitude, location.longitude]) && (
            <Marker 
              position={[location.latitude, location.longitude]}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `
                  <div class="relative">
                    <div class="w-10 h-10 ${profile?.role === 'rider' ? 'bg-black' : 'bg-brand-yellow'} rounded-full border-4 border-black shadow-2xl flex items-center justify-center">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" class="${profile?.role === 'rider' ? 'text-brand-yellow' : 'text-black'}">
                        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
                        <circle cx="12" cy="9" r="2.5" fill="currentColor"/>
                      </svg>
                    </div>
                    <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 border-2 border-white rounded-full"></div>
                  </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 40]
              })}
            >
              <Popup>You (${profile?.role === 'rider' ? 'Rider' : 'Customer'})</Popup>
            </Marker>
          )}

          {/* Active Ride: Other Party Marker */}
          {riderMapPos && isValidPos(riderMapPos) && activeRide && (
            <Marker 
              position={riderMapPos} 
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `
                  <div class="relative">
                    <div class="w-10 h-10 ${profile?.role === 'customer' ? 'bg-black' : 'bg-brand-yellow'} rounded-2xl flex items-center justify-center border-2 ${profile?.role === 'customer' ? 'border-brand-yellow' : 'border-black'} shadow-2xl">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" class="${profile?.role === 'customer' ? 'text-brand-yellow' : 'text-black'}">
                        <path d="M12 11c0 3.517-2.103 6.542-5.117 7.796c-.94.391-1.883.204-2.883-.171a11.007 11.007 0 0 1-5.117-7.625" />
                        <path d="M18 11c0 3.517 2.103 6.542 5.117 7.796c.94.391 1.883.204 2.883-.171a11.007 11.007 0 0 0 5.117-7.625" />
                        <circle cx="12" cy="9" r="5" stroke="currentColor" />
                      </svg>
                    </div>
                  </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 40]
              })}
            >
              <Popup>
                <div className="p-2 min-w-[140px]">
                  <p className="font-black text-xs uppercase italic">{profile?.role === 'customer' ? 'Your Rider' : 'Your Customer'}</p>
                  <p className="text-[10px] font-bold text-gray-500 uppercase">{profile?.role === 'customer' ? activeRide.riderName : activeRide.customerName || 'Customer'}</p>
                </div>
              </Popup>
            </Marker>
          )}

          {/* Route Display */}
          {result && (
            <>
              {[result.best_route, ...result.alternative_routes].map((route, i) => {
                const isActive = selectedRouteIndex === i;
                if (isNavigating && !isActive) return null;
                
                // Color mapping
                let color = "#94a3b8"; // Default Grey
                if (i === 0) color = "#22c55e"; // Green for Best Fuel
                else if (i === 1) color = "#3b82f6"; // Blue for Fastest
                else if (i === 2) color = "#64748b"; // Grey for Shortest
                
                const validWaypoints = (route.waypoints || []).filter(isValidPos) as [number, number][];
                if (validWaypoints.length < 2) return null;
                
                return (
                  <React.Fragment key={i}>
                    {/* Background line for smoothness or inactive routes */}
                    {(!isActive || !route.traffic_segments || route.traffic_segments.length === 0) ? (
                      <Polyline 
                        positions={validWaypoints} 
                        color={isActive ? color : "#cbd5e1"} 
                        weight={isActive ? 12 : 5}
                        opacity={isActive ? 1 : 0.4}
                        lineCap="round"
                        lineJoin="round"
                        pathOptions={{
                          className: isActive ? 'route-animated' : '',
                          dashArray: isActive ? '20, 20' : undefined
                        }}
                      >
                        {isActive && route.via_road && (
                          <Popup>
                            <div className="p-2">
                               <p className="text-[10px] font-black uppercase text-gray-400 mb-1">Recommended Path</p>
                               <p className="font-black text-gray-900">{route.description}</p>
                               <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
                                 <MapPin className="w-3 h-3 text-brand-yellow" />
                                 <span className="text-xs font-bold">{route.via_road}</span>
                               </div>
                            </div>
                          </Popup>
                        )}
                      </Polyline>
                    ) : (
                      <>
                        <Polyline 
                          positions={validWaypoints} 
                          color="#cbd5e1"
                          weight={12}
                          opacity={0.3}
                          lineCap="round"
                          lineJoin="round"
                        />
                        {(() => {
                          let currentIdx = 0;
                          const totalWeight = route.traffic_segments.reduce((acc, s) => acc + s.weight, 0);
                          return route.traffic_segments.map((segment, sIdx) => {
                            const segmentPointsCount = Math.ceil((segment.weight / totalWeight) * validWaypoints.length);
                            const segmentPoints = validWaypoints.slice(currentIdx, currentIdx + segmentPointsCount + 1);
                            currentIdx += segmentPointsCount;
                            
                            if (segmentPoints.length < 2) return null;
                            
                            let segmentColor = "#22c55e"; // Default green
                            if (segment.color === 'yellow') segmentColor = "#fbbf24";
                            if (segment.color === 'red') segmentColor = "#ef4444";

                        return (
                          <Polyline 
                            key={`segment-${sIdx}`}
                            positions={segmentPoints} 
                            color={segmentColor}
                                weight={12}
                                opacity={1}
                                lineCap="round"
                                lineJoin="round"
                                pathOptions={{
                                  className: 'route-animated',
                                  dashArray: '20, 20'
                                }}
                              />
                            );
                          });
                        })()}
                      </>
                    )}
                    
                    {/* Floating Labels along the route */}
                    {isActive && validWaypoints.length > 20 && (
                      <>
                        {(() => {
                           const pos1 = validWaypoints[Math.floor(validWaypoints.length / 4)];
                           return isValidPos(pos1) && (
                             <Marker 
                               position={pos1}
                               icon={L.divIcon({
                                 className: 'custom-div-icon',
                                 html: `
                                   <div class="bg-white/90 backdrop-blur-sm text-black px-3 py-1.5 rounded-full text-[10px] font-black whitespace-nowrap shadow-xl flex items-center gap-1 border border-gray-100">
                                     <span class="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                     ${route.via_road || 'Route Path'}
                                   </div>
                                 `,
                                 iconSize: [120, 24],
                                 iconAnchor: [60, 12]
                               })}
                             />
                           );
                        })()}
                        {(() => {
                           const pos2 = validWaypoints[Math.floor(validWaypoints.length * 3 / 4)];
                           return isValidPos(pos2) && (
                             <Marker 
                               position={pos2}
                               icon={L.divIcon({
                                 className: 'custom-div-icon',
                                 html: `
                                   <div class="bg-white/90 backdrop-blur-sm text-black px-3 py-1.5 rounded-full text-[10px] font-black whitespace-nowrap shadow-xl flex items-center gap-1 border border-gray-100">
                                     <span class="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
                                     ${route.time_minutes} min to arrival
                                   </div>
                                 `,
                                 iconSize: [120, 24],
                                 iconAnchor: [60, 12]
                               })}
                             />
                           );
                        })()}
                      </>
                    )}

                    {/* Arrows along the route */}
                    {isActive && validWaypoints.filter((_, idx) => idx % 5 === 0).map((wp, idx) => (
                      <Marker 
                        key={`arrow-${idx}`}
                        position={wp}
                        icon={L.divIcon({
                          className: 'custom-div-icon',
                          html: `<div class="text-white drop-shadow-md"><svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg></div>`,
                          iconSize: [12, 12],
                          iconAnchor: [6, 6]
                        })}
                      />
                    ))}
                  </React.Fragment>
                );
              })}
              {/* Destination Marker */}
              {(() => {
                const lastWp = result.best_route.waypoints?.[result.best_route.waypoints.length - 1];
                return isValidPos(lastWp) && (
                  <Marker 
                    position={lastWp}
                    icon={L.divIcon({
                      className: 'custom-div-icon',
                      html: `<div class="w-6 h-6 bg-red-500 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-white"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>`,
                      iconSize: [24, 24],
                      iconAnchor: [12, 24]
                    })}
                  >
                    <Popup>{end}</Popup>
                  </Marker>
                );
              })()}
              {/* Landmarks */}
              {landmarks.map((landmark, idx) => (
                <Marker 
                  key={idx}
                  position={landmark.position}
                  icon={L.divIcon({
                    className: 'landmark-icon',
                    html: `
                      <div class="flex flex-col items-center">
                        <div class="bg-white/80 backdrop-blur-sm px-2 py-1 rounded-md shadow-sm border border-gray-100 whitespace-nowrap">
                          <span class="text-[10px] font-bold text-gray-700">${landmark.name}</span>
                        </div>
                        <div class="w-2 h-2 bg-gray-400 rounded-full mt-1 border border-white"></div>
                      </div>
                    `,
                    iconSize: [120, 40],
                    iconAnchor: [60, 40]
                  })}
                />
              ))}

          {/* Online Riders (Real) */}
          {onlineRiders.map((r, idx) => (
            r.lastKnownLocation && isValidPos(r.lastKnownLocation) && (
              <Marker 
                key={r.uid} 
                position={r.lastKnownLocation}
                icon={L.divIcon({
                  className: 'custom-boda-icon',
                  html: `
                    <div class="relative w-10 h-10 flex items-center justify-center">
                       <div class="absolute w-8 h-8 bg-black/10 rounded-full animate-ping"></div>
                       <div class="relative w-8 h-8 bg-white border-2 border-green-600 rounded-lg shadow-lg flex items-center justify-center">
                          <span class="text-sm">🏍️</span>
                       </div>
                    </div>
                  `,
                  iconSize: [32, 32],
                  iconAnchor: [16, 16]
                })}
              />
            )
          ))}

          {/* Dummy Riders - 3D Car Style */}
              {dummyRiders.map((rider) => (
                <Marker 
                  key={rider.id}
                  position={rider.position}
                  icon={L.divIcon({
                    className: 'custom-car-icon',
                    html: `
                      <div style="transform: rotate(${rider.rotation}deg); position: relative; width: 40px; height: 20px;">
                        <div style="width: 36px; height: 18px; background: white; border: 2px solid #e5e7eb; border-radius: 4px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); position: relative; display: flex; align-items: center; justify-content: space-between; overflow: hidden;">
                          <div style="width: 10px; height: 100%; background: #1f2937;"></div>
                          <div style="flex: 1; height: 100%; background: white;"></div>
                          <div style="width: 4px; height: 100%; display: flex; flex-direction: column; gap: 2px; padding: 2px 0;">
                             <div style="flex: 1; background: #ef4444; border-radius: 1px;"></div>
                             <div style="flex: 1; background: #ef4444; border-radius: 1px;"></div>
                          </div>
                        </div>
                      </div>
                    `,
                    iconSize: [40, 20],
                    iconAnchor: [20, 10]
                  })}
                />
              ))}

              {/* User Pickup Location Marker (Green Circle) */}
              <Marker 
                position={[0.2975, 32.5970]} // Near Amigos area as per description
                icon={L.divIcon({
                  className: 'user-loc-icon',
                  html: `
                    <div class="relative">
                      <div class="w-10 h-10 bg-green-500 rounded-full border-4 border-white shadow-xl flex items-center justify-center">
                        <div class="w-3 h-3 bg-white rounded-full"></div>
                      </div>
                      <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-green-500 rotate-45 border-r-4 border-b-4 border-white -z-10"></div>
                    </div>
                  `,
                  iconSize: [40, 48],
                  iconAnchor: [20, 48]
                })}
              />
            </>
          )}
          {loading && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-md z-[500] flex flex-col items-center justify-center p-8 text-center">
              <div className="relative w-32 h-32 mb-8">
                <div className="absolute inset-0 border-8 border-green-100 rounded-full" />
                <div className="absolute inset-0 border-8 border-green-600 border-t-transparent rounded-full animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                  >
                    <Zap className="w-12 h-12 text-green-600 fill-green-600" />
                  </motion.div>
                </div>
              </div>
              <h2 className="text-2xl font-black text-gray-900 uppercase italic tracking-tight mb-2">Analyzing Kampala Jam</h2>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Optimizing for 2026 Fuel Prices</p>
              
              <div className="mt-8 space-y-2 w-full max-w-xs">
                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 3, repeat: Infinity }}
                    className="h-full bg-green-600"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-[8px] font-black text-green-600 uppercase">Profit Maximization</span>
                  <span className="text-[8px] font-black text-gray-400 uppercase">Verifying Inclines</span>
                </div>
              </div>
            </div>
          )}
        </MapContainer>
      </div>

      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.9 }}
            className={cn(
              "fixed bottom-24 left-4 right-4 z-[9999] p-4 rounded-2xl shadow-2xl border-2 flex items-center gap-3",
              notification.type === 'success' ? "bg-green-500 border-green-400 text-white" :
              notification.type === 'warning' ? "bg-orange-500 border-orange-400 text-white" :
              "bg-black border-gray-800 text-brand-yellow"
            )}
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
               {notification.type === 'success' ? <ShieldCheck className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
            </div>
            <p className="font-black text-sm">{notification.message}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map UI Layers */}
      <div className="absolute top-4 left-4 z-[50] pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {onlineRiders.length > 0 && (
            <div className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-lg border border-gray-100 shadow-sm flex items-center gap-2">
               <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
               <span className="text-[9px] font-black uppercase text-gray-600 tracking-tight">{onlineRiders.length} Online</span>
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-4 right-4 z-[50] pointer-events-none">
            {profile?.role === 'rider' && !activeRide && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleOnline();
                }}
                className={cn(
                  "h-8 px-4 rounded-lg font-black text-[9px] uppercase shadow-lg transition-all active:scale-95 border-2",
                  profile.isOnline 
                    ? "bg-green-500 border-green-400 text-white" 
                    : "bg-black border-gray-800 text-brand-yellow"
                )}
              >
                {profile.isOnline ? 'Online' : 'Go Online'}
              </motion.button>
            )}
          </div>

        <div className="max-w-sm mx-auto pointer-events-auto">
          {activeRide && (activeRide.status === RideStatus.ACCEPTED || activeRide.status === RideStatus.ARRIVED || activeRide.status === RideStatus.TRIP_STARTED) && (
            <div className="bg-white/95 backdrop-blur-xl border border-gray-100 shadow-2xl p-4 rounded-[28px] mb-4 space-y-4">
              {/* Trip Identity & Status */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-yellow rounded-2xl flex items-center justify-center text-black shadow-lg shadow-brand-yellow/30">
                    {activeRide.status === RideStatus.ACCEPTED ? <Clock className="w-6 h-6" /> : <Navigation className="w-6 h-6 rotate-45" />}
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">
                      {activeRide.status === RideStatus.ACCEPTED ? 'Rider approaching' : 
                       activeRide.status === RideStatus.ARRIVED ? 'Rider at pickup' : 'On Trip'}
                    </h3>
                    <p className="text-sm font-black text-gray-900 leading-none flex items-center gap-2">
                       {activeRide.status === RideStatus.ACCEPTED ? 'ETA ' + getETA() + ' MIN' : 
                        activeRide.status === RideStatus.ARRIVED ? 'START RIDE' : 'NAVIGATING...'}
                       <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    </p>
                  </div>
                </div>
                {activeRide.status === RideStatus.TRIP_STARTED && (
                  <div className="bg-blue-50 px-3 py-2 rounded-xl flex items-center gap-2">
                    <Zap className="w-3.5 h-3.5 text-blue-600 fill-blue-600" />
                    <span className="text-[9px] font-black text-blue-700 uppercase italic">Optimized</span>
                  </div>
                )}
              </div>

              {/* Progress Line */}
              <div className="relative pt-2">
                 <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-brand-yellow"
                      initial={{ width: "30%" }}
                      animate={{ width: activeRide.status === RideStatus.TRIP_STARTED ? "65%" : "30%" }}
                    />
                 </div>
                 {activeRide.status === RideStatus.ARRIVED && profile?.role === 'rider' && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-black text-brand-yellow px-3 py-1 rounded-full text-[8px] font-black uppercase shadow-xl animate-bounce">
                      Start Ride Now!
                    </div>
                 )}
              </div>

              {/* AI Guidance Detail */}
              {activeRide.status === RideStatus.TRIP_STARTED && activeRide.routeData?.navigation_steps?.[0] && (
                <div className="flex items-start gap-3 bg-gray-50 p-3 rounded-2xl border border-gray-100">
                  <div className="w-6 h-6 bg-white rounded-lg shadow-sm border border-gray-100 flex items-center justify-center shrink-0">
                    <ArrowUpRight className="w-4 h-4 text-brand-yellow" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[8px] font-black text-gray-400 uppercase leading-none mb-1">AI Smart Tip</p>
                    <p className="text-[11px] font-black text-gray-700 leading-tight italic">
                      {activeRide.routeData.navigation_steps[0]}
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2">
                {profile?.role === 'rider' && activeRide.status === RideStatus.ARRIVED && (
                  <button 
                    onClick={handleStartTrip}
                    className="flex-1 py-4 bg-brand-yellow text-black rounded-2xl font-black text-xs uppercase shadow-xl active:scale-95 transition-all"
                  >
                    🚀 Start Trip
                  </button>
                )}
                {profile?.role === 'rider' && activeRide.status === RideStatus.TRIP_STARTED && (
                  <button 
                    onClick={handleEndTrip}
                    className="flex-1 py-4 bg-red-500 text-white rounded-2xl font-black text-xs uppercase shadow-xl active:scale-95 transition-all"
                  >
                    Finish Ride
                  </button>
                )}
                {profile?.role === 'customer' && activeRide.status === RideStatus.ACCEPTED && (
                  <button className="flex-1 py-3 bg-gray-100 text-gray-500 rounded-2xl font-black text-xs uppercase border border-gray-200">
                    Cancel (Wait is long)
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

      {/* Controls Overlay */}
      <div className="absolute right-4 bottom-[140px] z-30 flex flex-col gap-2">
        <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col border border-gray-100 pointer-events-auto">
          <button 
            onClick={() => setZoom(prev => Math.min(prev + 1, 19))}
            className="w-8 h-8 bg-white flex items-center justify-center border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100"
          >
            <Plus className="w-4 h-4 text-gray-700" />
          </button>
          <button 
            onClick={() => setZoom(prev => Math.max(prev - 1, 12))}
            className="w-8 h-8 bg-white flex items-center justify-center hover:bg-gray-50 active:bg-gray-100"
          >
            <Minus className="w-4 h-4 text-gray-700" />
          </button>
        </div>
        <button 
          onClick={() => {
            setZoom(18);
          }}
          className="w-8 h-8 bg-white shadow-md rounded-lg flex items-center justify-center hover:bg-gray-50 transition-colors border border-gray-100 pointer-events-auto"
        >
          <Locate className="w-4 h-4 text-gray-700" />
        </button>
      </div>

      {/* Floating UI Elements Over Map - Consistently compact */}
      <div className="absolute bottom-[140px] left-5 z-[50] pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md px-2.5 py-1.5 rounded-lg flex items-center gap-2 shadow-md border border-gray-100 active:scale-95 transition-transform cursor-pointer pointer-events-auto">
          <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
          <span className="text-[10px] font-black text-gray-600 tracking-tighter uppercase italic">Safety</span>
        </div>
      </div>

      <div className="absolute bottom-[230px] right-5 z-[50]">
        {/* COMPASS/LOCATE COMBINED ALREADY IN RIGHT COLUMN - CAN REMOVE DUPLICATE COMPASS IF NEEDED BUT KEEPING FOR DESIGN */}
      </div>

      <AnimatePresence>
        {uiStep === 'searching' && (
          <motion.div
            initial={{ y: "-100%" }}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={{ type: "spring", damping: 35, stiffness: 400 }}
            className="absolute top-0 left-0 right-0 z-[200] bg-white/95 backdrop-blur-md flex flex-col p-3 border-b border-gray-100 shadow-xl max-h-[70vh]"
          >
            <div className="w-full max-w-sm mx-auto flex flex-col h-full overflow-hidden">
              <div className="flex items-center gap-3 mb-2">
                <button onClick={handleBack} className="w-8 h-8 flex items-center justify-center bg-gray-50 rounded-lg text-gray-400">
                  <ArrowLeft className="w-4 h-4 flex-shrink-0" />
                </button>
                <div className="flex-1 relative">
                  <div className="absolute left-[12px] top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-green-600" />
                  <input 
                    autoFocus
                    className="w-full bg-gray-100 pl-8 pr-10 py-2 rounded-lg text-sm font-bold text-gray-900 placeholder:text-gray-300 focus:outline-none transition-all"
                    placeholder="Where are you going?"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                  {end && (
                    <button onClick={() => setEnd('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-300">
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1 pb-4 no-scrollbar">
                {isAiSearching && (
                  <div className="py-4 flex flex-col items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-brand-yellow/20 border-t-brand-yellow rounded-full animate-spin" />
                    <p className="text-[9px] font-black uppercase text-gray-400 tracking-widest italic">Scanning Kampala...</p>
                  </div>
                )}
                
                {/* Combined Suggestions List with Group Headers */}
                <div className="space-y-4 pt-2">
                  {endSuggestions.length > 0 && (
                    <div>
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2 italic">Smart Matches</h4>
                      <div className="space-y-1">
                        {endSuggestions.map((sug, idx) => (
                          <button
                            key={`smart-${idx}`}
                            onClick={() => handleOptimize(sug)}
                            className="w-full flex items-center gap-3 p-3 bg-white hover:bg-gray-50 rounded-[20px] transition-all border border-gray-100 shadow-sm active:scale-95"
                          >
                            <div className="w-8 h-8 bg-brand-yellow/10 rounded-full flex items-center justify-center shrink-0">
                               <MapPin className="w-4 h-4 text-brand-yellow" />
                            </div>
                            <div className="text-left flex-1 min-w-0">
                              <p className="font-black text-sm text-gray-900 truncate leading-none mb-1 uppercase italic">{sug.split(',')[0]}</p>
                              <p className="text-[9px] font-bold text-gray-400 truncate italic">{sug.split(',').slice(1).join(',').trim() || 'Kampala District'}</p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-gray-200" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {localSuggestions.length > 0 && !isAiSearching && (
                    <div>
                      <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2 italic">Suggested Areas</h4>
                      <div className="grid grid-cols-1 gap-1">
                        {localSuggestions.map((s, i) => (
                          <button
                            key={`local-${i}`}
                            onClick={() => handleOptimize(s)}
                            className="w-full flex items-center gap-3 p-2 group hover:bg-gray-50 rounded-xl transition-all border border-transparent hover:border-gray-100"
                          >
                            <Navigation className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <p className="text-xs font-bold text-gray-600 truncate italic uppercase">{s.split(',')[0]}</p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {!isAiSearching && endSuggestions.length === 0 && localSuggestions.length === 0 && (
                    <div className="py-12 flex flex-col items-center justify-center text-gray-300 gap-3">
                       <Search className="w-10 h-10 opacity-20" />
                       <p className="text-[10px] font-black uppercase tracking-widest italic">No matches found</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: (isNavigating && activeRide) ? "calc(100% - 110px)" : "0%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
        className="absolute bottom-0 left-0 right-0 z-[100] bg-white rounded-t-3xl shadow-[0_-15px_40px_-15px_rgba(0,0,0,0.15)] flex flex-col border-t border-gray-50 overflow-hidden"
      >
        <AnimatePresence mode="wait">
          {hasLoyaltyDiscount && (uiStep === 'idle' || uiStep === 'preview') && (
             <motion.div 
               initial={{ opacity: 0, height: 0 }}
               animate={{ opacity: 1, height: 'auto' }}
               exit={{ opacity: 0, height: 0 }}
               className="bg-[#1e293b] text-white py-1.5 px-6 flex items-center justify-center font-bold text-[10px] tracking-wide"
             >
               <CircleCheck className="w-3 h-3 mr-2 text-white" />
               <span className="font-bold tracking-tight uppercase">35% Discount applied</span>
             </motion.div>
          )}
        </AnimatePresence>

        <div className="w-8 h-1 bg-gray-100 rounded-full mx-auto my-2 shrink-0" />
        
        <div className="flex-1 overflow-y-auto px-4 pb-6 min-h-[100px]">
          {authLoading && uiStep === 'idle' && (
            <div className="py-12 flex flex-col items-center justify-center">
               <Loader2 className="w-10 h-10 animate-spin text-gray-200" />
            </div>
          )}

          {uiStep === 'idle' && !authLoading && (
            <div className="pt-2 animate-in fade-in slide-in-from-bottom-5 duration-500">
              {profile?.role === 'rider' ? (
                <div className="py-8 flex flex-col items-center justify-center text-center">
                   <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4 relative">
                      <div className="absolute inset-0 bg-green-200 rounded-full animate-ping" />
                      <Navigation className="w-8 h-8 text-green-600 rotate-45 relative z-10" />
                   </div>
                   <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                     {profile.isOnline ? 'Online & Waiting' : 'You are Offline'}
                   </h3>
                   {!profile.isOnline && (
                     <button 
                       onClick={toggleOnline}
                       className="mt-6 px-10 py-4 bg-green-600 text-white rounded-2xl font-black uppercase tracking-widest shadow-xl active:scale-95 transition-transform"
                     >
                        Go Online
                     </button>
                   )}
                </div>
              ) : (
                <>
                  <button 
                    onClick={() => setUiStep('searching')}
                    className="w-full bg-[#f3f4f6]/60 p-3 rounded-lg flex items-center gap-3 mb-2 text-left group transition-all active:scale-[0.98]"
                  >
                     <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-sm">
                        <Car className="w-4 h-4 text-gray-900" />
                     </div>
                     <span className="text-lg font-bold text-gray-900 flex-1 tracking-tight italic">Where to?</span>
                  </button>

                  <div className="space-y-0.5">
                    {recentDestinations.slice(0, 2).map((dest, i) => {
                      const [title, sub] = dest.split(',');
                      return (
                        <button 
                          key={i} 
                          onClick={() => handleOptimize(dest)}
                          className="w-full flex items-center gap-3 py-2 group border-b border-gray-50 last:border-0"
                        >
                          <MapPin className="w-4 h-4 text-gray-300 shrink-0" />
                          <div className="text-left flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-800 truncate leading-none mb-0.5 italic">{title}</p>
                            <p className="text-[8px] font-bold text-gray-400 uppercase italic">
                              {sub?.trim() || 'Nearby'}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {uiStep === 'preview' && result && activeRoute && (
            <div className="pt-1 animate-in fade-in slide-in-from-bottom-5 duration-700">
              {/* Route Swiper Compact */}
              <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 pb-2">
                 {[result.best_route, ...result.alternative_routes].map((route, i) => (
                   <button
                     key={i}
                     onClick={() => setSelectedRouteIndex(i)}
                     className={cn(
                       "shrink-0 px-3 py-2 rounded-xl border-2 transition-all flex flex-col items-start gap-0.5 min-w-[120px]",
                       selectedRouteIndex === i 
                        ? "bg-green-600 border-green-500 text-white shadow-lg shadow-green-600/20" 
                        : "bg-gray-50 border-gray-100 text-gray-400"
                     )}
                   >
                     <p className="text-[8px] font-black uppercase tracking-widest leading-none">{i === 0 ? 'Best Profit' : route.description.split(' ')[0]}</p>
                     <p className="text-xs font-black italic">{route.time_minutes} min</p>
                   </button>
                 ))}
              </div>

              {/* AI Profit Strategy Card Compact */}
              <div className="flex gap-1 mb-1.5">
                <div className="flex-1 bg-orange-50/50 p-1 rounded-lg border border-orange-100 flex items-center gap-1.5">
                   <Fuel className="w-2.5 h-2.5 text-orange-600" />
                   <div>
                      <p className="text-[5px] font-black text-orange-600 uppercase leading-none">Fuel</p>
                      <p className="text-[11px] font-black text-orange-950 italic leading-none">{activeRoute.fuel_litres.toFixed(1)}L</p>
                   </div>
                </div>
                <div className="flex-1 bg-green-50/50 p-1 rounded-lg border border-green-100 flex items-center gap-1.5">
                   <TrendingUp className="w-2.5 h-2.5 text-green-600" />
                   <div>
                      <p className="text-[5px] font-black text-green-600 uppercase leading-none">Profit</p>
                      <p className="text-[11px] font-black text-green-950 italic leading-none">{(fare - (activeRoute.fuel_litres * 9500)).toLocaleString()}</p>
                   </div>
                </div>
              </div>

              <div className="bg-gray-50/30 backdrop-blur-sm rounded-lg p-1.5 mb-1.5 border border-gray-100 text-left">
                 <div className="flex items-center gap-1 mb-0.5">
                    <span className="text-[5px] font-black text-green-600 border border-green-200 px-0.5 rounded uppercase italic">AI</span>
                    <span className="text-[7px] font-bold text-gray-400 uppercase italic truncate">{activeRoute.via_road}</span>
                 </div>
                 <h3 className="text-[10px] font-black text-gray-900 uppercase italic leading-none mb-0.5">{activeRoute.description}</h3>
                 <p className="text-[7px] font-bold text-gray-500 italic leading-tight">{activeRoute.reason}</p>
              </div>
              
              <div className="mb-1.5">
                 <button
                    onClick={() => setRideType(RideType.STANDARD)}
                    className={cn(
                      "w-full flex items-center justify-between p-1 rounded-lg border-2 transition-all",
                      rideType === RideType.STANDARD ? "border-green-600 bg-white" : "border-transparent bg-white/40"
                    )}
                  >
                    <div className="flex items-center gap-1.5">
                       <span className="text-sm">🏍️</span>
                       <div className="text-left">
                          <p className="text-[9px] font-black text-gray-900 italic uppercase leading-none">Standard</p>
                          <p className="text-[6px] font-black text-gray-400 leading-none">Bajaj 150cc</p>
                       </div>
                    </div>
                    <p className="text-[10px] font-black text-green-600 italic">UGX {fare.toLocaleString()}</p>
                  </button>
              </div>

              <button 
                onClick={handleRequestRide}
                className="w-full py-2.5 bg-gray-900 hover:bg-black active:scale-[0.98] text-white rounded-lg text-xs font-black uppercase tracking-[0.1em] shadow-lg transition-all italic flex items-center justify-center gap-1.5"
              >
                Book Profit Route <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {uiStep === 'active' && activeRide && (
            <div className="pt-2 flex flex-col gap-4 animate-in zoom-in-95 duration-500">
              {requestStatus === 'searching' && (
                <div className="flex flex-col items-center justify-center py-4 text-center">
                   <div className="relative w-12 h-12 mb-3">
                      <div className="absolute inset-0 bg-green-100 rounded-full animate-ping" />
                      <div className="absolute inset-0 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center text-lg">🏍️</div>
                   </div>
                   <h3 className="text-lg font-black text-gray-900 mb-0.5 leading-none">Finding Boda</h3>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4 italic">Kampala Network...</p>
                   
                   <button 
                     onClick={async () => {
                       if (activeRide?.id) {
                         const { updateDoc, doc: fireDoc } = await import('firebase/firestore');
                         await updateDoc(fireDoc(db, 'rides', activeRide.id), { status: RideStatus.CANCELLED });
                         setActiveRide(null);
                         setRequestStatus('idle');
                         setUiStep('idle');
                       }
                     }}
                     className="px-6 py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 rounded-lg font-black uppercase tracking-widest text-[8px] transition-colors"
                   >
                     Cancel
                   </button>
                </div>
              )}
              {(requestStatus === 'matched' || requestStatus === 'ongoing') && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center text-lg shadow-sm border-2 border-white overflow-hidden text-gray-900 font-black">
                          {activeRide.riderName?.[0]}
                       </div>
                       <div>
                          <p className="text-sm font-black text-gray-900 mb-0 leading-none text-left uppercase italic">{activeRide.riderName || 'Rider'}</p>
                          <p className="text-[8px] font-bold text-gray-400 uppercase tracking-tighter text-left italic">Arriving • ⭐ 4.9</p>
                       </div>
                    </div>
                    <div className="text-right">
                       <p className="text-lg font-black text-green-600 leading-none text-right italic">{getETA()}m</p>
                       <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter mt-0.5 text-right">away</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                     <button 
                       onClick={async () => {
                         if (activeRide?.id) {
                           const { updateDoc, doc: fireDoc } = await import('firebase/firestore');
                           await updateDoc(fireDoc(db, 'rides', activeRide.id), { status: RideStatus.CANCELLED });
                           setActiveRide(null);
                           setUiStep('idle');
                         }
                       }}
                       className="flex items-center justify-center gap-2 p-2 bg-red-50 hover:bg-red-100 rounded-xl font-black text-[9px] text-red-600 uppercase italic transition-colors"
                     >
                        Cancel
                     </button>
                     <button className="flex items-center justify-center gap-2 p-2 bg-gray-900 hover:bg-black rounded-xl font-black text-[9px] text-white uppercase italic transition-colors">
                        <ShieldCheck className="w-3 h-3 text-green-400" /> Safety
                     </button>
                  </div>

                  <div className="pt-2 border-t border-gray-50 flex items-center justify-between">
                     <div className="text-left">
                        <p className="text-[8px] font-black text-gray-400 uppercase tracking-tighter mb-0.5 text-left italic">UGX {activeRide.fare.toLocaleString()}</p>
                     </div>
                     <div className="px-3 py-1 bg-green-100 text-green-700 rounded-lg font-black text-[8px] uppercase tracking-tighter italic">
                        {activeRide.status.replace('_', ' ')}
                     </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </motion.div>

      {/* Reroute Alert Modal */}
      <AnimatePresence>
        {showRerouteAlert && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed top-24 left-4 right-4 z-[110] bg-black border-4 border-brand-yellow rounded-[24px] p-5 shadow-2xl"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-brand-yellow rounded-2xl flex items-center justify-center shrink-0">
                <AlertTriangle className="w-8 h-8 text-black animate-bounce" />
              </div>
              <div className="flex-1">
                <h4 className="text-brand-yellow font-black text-sm uppercase">Heavy Traffic Ahead!</h4>
                <p className="text-white/60 text-[10px] font-bold mt-0.5">We found a fuel-optimized route that saves ~10 mins.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button 
                onClick={() => setShowRerouteAlert(false)}
                className="flex-1 bg-white/10 text-white h-10 rounded-xl font-black text-[10px] uppercase hover:bg-white/20 transition-colors"
              >
                Stay on Path
              </button>
              <button 
                onClick={handleSwitchRoute}
                className="flex-[2] bg-brand-yellow text-black h-10 rounded-xl font-black text-[10px] uppercase shadow-lg active:scale-95 transition-transform"
              >
                Switch to Optimized Route
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trip Summary Modal */}
      <AnimatePresence>
        {showSummary && lastTrip && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white w-full max-w-sm rounded-[32px] overflow-hidden shadow-2xl"
            >
              <div className="bg-brand-yellow p-8 text-center">
                <div className="w-20 h-20 bg-black rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
                  <TrendingUp className="w-10 h-10 text-brand-yellow" />
                </div>
                <h2 className="text-2xl font-black text-black">Trip Summary</h2>
                <p className="text-black/60 font-bold">Excellent Efficiency!</p>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <p className="text-[10px] font-black text-gray-400 uppercase">Distance</p>
                    <p className="text-xl font-black text-gray-900">{lastTrip.distance.toFixed(1)} km</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <p className="text-[10px] font-black text-gray-400 uppercase">Fuel Used</p>
                    <p className="text-xl font-black text-gray-900">{lastTrip.fuelUsed.toFixed(2)} L</p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-2xl">
                    <p className="text-[10px] font-black text-gray-400 uppercase">Total Fare</p>
                    <p className="text-xl font-black text-gray-900">UGX {lastTrip.fare.toLocaleString()}</p>
                  </div>
                  <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                    <p className="text-[10px] font-black text-green-600 uppercase">Net Profit</p>
                    <p className="text-xl font-black text-green-700">UGX {lastTrip.profit.toLocaleString()}</p>
                  </div>
                </div>

                <div className="bg-brand-black text-white p-4 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-brand-yellow rounded-lg flex items-center justify-center">
                      <Banknote className="w-5 h-5 text-black" />
                    </div>
                    <p className="text-sm font-bold">Savings vs Normal</p>
                  </div>
                  <p className="font-black text-brand-yellow">~4,500 UGX</p>
                </div>

                <button 
                  onClick={() => setShowSummary(false)}
                  className="w-full bg-brand-black text-brand-yellow h-14 rounded-2xl font-black text-lg uppercase shadow-lg active:scale-95 transition-transform"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
