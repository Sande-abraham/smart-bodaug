import React, { useState, useEffect, useRef } from 'react';
import { getRouteOptimization, getDestinationSuggestions } from '../services/geminiService';
import { RideStatus, RideType, Rider, RouteOptimizationResult, Trip, RideRequest, UserProfile } from '../types';
import { MapPin, Navigation, Banknote, Clock, ShieldCheck, Search, ChevronRight, X, Map as MapIcon, Loader2, Locate, Compass, TrendingUp, AlertTriangle, Plus, Minus, ArrowUp, ArrowUpRight, ArrowUpLeft, RotateCw, AlertCircle, Zap } from 'lucide-react';
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
  const { profile } = useAuth();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RouteOptimizationResult | null>(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);
  const [fare, setFare] = useState<number>(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet'>('cash');
  const [activeRide, setActiveRide] = useState<RideRequest | null>(null);
  const [requestStatus, setRequestStatus] = useState<'idle' | 'searching' | 'matched' | 'ongoing'>('idle');
  const [rideType, setRideType] = useState<RideType>(RideType.STANDARD);
  const [incomingRequest, setIncomingRequest] = useState<RideRequest | null>(null);
  const [endSuggestions, setEndSuggestions] = useState<string[]>([]);
  const [lastTrip, setLastTrip] = useState<Trip | null>(null);
  const [notification, setNotification] = useState<{message: string, type: 'info' | 'success' | 'warning'} | null>(null);
  const [riderMapPos, setRiderMapPos] = useState<[number, number] | null>(null);
  const [hasLoyaltyDiscount, setHasLoyaltyDiscount] = useState(false);

  // Update fare when route selection changes
  useEffect(() => {
    if (!result) return;
    const activeRoute = selectedRouteIndex === 0 ? result.best_route : result.alternative_routes[selectedRouteIndex - 1];
    
    // Sync calculated fare with selected route data
    if (activeRoute.suggested_fare_range) {
      setFare(activeRoute.suggested_fare_range.min);
    } else {
      const baseFare = 2000;
      const perKmRate = 1200;
      const distance = activeRoute.distance || result.distance || 0;
      let calculatedFare = baseFare + (distance * perKmRate);
      if (activeRoute.traffic_level?.toLowerCase() === 'heavy') calculatedFare *= 1.25;
      setFare(Math.round(calculatedFare));
    }
  }, [selectedRouteIndex, result]);

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

  // Trigger Notification helper
  const notify = (message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

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

  const rideTypes = [
    { id: RideType.ECONOMY, label: 'Economy', icon: '🏍️', priceMul: 0.8, color: 'bg-green-500' },
    { id: RideType.STANDARD, label: 'Standard', icon: '🔵', priceMul: 1.0, color: 'bg-blue-500' },
    { id: RideType.PREMIUM, label: 'Premium', icon: '🏍️✨', priceMul: 1.5, color: 'bg-purple-600' },
  ];

  // Listen for active ride if user is customer or rider
  useEffect(() => {
    if (!profile) return;
    
    const field = profile.role === 'customer' ? 'customerId' : 'riderId';
    const q = query(
      collection(db, 'rides'), 
      where(field, '==', profile.uid),
      where('status', 'in', [RideStatus.REQUESTED, RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.TRIP_STARTED])
    );

    const unsub = onSnapshot(q, (snap) => {
      if (!snap.empty) {
        const ride = { id: snap.docs[0].id, ...snap.docs[0].data() } as RideRequest;
        
        // Notify on status change for customer
        if (profile.role === 'customer' && activeRide?.status !== ride.status) {
          if (ride.status === RideStatus.ACCEPTED) notify("Rider has accepted your request!", "success");
          if (ride.status === RideStatus.ARRIVED) notify("Your rider has arrived at the pickup!", "info");
          if (ride.status === RideStatus.TRIP_STARTED) notify("Trip started. Enjoy your ride!", "success");
        }

        setActiveRide(ride);
        setRequestStatus(ride.status === RideStatus.REQUESTED ? 'searching' : 
                        ride.status === RideStatus.ACCEPTED ? 'matched' : 'ongoing');
        if (ride.status === RideStatus.TRIP_STARTED) setIsNavigating(true);
      } else {
        if (activeRide && profile.role === 'customer' && requestStatus !== 'idle') {
          // completed or cancelled
        }
        setActiveRide(null);
      }
    });

    // If Rider, ALSO listen for ANY unclaimed requests in their area
    let unsubGlobal: (() => void) | undefined;
    if (profile.role === 'rider' && profile.isApproved) {
      // Listen for direct assignments OR local area broadcasts (if we add broadcast logic later)
      const qGlobal = query(
        collection(db, 'rides'),
        where('riderId', '==', profile.uid),
        where('status', '==', RideStatus.REQUESTED)
      );
      
      console.log(`RIDER NOTIF: Starting listener for UID: ${profile.uid}`);
      
      unsubGlobal = onSnapshot(qGlobal, (snap) => {
        // Log for debugging
        console.log(`RIDER NOTIF: Snapshot update. Found ${snap.size} pending requests for ${profile.uid}`);
        
        if (!snap.empty) {
          const doc = snap.docs[0];
          const req = { id: doc.id, ...doc.data() } as RideRequest;
          console.log(`RIDER NOTIF: Incoming request ID: ${req.id}, Customer ID: ${req.customerId}`);
          
          // Only show if we don't have an active ride OR if this SPECIFIC request is new/different
          if (!activeRide && incomingRequest?.id !== req.id) {
            setIncomingRequest(req);
            notify("🚨 NEW RIDE REQUEST! Tap to view.", "warning");
          }
        } else {
          if (incomingRequest) {
            console.log("RIDER NOTIF: Clearing incoming request");
            setIncomingRequest(null);
          }
        }
      }, (err) => {
        console.error("RIDER NOTIF: Snapshot Error:", err);
        handleFirestoreError(err, OperationType.LIST, 'rides');
      });
    }

    return () => {
      unsub();
      if (unsubGlobal) unsubGlobal();
    };
  }, [profile?.uid, profile?.role, profile?.status, profile?.isOnline, !!activeRide, activeRide?.status]);

  const { location } = useGeolocation();
  const mapCenter: [number, number] = location ? [location.latitude, location.longitude] : [0.3476, 32.5825];

  // Rider: Update live location in background
  useEffect(() => {
    if (profile?.role !== 'rider' || !profile.isOnline) return;

    const updateInterval = setInterval(async () => {
      // Use real location if available, otherwise simulate movement around mapCenter
      const currentPos: [number, number] = location 
        ? [location.latitude, location.longitude] 
        : [mapCenter[0] + (Math.random() - 0.5) * 0.002, mapCenter[1] + (Math.random() - 0.5) * 0.002];
      
      try {
        const { updateDoc, doc } = await import('firebase/firestore');
        await updateDoc(doc(db, 'users', profile.uid), {
          lastKnownLocation: currentPos,
          lastLocationUpdate: new Date().toISOString()
        });
      } catch (err) {
        console.error("Failed to update rider location:", err);
      }
    }, 5000);

    return () => clearInterval(updateInterval);
  }, [profile?.uid, profile?.role, profile?.isOnline, location]);

  const toggleOnline = async () => {
    if (!profile) return;
    try {
      const isNowOnline = !profile.isOnline;
      const updateData: any = {
        isOnline: isNowOnline,
        isOnTrip: false,
        lastLocationUpdate: new Date().toISOString()
      };

      // If going online and no location, set a default near Kampala center to be discoverable
      if (isNowOnline && !profile.lastKnownLocation) {
        updateData.lastKnownLocation = [0.3476 + (Math.random() - 0.5) * 0.01, 32.5825 + (Math.random() - 0.5) * 0.01];
      }

      await updateDoc(doc(db, 'users', profile.uid), updateData);
      notify(isNowOnline ? "You are now Online! Waiting for requests..." : "You are now Offline", isNowOnline ? "success" : "info");
    } catch (err) {
      console.error("Toggle online error:", err);
    }
  };

  // Customer: Listen for Rider's real-time location
  useEffect(() => {
    if (profile?.role !== 'customer' || !activeRide?.riderId) {
      if (profile?.role === 'customer' && !activeRide) setRiderMapPos(null);
      return;
    }

    if (activeRide.status === RideStatus.ACCEPTED || activeRide.status === RideStatus.TRIP_STARTED || activeRide.status === RideStatus.ARRIVED) {
      const unsubRiderPos = onSnapshot(doc(db, 'users', activeRide.riderId), (snap) => {
        if (snap.exists()) {
          const rData = snap.data();
          if (rData.lastKnownLocation) {
            setRiderMapPos(rData.lastKnownLocation);
          }
        }
      });
      return () => unsubRiderPos();
    }
  }, [activeRide?.riderId, activeRide?.status, profile?.role, !!activeRide]);

  // ETA Calculation
  const getETA = () => {
    if (!activeRide || !riderMapPos) return null;
    const target = activeRide.status === RideStatus.ACCEPTED ? activeRide.pickupCoords : activeRide.destCoords;
    const dist = Math.sqrt(Math.pow(target[0] - riderMapPos[0], 2) + Math.pow(target[1] - riderMapPos[1], 2));
    // Very rough estimate: 1 degree approx 111km. 10km/h speed. 
    const mins = Math.max(1, Math.round(dist * 600)); 
    return mins;
  };

  // Helper: Haversine distance in KM
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const handleRequestRide = async () => {
    if (!profile) return;
    setRequestStatus('searching');
    
    let currentRadius = 5; // Start with 5km
    let attempts = 0;
    const maxAttempts = 3;

    const findRider = async (radius: number): Promise<any | null> => {
      console.log(`MATCHING: Searching for rider within ${radius}km...`);
      try {
        const { getDocs, query, collection, where } = await import('firebase/firestore');
        const ridersSnap = await getDocs(query(
          collection(db, 'users'),
          where('role', '==', 'rider'),
          where('isOnline', '==', true),
          where('isApproved', '==', true)
        ));

        if (ridersSnap.empty) {
          console.log("MATCHING: No online/approved riders found in Firestore.");
          return null;
        }

        console.log(`MATCHING: Found ${ridersSnap.size} riders total. Filtering by availability and distance...`);
        
        const cLat = mapCenter[0];
        const cLng = mapCenter[1];

        const riders = ridersSnap.docs
          .map(doc => {
             const data = doc.data();
             console.log(`MATCHING: Inspecting rider ${data.displayName} (${doc.id}). Location:`, data.lastKnownLocation);
             return { uid: doc.id, ...data } as UserProfile;
          })
          .filter(r => {
            if (r.isOnTrip) {
              console.log(`MATCHING: Rider ${r.displayName} skipped (already on trip)`);
              return false;
            }
            
            const loc = r.lastKnownLocation;
            if (!loc) {
              console.log(`MATCHING: Rider ${r.displayName} skipped (location is missing/null)`);
              return false;
            }

            let rLat: number, rLng: number;
            // Handle both array [lat, lng] and object {latitude, longitude}
            if (Array.isArray(loc)) {
              rLat = parseFloat(String(loc[0]));
              rLng = parseFloat(String(loc[1]));
            } else if (typeof loc === 'object') {
              rLat = parseFloat(String((loc as any).latitude || (loc as any).lat));
              rLng = parseFloat(String((loc as any).longitude || (loc as any).lng));
            } else {
              console.log(`MATCHING: Rider ${r.displayName} skipped (unrecognized location format: ${typeof loc})`, loc);
              return false;
            }

            if (isNaN(rLat) || isNaN(rLng)) {
              console.log(`MATCHING: Rider ${r.displayName} skipped (invalid coordinates: [${rLat}, ${rLng}])`);
              return false;
            }
            
            const dist = calculateDistance(cLat, cLng, rLat, rLng);
            const isWithin = dist <= radius;
            console.log(`MATCHING: Rider ${r.displayName} is ${dist.toFixed(2)}km away. Within radius? ${isWithin}`);
            return isWithin;
          })
          .sort((a, b) => {
            const getPos = (u: UserProfile) => {
              const l = u.lastKnownLocation!;
              return Array.isArray(l) ? [l[0], l[1]] : [(l as any).latitude || (l as any).lat, (l as any).longitude || (l as any).lng];
            };
            const posA = getPos(a);
            const posB = getPos(b);
            return calculateDistance(cLat, cLng, posA[0], posA[1]) - calculateDistance(cLat, cLng, posB[0], posB[1]);
          });

        if (riders.length > 0) {
          console.log(`MATCHING: Best match found: ${riders[0].displayName}`);
          return riders[0];
        }
        console.log(`MATCHING: No suitable rider found in ${radius}km radius.`);
        return null;
      } catch (err) {
        console.error("MATCHING: Critical Error:", err);
        return null;
      }
    };

    const processRequest = async () => {
      attempts++;
      const riderFound = await findRider(currentRadius);

      if (riderFound) {
        const finalFare = Math.round(fare * rideTypes.find(t => t.id === rideType)!.priceMul);
        const discountedFare = hasLoyaltyDiscount ? Math.round(finalFare * 0.65) : finalFare;
        const activeRoute = selectedRouteIndex === 0 ? result!.best_route : result!.alternative_routes[selectedRouteIndex - 1];

        const rideData: Partial<RideRequest> = {
          customerId: profile.uid,
          riderId: riderFound.uid,
          status: RideStatus.REQUESTED,
          pickup: start,
          destination: end,
          pickupCoords: mapCenter,
          destCoords: activeRoute.waypoints?.[activeRoute.waypoints.length - 1] || [0.3476, 32.5825],
          rideType: rideType,
          paymentMethod: paymentMethod,
          fare: discountedFare,
          estTime: activeRoute.time_minutes || 0,
          estDistance: activeRoute.distance || 0,
          timestamp: new Date().toISOString(),
          retryCount: attempts,
          matchingRadius: currentRadius
        };

        try {
          await addDoc(collection(db, 'rides'), rideData);
          notify(`Nearby Rider Found! Sending request to ${riderFound.displayName}...`, "success");
        } catch (err) {
          console.error("Booking failed:", err);
          notify("Failed to book ride", "warning");
          setRequestStatus('idle');
        }
      } else {
        if (attempts < maxAttempts) {
          const nextRadius = currentRadius + 3;
          currentRadius = nextRadius;
          notify(`Searching wider area (${nextRadius}km)...`, "info");
          setTimeout(processRequest, 4000); 
        } else {
          notify("No riders available within 11km. Please try again in 2 minutes.", "warning");
          setRequestStatus('idle');
        }
      }
    };

    processRequest();
  };

  const handleAcceptRequest = async () => {
    if (!incomingRequest?.id || !profile) return;
    try {
      await updateDoc(doc(db, 'rides', incomingRequest.id), {
        riderId: profile.uid,
        status: RideStatus.ACCEPTED,
        riderName: profile.displayName,
        riderPhone: profile.phoneNumber || 'N/A'
      });
      setIncomingRequest(null);
      notify("Ride Accepted! Go to pickup.", "success");
    } catch (err) {
      console.error("Accept error:", err);
    }
  };

  const handleDeclineRequest = () => {
    setIncomingRequest(null);
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
  const [recentDestinations, setRecentDestinations] = useState<string[]>(["Texas Lounge", "Mukwano Mall", "Kiseka Market"]);
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
  const [zoom, setZoom] = useState(14);
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
    if (!end || end.length < 2) {
      setEndSuggestions([]);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const sugs = await getDestinationSuggestions(end, location);
        setEndSuggestions(sugs);
      } catch (e) {
        console.error(e);
      }
    }, 800);
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
      setOptimizationError(error.message || "Route calculation failed. Using basic estimation.");
      
      // FALLBACK: Allow booking even if AI fails
      setResult({
        suggestions: ["Direct", "Alternative"],
        best_route: {
          description: "Direct Path (Estimated)",
          time_minutes: 15,
          distance: 3.5,
          fuel_litres: 0.15,
          cost: 4500,
          reason: "Showing direct route estimation while AI service is initializing.",
          suggested_fare_range: { min: 4000, max: 5000 }
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
    <div className="fixed inset-0 top-[64px] overflow-hidden -mx-4 -mt-6">
      {/* Map Background */}
      <div className="absolute inset-0 z-0">
        <MapContainer center={mapCenter} zoom={zoom} zoomControl={false} className="h-full w-full">
          <TileLayer 
            url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png" 
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          />
          <ChangeView center={mapCenter} zoom={zoom} />
          
          {location && (
            <Marker 
              position={[location.latitude, location.longitude]}
              icon={L.divIcon({
                className: 'custom-div-icon',
                html: `
                  <div class="relative">
                    <div class="w-10 h-10 bg-brand-yellow rounded-full border-4 border-black shadow-2xl flex items-center justify-center">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                        <path d="M19.5,13.5c-1.38,0-2.5,1.12-2.5,2.5s1.12,2.5,2.5,2.5s2.5-1.12,2.5-2.5S20.88,13.5,19.5,13.5z M4.5,13.5c-1.38,0-2.5,1.12-2.5,2.5 s1.12,2.5,2.5,2.5S7,17.38,7,16S5.88,13.5,4.5,13.5z M17,11l-3.3-4.4C13.2,6.1,12.6,6,12,6h-2C9.4,6,8.9,6.2,8.5,6.6L4.5,11H2v2h2.5 c0.6,0,1.1-0.2,1.5-0.6L9.6,8h1.9l2.6,3.5c0.4,0.5,1,0.8,1.6,0.8H22v-2H17z"/>
                      </svg>
                    </div>
                    <div class="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-500 border-2 border-white rounded-full"></div>
                  </div>
                `,
                iconSize: [40, 40],
                iconAnchor: [20, 20]
              })}
            >
              <Popup>You (Active Boda)</Popup>
            </Marker>
          )}

          {/* Simulation: Moving Rider Marker */}
          {riderMapPos && (
            <Marker position={riderMapPos} icon={customIcon}>
              <Popup>
                <div className="p-2 min-w-[120px]">
                  <p className="font-black text-xs uppercase">Rider is coming</p>
                  <p className="text-[10px] font-bold text-gray-500">UEB 123X - Bajaj Boxer</p>
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
                
                return (
                  <React.Fragment key={i}>
                    {/* Background line for smoothness or inactive routes */}
                    {(!isActive || !route.traffic_segments || route.traffic_segments.length === 0) ? (
                      <Polyline 
                        positions={route.waypoints as [number, number][]} 
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
                          positions={route.waypoints as [number, number][]} 
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
                            const segmentPointsCount = Math.ceil((segment.weight / totalWeight) * route.waypoints!.length);
                            const segmentPoints = route.waypoints!.slice(currentIdx, currentIdx + segmentPointsCount + 1);
                            currentIdx += segmentPointsCount;
                            
                            let segmentColor = "#22c55e"; // Default green
                            if (segment.color === 'yellow') segmentColor = "#fbbf24";
                            if (segment.color === 'red') segmentColor = "#ef4444";

                            return (
                              <Polyline 
                                key={`segment-${sIdx}`}
                                positions={segmentPoints as [number, number][]} 
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
                    {isActive && route.waypoints && route.waypoints.length > 20 && (
                      <>
                        <Marker 
                          position={route.waypoints[Math.floor(route.waypoints.length / 4)] as [number, number]}
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
                        <Marker 
                          position={route.waypoints[Math.floor(route.waypoints.length * 3 / 4)] as [number, number]}
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
                      </>
                    )}

                    {/* Arrows along the route */}
                    {isActive && route.waypoints?.filter((_, idx) => idx % 5 === 0).map((wp, idx) => (
                      <Marker 
                        key={`arrow-${idx}`}
                        position={wp as [number, number]}
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
              {result.best_route.waypoints && result.best_route.waypoints.length > 0 && (
                <Marker 
                  position={result.best_route.waypoints[result.best_route.waypoints.length - 1] as [number, number]}
                  icon={L.divIcon({
                    className: 'custom-div-icon',
                    html: `<div class="w-6 h-6 bg-red-500 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-white"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg></div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 24]
                  })}
                >
                   <Popup>{end}</Popup>
                </Marker>
              )}
            </>
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

      {/* Floating Header UI */}
      <div className="absolute top-4 left-4 right-4 z-40 pointer-events-none">
        <div className="flex justify-end mb-4">
          {profile?.role === 'rider' && profile.isApproved && !activeRide && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => {
                e.stopPropagation();
                toggleOnline();
              }}
              className={cn(
                "pointer-events-auto h-12 px-6 rounded-2xl font-black text-xs uppercase shadow-xl transition-all active:scale-95 border-2",
                profile.isOnline 
                  ? "bg-green-500 border-green-400 text-white" 
                  : "bg-black border-gray-800 text-brand-yellow"
              )}
            >
              {profile.isOnline ? 'Online' : 'Go Online'}
            </motion.button>
          )}
        </div>
        <AnimatePresence>
          {incomingRequest && (
            <motion.div 
              initial={{ y: -100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -100, opacity: 0 }}
              className="bg-black text-brand-yellow p-6 rounded-[32px] shadow-2xl border-4 border-brand-yellow space-y-6 pointer-events-auto mb-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-brand-yellow rounded-2xl flex items-center justify-center text-black">
                    <AlertTriangle className="w-8 h-8 animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black">NEW REQUEST!</h4>
                    <p className="text-[10px] font-black uppercase text-brand-yellow/60">Kampala Central</p>
                  </div>
                </div>
                <div className="text-right">
                   <p className="text-2xl font-black">{incomingRequest.fare.toLocaleString()} UGX</p>
                </div>
              </div>

              <div className="space-y-3">
                 <div className="flex items-start gap-3">
                   <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center shrink-0 mt-1">
                      <MapPin className="w-3 h-3 text-white" />
                   </div>
                   <div>
                      <p className="text-[8px] font-black uppercase text-brand-yellow/40">Pickup</p>
                      <p className="text-sm font-bold text-white truncate">{start || 'Current Location'}</p>
                   </div>
                 </div>
                 <div className="flex items-start gap-3">
                   <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shrink-0 mt-1">
                      <MapPin className="w-3 h-3 text-white" />
                   </div>
                   <div>
                      <p className="text-[8px] font-black uppercase text-brand-yellow/40">Destination</p>
                      <p className="text-sm font-bold text-white truncate">{end}</p>
                   </div>
                 </div>
              </div>

              <div className="flex gap-4">
                 <button 
                  onClick={handleDeclineRequest}
                  className="flex-1 bg-white/10 text-white h-14 rounded-2xl font-black text-sm uppercase"
                 >
                   DECLINE
                 </button>
                 <button 
                  onClick={handleAcceptRequest}
                  className="flex-[2] bg-brand-yellow text-black h-14 rounded-2xl font-black text-lg uppercase shadow-xl active:scale-95 transition-transform"
                 >
                   ACCEPT RIDE
                 </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-2 pointer-events-auto">
          {!isNavigating ? (
            <div className="flex items-center gap-2">
              <button className="w-10 h-10 bg-white shadow-lg rounded-full flex items-center justify-center">
                <Search className="w-5 h-5 text-gray-500" />
              </button>
              {result && (
                <button 
                  onClick={() => setResult(null)}
                  className="bg-white shadow-lg px-4 py-2 rounded-full font-bold text-sm flex items-center gap-2"
                >
                  <X className="w-4 h-4" /> Clear Route
                </button>
              )}
            </div>
          ) : (
            <div className="bg-brand-black text-white p-4 rounded-2xl shadow-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Navigation className="w-5 h-5 text-brand-yellow animate-pulse" />
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase">Navigating to</p>
                  <p className="font-bold truncate max-w-[150px]">{end}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-black text-brand-yellow">
                  {selectedRouteIndex === 0 ? result?.best_route.time_minutes : result?.alternative_routes[selectedRouteIndex-1].time_minutes}m
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Controls Overlay */}
      <div className="absolute right-4 bottom-[400px] z-30 flex flex-col gap-2">
        <div className="bg-white rounded-full shadow-xl overflow-hidden flex flex-col">
          <button 
            onClick={() => setZoom(prev => Math.min(prev + 1, 19))}
            className="w-12 h-12 bg-white flex items-center justify-center border-b border-gray-100 hover:bg-gray-50 active:bg-gray-100"
          >
            <Plus className="w-6 h-6 text-gray-700" />
          </button>
          <button 
            onClick={() => setZoom(prev => Math.max(prev - 1, 12))}
            className="w-12 h-12 bg-white flex items-center justify-center hover:bg-gray-50 active:bg-gray-100"
          >
            <Minus className="w-6 h-6 text-gray-700" />
          </button>
        </div>
        <button 
          onClick={() => {
            setZoom(18);
          }}
          className="w-12 h-12 bg-white shadow-xl rounded-full flex items-center justify-center hover:bg-gray-50 transition-colors"
        >
          <Locate className="w-6 h-6 text-gray-700" />
        </button>
      </div>

      {/* Bottom Sheet UI */}
      <motion.div 
        initial={{ y: "100%" }}
        animate={{ y: result ? (isNavigating ? "calc(100% - 130px)" : "0%") : "0%" }}
        transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="absolute bottom-0 left-0 right-0 z-20 bg-white rounded-t-[24px] shadow-[0_-8px_40px_-15px_rgba(0,0,0,0.1)] flex flex-col max-h-[80vh]"
      >
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto my-3 shrink-0" />
        
        {/* Discount/Smart Banner */}
        <div className="bg-brand-black text-white py-1 px-4 flex items-center justify-between gap-2 border-b border-white/5 shrink-0">
           <div className="flex items-center gap-1.5">
             <ShieldCheck className="w-3 h-3 text-brand-yellow" />
             <span className="text-[9px] font-black font-mono tracking-tighter uppercase text-brand-yellow/80">Smart Optimizer Activated</span>
           </div>
           <button 
            onClick={() => setSmartMode(!smartMode)}
            className={cn(
              "w-7 h-3.5 rounded-full p-0.5 transition-colors relative",
              smartMode ? "bg-brand-yellow" : "bg-gray-700"
            )}
           >
             <div className={cn(
               "w-2.5 h-2.5 bg-white rounded-full transition-all",
               smartMode ? "translate-x-3.5" : "translate-x-0"
             )} />
           </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2">
          {!result && !loading && (
            <div className="space-y-2 pt-2">
              <div className="relative">
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleOptimize(end);
                  }}
                  className="flex items-center gap-2 bg-gray-50 p-2 rounded-xl border border-gray-100"
                >
                  <MapIcon className="w-3.5 h-3.5 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Where to?" 
                    value={end}
                    onChange={(e) => {
                      setEnd(e.target.value);
                      if (!showSuggestions) setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="flex-1 bg-transparent font-bold text-xs outline-none placeholder:text-gray-400"
                  />
                  {end && (
                    <button 
                      type="button"
                      onClick={() => setEnd('')}
                      className="text-gray-400 hover:text-gray-600 px-1"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                  {end && (
                    <button 
                      type="submit"
                      className="bg-brand-yellow text-black px-2.5 py-1 rounded-lg font-black text-[8px] uppercase shadow-md active:scale-95 transition-transform"
                    >
                      Go
                    </button>
                  )}
                </form>
              </div>

              {showSuggestions && (
                <div className="space-y-0.5 max-h-[180px] overflow-y-auto pr-1 custom-scrollbar">
                  {/* While typing and no results yet, show loader if input is long enough */}
                  {end.length >= 2 && endSuggestions.length === 0 && (
                    <div className="flex items-center gap-2 py-3 px-2 text-gray-400 italic text-[10px]">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Finding matches in Kampala...
                    </div>
                  )}

                  {/* Show AI suggestions if we have them, otherwise show recents only if input is short or empty */}
                  {(endSuggestions.length > 0 ? endSuggestions : (end.length < 2 ? recentDestinations : [])).map((place, i) => (
                    <button 
                      key={i}
                      onClick={() => {
                        handleOptimize(place);
                        setShowSuggestions(false);
                      }}
                      className="w-full flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0 group hover:bg-gray-50 px-3 rounded-xl transition-all"
                    >
                      <div className="w-8 h-8 bg-gray-100 rounded-xl flex items-center justify-center group-hover:bg-brand-yellow text-gray-400 group-hover:text-black transition-colors shrink-0">
                        {endSuggestions.length > 0 ? <MapPin className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <p className="font-black text-gray-900 text-[11px] truncate leading-none">{place}</p>
                        <p className="text-[8px] text-gray-400 font-bold mt-1.5 uppercase tracking-wider">
                          {endSuggestions.length > 0 ? 'AI Suggestion' : 'Recently Used'}
                        </p>
                      </div>
                      <ChevronRight className="w-3 h-3 text-gray-300 group-hover:text-black" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {loading && (
            <div className="py-12 flex flex-col items-center justify-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-brand-yellow/20 blur-xl animate-pulse rounded-full" />
                <Loader2 className="w-10 h-10 animate-spin text-brand-yellow relative z-10" />
              </div>
              <div className="text-center">
                <p className="font-black text-base text-gray-900 uppercase tracking-tight">AI Optimizing Route</p>
                <p className="text-[10px] text-gray-500 font-bold mt-1 uppercase">Calculating Kampala Jam & Fuel Usage...</p>
              </div>
            </div>
          )}

          {/* Error Message if AI fails */}
          {optimizationError && !loading && (
            <div className="bg-red-50 border-2 border-red-100/50 rounded-2xl p-4 mb-3 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="text-[10px] font-black text-red-600 uppercase tracking-wider mb-0.5">Route Engine Status</p>
                <p className="text-xs text-red-700 font-bold leading-snug">{optimizationError}</p>
                <p className="text-[9px] text-red-500/70 mt-1 font-medium italic">* We've calculated an estimated route for you to continue.</p>
              </div>
            </div>
          )}

          {result && !loading && !isNavigating && (
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-brand-yellow/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-brand-yellow font-black" />
                  </div>
                  <div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-black/40 leading-none">AI Smart Selection</h3>
                    <p className="text-xs font-black text-brand-black">Optimized for {result.best_route.reason?.includes('fuel') ? 'Fuel Efficiency' : 'Speed'}</p>
                  </div>
                </div>
                <div className="bg-brand-yellow px-2 py-0.5 rounded text-[10px] font-black uppercase italic shadow-sm">AI Active</div>
              </div>

              {/* Horizontal Tier Selection */}
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide px-1">
                {[
                  { id: RideType.ECONOMY, label: 'Economy', price: (fare * 0.8), icon: '🏍️', desc: 'Budget friendly' },
                  { id: RideType.STANDARD, label: 'Standard', price: fare, icon: '🔵', desc: 'AI Optimal' },
                  { id: RideType.PREMIUM, label: 'Premium', price: (fare * 1.5), icon: '🏍️✨', desc: 'VIP Boda' }
                ].map((tier) => (
                  <button
                    key={tier.id}
                    onClick={() => {
                       setRideType(tier.id);
                    }}
                    className={cn(
                      "flex-none w-32 p-3 rounded-2xl border-2 transition-all text-left",
                      rideType === tier.id 
                        ? "border-brand-black bg-brand-black text-white shadow-lg" 
                        : "border-gray-100 bg-white hover:border-brand-yellow/50"
                    )}
                  >
                    <div className="text-lg mb-1">{tier.icon}</div>
                    <div className={cn("text-[10px] font-black uppercase tracking-tight", rideType === tier.id ? "text-brand-yellow" : "text-brand-black/60")}>
                      {tier.label}
                    </div>
                    <div className="text-xs font-black">
                      {Math.round(tier.price / 100) * 100}k
                    </div>
                    <div className={cn("text-[8px] font-bold mt-0.5", rideType === tier.id ? "text-white/60" : "text-brand-black/40")}>
                      {tier.desc}
                    </div>
                  </button>
                ))}
              </div>

              {/* Ride Summary Bar */}
              <div className="bg-brand-yellow/5 rounded-2xl p-3 border border-brand-yellow/20 flex items-center justify-between">
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-brand-black/60" />
                    <span className="text-[10px] font-bold text-brand-black">{result.best_route.time_minutes} mins</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Navigation className="w-3 h-3 text-brand-black/60" />
                    <span className="text-[10px] font-bold text-brand-black">{(result.best_route.distance || result.distance).toFixed(1)} km</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black text-brand-black uppercase block leading-none">Total Fare</span>
                  <span className="text-sm font-black text-brand-black">
                    {Math.round((fare * (rideType === RideType.ECONOMY ? 0.8 : rideType === RideType.PREMIUM ? 1.5 : 1)) / 100) * 100} UGX
                  </span>
                </div>
              </div>

              {/* Action Buttons Integrated */}
              <div className="flex gap-2 pt-2 pb-4">
                <button
                  onClick={() => setResult(null)}
                  className="w-12 h-12 rounded-xl border-2 border-gray-100 flex items-center justify-center bg-white hover:bg-gray-50 transition-colors"
                >
                  <X className="w-5 h-5 text-gray-400" />
                </button>
                <div className="flex-1 flex gap-2">
                   <button 
                    onClick={() => setPaymentMethod(paymentMethod === 'cash' ? 'wallet' : 'cash')}
                    className="flex-1 px-4 rounded-xl border-2 border-gray-100 font-black text-[10px] uppercase flex items-center justify-center gap-2"
                   >
                     {paymentMethod === 'cash' ? <Banknote className="w-4 h-4" /> : <div className="w-3 h-3 rounded-full bg-brand-yellow shadow-sm" />}
                     {paymentMethod}
                   </button>
                   <button 
                    onClick={handleRequestRide}
                    className="flex-[2] bg-brand-black text-brand-yellow h-12 rounded-xl font-black text-xs uppercase shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                  >
                    <Zap className="w-4 h-4 fill-brand-yellow" />
                    Book Boda Now
                  </button>
                </div>
              </div>
            </div>
          )}

          {requestStatus === 'searching' && (
            <div className="py-4 space-y-4 flex flex-col items-center text-center">
              <div className="relative">
                <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center animate-pulse shadow-lg">
                  <Navigation className="w-6 h-6 text-brand-yellow rotate-45" />
                </div>
                <div className="absolute -inset-1.5 border-2 border-brand-yellow border-t-transparent rounded-2xl animate-spin"></div>
              </div>
              <div>
                <h3 className="text-sm font-black text-black uppercase tracking-tight">Finding Riders...</h3>
                <p className="text-[9px] font-bold text-gray-400 mt-0.5 uppercase tracking-tighter">Assigning nearest Boda</p>
              </div>
            </div>
          )}

          {requestStatus === 'matched' && activeRide && (
            <div className="space-y-4 py-2">
               <div className="bg-green-50 p-2.5 rounded-xl border border-green-100 flex items-center gap-3">
                 <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center text-white shrink-0">
                   <ShieldCheck className="w-5 h-5" />
                 </div>
                 <div>
                   <p className="font-black text-xs text-green-700">
                     {activeRide.status === RideStatus.ACCEPTED ? 'Rider Matched!' : 
                      activeRide.status === RideStatus.ARRIVED ? 'Rider Arrived!' : 'Ongoing'}
                   </p>
                   <p className="text-[9px] font-bold text-green-600 uppercase">
                     {activeRide.status === RideStatus.ACCEPTED ? `ETA: ${getETA() || '?'} mins` : 
                      activeRide.status === RideStatus.ARRIVED ? 'Meet at pickup' : 'Safe Trip'}
                   </p>
                 </div>
               </div>

               <div className="bg-white p-3 rounded-2xl border-2 border-gray-100 shadow-sm flex items-center justify-between gap-3">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-brand-yellow border border-black/5 flex items-center justify-center overflow-hidden shrink-0">
                      <img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${activeRide.riderId || 'rider'}`} alt="rider" className="w-full h-full" />
                   </div>
                   <div className="flex-1 min-w-0">
                     <h4 className="font-black text-sm text-gray-900 leading-none truncate">{(activeRide as any).riderName || 'Boda Pro'}</h4>
                     <p className="text-[9px] font-bold text-gray-400 mt-1 uppercase">UEB 456X</p>
                   </div>
                 </div>
                 <div className="text-right shrink-0">
                    <p className="text-sm font-black text-black">{activeRide.fare.toLocaleString()}</p>
                    <p className="text-[8px] font-black uppercase text-gray-400">{activeRide.paymentMethod}</p>
                 </div>
               </div>

               {profile?.role === 'rider' ? (
                 <div className="space-y-2">
                   {activeRide.status === RideStatus.ACCEPTED && (
                     <button
                       onClick={async () => {
                         const { updateDoc, doc: fireDoc } = await import('firebase/firestore');
                         await updateDoc(fireDoc(db, 'users', profile.uid), { lastKnownLocation: mapCenter });
                         await updateDoc(fireDoc(db, 'rides', activeRide.id!), { status: RideStatus.ARRIVED });
                         notify("Arrived at pickup!", "success");
                       }}
                       className="w-full bg-black text-brand-yellow h-12 rounded-xl font-black text-sm shadow-xl uppercase"
                     >
                       I HAVE ARRIVED
                     </button>
                   )}
                   {activeRide.status === RideStatus.ARRIVED && (
                     <button
                       onClick={handleStartTrip}
                       className="w-full bg-brand-yellow text-black h-12 rounded-xl border-2 border-black font-black text-sm shadow-xl uppercase"
                     >
                       START TRIP
                     </button>
                   )}
                   {activeRide.status === RideStatus.TRIP_STARTED && (
                      <button 
                        onClick={handleEndTrip}
                        disabled={saving}
                        className="w-full bg-red-500 text-white h-12 rounded-xl font-black text-sm shadow-xl uppercase"
                      >
                        {saving ? 'Processing...' : 'Complete Trip'}
                      </button>
                   )}
                 </div>
               ) : (
                 <div className="text-center py-3 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                    <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none">
                      {activeRide.status === RideStatus.TRIP_STARTED ? 'Trip in progress' : 'Waiting for Updates'}
                    </p>
                    <div className="flex items-center justify-center gap-1.5 mt-2">
                      <div className="w-1 h-1 bg-brand-yellow rounded-full animate-bounce"></div>
                      <div className="w-1 h-1 bg-brand-yellow rounded-full animate-bounce [animation-delay:0.2s]"></div>
                      <div className="w-1 h-1 bg-brand-yellow rounded-full animate-bounce [animation-delay:0.4s]"></div>
                    </div>
                 </div>
               )}
            </div>
          )}

          {isNavigating && result && profile?.role === 'rider' && (
            <div className="space-y-3 pt-1">
              <div className="bg-brand-yellow -mx-4 p-2 flex items-center gap-2 border-b border-black/5">
                <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-brand-yellow shrink-0">
                  {result.navigation_steps?.[0]?.toLowerCase().includes('left') ? <ArrowUpLeft className="w-5 h-5" /> : 
                   result.navigation_steps?.[0]?.toLowerCase().includes('right') ? <ArrowUpRight className="w-5 h-5" /> :
                   <ArrowUp className="w-5 h-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-base font-black text-black leading-tight">
                    {result.navigation_steps?.[0]?.match(/\d+\s*m/)?.[0] || '150 m'}
                  </p>
                  <p className="text-[9px] font-bold text-black/60 uppercase truncate">
                    {result.navigation_steps?.[0] || 'Follow path'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                 <div>
                    <p className="text-[8px] font-black text-gray-400 uppercase">Destination</p>
                    <p className="font-bold text-xs text-gray-900 truncate max-w-[150px]">{end}</p>
                 </div>
                 <div className="text-right">
                    <p className="text-[8px] font-black text-gray-400 uppercase">Profit</p>
                    <p className="font-black text-sm text-green-600">
                      +{(fare - (selectedRouteIndex === 0 ? result.best_route.cost : result.alternative_routes[selectedRouteIndex-1].cost)).toLocaleString()}
                    </p>
                 </div>
              </div>
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
