export type DriverStatus = 'free' | 'driving' | 'pickup' | 'busy' | 'home';

export const DRIVER_STATUS_COLORS = {
  free: {
    primary: '#007a1e',
    light: '#dcfce7',
    dark: '#005714',
    name: 'Zielony',
    label: 'Wolna'
  },
  driving: {
    primary: '#0052cc',
    light: '#dbeafe',
    dark: '#003d99',
    name: 'Niebieski',
    label: 'Kursem'
  },
  pickup: {
    primary: '#aa0000',
    light: '#fee2e2',
    dark: '#800000',
    name: 'Czerwony',
    label: 'Dojazd'
  },
  busy: {
    primary: '#8428bc',
    light: '#f3e8f3',
    dark: '#6020a0',
    name: 'Fioletowy',
    label: 'Zajęta'
  },
  home: {
    primary: '#6b7280',
    light: '#f3f4f6',
    dark: '#4b5563',
    name: 'Szary',
    label: 'Dom'
  }
} as const;

export function getDriverStatusColor(status: DriverStatus): {
  primary: string;
  light: string;
  dark: string;
  name: string;
  label: string;
} {
  return DRIVER_STATUS_COLORS[status] || DRIVER_STATUS_COLORS.home;
}

export function isDriverActive(status: DriverStatus): boolean {
  return status !== 'home';
}

export function getDriverStatusLabel(status: DriverStatus): string {
  return DRIVER_STATUS_COLORS[status]?.label || 'Nieznany';
}

export function getMarkerColor(status: DriverStatus): string {
  return DRIVER_STATUS_COLORS[status]?.primary || DRIVER_STATUS_COLORS.home.primary;
}

export function getBackgroundColorClass(status: DriverStatus): string {
  switch (status) {
    case 'free':
      return 'bg-green-50 border-green-200';
    case 'driving':
      return 'bg-blue-50 border-blue-200';
    case 'pickup':
      return 'bg-red-50 border-red-200';
    case 'busy':
      return 'bg-purple-50 border-purple-200';
    case 'home':
      return 'bg-gray-50 border-gray-200';
    default:
      return 'bg-gray-50 border-gray-200';
  }
}

export function getTextColorClass(status: DriverStatus): string {
  switch (status) {
    case 'free':
      return 'text-green-700';
    case 'driving':
      return 'text-blue-700';
    case 'pickup':
      return 'text-red-700';
    case 'busy':
      return 'text-purple-800';
    case 'home':
      return 'text-gray-700';
    default:
      return 'text-gray-700';
  }
}

export function getBorderLeftColorClass(status: DriverStatus): string {
  switch (status) {
    case 'free':
      return 'border-l-4 border-l-green-500';
    case 'driving':
      return 'border-l-4 border-l-blue-500';
    case 'pickup':
      return 'border-l-4 border-l-red-500';
    case 'busy':
      return 'border-l-4 border-l-purple-700';
    case 'home':
      return 'border-l-4 border-l-gray-500';
    default:
      return 'border-l-4 border-l-gray-500';
  }
}

export function getBadgeColorClass(status: DriverStatus): string {
  switch (status) {
    case 'free':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'driving':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'pickup':
      return 'bg-red-100 text-red-800 border-red-300';
    case 'busy':
      return 'bg-purple-100 text-purple-800 border-purple-300';
    case 'home':
      return 'bg-gray-100 text-gray-800 border-gray-300';
    default:
      return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

export const ACTIVE_STATUSES: DriverStatus[] = ['free', 'driving', 'pickup', 'busy'];
export const ALL_STATUSES: DriverStatus[] = ['free', 'driving', 'pickup', 'busy', 'home'];
