export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'dispatcher' | 'driver' | 'support' | 'accounting';
  zone?: number;
  status: 'active' | 'inactive';
}

export interface Zone {
  id: number;
  name: string;
  coordinates: { lat: number; lng: number }[];
  driversCount: number;
}

export interface Order {
  id: string;
  orderNumber?: string;        // format XXX/MMYY np. "100/0226"
  customerName: string;
  customerPhone: string;
  customerId?: string;         // FK do tabeli clients
  pickupAddress: string;
  destinationAddress: string;
  pickupZone?: number;         // alias historyczny
  pickupRegionId?: number;     // rejon odbioru wykryty automatycznie
  destinationZone?: number;
  taxiCount: number;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'corporate';
  vehicleCategory: 'standard' | 'comfort' | 'premium' | 'van';
  scheduledDate: string;
  scheduledTime: string;
  notes: string;
  status: 'new' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
  assignedDriver?: string;
  cost: number;
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  code: string;
  currentZone: number;
  status: 'free' | 'driving' | 'pickup' | 'busy' | 'home';
  queuePosition: number;
  vehicleCategory: string[];
  location: { lat: number; lng: number };
  latitude?: number;
  longitude?: number;
  rating: number;
  totalRides: number;
}

export interface PricingRule {
  category: string;
  baseFare: number;
  perKmRate: number;
  waitingTimeRate: number;
  nightSurcharge: number;
  description: string;
}

export interface AssignmentRule {
  searchRadius: number;
  fallbackZones: number[];
  marketplaceEnabled: boolean;
  maxWaitTime: number;
  priorityCategories: string[];
  emergencyMode: boolean;
}

export interface Region {
  id: string;
  name: string;
  number: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface TaxiCode {
  id: string;
  code: string;
  region_id: string;
  driver_id?: string;
  status: 'available' | 'assigned' | 'inactive';
  created_at: string;
  updated_at: string;
  region?: Region;
}