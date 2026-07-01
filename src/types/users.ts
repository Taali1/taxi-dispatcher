export interface BaseUser {
  id: string;
  email: string;
  name: string;
  password?: string;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  updatedAt: string;
  lastLogin?: string;
}

export interface Administrator extends BaseUser {
  permissions: AdminPermission[];
  department?: string;
  accessLevel: 'super' | 'standard' | 'limited';
}

export interface Driver extends Omit<BaseUser, 'status'> {
  driverCode: string;
  pin: string;
  licenseNumber: string;
  licenseExpiry?: string;
  sideNumber?: string;
  phoneNumber: string;
  vehicleBrand?: string;
  vehicleModel?: string;
  vehicleColor?: string;
  registrationNumber?: string;
  currentZone?: number;
  zoneEnteredAt?: string;
  queuePosition?: number;
  rating?: number;
  totalRides?: number;
  currentLocation?: { lat: number; lng: number };
  latitude?: number;
  longitude?: number;
  lastLocationUpdate?: string;
  vehicleCategories?: string[];
  emergencyContact?: string;
  documents?: any;
  status: 'free' | 'driving' | 'pickup' | 'busy' | 'home' | 'active' | 'inactive' | 'suspended';
  suspendedUntil?: string;
}

export interface Dispatcher extends BaseUser {
  employeeId: string;
  shift: 'morning' | 'afternoon' | 'night' | 'rotating';
  assignedZones: number[];
  maxConcurrentOrders: number;
  phoneExtension?: string;
  trainingCompleted: boolean;
}

export interface SupportAgent extends BaseUser {
  agentId: string;
  department: 'technical' | 'customer' | 'billing';
  languages: string[];
  ticketLimit: number;
  specializations: string[];
}

export interface AccountingUser extends BaseUser {
  employeeId: string;
  accessLevel: 'viewer' | 'editor' | 'manager';
  certifications: string[];
  department: 'payroll' | 'billing' | 'reports' | 'audit';
}

export type UserRole = 'admin' | 'driver' | 'dispatcher' | 'support' | 'accounting';
export type VehicleCategory = 'standard' | 'comfort' | 'premium' | 'van';
export type AdminPermission = 'users' | 'zones' | 'pricing' | 'reports' | 'system';

export interface UserPermissions {
  userId: string;
  roles: UserRole[];
  panelAccess: {
    admin: boolean;
    dispatcher: boolean;
    driver: boolean;
    support: boolean;
    accounting: boolean;
  };
}

export interface UserFilter {
  search: string;
  role?: UserRole;
  status?: 'active' | 'inactive' | 'suspended';
  zone?: number;
}

export type AnyUser = Administrator | Driver | Dispatcher | SupportAgent | AccountingUser;