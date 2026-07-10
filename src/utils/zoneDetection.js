function isPointInPolygon(point, polygon) {
  let inside = false;
  const x = point.lng;
  const y = point.lat;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersect = ((yi > y) !== (yj > y)) &&
      (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }

  return inside;
}

export function createZoneDetection({ safeQuery }) {
  async function detectZoneFromCoordinates(latitude, longitude) {
    try {
      const zones = await safeQuery(
        'SELECT id, number, coordinates FROM zones WHERE is_active = true'
      );

      if (!zones || zones.length === 0) {
        console.log('[Zone Detection] No active zones found');
        return null;
      }

      const point = { lat: latitude, lng: longitude };

      for (const zone of zones) {
        let coordinates;
        try {
          coordinates = typeof zone.coordinates === 'string'
            ? JSON.parse(zone.coordinates)
            : zone.coordinates;
        } catch {
          console.error('[Zone Detection] Failed to parse coordinates for zone:', zone.number);
          continue;
        }

        if (isPointInPolygon(point, coordinates)) {
          console.log(`[Zone Detection] Point (${latitude}, ${longitude}) is in zone ${zone.number}`);
          return zone.number;
        }
      }

      console.log(`[Zone Detection] Point (${latitude}, ${longitude}) is not in any zone`);
      return null;
    } catch (error) {
      console.error('[Zone Detection] Error:', error.message);
      return null;
    }
  }

  return { detectZoneFromCoordinates, isPointInPolygon };
}
