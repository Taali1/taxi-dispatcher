import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Polygon, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-draw';
import 'leaflet-draw/dist/leaflet.draw.css';
import { Plus, Download, MapPin, Edit, Trash2, Save, X, AlertCircle, Loader } from 'lucide-react';
import { zoneService, Zone } from '../../services/zoneService';
import { dataSourceService } from '../../services/dataSourceService';

interface CityBoundary {
  id: string;
  name: string;
  color: string;
  coordinates: { lat: number; lng: number }[];
  createdAt: string;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface DrawControlProps {
  onPolygonCreated: (coordinates: { lat: number; lng: number }[]) => void;
  isDrawing: boolean;
  editingCoordinates?: { lat: number; lng: number }[] | null;
  existingZones: Zone[];
  undoRef?: React.MutableRefObject<(() => void) | null>;
}

const DrawControl: React.FC<DrawControlProps> = ({ onPolygonCreated, isDrawing, editingCoordinates, existingZones, undoRef }) => {
  const map = useMap();
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawControlRef = useRef<L.Control.Draw | null>(null);
  const snapMarkersRef = useRef<L.CircleMarker[]>([]);
  const isDrawingPolygonRef = useRef<boolean>(false);
  const currentPointsRef = useRef<L.LatLng[]>([]);
  const tempLinesRef = useRef<L.Polyline[]>([]);
  const tempMarkersRef = useRef<L.CircleMarker[]>([]);
  const isSnapClosingRef = useRef<boolean>(false);

  // Funkcja do znalezienia najbliższego wierzchołka — próg w PIKSELACH (nie metrach)
  // Dzięki temu czułość snap nie zależy od zoomu; 20px = wygodny snap bez nadmiernego przyciągania
  const findNearestVertex = (latlng: L.LatLng, thresholdPx: number = 20): L.LatLng | null => {
    let nearest: L.LatLng | null = null;
    let minDistance = thresholdPx;
    const pc = map.latLngToContainerPoint(latlng);

    existingZones.forEach(zone => {
      zone.coordinates.forEach(coord => {
        const vertex = L.latLng(coord.lat, coord.lng);
        const pv = map.latLngToContainerPoint(vertex);
        const distance = Math.sqrt(Math.pow(pc.x - pv.x, 2) + Math.pow(pc.y - pv.y, 2));
        if (distance < minDistance) {
          minDistance = distance;
          nearest = vertex;
        }
      });
    });

    return nearest;
  };

  // Funkcja do czyszczenia tymczasowych elementów
  const clearTempDrawing = () => {
    tempLinesRef.current.forEach(line => map.removeLayer(line));
    tempLinesRef.current = [];
    tempMarkersRef.current.forEach(marker => map.removeLayer(marker));
    tempMarkersRef.current = [];
    currentPointsRef.current = [];
    isDrawingPolygonRef.current = false;
  };

  // Cofnij ostatni punkt (Backspace / Ctrl+Z)
  const undoLastPoint = () => {
    if (currentPointsRef.current.length === 0) return;
    // Usuń ostatni marker
    const lastMarker = tempMarkersRef.current.pop();
    if (lastMarker) map.removeLayer(lastMarker);
    // Usuń ostatnią linię łączącą (jest o 1 mniej niż markerów)
    const lastLine = tempLinesRef.current.pop();
    if (lastLine) map.removeLayer(lastLine);
    // Usuń ostatni punkt
    currentPointsRef.current.pop();
    // Jeśli nie ma już żadnych punktów — wyjdź z trybu rysowania
    if (currentPointsRef.current.length === 0) {
      isDrawingPolygonRef.current = false;
    }
  };

  // Pomocnik: odległość w pikselach między dwoma punktami mapy
  const pixelDistance = (a: L.LatLng, b: L.LatLng): number => {
    const pa = map.latLngToContainerPoint(a);
    const pb = map.latLngToContainerPoint(b);
    return Math.sqrt(Math.pow(pa.x - pb.x, 2) + Math.pow(pa.y - pb.y, 2));
  };

  // Funkcja do dodania punktu
  const addPoint = (latlng: L.LatLng) => {
    const snapped = findNearestVertex(latlng) || latlng;

    // Zamknij polygon jeśli kursor był w strefie snap do pierwszego punktu
    if (currentPointsRef.current.length >= 3 && isSnapClosingRef.current) {
      finishPolygon();
      return;
    }

    currentPointsRef.current.push(snapped);

    // Dodaj marker na punkcie
    const marker = L.circleMarker(snapped, {
      radius: 6,
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: 0.8,
      weight: 2,
    });

    // Jeśli to pierwszy punkt, zrób go klikalny do zamykania
    if (currentPointsRef.current.length === 1) {
      marker.setStyle({
        radius: 8,
        weight: 3,
      });
      marker.bindTooltip('Kliknij ponownie aby zamknąć', {
        permanent: false,
        direction: 'top',
      });
      marker.on('click', (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e);
        if (currentPointsRef.current.length >= 3) {
          finishPolygon();
        }
      });
    }

    marker.addTo(map);
    tempMarkersRef.current.push(marker);

    // Jeśli mamy więcej niż 1 punkt, narysuj linię
    if (currentPointsRef.current.length > 1) {
      const lastTwo = currentPointsRef.current.slice(-2);
      const line = L.polyline(lastTwo, {
        color: '#ef4444',
        weight: 2,
        dashArray: '5, 5',
      });
      line.addTo(map);
      tempLinesRef.current.push(line);
    }
  };

  // Funkcja do zakończenia rysowania
  const finishPolygon = () => {
    if (currentPointsRef.current.length >= 3) {
      const coordinates = currentPointsRef.current.map(p => ({
        lat: p.lat,
        lng: p.lng,
      }));
      onPolygonCreated(coordinates);
      clearTempDrawing();
    }
  };

  // Obsługa ruchu myszy - podgląd linii
  useEffect(() => {
    if (!isDrawing) return;

    let previewLine: L.Polyline | null = null;
    let closingLine: L.Polyline | null = null;

    const handleMouseMove = (e: L.LeafletMouseEvent) => {
      if (isDrawingPolygonRef.current && currentPointsRef.current.length > 0) {
        const lastPoint = currentPointsRef.current[currentPointsRef.current.length - 1];
        const firstPoint = currentPointsRef.current[0];

        // Sprawdź czy kursor jest blisko pierwszego punktu (snap zamykający)
        const pts = currentPointsRef.current.length;
        const pa = map.latLngToContainerPoint(firstPoint);
        const pc = map.latLngToContainerPoint(e.latlng);
        const pxDist = Math.sqrt(Math.pow(pa.x - pc.x, 2) + Math.pow(pa.y - pc.y, 2));
        const isSnappingToClose = pts >= 3 && pxDist < 15;
        isSnapClosingRef.current = isSnappingToClose;

        // Użyj pierwszego punktu jako celu jeśli snap zamykający, inaczej snap do wierzchołka
        const snapped = isSnappingToClose
          ? firstPoint
          : (findNearestVertex(e.latlng) || e.latlng);

        // Usuń stare linie podglądu
        if (previewLine) map.removeLayer(previewLine);
        if (closingLine) map.removeLayer(closingLine);

        // Linia od ostatniego punktu do kursora (zielona gdy snap zamykający)
        previewLine = L.polyline([lastPoint, snapped], {
          color: isSnappingToClose ? '#10b981' : '#ef4444',
          weight: isSnappingToClose ? 3 : 2,
          dashArray: '10, 5',
          opacity: isSnappingToClose ? 0.9 : 0.5,
        });
        previewLine.addTo(map);

        // Linia zamykająca do pierwszego punktu (gdy 2+ punkty i nie snapujemy już)
        if (pts >= 2 && !isSnappingToClose) {
          closingLine = L.polyline([snapped, firstPoint], {
            color: '#10b981',
            weight: 2,
            dashArray: '10, 5',
            opacity: 0.4,
          });
          closingLine.addTo(map);
        }
      }
    };

    map.on('mousemove', handleMouseMove);

    return () => {
      map.off('mousemove', handleMouseMove);
      if (previewLine) {
        map.removeLayer(previewLine);
      }
      if (closingLine) {
        map.removeLayer(closingLine);
      }
    };
  }, [isDrawing, map]);

  useEffect(() => {
    if (!drawnItemsRef.current) {
      drawnItemsRef.current = new L.FeatureGroup();
      map.addLayer(drawnItemsRef.current);
    }

    // Dodaj markery na istniejących wierzchołkach
    if (isDrawing) {
      // Usuń stare markery
      snapMarkersRef.current.forEach(marker => map.removeLayer(marker));
      snapMarkersRef.current = [];

      // Dodaj klikalne markery na istniejących wierzchołkach
      existingZones.forEach(zone => {
        zone.coordinates.forEach(coord => {
          const marker = L.circleMarker([coord.lat, coord.lng], {
            radius: 7,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.7,
            weight: 3,
          });

          // Dodaj tooltip
          marker.bindTooltip('Kliknij aby przypiąć', {
            permanent: false,
            direction: 'top',
          });

          // Dodaj obsługę kliknięcia
          marker.on('click', () => {
            if (isDrawingPolygonRef.current) {
              addPoint(L.latLng(coord.lat, coord.lng));
            }
          });

          marker.addTo(map);
          snapMarkersRef.current.push(marker);
        });
      });

      // Obsługa kliknięć na mapie
      const handleMapClick = (e: L.LeafletMouseEvent) => {
        if (!isDrawingPolygonRef.current) {
          // Rozpocznij rysowanie
          isDrawingPolygonRef.current = true;
        }
        addPoint(e.latlng);
      };

      const handleMapDblClick = (e: L.LeafletMouseEvent) => {
        if (isDrawingPolygonRef.current) {
          e.originalEvent.preventDefault();
          e.originalEvent.stopPropagation();
          finishPolygon();
        }
      };

      const handleKeyPress = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && isDrawingPolygonRef.current) {
          finishPolygon();
        } else if (e.key === 'Escape') {
          clearTempDrawing();
        } else if (
          (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) &&
          isDrawingPolygonRef.current
        ) {
          e.preventDefault();
          undoLastPoint();
        }
      };

      map.on('click', handleMapClick);
      map.on('dblclick', handleMapDblClick);
      document.addEventListener('keydown', handleKeyPress);

      return () => {
        map.off('click', handleMapClick);
        map.off('dblclick', handleMapDblClick);
        document.removeEventListener('keydown', handleKeyPress);
        snapMarkersRef.current.forEach(marker => map.removeLayer(marker));
        snapMarkersRef.current = [];
        clearTempDrawing();
      };
    } else {
      // Usuń markery gdy nie rysujemy
      snapMarkersRef.current.forEach(marker => map.removeLayer(marker));
      snapMarkersRef.current = [];
      clearTempDrawing();
    }
  }, [map, onPolygonCreated, isDrawing, existingZones]);

  useEffect(() => {
    if (editingCoordinates && drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
      const latLngs = editingCoordinates.map(coord => [coord.lat, coord.lng] as [number, number]);
      const polygon = L.polygon(latLngs);
      drawnItemsRef.current.addLayer(polygon);
    }
  }, [editingCoordinates]);

  // Udostępnij undoLastPoint przez ref żeby rodzic mógł wywołać z przycisku
  if (undoRef) undoRef.current = undoLastPoint;

  return null;
};

// ─── BoundaryDrawControl ──────────────────────────────────────────────────────
interface BoundaryDrawControlProps {
  isActive: boolean;
  color: string;
  initialCoords?: { lat: number; lng: number }[];
  onCreated: (coords: { lat: number; lng: number }[]) => void;
  undoRef?: React.MutableRefObject<(() => void) | null>;
}

const BoundaryDrawControl: React.FC<BoundaryDrawControlProps> = ({ isActive, color, initialCoords, onCreated, undoRef }) => {
  const map = useMap();
  const pointsRef = useRef<L.LatLng[]>([]);
  const markersRef = useRef<L.CircleMarker[]>([]);
  const polylineRef = useRef<L.Polyline | null>(null);
  const previewRef = useRef<L.Polygon | null>(null);
  const loadedRef = useRef(false);

  const updateVisuals = () => {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = pointsRef.current.map((pt, i) =>
      L.circleMarker(pt, { radius: i === 0 ? 9 : 5, color: i === 0 ? '#fff' : color, fillColor: color, fillOpacity: 1, weight: 2 }).addTo(map)
    );
    polylineRef.current?.remove();
    if (pointsRef.current.length > 1) polylineRef.current = L.polyline(pointsRef.current, { color, weight: 3 }).addTo(map);
    previewRef.current?.remove();
    if (pointsRef.current.length >= 3) previewRef.current = L.polygon(pointsRef.current, { color, fillColor: color, fillOpacity: 0.15, weight: 2, dashArray: '8,4' }).addTo(map);
  };

  const cleanup = () => {
    markersRef.current.forEach(m => m.remove()); markersRef.current = [];
    polylineRef.current?.remove(); polylineRef.current = null;
    previewRef.current?.remove(); previewRef.current = null;
    pointsRef.current = [];
    loadedRef.current = false;
  };

  useEffect(() => {
    if (!isActive) { cleanup(); return; }
    if (initialCoords && initialCoords.length > 0 && !loadedRef.current) {
      loadedRef.current = true;
      pointsRef.current = initialCoords.map(c => L.latLng(c.lat, c.lng));
      updateVisuals();
    }
  }, [isActive]);

  useEffect(() => {
    if (!undoRef) return;
    undoRef.current = () => {
      if (pointsRef.current.length === 0) return;
      pointsRef.current = pointsRef.current.slice(0, -1);
      updateVisuals();
    };
    return () => { if (undoRef) undoRef.current = null; };
  });

  useMapEvents({
    click(e) {
      if (!isActive) return;
      const pt = e.latlng;
      if (pointsRef.current.length >= 3) {
        const fp = map.latLngToContainerPoint(pointsRef.current[0]);
        const cp = map.latLngToContainerPoint(pt);
        if (Math.hypot(cp.x - fp.x, cp.y - fp.y) < 20) {
          const coords = pointsRef.current.map(ll => ({ lat: ll.lat, lng: ll.lng }));
          cleanup(); onCreated(coords); return;
        }
      }
      pointsRef.current = [...pointsRef.current, pt];
      updateVisuals();
    },
    dblclick(e) {
      if (!isActive || pointsRef.current.length < 3) return;
      L.DomEvent.stop(e);
      const coords = pointsRef.current.map(ll => ({ lat: ll.lat, lng: ll.lng }));
      cleanup(); onCreated(coords);
    },
  });

  return null;
};

const ZoneManagement: React.FC = () => {
  const [zones, setZones] = useState<Zone[]>([]);
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [currentPolygon, setCurrentPolygon] = useState<{ lat: number; lng: number }[]>([]);
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [mapCenter] = useState<[number, number]>([50.0647, 19.9450]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoneForm, setZoneForm] = useState({
    name: '',
    number: 1,
    scheduledDispatchMinutes: 10,
  });
  const [showCoordsPanel, setShowCoordsPanel] = useState(false);
  const [coordsText, setCoordsText] = useState('');
  const [cityBoundaries, setCityBoundaries] = useState<CityBoundary[]>([]);
  const [showBoundaryPanel, setShowBoundaryPanel] = useState(false);
  const [editingBoundary, setEditingBoundary] = useState<CityBoundary | null>(null);
  const [boundaryForm, setBoundaryForm] = useState({ name: '', color: '#f97316' });
  const [boundaryCoordsText, setBoundaryCoordsText] = useState('');
  const [isSavingBoundary, setIsSavingBoundary] = useState(false);
  const [isBoundaryDrawingMode, setIsBoundaryDrawingMode] = useState(false);
  const [boundaryDrawCoords, setBoundaryDrawCoords] = useState<{ lat: number; lng: number }[]>([]);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ type: 'zone' | 'boundary'; id: string; name: string; zoneNumber?: number } | null>(null);
  const undoDrawRef = useRef<(() => void) | null>(null);
  const undoBoundaryDrawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    loadZones();
    loadCityBoundaries();

    const unsubscribe = dataSourceService.onConfigChange(() => {
      loadZones();
      loadCityBoundaries();
    });

    return unsubscribe;
  }, []);

  const loadZones = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const zonesData = await zoneService.getZones();
      setZones(zonesData);
    } catch (error) {
      console.error('Error loading zones:', error);
      setError('Błąd podczas ładowania rejonów');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCityBoundaries = async () => {
    try {
      const res = await fetch('/api/city-boundaries');
      const data = await res.json();
      if (data.success) {
        setCityBoundaries(data.data.map((b: any) => ({
          id: b.id,
          name: b.name,
          color: b.color || '#f97316',
          coordinates: (() => {
            try { return typeof b.coordinates === 'string' ? JSON.parse(b.coordinates) : b.coordinates; }
            catch { return []; }
          })(),
          createdAt: b.created_at,
        })));
      }
    } catch { /* cicha obsługa */ }
  };

  // Sprawdź czy dwa punkty są identyczne (z małą tolerancją)
  const arePointsEqual = (p1: { lat: number; lng: number }, p2: { lat: number; lng: number }, tolerance: number = 0.000001): boolean => {
    return Math.abs(p1.lat - p2.lat) < tolerance && Math.abs(p1.lng - p2.lng) < tolerance;
  };

  // Sprawdź czy punkt leży na krawędzi (wspólna granica jest OK)
  const isPointOnEdge = (point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[], tolerance: number = 0.000001): boolean => {
    for (let i = 0; i < polygon.length; i++) {
      const p1 = polygon[i];
      const p2 = polygon[(i + 1) % polygon.length];

      // Sprawdź czy punkt leży na odcinku między p1 i p2
      const dist1 = Math.sqrt(Math.pow(p1.lat - point.lat, 2) + Math.pow(p1.lng - point.lng, 2));
      const dist2 = Math.sqrt(Math.pow(p2.lat - point.lat, 2) + Math.pow(p2.lng - point.lng, 2));
      const edgeLength = Math.sqrt(Math.pow(p2.lat - p1.lat, 2) + Math.pow(p2.lng - p1.lng, 2));

      if (Math.abs(dist1 + dist2 - edgeLength) < tolerance) {
        return true;
      }
    }
    return false;
  };

  // Sprawdź czy polygon przecina się z innymi rejonami
  const checkPolygonOverlap = (newCoords: { lat: number; lng: number }[], excludeZoneId?: string): boolean => {
    const newPolygon = L.polygon(newCoords.map(c => [c.lat, c.lng] as [number, number]));
    const newBounds = newPolygon.getBounds();

    for (const zone of zones) {
      if (excludeZoneId && zone.id === excludeZoneId) continue;

      const existingPolygon = L.polygon(zone.coordinates.map(c => [c.lat, c.lng] as [number, number]));
      const existingBounds = existingPolygon.getBounds();

      // Szybki test bounding boxów — jeśli się nie przecinają, pomijamy
      if (!newBounds.intersects(existingBounds)) continue;

      const newPoints     = newCoords.map(c => L.latLng(c.lat, c.lng));
      const existingPoints = zone.coordinates.map(c => L.latLng(c.lat, c.lng));

      // Sprawdź 1: czy wierzchołek NOWEGO rejonu leży WEWNĄTRZ istniejącego
      // (pomijamy wierzchołki wspólne i punkty leżące dokładnie na granicy)
      for (const point of newPoints) {
        const pc = { lat: point.lat, lng: point.lng };
        const isShared = zone.coordinates.some(ep => arePointsEqual(pc, ep));
        if (!isShared && !isPointOnEdge(pc, zone.coordinates)) {
          if (isPointInPolygon(point, zone.coordinates)) return true;
        }
      }

      // Sprawdź 2: czy wierzchołek ISTNIEJĄCEGO rejonu leży WEWNĄTRZ nowego
      for (const point of existingPoints) {
        const pc = { lat: point.lat, lng: point.lng };
        const isShared = newCoords.some(np => arePointsEqual(pc, np));
        if (!isShared && !isPointOnEdge(pc, newCoords)) {
          if (isPointInPolygon(point, newCoords)) return true;
        }
      }

      // Sprawdź 3: właściwe przecięcie krawędzi (krzyżują się w punkcie wewnętrznym)
      // Wspólne wierzchołki i koliniarne krawędzie (przylegające rejony) → NIE są przecięciem
      for (let i = 0; i < newCoords.length; i++) {
        const p1 = newCoords[i];
        const p2 = newCoords[(i + 1) % newCoords.length];
        for (let j = 0; j < zone.coordinates.length; j++) {
          const p3 = zone.coordinates[j];
          const p4 = zone.coordinates[(j + 1) % zone.coordinates.length];
          if (doSegmentsProperlyIntersect(p1, p2, p3, p4)) return true;
        }
      }
    }

    return false;
  };

  // Algorytm Ray Casting do sprawdzenia czy punkt jest w polygonie
  const isPointInPolygon = (point: L.LatLng, polygon: { lat: number; lng: number }[]): boolean => {
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
  };

  // Iloczyn wektorowy 2D — po której stronie prostej O→A leży punkt B
  // > 0: lewa strona, < 0: prawa strona, = 0: kolinearny
  const cross2D = (
    O: { lat: number; lng: number },
    A: { lat: number; lng: number },
    B: { lat: number; lng: number }
  ): number =>
    (A.lat - O.lat) * (B.lng - O.lng) - (A.lng - O.lng) * (B.lat - O.lat);

  // Zwraca true TYLKO gdy odcinki właściwie się przecinają (krzyżują w punkcie wewnętrznym).
  // Wspólne wierzchołki, styk końców, koliniarne/nakładające się odcinki → false.
  // Dzięki temu przylegające rejony (wspólna krawędź lub wspólny wierzchołek) są dozwolone.
  const doSegmentsProperlyIntersect = (
    p1: { lat: number; lng: number },
    p2: { lat: number; lng: number },
    p3: { lat: number; lng: number },
    p4: { lat: number; lng: number }
  ): boolean => {
    const d1 = cross2D(p3, p4, p1);
    const d2 = cross2D(p3, p4, p2);
    const d3 = cross2D(p1, p2, p3);
    const d4 = cross2D(p1, p2, p4);
    // Ścisłe nierówności: = 0 (kolinearny lub styk wierzchołka) → false
    return (
      ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
  };

  const handlePolygonCreated = (coordinates: { lat: number; lng: number }[]) => {
    // Sprawdź czy nowy rejon nakłada się na istniejące
    if (checkPolygonOverlap(coordinates)) {
      setError('Nowy rejon nakłada się na istniejący rejon. Rejony nie mogą się przecinać.');
      setIsDrawingMode(false);
      return;
    }

    setCurrentPolygon(coordinates);
    setShowZoneForm(true);
    setIsDrawingMode(false);
    setError(null);
  };

  const calculatePolygonCenter = (coordinates: { lat: number; lng: number }[]) => {
    const lat = coordinates.reduce((sum, coord) => sum + coord.lat, 0) / coordinates.length;
    const lng = coordinates.reduce((sum, coord) => sum + coord.lng, 0) / coordinates.length;
    return { lat, lng };
  };

  const handleSaveZone = async (e: React.FormEvent) => {
    e.preventDefault();

    if (currentPolygon.length < 3) {
      setError('Rejon musi mieć minimum 3 punkty');
      return;
    }

    if (zones.some(z => z.number === zoneForm.number && (!editingZone || z.id !== editingZone.id))) {
      setError('Rejon o tym numerze już istnieje');
      return;
    }

    // Sprawdź nakładanie się rejonów (pomijając edytowany rejon)
    if (checkPolygonOverlap(currentPolygon, editingZone?.id)) {
      setError('Rejon nakłada się na inny istniejący rejon. Rejony nie mogą się przecinać.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      if (editingZone) {
        await zoneService.updateZone(editingZone.id, {
          name: zoneForm.name,
          number: zoneForm.number,
          coordinates: currentPolygon,
          scheduledDispatchMinutes: zoneForm.scheduledDispatchMinutes,
        });
      } else {
        await zoneService.createZone({
          name: zoneForm.name,
          number: zoneForm.number,
          coordinates: currentPolygon,
          driversCount: 0,
          scheduledDispatchMinutes: zoneForm.scheduledDispatchMinutes,
        });
      }

      await loadZones();
      setShowZoneForm(false);
      setEditingZone(null);
      setCurrentPolygon([]);
      setZoneForm({ name: '', number: 1, scheduledDispatchMinutes: 10 });
    } catch (error) {
      console.error('Error saving zone:', error);
      setError(error instanceof Error ? error.message : 'Błąd podczas zapisywania rejonu');
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditZone = (zone: Zone) => {
    setEditingZone(zone);
    setZoneForm({
      name: zone.name,
      number: zone.number,
      scheduledDispatchMinutes: zone.scheduledDispatchMinutes ?? 10,
    });
    setCurrentPolygon(zone.coordinates);
    setShowZoneForm(true);
  };

  const handleDeleteZone = (id: string, name: string, zoneNumber?: number) => {
    setConfirmDelete({ type: 'zone', id, name, zoneNumber });
  };

  const executeConfirmDelete = async () => {
    if (!confirmDelete) return;
    const target = confirmDelete;
    setConfirmDelete(null);
    setError(null);
    try {
      if (target.type === 'zone') {
        await zoneService.deleteZone(target.id);
        // Usuń reguły przydziału dla tego rejonu
        if (target.zoneNumber != null) {
          try {
            await fetch(`/api/admin/zone-rules/${target.zoneNumber}`, { method: 'DELETE' });
          } catch (ruleErr) {
            console.warn('[ZoneManagement] Nie udało się usunąć reguł przydziału dla rejonu', target.zoneNumber);
          }
        }
        await loadZones();
      } else {
        await fetch(`/api/city-boundaries/${target.id}`, { method: 'DELETE' });
        loadCityBoundaries();
      }
    } catch (error) {
      console.error('Error deleting:', error);
      setError(error instanceof Error ? error.message : 'Błąd podczas usuwania');
    }
  };

  const generateSQL = () => {
    const sqlStatements = zones.map(zone => {
      const coordsStr = zone.coordinates.map(c => `${c.lat},${c.lng}`).join(';');
      return `INSERT INTO zones (id, name, number, coordinates, drivers_count, created_at) VALUES ('${zone.id}', '${zone.name}', ${zone.number}, '${coordsStr}', ${zone.driversCount}, '${zone.createdAt}');`;
    }).join('\n');

    const fullSQL = `-- SQL Export for Zones
-- Generated on: ${new Date().toISOString()}

CREATE TABLE IF NOT EXISTS zones (
  id varchar(36) PRIMARY KEY,
  name varchar(100) NOT NULL,
  number int NOT NULL UNIQUE,
  coordinates text NOT NULL,
  drivers_count int DEFAULT 0,
  created_at timestamp DEFAULT CURRENT_TIMESTAMP
);

${sqlStatements}`;

    const blob = new Blob([fullSQL], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'zones_export.sql';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getNextZoneNumber = () => {
    if (zones.length === 0) return 1;
    return Math.max(...zones.map(z => z.number)) + 1;
  };

  const parseCoordsText = (text: string): { lat: number; lng: number }[] => {
    return text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .flatMap(line => {
        const parts = line.split(/[\s,;]+/).filter(p => p.length > 0);
        if (parts.length >= 2) {
          const lat = parseFloat(parts[0].replace(',', '.'));
          const lng = parseFloat(parts[1].replace(',', '.'));
          if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
            return [{ lat, lng }];
          }
        }
        return [];
      });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900/50 border border-red-500 rounded-md p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-red-200 font-medium mb-1">Błąd</h4>
            <p className="text-red-300 text-sm">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Zarządzanie Rejonami</h2>
          <p className="text-gray-300">Definiuj strefy na mapie poprzez rysowanie polygonów</p>
        </div>

        <div className="flex space-x-4">
          <button
            onClick={generateSQL}
            className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
          >
            <Download className="w-4 h-4" />
            <span>Eksport SQL</span>
          </button>

          <button
            onClick={() => {
              setZoneForm({ name: '', number: getNextZoneNumber() });
              setCurrentPolygon([]);
              setEditingZone(null);
              setShowCoordsPanel(false);
              setCoordsText('');
              setIsDrawingMode(true);
            }}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md transition-colors duration-200"
          >
            <Plus className="w-4 h-4" />
            <span>Dodaj rejon</span>
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">Mapa Rejonów</h3>

            <div className="flex space-x-2">
              <button
                onClick={() => {
                  const isOpening = !showBoundaryPanel;
                  setShowBoundaryPanel(isOpening);
                  if (isOpening) {
                    setIsDrawingMode(false);
                    setShowCoordsPanel(false);
                    setEditingBoundary(null);
                    setBoundaryForm({ name: '', color: '#f97316' });
                  }
                  setBoundaryCoordsText('');
                }}
                className={`px-3 py-2 rounded-md text-sm transition-colors duration-200 ${
                  showBoundaryPanel
                    ? 'bg-orange-600 hover:bg-orange-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
              >
                {showBoundaryPanel ? 'Zamknij granicę' : 'Granica miasta'}
              </button>
              <button
                onClick={() => {
                  const isOpening = !showCoordsPanel;
                  setShowCoordsPanel(isOpening);
                  if (isOpening) {
                    setIsDrawingMode(false);
                    setShowBoundaryPanel(false);
                    setEditingZone(null);
                    setZoneForm({ name: '', number: getNextZoneNumber(), scheduledDispatchMinutes: 10 });
                  }
                  setCoordsText('');
                }}
                className={`px-3 py-2 rounded-md text-sm transition-colors duration-200 ${
                  showCoordsPanel
                    ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                    : 'bg-gray-600 hover:bg-gray-700 text-white'
                }`}
              >
                {showCoordsPanel ? 'Zamknij edytor' : 'Wpisz współrzędne'}
              </button>
              <button
                onClick={() => {
                  setIsDrawingMode(!isDrawingMode);
                  if (!isDrawingMode) { setShowCoordsPanel(false); setShowBoundaryPanel(false); setBoundaryCoordsText(''); setCoordsText(''); }
                }}
                className={`px-3 py-2 rounded-md text-sm transition-colors duration-200 ${
                  isDrawingMode
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                }`}
              >
                {isDrawingMode ? 'Zakończ rysowanie' : 'Rysuj rejon'}
              </button>
            </div>
          </div>

          <div>
            <div className="w-full h-96 rounded-md overflow-hidden border border-[#4a4a4a]" style={{ minHeight: '500px' }}>
              <MapContainer
                center={mapCenter}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                className="z-0"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <DrawControl
                  onPolygonCreated={handlePolygonCreated}
                  isDrawing={isDrawingMode}
                  editingCoordinates={editingZone?.coordinates}
                  existingZones={zones}
                  undoRef={undoDrawRef}
                />
                <BoundaryDrawControl
                  isActive={isBoundaryDrawingMode}
                  color={boundaryForm.color}
                  initialCoords={editingBoundary?.coordinates}
                  onCreated={(coords) => { setBoundaryDrawCoords(coords); setIsBoundaryDrawingMode(false); }}
                  undoRef={undoBoundaryDrawRef}
                />
                {/* Granice miasta */}
                {cityBoundaries.map(b => (
                  <Polygon
                    key={b.id}
                    positions={b.coordinates.map(c => [c.lat, c.lng] as [number, number])}
                    pathOptions={{ color: b.color, fillColor: b.color, fillOpacity: 0.06, weight: 3, dashArray: '10, 6' }}
                  />
                ))}
                {/* Podgląd narysowanej granicy (po zakończeniu rysowania) */}
                {showBoundaryPanel && !isBoundaryDrawingMode && boundaryDrawCoords.length >= 3 && (
                  <Polygon
                    positions={boundaryDrawCoords.map(c => [c.lat, c.lng] as [number, number])}
                    pathOptions={{ color: boundaryForm.color, fillColor: boundaryForm.color, fillOpacity: 0.1, weight: 3, dashArray: '10, 6' }}
                  />
                )}
                {/* Podgląd ze starych współrzędnych tekstowych */}
                {showBoundaryPanel && !isBoundaryDrawingMode && boundaryDrawCoords.length < 3 && (() => {
                  const preview = parseCoordsText(boundaryCoordsText);
                  return preview.length >= 3 ? (
                    <Polygon
                      positions={preview.map(c => [c.lat, c.lng] as [number, number])}
                      pathOptions={{ color: boundaryForm.color, fillColor: boundaryForm.color, fillOpacity: 0.1, weight: 3, dashArray: '10, 6' }}
                    />
                  ) : null;
                })()}
                {/* Podgląd nowego rejonu ze współrzędnych */}
                {showCoordsPanel && (() => {
                  const preview = parseCoordsText(coordsText);
                  return preview.length >= 3 ? (
                    <Polygon
                      positions={preview.map(c => [c.lat, c.lng] as [number, number])}
                      pathOptions={{ color: '#f59e0b', fillColor: '#f59e0b', fillOpacity: 0.25, weight: 2, dashArray: '6, 4' }}
                    />
                  ) : null;
                })()}
                {zones.map((zone) => {
                  const positions = zone.coordinates.map(coord => [coord.lat, coord.lng] as [number, number]);
                  const isEditing = editingZone?.id === zone.id;
                  const centroidLat = zone.coordinates.reduce((s, c) => s + c.lat, 0) / zone.coordinates.length;
                  const centroidLng = zone.coordinates.reduce((s, c) => s + c.lng, 0) / zone.coordinates.length;
                  const numberIcon = L.divIcon({
                    html: `<div style="background:rgba(30,58,138,0.88);color:#fff;font-weight:900;font-size:13px;border-radius:50%;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border:2px solid #93c5fd;box-shadow:0 1px 4px rgba(0,0,0,0.5);pointer-events:none">${zone.number}</div>`,
                    className: '',
                    iconSize: [26, 26],
                    iconAnchor: [13, 13],
                  });
                  return (
                    <React.Fragment key={zone.id}>
                      <Polygon
                        positions={positions}
                        pathOptions={{
                          color: isDrawingMode && !isEditing ? '#10b981' : '#3b82f6',
                          fillColor: isDrawingMode && !isEditing ? '#10b981' : '#3b82f6',
                          fillOpacity: isDrawingMode && !isEditing ? 0.2 : 0.3,
                          weight: isDrawingMode && !isEditing ? 3 : 2,
                          dashArray: isDrawingMode && !isEditing ? '5, 5' : undefined,
                        }}
                      />
                      <Marker
                        position={[centroidLat, centroidLng]}
                        icon={numberIcon}
                        interactive={false}
                      />
                    </React.Fragment>
                  );
                })}
              </MapContainer>
            </div>
            <div className="mt-3 space-y-2">
              <div className="text-sm text-gray-300">
                💡 Kliknij "Rysuj rejon" i zaznacz minimum 3 punkty na mapie aby utworzyć nowy rejon
              </div>
              {isDrawingMode && (
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 flex-1">
                    <div className="text-sm text-green-400 flex items-center space-x-2">
                      <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                      <span>Zielone punkty = wierzchołki istniejących rejonów (kliknij aby przypiąć)</span>
                    </div>
                    <div className="text-sm text-red-400 flex items-center space-x-2">
                      <span className="inline-block w-2 h-2 bg-red-500 rounded-full"></span>
                      <span>Czerwone punkty = twoje punkty | Podwójne kliknięcie lub Enter = zakończ</span>
                    </div>
                    <div className="text-xs text-gray-400">
                      Escape = anuluj rysowanie &nbsp;|&nbsp; Backspace / Ctrl+Z = cofnij punkt
                    </div>
                  </div>
                  <button
                    onClick={() => undoDrawRef.current?.()}
                    className="flex items-center space-x-1.5 px-3 py-1.5 rounded-md bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-[#4a4a4a] text-gray-300 hover:text-white text-sm font-medium transition-colors shrink-0"
                    title="Cofnij ostatni punkt (Backspace / Ctrl+Z)"
                  >
                    <span>↩</span>
                    <span>Cofnij punkt</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {showCoordsPanel && (
          <div className="bg-[#1e1e1e] rounded-md p-6 border border-yellow-600/40">
            <h3 className="text-lg font-semibold text-white mb-4">
              {editingZone ? 'Edytuj rejon — współrzędne' : 'Nowy rejon — wpisz współrzędne'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Nazwa rejonu</label>
                <input
                  type="text"
                  value={zoneForm.name}
                  onChange={e => setZoneForm({ ...zoneForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  placeholder="np. Stare Miasto"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Numer rejonu</label>
                <input
                  type="number"
                  value={zoneForm.number}
                  onChange={e => setZoneForm({ ...zoneForm, number: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  min="1" max="999"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-300 mb-2">Wydawaj zlecenie terminowe (min przed terminem)</label>
                <input
                  type="number"
                  value={zoneForm.scheduledDispatchMinutes}
                  onChange={e => setZoneForm({ ...zoneForm, scheduledDispatchMinutes: Math.max(1, parseInt(e.target.value) || 10) })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
                  min="1" max="120"
                />
              </div>
            </div>

            <label className="block text-sm font-medium text-gray-300 mb-2">
              Współrzędne wierzchołków <span className="text-gray-500 font-normal">(każdy w nowej linii: <code className="text-yellow-400">szerokość, długość</code>)</span>
            </label>
            <textarea
              value={coordsText}
              onChange={e => setCoordsText(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white font-mono text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-yellow-500 resize-y"
              placeholder={"50.064700, 19.945000\n50.065000, 19.952000\n50.060000, 19.952000\n50.059000, 19.945000"}
              spellCheck={false}
            />
            <div className="mt-1 text-sm h-5">
              {(() => {
                const coords = parseCoordsText(coordsText);
                if (coordsText.trim().length === 0) return null;
                if (coords.length === 0) return <span className="text-red-400">Brak poprawnych współrzędnych</span>;
                if (coords.length < 3) return <span className="text-yellow-400">{coords.length} {coords.length === 1 ? 'punkt' : 'punkty'} — potrzeba minimum 3</span>;
                return <span className="text-green-400">{coords.length} punktów — podgląd widoczny na mapie</span>;
              })()}
            </div>

            <div className="flex space-x-3 mt-4">
              <button
                disabled={isSaving}
                onClick={async () => {
                  const coords = parseCoordsText(coordsText);
                  if (!zoneForm.name.trim()) { setError('Podaj nazwę rejonu'); return; }
                  if (coords.length < 3) { setError('Podaj minimum 3 poprawne współrzędne'); return; }
                  if (zones.some(z => z.number === zoneForm.number && (!editingZone || z.id !== editingZone.id))) {
                    setError('Rejon o tym numerze już istnieje'); return;
                  }
                  if (checkPolygonOverlap(coords, editingZone?.id)) {
                    setError('Rejon nakłada się na istniejący rejon'); return;
                  }
                  setIsSaving(true);
                  setError(null);
                  try {
                    if (editingZone) {
                      await zoneService.updateZone(editingZone.id, {
                        name: zoneForm.name,
                        number: zoneForm.number,
                        coordinates: coords,
                        scheduledDispatchMinutes: zoneForm.scheduledDispatchMinutes,
                      });
                    } else {
                      await zoneService.createZone({
                        name: zoneForm.name,
                        number: zoneForm.number,
                        coordinates: coords,
                        driversCount: 0,
                        scheduledDispatchMinutes: zoneForm.scheduledDispatchMinutes,
                      });
                    }
                    await loadZones();
                    setShowCoordsPanel(false);
                    setCoordsText('');
                    setEditingZone(null);
                    setZoneForm({ name: '', number: 1, scheduledDispatchMinutes: 10 });
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Błąd podczas zapisywania rejonu');
                  } finally {
                    setIsSaving(false);
                  }
                }}
                className="flex items-center space-x-2 px-5 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
              >
                {isSaving ? <><Loader className="w-4 h-4 animate-spin" /><span>Zapisywanie...</span></> : <><Save className="w-4 h-4" /><span>{editingZone ? 'Zapisz zmiany' : 'Zapisz rejon'}</span></>}
              </button>
              <button
                onClick={() => { setShowCoordsPanel(false); setCoordsText(''); setEditingZone(null); }}
                className="px-5 py-2 bg-[#2a2a2a] hover:bg-[#333] text-white rounded-md transition-colors"
              >
                Anuluj
              </button>
            </div>
          </div>
        )}

        {showBoundaryPanel && (
          <div className="bg-[#1e1e1e] rounded-md p-6 border border-orange-600/40">
            <h3 className="text-lg font-semibold text-white mb-4">
              {editingBoundary ? 'Edytuj granicę miasta' : 'Nowa granica miasta'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Nazwa</label>
                <input
                  type="text"
                  value={boundaryForm.name}
                  onChange={e => setBoundaryForm({ ...boundaryForm, name: e.target.value })}
                  className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="np. Granica Krakowa"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Kolor</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={boundaryForm.color}
                    onChange={e => setBoundaryForm({ ...boundaryForm, color: e.target.value })}
                    className="h-10 w-14 rounded cursor-pointer bg-transparent border border-[#4a4a4a]"
                  />
                  <span className="text-gray-400 text-sm font-mono">{boundaryForm.color}</span>
                </div>
              </div>
            </div>

            {/* Rysowanie na mapie */}
            {!isBoundaryDrawingMode && boundaryDrawCoords.length < 3 && (
              <button
                onClick={() => { setBoundaryDrawCoords([]); setIsBoundaryDrawingMode(true); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 hover:bg-orange-700 text-white rounded-md font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                Rysuj granicę na mapie
              </button>
            )}
            {isBoundaryDrawingMode && (
              <div className="space-y-2">
                <div className="bg-orange-900/30 border border-orange-700 rounded-md px-4 py-3 text-sm text-orange-300">
                  🖱️ Klikaj na mapie żeby dodawać punkty. Kliknij blisko <strong>pierwszego punktu</strong> lub <strong>podwójnie kliknij</strong> żeby zamknąć granicę.
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => undoBoundaryDrawRef.current?.()}
                    className="flex-1 px-3 py-2 bg-[#2a2a2a] hover:bg-[#333] text-white rounded-md text-sm transition-colors"
                  >
                    ↩ Cofnij punkt
                  </button>
                  <button
                    onClick={() => setIsBoundaryDrawingMode(false)}
                    className="flex-1 px-3 py-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded-md text-sm transition-colors"
                  >
                    Anuluj rysowanie
                  </button>
                </div>
              </div>
            )}
            {!isBoundaryDrawingMode && boundaryDrawCoords.length >= 3 && (
              <div className="space-y-2">
                <div className="bg-green-900/30 border border-green-700 rounded-md px-4 py-3 text-sm text-green-300">
                  ✅ Narysowano {boundaryDrawCoords.length} punktów — podgląd widoczny na mapie
                </div>
                <button
                  onClick={() => { setBoundaryDrawCoords([]); setIsBoundaryDrawingMode(true); }}
                  className="w-full px-3 py-2 bg-[#2a2a2a] hover:bg-[#333] text-gray-300 rounded-md text-sm transition-colors"
                >
                  Narysuj ponownie
                </button>
              </div>
            )}

            {boundaryError && (
              <div className="mt-3 bg-red-900/40 border border-red-600 rounded-md px-4 py-2 text-sm text-red-300">
                ❌ {boundaryError}
              </div>
            )}

            <div className="flex space-x-3 mt-4">
              <button
                disabled={isSavingBoundary}
                onClick={async () => {
                  setBoundaryError(null);
                  const coords = boundaryDrawCoords.length >= 3 ? boundaryDrawCoords : parseCoordsText(boundaryCoordsText);
                  if (!boundaryForm.name.trim()) { setBoundaryError('Podaj nazwę granicy'); return; }
                  if (coords.length < 3) { setBoundaryError('Narysuj granicę na mapie (minimum 3 punkty)'); return; }
                  setIsSavingBoundary(true);
                  try {
                    let res: Response;
                    if (editingBoundary) {
                      res = await fetch(`/api/city-boundaries/${editingBoundary.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: boundaryForm.name, color: boundaryForm.color, coordinates: coords }),
                      });
                    } else {
                      res = await fetch('/api/city-boundaries', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: boundaryForm.name, color: boundaryForm.color, coordinates: coords }),
                      });
                    }
                    if (!res.ok) {
                      const errData = await res.json().catch(() => ({}));
                      throw new Error(errData.error || `Błąd serwera (HTTP ${res.status})`);
                    }
                    const result = await res.json();
                    if (!result.success) throw new Error(result.error || 'Nieznany błąd podczas zapisu');
                    await loadCityBoundaries();
                    setShowBoundaryPanel(false);
                    setBoundaryCoordsText('');
                    setBoundaryDrawCoords([]);
                    setIsBoundaryDrawingMode(false);
                    setBoundaryError(null);
                    setEditingBoundary(null);
                    setBoundaryForm({ name: '', color: '#f97316' });
                  } catch (err) {
                    setBoundaryError(err instanceof Error ? err.message : 'Błąd podczas zapisywania granicy');
                  } finally {
                    setIsSavingBoundary(false);
                  }
                }}
                className="flex items-center space-x-2 px-5 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-md font-medium transition-colors"
              >
                {isSavingBoundary ? <><Loader className="w-4 h-4 animate-spin" /><span>Zapisywanie...</span></> : <><Save className="w-4 h-4" /><span>{editingBoundary ? 'Zapisz zmiany' : 'Zapisz granicę'}</span></>}
              </button>
              <button
                onClick={() => { setShowBoundaryPanel(false); setBoundaryCoordsText(''); setBoundaryDrawCoords([]); setIsBoundaryDrawingMode(false); setEditingBoundary(null); }}
                className="px-5 py-2 bg-[#2a2a2a] hover:bg-[#333] text-white rounded-md transition-colors"
              >
                Anuluj
              </button>
            </div>
          </div>
        )}

        <div className="bg-[#1e1e1e] rounded-md border border-[#3d3d3d]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#3d3d3d]">
            <h3 className="text-lg font-semibold text-white">Lista Rejonów</h3>
            <span className="bg-[#272727] text-gray-300 px-2 py-1 rounded text-xs">
              {zones.length}
            </span>
          </div>

          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-[#3d3d3d]">
                    <th className="pb-3 text-gray-300 font-medium">Nr</th>
                    <th className="pb-3 text-gray-300 font-medium">Nazwa</th>
                    <th className="pb-3 text-gray-300 font-medium">Wierzchołki</th>
                    <th className="pb-3 text-gray-300 font-medium">Kierowcy</th>
                    <th className="pb-3 text-gray-300 font-medium">Utworzony</th>
                    <th className="pb-3 text-gray-300 font-medium w-1">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {zones.map((zone) => (
                    <tr key={zone.id} className="border-b border-[#3d3d3d] last:border-b-0 hover:bg-[#141414] transition-colors">
                      <td className="py-4">
                        <div className="bg-blue-600 w-7 h-7 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs font-bold">{zone.number}</span>
                        </div>
                      </td>
                      <td className="py-4">
                        <span className="text-white font-semibold">{zone.name}</span>
                      </td>
                      <td className="py-4 text-gray-300">{zone.coordinates.length}</td>
                      <td className="py-4 text-gray-300">{zone.driversCount}</td>
                      <td className="py-4 text-gray-300">{new Date(zone.createdAt).toLocaleDateString('pl-PL')}</td>
                      <td className="py-4">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleEditZone(zone)}
                            className="px-3 py-1 rounded-md text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                          >
                            Edytuj
                          </button>
                          <button
                            onClick={() => handleDeleteZone(zone.id, zone.name, zone.number)}
                            className="px-3 py-1 rounded-md text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
                          >
                            Usuń
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {zones.length === 0 && (
                <div className="text-center py-10 text-gray-300">
                  <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <div className="text-sm">Brak rejonów</div>
                  <div className="text-xs mt-1">Narysuj pierwszy rejon na mapie</div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Granice Miasta */}
        <div className="bg-[#1e1e1e] rounded-md p-6 border border-[#3d3d3d]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Granice Miasta</h3>
            <span className="bg-[#272727] text-gray-300 px-2 py-1 rounded text-xs">
              {cityBoundaries.length}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {cityBoundaries.map(b => (
              <div key={b.id} className="bg-[#272727] rounded-md p-3 border border-[#4a4a4a]">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 rounded-sm border-2 shrink-0" style={{ borderColor: b.color, backgroundColor: b.color + '33' }} />
                    <span className="text-white font-medium text-sm">{b.name}</span>
                  </div>
                  <div className="flex space-x-1">
                    <button
                      onClick={() => {
                        setEditingBoundary(b);
                        setBoundaryForm({ name: b.name, color: b.color });
                        setBoundaryCoordsText(b.coordinates.map(c => `${c.lat}, ${c.lng}`).join('\n'));
                        setShowBoundaryPanel(true);
                        setShowCoordsPanel(false);
                        setIsDrawingMode(false);
                      }}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ type: 'boundary', id: b.id, name: b.name })}
                      className="text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  {b.coordinates.length} punktów
                </div>
              </div>
            ))}

            {cityBoundaries.length === 0 && (
              <div className="col-span-full text-center py-6 text-gray-500 text-sm">
                Brak granic — kliknij "Granica miasta" aby dodać
              </div>
            )}
          </div>
        </div>
      </div>

      {showZoneForm && currentPolygon.length >= 3 && (
        <div className="fixed inset-0 bg-[#272727]/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#1e1e1e] rounded-xl w-full max-w-md border border-[#3d3d3d] shadow-2xl">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-bold text-white">
                  {editingZone ? 'Edytuj Rejon' : 'Nowy Rejon'}
                </h3>
                <button
                  onClick={() => {
                    setShowZoneForm(false);
                    setCurrentPolygon([]);
                    setEditingZone(null);
                  }}
                  className="text-gray-300 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <form onSubmit={handleSaveZone} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Nazwa rejonu
                  </label>
                  <input
                    type="text"
                    value={zoneForm.name}
                    onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="np. Stare Miasto"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Numer rejonu
                  </label>
                  <input
                    type="number"
                    value={zoneForm.number}
                    onChange={(e) => setZoneForm({ ...zoneForm, number: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="999"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Wydawaj zlecenie terminowe (min przed terminem)
                  </label>
                  <input
                    type="number"
                    value={zoneForm.scheduledDispatchMinutes}
                    onChange={(e) => setZoneForm({ ...zoneForm, scheduledDispatchMinutes: Math.max(1, parseInt(e.target.value) || 10) })}
                    className="w-full px-3 py-2 bg-[#2a2a2a] border border-[#4a4a4a] rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    min="1"
                    max="120"
                  />
                  <p className="text-xs text-gray-500 mt-1">System automatycznie wyda zlecenie terminowe na X minut przed godziną odbioru</p>
                </div>

                <div className="bg-[#272727] rounded-md p-3">
                  <div className="text-sm text-gray-300 mb-1">Polygon:</div>
                  <div className="text-white font-mono text-sm">
                    {currentPolygon.length} punktów
                  </div>
                  <div className="text-xs text-gray-300 mt-1">
                    Pierwszy punkt: {currentPolygon[0]?.lat.toFixed(6)}, {currentPolygon[0]?.lng.toFixed(6)}
                  </div>
                </div>

                <div className="flex space-x-3">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="flex-1 bg-green-600 hover:bg-green-700 disabled:bg-[#2a2a2a] text-white font-medium py-3 rounded-md transition-colors duration-200 flex items-center justify-center space-x-2"
                  >
                    {isSaving ? (
                      <>
                        <Loader className="w-4 h-4 animate-spin" />
                        <span>Zapisywanie...</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        <span>{editingZone ? 'Zapisz zmiany' : 'Zapisz rejon'}</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => {
                      setShowZoneForm(false);
                      setCurrentPolygon([]);
                      setEditingZone(null);
                    }}
                    className="bg-[#2a2a2a] hover:bg-[#272727] disabled:bg-[#272727] text-white font-medium px-6 py-3 rounded-md transition-colors duration-200"
                  >
                    Anuluj
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal potwierdzenia usunięcia */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[9999]">
          <div className="bg-[#1e1e1e] rounded-xl w-full max-w-sm border border-[#3d3d3d] shadow-2xl">
            <div className="p-6">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">
                    {confirmDelete.type === 'zone' ? 'Usuń rejon' : 'Usuń granicę'}
                  </h3>
                  <p className="text-gray-400 text-sm">Ta operacja jest nieodwracalna</p>
                </div>
              </div>

              <p className="text-gray-300 mb-6">
                Czy na pewno chcesz usunąć{' '}
                {confirmDelete.type === 'zone' ? 'rejon' : 'granicę'}{' '}
                <span className="text-white font-semibold">"{confirmDelete.name}"</span>?
              </p>

              <div className="flex space-x-3">
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="flex-1 px-4 py-2.5 rounded-md bg-[#2a2a2a] hover:bg-[#333] text-white font-medium transition-colors"
                >
                  Anuluj
                </button>
                <button
                  onClick={executeConfirmDelete}
                  className="flex-1 px-4 py-2.5 rounded-md bg-red-600 hover:bg-red-700 text-white font-semibold transition-colors"
                >
                  Usuń
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZoneManagement;
