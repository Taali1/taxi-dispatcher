import { Driver, Order, Zone, AssignmentRule } from '../types';

export class OrderAssignmentEngine {
  private drivers: Driver[];
  private zones: Zone[];
  private rules: AssignmentRule;

  constructor(drivers: Driver[], zones: Zone[], rules: AssignmentRule) {
    this.drivers = drivers;
    this.zones = zones;
    this.rules = rules;
  }

  assignOrder(order: Order): { driver: Driver | null; reason: string } {
    // 1. Find drivers in the pickup zone
    const zoneDrivers = this.getAvailableDriversInZone(order.pickupZone!);
    
    if (zoneDrivers.length > 0) {
      const driver = this.selectBestDriver(zoneDrivers, order.vehicleCategory);
      if (driver) {
        return { driver, reason: `Przydzielono kierowcę z rejonu ${order.pickupZone}` };
      }
    }

    // 2. Search in fallback zones
    for (const fallbackZone of this.rules.fallbackZones) {
      const fallbackDrivers = this.getAvailableDriversInZone(fallbackZone);
      if (fallbackDrivers.length > 0) {
        const driver = this.selectBestDriver(fallbackDrivers, order.vehicleCategory);
        if (driver) {
          return { driver, reason: `Przydzielono kierowcę z rejonu zapasowego ${fallbackZone}` };
        }
      }
    }

    // 3. Send to marketplace if enabled
    if (this.rules.marketplaceEnabled) {
      return { driver: null, reason: 'Zlecenie wysłane na giełdę - brak dostępnych kierowców' };
    }

    return { driver: null, reason: 'Nie znaleziono dostępnego kierowcy' };
  }

  private getAvailableDriversInZone(zoneId: number): Driver[] {
    return this.drivers.filter(driver =>
      driver.currentZone === zoneId &&
      driver.status === 'free'
    ).sort((a, b) => {
      if (a.queuePosition && b.queuePosition) {
        return a.queuePosition - b.queuePosition;
      }
      return 0;
    });
  }

  private selectBestDriver(drivers: Driver[], requiredCategory: string): Driver | null {
    // Find driver with matching category and lowest queue position
    const matchingDrivers = drivers.filter(driver =>
      driver.vehicleCategory.includes(requiredCategory)
    );

    if (matchingDrivers.length === 0) return null;

    return matchingDrivers.reduce((best, current) =>
      current.queuePosition < best.queuePosition ? current : best
    );
  }

  calculateDistance(pickupZone: number, destinationZone: number): number {
    // Mock distance calculation - in real app would use mapping API
    return Math.random() * 15 + 2;
  }

  calculateCost(distance: number, category: string, pricingRules: any): number {
    const baseFare = pricingRules[category]?.baseFare || 8.0;
    const perKmRate = pricingRules[category]?.perKmRate || 2.5;
    
    return baseFare + (distance * perKmRate);
  }
}