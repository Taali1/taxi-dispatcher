import { Order } from '../types';
import { driverQueueService } from './driverQueueService';

export interface AssignmentResult {
  driverId: string | null;
  driverName: string | null;
  driverCode: string | null;
  reason: string;
  queuePosition: number | null;
}

class OrderAssignmentService {
  async assignOrderToDriver(
    order: Order,
    options?: {
      fallbackZones?: number[];
      marketplaceEnabled?: boolean;
    }
  ): Promise<AssignmentResult> {
    const pickupZone = order.pickupZone;
    if (!pickupZone) {
      return {
        driverId: null,
        driverName: null,
        driverCode: null,
        reason: 'Nie określono rejonu odbioru',
        queuePosition: null
      };
    }

    try {
      const driver = await this.findBestDriverInZone(pickupZone, order.vehicleCategory);

      if (driver) {
        return {
          driverId: driver.driver_id,
          driverName: driver.driver_name,
          driverCode: driver.driver_code,
          reason: `Przydzielono kierowcę z rejonu ${pickupZone}`,
          queuePosition: driver.queue_pos
        };
      }

      if (options?.fallbackZones && options.fallbackZones.length > 0) {
        for (const fallbackZone of options.fallbackZones) {
          const fallbackDriver = await this.findBestDriverInZone(
            fallbackZone,
            order.vehicleCategory
          );

          if (fallbackDriver) {
            return {
              driverId: fallbackDriver.driver_id,
              driverName: fallbackDriver.driver_name,
              driverCode: fallbackDriver.driver_code,
              reason: `Przydzielono kierowcę z rejonu zapasowego ${fallbackZone}`,
              queuePosition: fallbackDriver.queue_pos
            };
          }
        }
      }

      if (options?.marketplaceEnabled) {
        return {
          driverId: null,
          driverName: null,
          driverCode: null,
          reason: 'Zlecenie wysłane na giełdę - brak dostępnych kierowców',
          queuePosition: null
        };
      }

      return {
        driverId: null,
        driverName: null,
        driverCode: null,
        reason: 'Nie znaleziono dostępnego kierowcy',
        queuePosition: null
      };
    } catch (error) {
      console.error('Błąd podczas przydzielania zlecenia:', error);
      return {
        driverId: null,
        driverName: null,
        driverCode: null,
        reason: 'Błąd podczas przydzielania zlecenia',
        queuePosition: null
      };
    }
  }

  private async findBestDriverInZone(
    zoneNumber: number,
    vehicleCategory: string
  ): Promise<any | null> {
    try {
      const driversInQueue = await driverQueueService.getDriversInQueue(zoneNumber);

      if (driversInQueue.length === 0) {
        return null;
      }

      const matchingDrivers = driversInQueue.filter((driver: any) => {
        const categories = driver.vehicle_categories || [];
        return categories.includes(vehicleCategory) || categories.includes('standard');
      });

      if (matchingDrivers.length === 0) {
        return driversInQueue[0];
      }

      return matchingDrivers[0];
    } catch (error) {
      console.error('Błąd podczas wyszukiwania kierowcy:', error);
      return null;
    }
  }

  async getAvailableDriversInZone(zoneNumber: number): Promise<any[]> {
    try {
      const driversInQueue = await driverQueueService.getDriversInQueue(zoneNumber);
      return driversInQueue;
    } catch (error) {
      console.error('Błąd podczas pobierania dostępnych kierowców:', error);
      return [];
    }
  }

  async suggestDriversForOrder(
    order: Order,
    limit: number = 5
  ): Promise<any[]> {
    const pickupZone = order.pickupZone;
    if (!pickupZone) {
      return [];
    }

    try {
      const driversInQueue = await driverQueueService.getDriversInQueue(pickupZone);
      const limitedDrivers = driversInQueue.slice(0, limit);

      return limitedDrivers.map((driver: any, index: number) => ({
        id: driver.driver_id,
        name: driver.driver_name,
        driver_code: driver.driver_code,
        queue_position: driver.queue_pos,
        vehicle_categories: driver.vehicle_categories,
        free_duration: driver.free_duration,
        matchScore: this.calculateMatchScore(driver, order),
        priority: index + 1
      }));
    } catch (error) {
      console.error('Błąd podczas pobierania sugestii kierowców:', error);
      return [];
    }
  }

  private calculateMatchScore(driver: any, order: Order): number {
    let score = 100;

    const categories = driver.vehicle_categories || [];
    if (categories.includes(order.vehicleCategory)) {
      score += 20;
    }

    if (driver.queue_pos === 1) {
      score += 15;
    }

    return score;
  }

  async getQueueStatistics(): Promise<{
    totalFreeDrivers: number;
    driversByZone: { zone: number; count: number }[];
    averageQueuePosition: number;
  }> {
    try {
      const allDriversInQueues = await driverQueueService.getAllDriversInQueues();

      const zoneMap = new Map<number, number>();
      let totalQueuePosition = 0;

      allDriversInQueues.forEach((driver: any) => {
        const zone = driver.current_zone;
        if (zone) {
          zoneMap.set(zone, (zoneMap.get(zone) || 0) + 1);
          if (driver.queue_pos) {
            totalQueuePosition += driver.queue_pos;
          }
        }
      });

      const driversByZone = Array.from(zoneMap.entries()).map(([zone, count]) => ({
        zone,
        count
      }));

      return {
        totalFreeDrivers: allDriversInQueues.length,
        driversByZone,
        averageQueuePosition: allDriversInQueues.length > 0 ? totalQueuePosition / allDriversInQueues.length : 0
      };
    } catch (error) {
      console.error('Błąd podczas pobierania statystyk kolejki:', error);
      return {
        totalFreeDrivers: 0,
        driversByZone: [],
        averageQueuePosition: 0
      };
    }
  }
}

export const orderAssignmentService = new OrderAssignmentService();
