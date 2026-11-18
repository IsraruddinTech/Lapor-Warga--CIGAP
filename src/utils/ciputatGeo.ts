import ciputatGeoJson from '../data/ciputatKelurahanGeo.json';
import type { KelurahanCiputat, ServiceAreaStatus } from '../types.ts';

interface GeoJsonPolygonGeometry {
  type: 'Polygon';
  coordinates: number[][][];
}

interface GeoJsonMultiPolygonGeometry {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

export interface CiputatKelurahanFeature {
  type: 'Feature';
  properties: {
    kelurahan: KelurahanCiputat;
    bpsName: string;
    bpsCode: string;
    kecamatan: string;
    kota: string;
    provinsi: string;
    center: { lat: number; lng: number };
  };
  geometry: GeoJsonPolygonGeometry | GeoJsonMultiPolygonGeometry;
}

const FEATURES = (ciputatGeoJson.features || []) as CiputatKelurahanFeature[];

export const CIPUTAT_POLYGON_BBOX = {
  minLat: ciputatGeoJson.metadata?.bbox?.minLat ?? -6.34207,
  maxLat: ciputatGeoJson.metadata?.bbox?.maxLat ?? -6.2799,
  minLng: ciputatGeoJson.metadata?.bbox?.minLng ?? 106.69047,
  maxLng: ciputatGeoJson.metadata?.bbox?.maxLng ?? 106.75901,
};

/**
 * Satu-satunya batas wilayah proyeksi & viewport peta CiGap (diturunkan dari GeoJSON 7 kelurahan + padding aman marker)
 */
export const CIPUTAT_BOUNDS = {
  minLat: -6.345,
  maxLat: -6.277,
  minLng: 106.688,
  maxLng: 106.766,
};

/**
 * Titik pusat default Kecamatan Ciputat (berada di dalam poligon Kel. Ciputat)
 */
export const DEFAULT_CIPUTAT_CENTER = {
  lat: -6.3115,
  lng: 106.7452,
};

/**
 * Titik representatif interior terverifikasi untuk masing-masing dari 7 Kelurahan di Kecamatan Ciputat
 * (Digunakan untuk mengarahkan tampilan peta saat dropdown kelurahan dipilih, tidak menimpa pin kejadian tanpa aksi user)
 */
export const KELURAHAN_CENTERS: Record<KelurahanCiputat, { lat: number; lng: number }> = {
  Ciputat: { lat: -6.31905, lng: 106.74552 },
  Cipayung: { lat: -6.32963, lng: 106.7515 },
  Serua: { lat: -6.31428, lng: 106.71172 },
  'Serua Indah': { lat: -6.31437, lng: 106.7268 },
  'Sawah Baru': { lat: -6.29229, lng: 106.72121 },
  Sawah: { lat: -6.29886, lng: 106.73457 },
  Jombang: { lat: -6.29736, lng: 106.7047 },
};

const BOUNDARY_TOLERANCE_METERS = 30;
const METERS_PER_DEG_LAT = 111132.92;

export function isValidGeoCoordinate(
  coords: unknown
): coords is { lat: number; lng: number } {
  if (!coords || typeof coords !== 'object') return false;
  const candidate = coords as { lat?: unknown; lng?: unknown };
  if (typeof candidate.lat !== 'number' || typeof candidate.lng !== 'number') return false;
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return false;
  if (candidate.lat < -90 || candidate.lat > 90) return false;
  if (candidate.lng < -180 || candidate.lng > 180) return false;
  if (candidate.lat === 0 && candidate.lng === 0) return false;
  return true;
}

export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3;
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function normalizeKelurahanName(raw?: string | null): KelurahanCiputat | null {
  if (!raw || typeof raw !== 'string') return null;
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^(kel\.?|kelurahan)\s+/i, '')
    .replace(/\s+/g, ' ');

  if (cleaned === 'ciputat') return 'Ciputat';
  if (cleaned === 'cipayung') return 'Cipayung';
  if (cleaned === 'serua' || cleaned === 'sarua') return 'Serua';
  if (cleaned === 'serua indah' || cleaned === 'sarua indah') return 'Serua Indah';
  if (cleaned === 'sawah baru') return 'Sawah Baru';
  if (cleaned === 'sawah' || cleaned === 'sawah lama') return 'Sawah';
  if (cleaned === 'jombang') return 'Jombang';
  return null;
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  const len = ring.length;
  for (let i = 0, j = len - 1; i < len; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];

    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi === 0 ? 1e-18 : yj - yi) + xi;
    if (intersects) {
      inside = !inside;
    }
  }
  return inside;
}

function pointToSegmentDistanceMeters(
  lat: number,
  lng: number,
  aLng: number,
  aLat: number,
  bLng: number,
  bLat: number
): number {
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const metersPerDegLng = METERS_PER_DEG_LAT * cosLat;

  const px = 0;
  const py = 0;
  const ax = (aLng - lng) * metersPerDegLng;
  const ay = (aLat - lat) * METERS_PER_DEG_LAT;
  const bx = (bLng - lng) * metersPerDegLng;
  const by = (bLat - lat) * METERS_PER_DEG_LAT;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = ax + t * dx;
  const closestY = ay + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

function minDistanceToRingMeters(lat: number, lng: number, ring: number[][]): number {
  let minDist = Infinity;
  for (let i = 0; i < ring.length - 1; i++) {
    const [aLng, aLat] = ring[i];
    const [bLng, bLat] = ring[i + 1];
    const d = pointToSegmentDistanceMeters(lat, lng, aLng, aLat, bLng, bLat);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function inspectPointAgainstGeometry(
  lat: number,
  lng: number,
  geometry: GeoJsonPolygonGeometry | GeoJsonMultiPolygonGeometry
): { inside: boolean; minEdgeDistanceMeters: number } {
  const polygons =
    geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

  let insideAny = false;
  let minEdgeDistance = Infinity;

  for (const poly of polygons) {
    const outer = poly[0];
    if (!outer || outer.length < 4) continue;

    const outerEdgeDist = minDistanceToRingMeters(lat, lng, outer);
    if (outerEdgeDist < minEdgeDistance) minEdgeDistance = outerEdgeDist;

    if (pointInRing(lng, lat, outer)) {
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        const hole = poly[h];
        const holeDist = minDistanceToRingMeters(lat, lng, hole);
        if (holeDist < minEdgeDistance) minEdgeDistance = holeDist;
        if (pointInRing(lng, lat, hole)) {
          inHole = true;
          break;
        }
      }
      if (!inHole) {
        insideAny = true;
      }
    }
  }

  return { inside: insideAny, minEdgeDistanceMeters: minEdgeDistance };
}

export function findNearestKelurahan(lat: number, lng: number): KelurahanCiputat {
  let minDistance = Infinity;
  let nearest: KelurahanCiputat = 'Ciputat';

  (Object.keys(KELURAHAN_CENTERS) as KelurahanCiputat[]).forEach((kel) => {
    const center = KELURAHAN_CENTERS[kel];
    const dist = calculateDistanceMeters(lat, lng, center.lat, center.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = kel;
    }
  });

  return nearest;
}

export interface KelurahanDetectionResult {
  validCoords: boolean;
  detectedKelurahan: KelurahanCiputat | null;
  matchedKelurahanList: KelurahanCiputat[];
  nearestKelurahan: KelurahanCiputat;
  serviceAreaStatus: ServiceAreaStatus;
  isWithinServiceArea: boolean;
  distanceToBoundaryMeters: number;
  boundaryMethod: 'geojson_polygon' | 'indeterminate';
}

export function detectKelurahanFromCoords(
  lat: number,
  lng: number
): KelurahanDetectionResult {
  if (!isValidGeoCoordinate({ lat, lng })) {
    return {
      validCoords: false,
      detectedKelurahan: null,
      matchedKelurahanList: [],
      nearestKelurahan: 'Ciputat',
      serviceAreaStatus: 'tidak_diketahui',
      isWithinServiceArea: false,
      distanceToBoundaryMeters: Infinity,
      boundaryMethod: 'indeterminate',
    };
  }

  if (FEATURES.length === 0) {
    return {
      validCoords: true,
      detectedKelurahan: null,
      matchedKelurahanList: [],
      nearestKelurahan: findNearestKelurahan(lat, lng),
      serviceAreaStatus: 'tidak_diketahui',
      isWithinServiceArea: false,
      distanceToBoundaryMeters: Infinity,
      boundaryMethod: 'indeterminate',
    };
  }

  const matchedKelurahan: KelurahanCiputat[] = [];
  let closestFeatureKel: KelurahanCiputat | null = null;
  let minEdgeDistanceOverall = Infinity;

  for (const feature of FEATURES) {
    const res = inspectPointAgainstGeometry(lat, lng, feature.geometry);
    if (res.inside) {
      matchedKelurahan.push(feature.properties.kelurahan);
    }
    if (res.minEdgeDistanceMeters < minEdgeDistanceOverall) {
      minEdgeDistanceOverall = res.minEdgeDistanceMeters;
      closestFeatureKel = feature.properties.kelurahan;
    }
  }

  const nearestCenterKel = findNearestKelurahan(lat, lng);

  if (matchedKelurahan.length > 0) {
    return {
      validCoords: true,
      detectedKelurahan: matchedKelurahan[0],
      matchedKelurahanList: matchedKelurahan,
      nearestKelurahan: matchedKelurahan[0],
      serviceAreaStatus: 'dalam_wilayah',
      isWithinServiceArea: true,
      distanceToBoundaryMeters: Math.round(minEdgeDistanceOverall),
      boundaryMethod: 'geojson_polygon',
    };
  }

  if (minEdgeDistanceOverall <= BOUNDARY_TOLERANCE_METERS && closestFeatureKel) {
    return {
      validCoords: true,
      detectedKelurahan: closestFeatureKel,
      matchedKelurahanList: [closestFeatureKel],
      nearestKelurahan: closestFeatureKel,
      serviceAreaStatus: 'batas_wilayah',
      isWithinServiceArea: true,
      distanceToBoundaryMeters: Math.round(minEdgeDistanceOverall),
      boundaryMethod: 'geojson_polygon',
    };
  }

  return {
    validCoords: true,
    detectedKelurahan: null,
    matchedKelurahanList: [],
    nearestKelurahan: closestFeatureKel || nearestCenterKel,
    serviceAreaStatus: 'luar_wilayah',
    isWithinServiceArea: false,
    distanceToBoundaryMeters: Math.round(minEdgeDistanceOverall),
    boundaryMethod: 'geojson_polygon',
  };
}

export function isWithinCiputatServiceArea(coords: { lat: number; lng: number }): boolean {
  if (!isValidGeoCoordinate(coords)) return false;
  const detection = detectKelurahanFromCoords(coords.lat, coords.lng);
  return detection.serviceAreaStatus === 'dalam_wilayah' || detection.serviceAreaStatus === 'batas_wilayah';
}

export function isWithinCiputatBounds(coords: { lat: number; lng: number }): boolean {
  return isWithinCiputatServiceArea(coords);
}

export function buildFallbackLocationLabel(
  kelurahan?: string,
  coords?: { lat: number; lng: number } | null
): string {
  const valid = isValidGeoCoordinate(coords);
  if (valid) {
    const detection = detectKelurahanFromCoords(coords.lat, coords.lng);
    if (detection.detectedKelurahan) {
      return `Kel. ${detection.detectedKelurahan}, Kec. Ciputat (Koordinat ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`;
    }
    if (detection.serviceAreaStatus === 'luar_wilayah') {
      return `Luar Wilayah Kecamatan Ciputat (Koordinat ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`;
    }
    const kelText = typeof kelurahan === 'string' && kelurahan.trim() ? `Kel. ${kelurahan.trim()}` : 'Wilayah Ciputat';
    return `${kelText} (Titik Koordinat ${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)})`;
  }
  return typeof kelurahan === 'string' && kelurahan.trim()
    ? `Kel. ${kelurahan.trim()}`
    : 'Wilayah Ciputat';
}

export function getCiputatGeoFeatures(): CiputatKelurahanFeature[] {
  return FEATURES;
}
