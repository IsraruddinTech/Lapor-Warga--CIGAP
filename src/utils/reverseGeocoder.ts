import type {
  ReverseGeocodeAddressComponents,
  ReverseGeocodeResult,
} from '../types.ts';
import {
  buildFallbackLocationLabel,
  detectKelurahanFromCoords,
  isValidGeoCoordinate,
} from './ciputatGeo.ts';

export type GeocodeProviderName =
  | 'locationiq'
  | 'geoapify'
  | 'opencage'
  | 'google'
  | 'custom_nominatim'
  | 'none';

interface RawProviderResult {
  found: boolean;
  formattedAddress: string | null;
  components: ReverseGeocodeAddressComponents | null;
}

interface CacheEntry {
  result: Omit<ReverseGeocodeResult, 'cached'>;
  expiresAtMs: number;
}

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit
const MAX_CACHE_ENTRIES = 1000;
const REQUEST_TIMEOUT_MS = 4500;

const geocodeCache = new Map<string, CacheEntry>();

function normalizeCacheKey(provider: string, lat: number, lng: number): string {
  return `${provider}:${lat.toFixed(5)},${lng.toFixed(5)}`;
}

function getCachedEntry(key: string): ReverseGeocodeResult | null {
  const entry = geocodeCache.get(key);
  if (!entry) return null;
  if (entry.expiresAtMs <= Date.now()) {
    geocodeCache.delete(key);
    return null;
  }
  return { ...entry.result, cached: true };
}

function setCachedEntry(key: string, result: Omit<ReverseGeocodeResult, 'cached'>): void {
  if (geocodeCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = geocodeCache.keys().next().value;
    if (oldestKey) {
      geocodeCache.delete(oldestKey);
    }
  }
  geocodeCache.set(key, {
    result,
    expiresAtMs: Date.now() + CACHE_TTL_MS,
  });
}

export function clearReverseGeocodeCache(): void {
  geocodeCache.clear();
}

export function getActiveGeocodeProviderConfig(): {
  provider: GeocodeProviderName;
  apiKey: string;
  baseUrl: string;
  userAgent: string;
  configured: boolean;
  reason?: string;
} {
  const rawProvider = (process.env.GEOCODE_PROVIDER || 'none').trim().toLowerCase();
  const apiKey = (process.env.GEOCODE_API_KEY || '').trim();
  const baseUrl = (process.env.GEOCODE_BASE_URL || '').trim().replace(/\/+$/, '');
  const userAgent =
    (process.env.GEOCODE_USER_AGENT || '').trim() || 'CiGap-Ciputat-ServicePortal/1.0';

  if (!rawProvider || rawProvider === 'none' || rawProvider === 'disabled') {
    return {
      provider: 'none',
      apiKey: '',
      baseUrl: '',
      userAgent,
      configured: false,
      reason:
        'Provider reverse geocoding alamat jalan belum dikonfigurasi pada server (GEOCODE_PROVIDER / GEOCODE_API_KEY).',
    };
  }

  if (rawProvider === 'locationiq') {
    if (!apiKey) {
      return {
        provider: 'locationiq',
        apiKey: '',
        baseUrl: baseUrl || 'https://us1.locationiq.com/v1/reverse',
        userAgent,
        configured: false,
        reason: 'GEOCODE_API_KEY wajib diisi untuk provider LocationIQ.',
      };
    }
    return {
      provider: 'locationiq',
      apiKey,
      baseUrl: baseUrl || 'https://us1.locationiq.com/v1/reverse',
      userAgent,
      configured: true,
    };
  }

  if (rawProvider === 'geoapify') {
    if (!apiKey) {
      return {
        provider: 'geoapify',
        apiKey: '',
        baseUrl: baseUrl || 'https://api.geoapify.com/v1/geocode/reverse',
        userAgent,
        configured: false,
        reason: 'GEOCODE_API_KEY wajib diisi untuk provider Geoapify.',
      };
    }
    return {
      provider: 'geoapify',
      apiKey,
      baseUrl: baseUrl || 'https://api.geoapify.com/v1/geocode/reverse',
      userAgent,
      configured: true,
    };
  }

  if (rawProvider === 'opencage') {
    if (!apiKey) {
      return {
        provider: 'opencage',
        apiKey: '',
        baseUrl: baseUrl || 'https://api.opencagedata.com/geocode/v1/json',
        userAgent,
        configured: false,
        reason: 'GEOCODE_API_KEY wajib diisi untuk provider OpenCage.',
      };
    }
    return {
      provider: 'opencage',
      apiKey,
      baseUrl: baseUrl || 'https://api.opencagedata.com/geocode/v1/json',
      userAgent,
      configured: true,
    };
  }

  if (rawProvider === 'google') {
    if (!apiKey) {
      return {
        provider: 'google',
        apiKey: '',
        baseUrl: baseUrl || 'https://maps.googleapis.com/maps/api/geocode/json',
        userAgent,
        configured: false,
        reason: 'GEOCODE_API_KEY wajib diisi untuk provider Google Geocoding.',
      };
    }
    return {
      provider: 'google',
      apiKey,
      baseUrl: baseUrl || 'https://maps.googleapis.com/maps/api/geocode/json',
      userAgent,
      configured: true,
    };
  }

  if (rawProvider === 'custom_nominatim') {
    if (!baseUrl) {
      return {
        provider: 'custom_nominatim',
        apiKey,
        baseUrl: '',
        userAgent,
        configured: false,
        reason: 'GEOCODE_BASE_URL wajib diisi untuk server Nominatim mandiri (self-hosted).',
      };
    }
    // Larang endpoint publik nominatim.openstreetmap.org sebagai default agar mematuhi usage policy
    if (/nominatim\.openstreetmap\.org/i.test(baseUrl)) {
      return {
        provider: 'custom_nominatim',
        apiKey,
        baseUrl: '',
        userAgent,
        configured: false,
        reason:
          'Instance publik nominatim.openstreetmap.org tidak diizinkan untuk traffic produksi; gunakan server self-hosted atau API key geocoding komersial.',
      };
    }
    return {
      provider: 'custom_nominatim',
      apiKey,
      baseUrl,
      userAgent,
      configured: true,
    };
  }

  return {
    provider: 'none',
    apiKey: '',
    baseUrl: '',
    userAgent,
    configured: false,
    reason: `Provider geocoding "${rawProvider}" tidak dikenali.`,
  };
}

function cleanFormattedAddress(raw?: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : null;
}

async function queryLocationIqOrCustomNominatim(
  endpoint: string,
  lat: number,
  lng: number,
  apiKey: string,
  userAgent: string,
  signal: AbortSignal
): Promise<RawProviderResult> {
  const url = new URL(endpoint);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('accept-language', 'id');
  if (apiKey) {
    url.searchParams.set('key', apiKey);
  }

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'User-Agent': userAgent,
    },
    signal,
  });

  if (!res.ok) {
    throw new Error(`GEOCODE_UPSTREAM_HTTP_${res.status}`);
  }

  const data = (await res.json()) as {
    display_name?: string;
    address?: Record<string, string | undefined>;
    error?: string;
  };

  if (data.error || !data.display_name) {
    return { found: false, formattedAddress: null, components: null };
  }

  const addr = data.address || {};
  const road =
    addr.road ||
    addr.pedestrian ||
    addr.footway ||
    addr.residential ||
    addr.neighbourhood ||
    undefined;
  const kel = addr.village || addr.suburb || addr.quarter || undefined;
  const kec = addr.city_district || addr.district || addr.town || undefined;
  const city = addr.city || addr.county || addr.municipality || undefined;
  const province = addr.state || undefined;

  const shortParts = [road, addr.house_number ? `No. ${addr.house_number}` : undefined, kel, kec, city]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.trim());

  const formattedAddress =
    shortParts.length > 0 ? shortParts.join(', ') : cleanFormattedAddress(data.display_name);

  return {
    found: Boolean(formattedAddress),
    formattedAddress,
    components: {
      road,
      kelurahan: kel,
      kecamatan: kec,
      city,
      province,
      postcode: addr.postcode,
    },
  };
}

async function queryGeoapify(
  endpoint: string,
  lat: number,
  lng: number,
  apiKey: string,
  signal: AbortSignal
): Promise<RawProviderResult> {
  const url = new URL(endpoint);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('lang', 'id');
  url.searchParams.set('format', 'json');
  url.searchParams.set('apiKey', apiKey);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    throw new Error(`GEOCODE_UPSTREAM_HTTP_${res.status}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      formatted?: string;
      street?: string;
      housenumber?: string;
      suburb?: string;
      village?: string;
      district?: string;
      county?: string;
      city?: string;
      state?: string;
      postcode?: string;
    }>;
  };

  const first = data.results?.[0];
  if (!first) {
    return { found: false, formattedAddress: null, components: null };
  }

  const road = first.street || undefined;
  const kel = first.village || first.suburb || undefined;
  const kec = first.district || undefined;
  const city = first.city || first.county || undefined;

  const shortParts = [road, first.housenumber ? `No. ${first.housenumber}` : undefined, kel, kec, city]
    .filter((v): v is string => Boolean(v && v.trim()))
    .map((v) => v.trim());

  const formattedAddress =
    shortParts.length > 0 ? shortParts.join(', ') : cleanFormattedAddress(first.formatted);

  return {
    found: Boolean(formattedAddress),
    formattedAddress,
    components: {
      road,
      kelurahan: kel,
      kecamatan: kec,
      city,
      province: first.state,
      postcode: first.postcode,
    },
  };
}

async function queryOpenCage(
  endpoint: string,
  lat: number,
  lng: number,
  apiKey: string,
  signal: AbortSignal
): Promise<RawProviderResult> {
  const url = new URL(endpoint);
  url.searchParams.set('q', `${lat},${lng}`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('language', 'id');
  url.searchParams.set('no_annotations', '1');
  url.searchParams.set('limit', '1');

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    throw new Error(`GEOCODE_UPSTREAM_HTTP_${res.status}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      formatted?: string;
      components?: Record<string, string | undefined>;
    }>;
  };

  const first = data.results?.[0];
  if (!first) {
    return { found: false, formattedAddress: null, components: null };
  }

  const c = first.components || {};
  const road = c.road || c.pedestrian || c.residential || undefined;
  const kel = c.village || c.suburb || c.neighbourhood || undefined;
  const kec = c.city_district || c.district || undefined;
  const city = c.city || c.town || c.county || undefined;

  const formattedAddress = cleanFormattedAddress(first.formatted);
  return {
    found: Boolean(formattedAddress),
    formattedAddress,
    components: {
      road,
      kelurahan: kel,
      kecamatan: kec,
      city,
      province: c.state,
      postcode: c.postcode,
    },
  };
}

async function queryGoogleGeocoding(
  endpoint: string,
  lat: number,
  lng: number,
  apiKey: string,
  signal: AbortSignal
): Promise<RawProviderResult> {
  const url = new URL(endpoint);
  url.searchParams.set('latlng', `${lat},${lng}`);
  url.searchParams.set('language', 'id');
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString(), {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  });

  if (!res.ok) {
    throw new Error(`GEOCODE_UPSTREAM_HTTP_${res.status}`);
  }

  const data = (await res.json()) as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      address_components?: Array<{
        long_name: string;
        short_name: string;
        types: string[];
      }>;
    }>;
  };

  const first = data.results?.[0];
  if (!first || data.status === 'ZERO_RESULTS') {
    return { found: false, formattedAddress: null, components: null };
  }

  const pickType = (type: string) =>
    first.address_components?.find((c) => c.types.includes(type))?.long_name;

  return {
    found: Boolean(first.formatted_address),
    formattedAddress: cleanFormattedAddress(first.formatted_address),
    components: {
      road: pickType('route'),
      kelurahan: pickType('administrative_area_level_4') || pickType('sublocality_level_2'),
      kecamatan: pickType('administrative_area_level_3') || pickType('sublocality_level_1'),
      city: pickType('administrative_area_level_2') || pickType('locality'),
      province: pickType('administrative_area_level_1'),
      postcode: pickType('postal_code'),
    },
  };
}

export async function reverseGeocodeCoordinate(
  lat: number,
  lng: number
): Promise<ReverseGeocodeResult> {
  if (!isValidGeoCoordinate({ lat, lng })) {
    throw new Error('INVALID_COORDINATES');
  }

  const geoDetection = detectKelurahanFromCoords(lat, lng);
  const fallbackLabel = buildFallbackLocationLabel(
    geoDetection.detectedKelurahan || undefined,
    { lat, lng }
  );

  const config = getActiveGeocodeProviderConfig();
  if (!config.configured) {
    return {
      configured: false,
      provider: config.provider,
      found: false,
      formattedAddress: null,
      components: null,
      detectedKelurahan: geoDetection.detectedKelurahan,
      nearestKelurahan: geoDetection.nearestKelurahan,
      serviceAreaStatus: geoDetection.serviceAreaStatus,
      fallbackLabel,
      cached: false,
      errorCode: 'PROVIDER_NOT_CONFIGURED',
      error: config.reason,
    };
  }

  const cacheKey = normalizeCacheKey(config.provider, lat, lng);
  const cached = getCachedEntry(cacheKey);
  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    let rawResult: RawProviderResult;
    if (config.provider === 'locationiq' || config.provider === 'custom_nominatim') {
      rawResult = await queryLocationIqOrCustomNominatim(
        config.baseUrl,
        lat,
        lng,
        config.apiKey,
        config.userAgent,
        controller.signal
      );
    } else if (config.provider === 'geoapify') {
      rawResult = await queryGeoapify(config.baseUrl, lat, lng, config.apiKey, controller.signal);
    } else if (config.provider === 'opencage') {
      rawResult = await queryOpenCage(config.baseUrl, lat, lng, config.apiKey, controller.signal);
    } else if (config.provider === 'google') {
      rawResult = await queryGoogleGeocoding(
        config.baseUrl,
        lat,
        lng,
        config.apiKey,
        controller.signal
      );
    } else {
      rawResult = { found: false, formattedAddress: null, components: null };
    }

    const result: Omit<ReverseGeocodeResult, 'cached'> = {
      configured: true,
      provider: config.provider,
      found: rawResult.found,
      formattedAddress: rawResult.formattedAddress,
      components: rawResult.components,
      detectedKelurahan: geoDetection.detectedKelurahan,
      nearestKelurahan: geoDetection.nearestKelurahan,
      serviceAreaStatus: geoDetection.serviceAreaStatus,
      fallbackLabel,
    };

    setCachedEntry(cacheKey, result);
    return { ...result, cached: false };
  } catch (err) {
    const isAbort = err instanceof Error && err.name === 'AbortError';
    return {
      configured: true,
      provider: config.provider,
      found: false,
      formattedAddress: null,
      components: null,
      detectedKelurahan: geoDetection.detectedKelurahan,
      nearestKelurahan: geoDetection.nearestKelurahan,
      serviceAreaStatus: geoDetection.serviceAreaStatus,
      fallbackLabel,
      cached: false,
      errorCode: isAbort ? 'GEOCODE_TIMEOUT' : 'GEOCODE_UPSTREAM_ERROR',
      error: isAbort
        ? 'Permintaan pengenalan alamat melebihi batas waktu.'
        : 'Layanan pengenalan alamat sedang tidak dapat dijangkau. Anda tetap dapat mengisi alamat secara manual.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
