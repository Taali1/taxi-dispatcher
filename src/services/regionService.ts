import { Region, TaxiCode } from '../types';
import { dataSourceService } from './dataSourceService';

const STORAGE_KEY = 'taxi_regions_data';

interface RegionsData {
  regions: Region[];
  taxiCodes: TaxiCode[];
}

class RegionService {
  private cache: RegionsData = { regions: [], taxiCodes: [] };
  private isInitialized = false;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    await this.loadData();
    this.isInitialized = true;

    dataSourceService.onDataChange((table) => {
      if (table === 'regions' || table === 'taxi_codes') {
        this.loadData();
      }
    });

    dataSourceService.onConfigChange(() => {
      console.log('[RegionService] Config changed, reloading data...');
      this.loadData();
    });
  }

  private async loadData() {
    if (dataSourceService.isUsingExternalDatabase()) {
      await this.loadFromExternalDatabase();
    } else {
      this.migrateFromZonesData();
      this.cache = this.loadFromStorage();
    }
  }

  private async loadFromExternalDatabase() {
    try {
      const [regionsResult, codesResult] = await Promise.all([
        dataSourceService.getAll<Region>('regions'),
        dataSourceService.getAll<TaxiCode>('taxi_codes')
      ]);

      if (regionsResult.success && regionsResult.data) {
        this.cache.regions = regionsResult.data;
      }

      if (codesResult.success && codesResult.data) {
        this.cache.taxiCodes = codesResult.data;
      }

      console.log('[RegionService] Loaded from external DB:', {
        regions: this.cache.regions.length,
        taxiCodes: this.cache.taxiCodes.length
      });
    } catch (error) {
      console.error('[RegionService] Error loading from external DB:', error);
      this.cache = this.loadFromStorage();
    }
  }

  private generateTaxiCodesForRegion(region: Region, codesPerRegion: number = 10): TaxiCode[] {
    const taxiCodes: TaxiCode[] = [];
    const timestamp = new Date().toISOString();

    for (let i = 1; i <= codesPerRegion; i++) {
      const codeNumber = String(i).padStart(2, '0');
      const code = `${region.number}${codeNumber}`;

      taxiCodes.push({
        id: `taxi_${region.id}_${i}_${Date.now()}`,
        code: code,
        region_id: region.id,
        status: 'available',
        created_at: timestamp,
        updated_at: timestamp,
      });
    }

    return taxiCodes;
  }

  private migrateFromZonesData(): void {
    try {
      const existingData = localStorage.getItem(STORAGE_KEY);
      if (existingData) {
        return;
      }

      const zonesData = localStorage.getItem('taxi_zones');
      if (!zonesData) {
        return;
      }

      const zones = JSON.parse(zonesData);
      const regions: Region[] = zones.map((zone: any) => ({
        id: zone.id,
        name: zone.name,
        number: zone.number,
        description: `Rejon ${zone.number}`,
        created_at: zone.createdAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const taxiCodes: TaxiCode[] = [];
      regions.forEach(region => {
        const codes = this.generateTaxiCodesForRegion(region, 10);
        taxiCodes.push(...codes);
      });

      const data: RegionsData = {
        regions,
        taxiCodes,
      };

      this.saveToStorage(data);
      console.log(`Migrated zones data to regions data with ${regions.length} regions and ${taxiCodes.length} taxi codes`);
    } catch (error) {
      console.error('Error migrating zones data:', error);
    }
  }

  private loadFromStorage(): RegionsData {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.error('Error loading regions data:', error);
    }
    return { regions: [], taxiCodes: [] };
  }

  private saveToStorage(data: RegionsData): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving regions data:', error);
    }
  }

  private async saveData(data: RegionsData): Promise<void> {
    this.cache = data;
    this.saveToStorage(data);
  }

  async getRegions(): Promise<Region[]> {
    return this.cache.regions.sort((a, b) => a.number - b.number);
  }

  async getRegionById(id: string): Promise<Region | null> {
    return this.cache.regions.find(r => r.id === id) || null;
  }

  async createRegion(region: Omit<Region, 'id' | 'created_at' | 'updated_at'>): Promise<Region> {
    const newRegion: Region = {
      ...region,
      id: `region_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (dataSourceService.isUsingExternalDatabase()) {
      await dataSourceService.insert('regions', newRegion);
    }

    this.cache.regions.push(newRegion);
    await this.saveData(this.cache);
    return newRegion;
  }

  async updateRegion(id: string, updates: Partial<Omit<Region, 'id' | 'created_at' | 'updated_at'>>): Promise<Region> {
    const index = this.cache.regions.findIndex(r => r.id === id);
    if (index === -1) {
      throw new Error('Region not found');
    }

    this.cache.regions[index] = {
      ...this.cache.regions[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (dataSourceService.isUsingExternalDatabase()) {
      await dataSourceService.update('regions', id, updates);
    }

    await this.saveData(this.cache);
    return this.cache.regions[index];
  }

  async deleteRegion(id: string): Promise<void> {
    if (dataSourceService.isUsingExternalDatabase()) {
      await dataSourceService.delete('regions', id);
      const codesToDelete = this.cache.taxiCodes.filter(tc => tc.region_id === id);
      for (const code of codesToDelete) {
        await dataSourceService.delete('taxi_codes', code.id);
      }
    }

    this.cache.regions = this.cache.regions.filter(r => r.id !== id);
    this.cache.taxiCodes = this.cache.taxiCodes.filter(tc => tc.region_id !== id);
    await this.saveData(this.cache);
  }

  async getTaxiCodes(): Promise<TaxiCode[]> {
    return this.cache.taxiCodes.map(code => {
      const region = this.cache.regions.find(r => r.id === code.region_id);
      return { ...code, region };
    }).sort((a, b) => a.code.localeCompare(b.code));
  }

  async getTaxiCodesByRegion(regionId: string): Promise<TaxiCode[]> {
    return this.cache.taxiCodes
      .filter(tc => tc.region_id === regionId)
      .map(code => {
        const region = this.cache.regions.find(r => r.id === code.region_id);
        return { ...code, region };
      })
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  async createTaxiCode(taxiCode: Omit<TaxiCode, 'id' | 'created_at' | 'updated_at' | 'region'>): Promise<TaxiCode> {
    const newCode: TaxiCode = {
      ...taxiCode,
      id: `taxi_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (dataSourceService.isUsingExternalDatabase()) {
      await dataSourceService.insert('taxi_codes', newCode);
    }

    const region = this.cache.regions.find(r => r.id === newCode.region_id);
    this.cache.taxiCodes.push(newCode);
    await this.saveData(this.cache);
    return { ...newCode, region };
  }

  async updateTaxiCode(id: string, updates: Partial<Omit<TaxiCode, 'id' | 'created_at' | 'updated_at' | 'region'>>): Promise<TaxiCode> {
    const index = this.cache.taxiCodes.findIndex(tc => tc.id === id);
    if (index === -1) {
      throw new Error('Taxi code not found');
    }

    this.cache.taxiCodes[index] = {
      ...this.cache.taxiCodes[index],
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (dataSourceService.isUsingExternalDatabase()) {
      await dataSourceService.update('taxi_codes', id, updates);
    }

    const region = this.cache.regions.find(r => r.id === this.cache.taxiCodes[index].region_id);
    await this.saveData(this.cache);
    return { ...this.cache.taxiCodes[index], region };
  }

  async deleteTaxiCode(id: string): Promise<void> {
    if (dataSourceService.isUsingExternalDatabase()) {
      await dataSourceService.delete('taxi_codes', id);
    }

    this.cache.taxiCodes = this.cache.taxiCodes.filter(tc => tc.id !== id);
    await this.saveData(this.cache);
  }

  async getRegionsWithTaxiCodes(): Promise<(Region & { taxiCodes: TaxiCode[] })[]> {
    console.log('RegionService - Loading regions with codes:', {
      regionsCount: this.cache.regions.length,
      taxiCodesCount: this.cache.taxiCodes.length,
    });

    return this.cache.regions
      .sort((a, b) => a.number - b.number)
      .map(region => ({
        ...region,
        taxiCodes: this.cache.taxiCodes
          .filter(code => code.region_id === region.id)
          .sort((a, b) => a.code.localeCompare(b.code)),
      }));
  }

  async generateCodesForRegion(regionId: string, count: number = 10): Promise<TaxiCode[]> {
    const region = this.cache.regions.find(r => r.id === regionId);

    if (!region) {
      throw new Error('Region not found');
    }

    const existingCodes = this.cache.taxiCodes.filter(tc => tc.region_id === regionId);
    const startNumber = existingCodes.length + 1;
    const timestamp = new Date().toISOString();
    const newCodes: TaxiCode[] = [];

    for (let i = 0; i < count; i++) {
      const codeNumber = String(startNumber + i).padStart(2, '0');
      const code = `${region.number}${codeNumber}`;

      const newCode: TaxiCode = {
        id: `taxi_${regionId}_${startNumber + i}_${Date.now()}`,
        code: code,
        region_id: regionId,
        status: 'available',
        created_at: timestamp,
        updated_at: timestamp,
      };

      if (dataSourceService.isUsingExternalDatabase()) {
        await dataSourceService.insert('taxi_codes', newCode);
      }

      newCodes.push(newCode);
      this.cache.taxiCodes.push(newCode);
    }

    await this.saveData(this.cache);
    return newCodes;
  }

  async refresh(): Promise<void> {
    await this.loadData();
  }
}

export const regionService = new RegionService();
