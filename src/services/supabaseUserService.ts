import { Administrator, Driver, Dispatcher, SupportAgent, AccountingUser, UserRole } from '../types/users';
import { supabase } from './supabase';

export class SupabaseUserService {
  private isSupabaseAvailable(): boolean {
    return supabase !== null;
  }

  // Administrator methods
  async createAdministrator(data: Omit<Administrator, 'id' | 'createdAt' | 'updatedAt'>): Promise<Administrator> {
    if (!this.isSupabaseAvailable()) {
      throw new Error('Supabase nie jest skonfigurowane. Skonfiguruj połączenie z bazą danych.');
    }

    try {
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            role: 'admin'
          }
        }
      });

      if (authError) throw authError;

      // Insert into administrators table
      const adminData = {
        id: authData.user?.id,
        email: data.email,
        name: data.name,
        department: data.department,
        access_level: data.accessLevel,
        permissions: data.permissions,
        status: data.status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: insertedData, error: insertError } = await supabase
        .from('administrators')
        .insert([adminData])
        .select()
        .single();

      if (insertError) throw insertError;

      return {
        id: insertedData.id,
        email: insertedData.email,
        name: insertedData.name,
        department: insertedData.department,
        accessLevel: insertedData.access_level,
        permissions: insertedData.permissions,
        status: insertedData.status,
        createdAt: insertedData.created_at,
        updatedAt: insertedData.updated_at
      };
    } catch (error) {
      console.error('Error creating administrator:', error);
      throw new Error('Błąd podczas tworzenia administratora: ' + (error as Error).message);
    }
  }

  async getAdministrators(): Promise<Administrator[]> {
    if (!this.isSupabaseAvailable()) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('administrators')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map((admin: any) => ({
        id: admin.id,
        email: admin.email,
        name: admin.name,
        department: admin.department,
        accessLevel: admin.access_level,
        permissions: admin.permissions || [],
        status: admin.status,
        createdAt: admin.created_at,
        updatedAt: admin.updated_at
      }));
    } catch (error) {
      console.error('Error fetching administrators:', error);
      return [];
    }
  }

  async updateAdministrator(id: string, data: Partial<Administrator>): Promise<Administrator | null> {
    if (!this.isSupabaseAvailable()) {
      throw new Error('Supabase nie jest skonfigurowane');
    }

    try {
      const updateData: any = {
        updated_at: new Date().toISOString()
      };

      if (data.name) updateData.name = data.name;
      if (data.email) updateData.email = data.email;
      if (data.department) updateData.department = data.department;
      if (data.accessLevel) updateData.access_level = data.accessLevel;
      if (data.permissions) updateData.permissions = data.permissions;
      if (data.status) updateData.status = data.status;

      const { data: updatedData, error } = await supabase
        .from('administrators')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return {
        id: updatedData.id,
        email: updatedData.email,
        name: updatedData.name,
        department: updatedData.department,
        accessLevel: updatedData.access_level,
        permissions: updatedData.permissions,
        status: updatedData.status,
        createdAt: updatedData.created_at,
        updatedAt: updatedData.updated_at
      };
    } catch (error) {
      console.error('Error updating administrator:', error);
      throw new Error('Błąd podczas aktualizacji administratora');
    }
  }

  async deleteAdministrator(id: string): Promise<boolean> {
    if (!this.isSupabaseAvailable()) {
      throw new Error('Supabase nie jest skonfigurowane');
    }

    try {
      const { error } = await supabase
        .from('administrators')
        .delete()
        .eq('id', id);

      if (error) throw error;

      // Also delete from Supabase Auth
      await supabase.auth.admin.deleteUser(id);

      return true;
    } catch (error) {
      console.error('Error deleting administrator:', error);
      throw new Error('Błąd podczas usuwania administratora');
    }
  }

  // Driver methods
  async createDriver(data: Omit<Driver, 'id' | 'createdAt' | 'updatedAt'>): Promise<Driver> {
    if (!this.isSupabaseAvailable()) {
      throw new Error('Supabase nie jest skonfigurowane');
    }

    try {
      // Create user in Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: {
            name: data.name,
            role: 'driver'
          }
        }
      });

      if (authError) throw authError;

      // Insert into drivers table
      const driverData = {
        id: authData.user?.id,
        email: data.email,
        name: data.name,
        driver_code: data.driverCode,
        license_number: data.licenseNumber,
        license_expiry: data.licenseExpiry,
        current_zone: data.currentZone,
        vehicle_categories: data.vehicleCategories,
        rating: data.rating,
        total_rides: data.totalRides,
        phone_number: data.phoneNumber,
        emergency_contact: data.emergencyContact,
        documents: data.documents,
        status: data.status,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data: insertedData, error: insertError } = await supabase
        .from('drivers')
        .insert([driverData])
        .select()
        .single();

      if (insertError) throw insertError;

      return {
        id: insertedData.id,
        email: insertedData.email,
        name: insertedData.name,
        driverCode: insertedData.driver_code,
        licenseNumber: insertedData.license_number,
        licenseExpiry: insertedData.license_expiry,
        currentZone: insertedData.current_zone,
        vehicleCategories: insertedData.vehicle_categories,
        rating: insertedData.rating,
        totalRides: insertedData.total_rides,
        phoneNumber: insertedData.phone_number,
        emergencyContact: insertedData.emergency_contact,
        documents: insertedData.documents,
        status: insertedData.status,
        createdAt: insertedData.created_at,
        updatedAt: insertedData.updated_at
      };
    } catch (error) {
      console.error('Error creating driver:', error);
      throw new Error('Błąd podczas tworzenia kierowcy: ' + (error as Error).message);
    }
  }

  async getDrivers(): Promise<Driver[]> {
    if (!this.isSupabaseAvailable()) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data.map((driver: any) => ({
        id: driver.id,
        email: driver.email,
        name: driver.name,
        driverCode: driver.driver_code,
        licenseNumber: driver.license_number,
        licenseExpiry: driver.license_expiry,
        currentZone: driver.current_zone,
        vehicleCategories: driver.vehicle_categories || [],
        rating: driver.rating,
        totalRides: driver.total_rides,
        phoneNumber: driver.phone_number,
        emergencyContact: driver.emergency_contact,
        documents: driver.documents,
        status: driver.status,
        createdAt: driver.created_at,
        updatedAt: driver.updated_at
      }));
    } catch (error) {
      console.error('Error fetching drivers:', error);
      return [];
    }
  }

  // Driver status tracking
  async updateDriverStatus(driverId: string, status: string, regionNumber?: number | null): Promise<void> {
    if (!this.isSupabaseAvailable()) {
      console.warn('Supabase not available, skipping database update');
      return;
    }

    try {
      const updateData: any = {
        status,
        status_changed_at: new Date().toISOString(),
        status_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      if (regionNumber !== undefined && regionNumber !== null) {
        updateData.current_region_number = regionNumber;
      }

      const { error } = await supabase
        .from('drivers')
        .update(updateData)
        .eq('id', driverId);

      if (error) {
        console.error('Error updating driver status in database:', error);
      } else {
        console.log('✅ Driver status saved to database:', { driverId, status, regionNumber });
      }
    } catch (error) {
      console.error('Error updating driver status:', error);
    }
  }

  // Similar methods for dispatchers, support agents, and accounting users...
  // (Implementation would follow the same pattern)

  // Authentication integration
  async authenticateUser(email: string, password: string, role: UserRole): Promise<{ user: any | null, error: string | null }> {
    if (!this.isSupabaseAvailable()) {
      return { user: null, error: 'Supabase nie jest skonfigurowane' };
    }

    try {
      // First, try to create demo users if they don't exist
      await this.ensureDemoUsersExist();

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      // Verify user has the requested role
      const userId = data.user?.id;
      let userExists = false;

      switch (role) {
        case 'admin':
          const { data: adminData } = await supabase
            .from('administrators')
            .select('id')
            .eq('id', userId)
            .single();
          userExists = !!adminData;
          break;
        case 'driver':
          const { data: driverData } = await supabase
            .from('drivers')
            .select('id')
            .eq('id', userId)
            .single();
          userExists = !!driverData;
          break;
        case 'dispatcher':
          const { data: dispatcherData } = await supabase
            .from('dispatchers')
            .select('id')
            .eq('id', userId)
            .single();
          userExists = !!dispatcherData;
          break;
        case 'support':
          const { data: supportData } = await supabase
            .from('support_agents')
            .select('id')
            .eq('id', userId)
            .single();
          userExists = !!supportData;
          break;
        case 'accounting':
          const { data: accountingData } = await supabase
            .from('accounting_users')
            .select('id')
            .eq('id', userId)
            .single();
          userExists = !!accountingData;
          break;
        // Add other roles...
      }

      if (!userExists) {
        return { user: null, error: 'Użytkownik nie ma uprawnień do tego panelu' };
      }

      return { user: data.user, error: null };
    } catch (error) {
      console.error('Authentication error:', error);
      return { user: null, error: error instanceof Error ? error.message : 'Authentication failed' };
    }
  }

  // Ensure demo users exist in Supabase
  private async ensureDemoUsersExist(): Promise<void> {
    if (!this.isSupabaseAvailable()) return;

    const demoUsers = [
      { email: 'admin@taxi.com', password: 'password', role: 'admin', name: 'Administrator' },
      { email: 'dispatcher@taxi.com', password: 'password', role: 'dispatcher', name: 'Dyspozytor' },
      { email: 'driver@taxi.com', password: 'password', role: 'driver', name: 'Kierowca Jan' },
      { email: 'support@taxi.com', password: 'password', role: 'support', name: 'Support Agent' },
      { email: 'accounting@taxi.com', password: 'password', role: 'accounting', name: 'Księgowy' },
    ];

    for (const user of demoUsers) {
      try {
        // Check if user already exists
        const { data: existingUser } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: user.password
        });

        if (existingUser.user) {
          // User exists, sign them out
          await supabase.auth.signOut();
          continue;
        }
      } catch (error) {
        // User doesn't exist, create them
        try {
          const { data: authData, error: signUpError } = await supabase.auth.signUp({
            email: user.email,
            password: user.password,
            options: {
              data: {
                name: user.name,
                role: user.role
              }
            }
          });

          if (signUpError) {
            console.warn(`Failed to create demo user ${user.email}:`, signUpError);
            continue;
          }

          if (authData.user) {
            // Create corresponding record in role-specific table
            await this.createDemoUserRecord(authData.user.id, user);
          }
        } catch (createError) {
          console.warn(`Error creating demo user ${user.email}:`, createError);
        }
      }
    }
  }

  private async createDemoUserRecord(userId: string, user: any): Promise<void> {
    try {
      switch (user.role) {
        case 'admin':
          await supabase.from('administrators').insert({
            id: userId,
            email: user.email,
            name: user.name,
            department: 'IT',
            access_level: 'full',
            permissions: ['user_management', 'system_config', 'reports'],
            status: 'active'
          });
          break;
        case 'dispatcher':
          await supabase.from('dispatchers').insert({
            id: userId,
            email: user.email,
            name: user.name,
            shift: 'day',
            assigned_zones: ['Zone 1', 'Zone 2'],
            max_concurrent_orders: 10,
            status: 'active'
          });
          break;
        case 'driver':
          await supabase.from('drivers').insert({
            id: userId,
            email: user.email,
            name: user.name,
            driver_code: 'DRV001',
            license_number: 'LIC123456',
            license_expiry: '2025-12-31',
            current_zone: 'Zone 1',
            vehicle_categories: ['standard'],
            rating: 4.5,
            total_rides: 150,
            phone_number: '+48123456789',
            status: 'active'
          });
          break;
        case 'support':
          await supabase.from('support_agents').insert({
            id: userId,
            email: user.email,
            name: user.name,
            languages: ['pl', 'en'],
            specializations: ['technical', 'billing'],
            max_concurrent_tickets: 5,
            status: 'active'
          });
          break;
        case 'accounting':
          await supabase.from('accounting_users').insert({
            id: userId,
            email: user.email,
            name: user.name,
            certifications: ['CPA'],
            access_level: 'standard',
            department: 'Finance',
            status: 'active'
          });
          break;
      }
    } catch (error) {
      console.warn(`Failed to create ${user.role} record for ${user.email}:`, error);
    }
  }
}

export const supabaseUserService = new SupabaseUserService();