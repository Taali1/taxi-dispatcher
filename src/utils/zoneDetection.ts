interface ZonePoint {
  id: number;
  name: string;
  coordinates: { lat: number; lng: number }[];
}

export class ZoneDetectionService {
  private zones: ZonePoint[];

  constructor(zones: ZonePoint[]) {
    this.zones = zones;
  }

  detectZoneFromAddress(address: string): number | null {
    if (!address) return null;
    const addressLower = address.toLowerCase();

    // 1. Dopasuj po nazwie strefy z DB (najwyższy priorytet)
    for (const zone of this.zones) {
      if (zone.name && addressLower.includes(zone.name.toLowerCase())) {
        return zone.id;
      }
    }

    // 2. Keyword fallback — zwróć wynik TYLKO jeśli numer istnieje w this.zones
    const validZoneIds = new Set(this.zones.map(z => z.id));
    const zoneKeywords: Record<number, string[]> = {
      1:  ['stare miasto', 'rynek główny', 'floriańska'],
      2:  ['kazimierz', 'szeroka', 'józefa'],
      3:  ['podgórze', 'wielicka', 'kalwaryjska'],
      4:  ['krowodrza', 'słowackiego', 'manifestu'],
      5:  ['grzegórzki', 'dietla', 'dąbrowskiego'],
      6:  ['prądnik', 'opolska', 'rakowicka'],
      7:  ['nowa huta', 'powstańców', 'bieńczycka'],
      8:  ['salwator', 'kościuszki', 'zwierzyniecka'],
      9:  ['dębniki', 'zakrzówek', 'tyniecka'],
      10: ['mistrzejowice', 'os. tysiąclecia'],
      11: ['bieńczyce', 'igołomska'],
      12: ['jagiellońska', 'mogilska', 'botaniczna'],
    };

    for (const [zoneNum, keywords] of Object.entries(zoneKeywords)) {
      const id = parseInt(zoneNum);
      if (validZoneIds.has(id) && keywords.some(kw => addressLower.includes(kw))) {
        return id;
      }
    }

    return null;
  }

  detectZoneFromCoordinates(lat: number, lng: number): number | null {
    // Point-in-polygon algorithm for precise zone detection
    for (const zone of this.zones) {
      if (this.isPointInPolygon({ lat, lng }, zone.coordinates)) {
        return zone.id;
      }
    }
    
    return null;
  }

  private isPointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].lat;
      const yi = polygon[i].lng;
      const xj = polygon[j].lat;
      const yj = polygon[j].lng;
      
      if (((yi > point.lng) !== (yj > point.lng)) && 
          (point.lat < (xj - xi) * (point.lng - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    
    return inside;
  }
}