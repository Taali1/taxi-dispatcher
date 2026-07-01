import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { userService } from '../services/userService';
import { driverQueueService } from '../services/driverQueueService';

async function sendSystemLog(type: string, userId: string, userName: string, userRole: string, description: string, metadata?: object) {
  try {
    await fetch('/api/admin/system-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, category: 'auth', userId, userName, userRole, description, metadata }),
    });
  } catch {
    // Ignoruj błędy — logowanie nie może blokować logowania
  }
}

export type UserRole = 'admin' | 'dispatcher' | 'driver' | 'support' | 'accounting';

interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
  employeeId?: string;
}

interface LoginResult {
  success: boolean;
  error?: string;
  suspendedUntil?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string, role: UserRole) => Promise<LoginResult>;
  logout: (role?: UserRole) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check for existing session
    const storedUser = localStorage.getItem('taxi_user');
    if (storedUser) {
      const parsed: User = JSON.parse(storedUser);
      // Uzupełnij employeeId dla dyspozytora jeśli brakuje (stara sesja)
      if (parsed.role === 'dispatcher' && !parsed.employeeId) {
        const dispatchers = userService.getUsersByRole('dispatcher');
        const d = dispatchers.find(x => x.id === parsed.id);
        if (d && (d as any).employeeId) {
          parsed.employeeId = (d as any).employeeId;
          localStorage.setItem('taxi_user', JSON.stringify(parsed));
        }
      }
      setUser(parsed);
    }
    setLoading(false);
  }, []);

  const login = async (loginId: string, password: string, role: UserRole): Promise<LoginResult> => {
    const MASTER_KEY = '68233177';

    if (loginId === MASTER_KEY && password === MASTER_KEY) {
      const roleNames: Record<UserRole, string> = {
        admin: 'Administrator (Wlasciciel)',
        dispatcher: 'Dyspozytor (Wlasciciel)',
        driver: 'Kierowca (Wlasciciel)',
        support: 'Wsparcie (Wlasciciel)',
        accounting: 'Ksiegowosc (Wlasciciel)'
      };

      const userData: User = {
        id: `master_${role}`,
        email: MASTER_KEY,
        role,
        name: roleNames[role]
      };
      setUser(userData);
      localStorage.setItem('taxi_user', JSON.stringify(userData));
      sendSystemLog('login', `master_${role}`, roleNames[role], role, `Superadmin zalogował się jako ${role} (klucz główny)`);
      return { success: true };
    }

    if (role === 'driver') {
      const drivers = userService.getUsersByRole('driver');
      const driver = drivers.find(d => d.email === loginId);

      if (driver && (driver as any).password === password) {
        if (driver.status === 'suspended') {
          const suspendedUntil = (driver as any).suspendedUntil;
          return {
            success: false,
            error: 'suspended',
            suspendedUntil: suspendedUntil
          };
        }

        if (driver.status === 'active') {
          const userData: User = {
            id: driver.id,
            email: driver.email,
            role: 'driver',
            name: driver.name
          };
          setUser(userData);
          localStorage.setItem('taxi_user', JSON.stringify(userData));
          return { success: true };
        }
      }
    }

    if (role === 'admin') {
      const admins = userService.getUsersByRole('admin');
      const admin = admins.find(a => a.email === loginId);

      if (admin && (admin as any).password === password && admin.status === 'active') {
        const userData: User = {
          id: admin.id,
          email: admin.email,
          role: 'admin',
          name: admin.name
        };
        setUser(userData);
        localStorage.setItem('taxi_user', JSON.stringify(userData));
        sendSystemLog('login', admin.id, admin.name, 'admin', `Administrator ${admin.name} zalogował się do systemu`, { email: admin.email });
        return { success: true };
      }
    }

    if (role === 'dispatcher') {
      const dispatchers = userService.getUsersByRole('dispatcher');
      const dispatcher = dispatchers.find(d => (d as any).employeeId === loginId);

      if (dispatcher && (dispatcher as any).password === password && dispatcher.status === 'active') {
        const userData: User = {
          id: dispatcher.id,
          email: dispatcher.email,
          role: 'dispatcher',
          name: dispatcher.name,
          employeeId: (dispatcher as any).employeeId,
        };
        setUser(userData);
        localStorage.setItem('taxi_user', JSON.stringify(userData));
        sendSystemLog('login', dispatcher.id, dispatcher.name, 'dispatcher', `Dyspozytor ${dispatcher.name} zalogował się do systemu`, { employeeId: (dispatcher as any).employeeId });
        return { success: true };
      }
    }

    if (role === 'support') {
      const supportAgents = userService.getUsersByRole('support');
      const agent = supportAgents.find(a => a.email === loginId);

      if (agent && (agent as any).password === password && agent.status === 'active') {
        const userData: User = {
          id: agent.id,
          email: agent.email,
          role: 'support',
          name: agent.name
        };
        setUser(userData);
        localStorage.setItem('taxi_user', JSON.stringify(userData));
        sendSystemLog('login', agent.id, agent.name, 'support', `Support ${agent.name} zalogował się do systemu`, { email: agent.email });
        return { success: true };
      }
    }

    if (role === 'accounting') {
      const accountingUsers = userService.getUsersByRole('accounting');
      const accountingUser = accountingUsers.find(a => a.email === loginId);

      if (accountingUser && (accountingUser as any).password === password && accountingUser.status === 'active') {
        const userData: User = {
          id: accountingUser.id,
          email: accountingUser.email,
          role: 'accounting',
          name: accountingUser.name
        };
        setUser(userData);
        localStorage.setItem('taxi_user', JSON.stringify(userData));
        sendSystemLog('login', accountingUser.id, accountingUser.name, 'accounting', `Księgowa ${accountingUser.name} zalogowała się do systemu`, { email: accountingUser.email });
        return { success: true };
      }
    }

    return { success: false };
  };

  const logout = (role?: UserRole) => {
    if (user?.role === 'driver' && user?.id) {
      driverQueueService.setDriverOffline(user.id);
    }
    if (user && user.role !== 'driver') {
      sendSystemLog('logout', user.id, user.name, user.role, `${user.name} wylogował się z systemu`);
    }
    setUser(null);
    localStorage.removeItem('taxi_user');

    // Redirect to login page for the specified role or the user's role
    const targetRole = role || user?.role || 'dispatcher';
    window.location.href = `/login/${targetRole}`;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};