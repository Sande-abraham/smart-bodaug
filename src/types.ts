export interface Location {
  latitude: number;
  longitude: number;
}

export interface TrafficAlert {
  location: string;
  condition: string;
  action: string;
  intensity: 'low' | 'medium' | 'high';
}

export interface FuelPriceAlert {
  station: string;
  price: number;
  trend: 'up' | 'down' | 'stable';
  distance: string;
}

export type UserRole = 'customer' | 'rider' | 'admin';
export type UserStatus = 'active' | 'pending' | 'suspended' | 'declined';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';

export interface RiderApplication {
  id?: string;
  userId: string;
  userName: string;
  userEmail: string;
  nationalId: string;
  drivingPermit: string;
  bikeNumber: string;
  bodaType: RideType;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: 'RIDER_APPLICATION' | 'RIDE_REQUEST' | 'SYSTEM' | 'LOYALTY';
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: string;
}

export enum RideStatus {
  REQUESTED = 'REQUESTED',
  ACCEPTED = 'ACCEPTED',
  ARRIVED = 'ARRIVED',
  TRIP_STARTED = 'TRIP_STARTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum RideType {
  ECONOMY = 'ECONOMY',
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM'
}

export interface RideRequest {
  id?: string;
  customerId: string;
  riderId?: string;
  riderName?: string;
  riderPhone?: string;
  status: RideStatus;
  pickup: string;
  destination: string;
  pickupCoords: [number, number];
  destCoords: [number, number];
  rideType: RideType;
  paymentMethod: 'cash' | 'wallet';
  fare: number;
  estTime: number;
  estDistance: number;
  retryCount?: number;
  matchingRadius?: number;
  routeData?: RouteOptimizationResult;
  timestamp: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  role_requested?: UserRole;
  verification_status?: VerificationStatus;
  isApproved?: boolean;
  phoneNumber?: string;
  numberPlate?: string; // For riders
  isOnline?: boolean;
  currentRideId?: string | null;
  earnings?: number;
  walletBalance?: number;
  efficiencyScore?: number;
  rating?: number;
  bikeType?: string;
  isOnTrip?: boolean;
  lastKnownLocation?: [number, number];
  lastLocationUpdate?: string;
  loyaltyRidesRemaining?: number;
  createdAt: string;
}

export interface Rider extends UserProfile {
  phoneNumber: string;
  bikeType: string;
  fuelConsumptionRate: number; // Liters per km
  tankCapacity: number; // Liters
  rating: number; // 0-5
  lastKnownLocation?: [number, number];
}

export interface Trip {
  id?: string;
  uid: string;
  distance: number;
  fuelUsed: number;
  fuelCost: number;
  fare: number;
  profit: number;
  startPoint: string;
  endPoint: string;
  timestamp: string;
}

export interface RouteInfo {
  description: string;
  fuel_litres: number;
  cost: number;
  time_minutes: number;
  distance: number;
  traffic_level?: string;
  road_type?: string;
  via_road?: string;
  profit_saved?: number;
  reason: string;
  waypoints?: [number, number][]; // Lat, Lng pairs for polyline
  traffic_segments?: { color: 'green' | 'yellow' | 'red', weight: number }[];
  suggested_fare_range?: {
    min: number;
    max: number;
  };
}

export interface RouteOptimizationResult {
  suggestions: string[];
  best_route: RouteInfo;
  alternative_routes: RouteInfo[];
  navigation_steps: string[];
  distance: number; // For backward compatibility/trips
}

export interface DailySummary {
  date: string;
  totalTrips: number;
  totalFuelUsed: number;
  totalEarnings: number;
  totalProfit: number;
}
