import { useState, useEffect, useCallback, useRef } from 'react';
import { KelurahanCiputat } from '../types';
import { CIPUTAT_LANDMARKS } from '../data/mockReports';
import {
  DEFAULT_CIPUTAT_CENTER,
  calculateDistanceMeters,
  detectKelurahanFromCoords,
  findNearestKelurahan,
  isWithinCiputatServiceArea,
} from '../utils/ciputatGeo';

export { findNearestKelurahan };

export type LocationPermissionState = 'prompt' | 'granted' | 'denied' | 'unsupported';

export interface UserLiveLocationState {
  permissionState: LocationPermissionState;
  userCoords: { lat: number; lng: number } | null;
  accuracy: number | null; // meters
  heading: number | null;
  speed: number | null;
  timestamp: number | null;
  isLoading: boolean;
  errorMessage: string | null;
  isInCiputat: boolean;
  nearestKelurahan: KelurahanCiputat;
  nearestLandmark: string;
  detectedKelurahan: KelurahanCiputat | null;
  detectedLandmark: string | null;
  isGpsEnabled: boolean;
  showPermissionBanner: boolean;
  requestLocation: () => Promise<boolean>;
  requestLocationCoords: () => Promise<{ lat: number; lng: number } | null>;
  disableLocation: () => void;
  stopWatching: () => void;
  dismissBanner: () => void;
}

export function findNearestLandmark(lat: number, lng: number): string {
  let minDistance = Infinity;
  let nearest = 'Kecamatan Ciputat';

  CIPUTAT_LANDMARKS.forEach((lm) => {
    const dist = calculateDistanceMeters(lat, lng, lm.lat, lm.lng);
    if (dist < minDistance) {
      minDistance = dist;
      nearest = `${lm.name} (Kel. ${lm.kelurahan})`;
    }
  });

  return nearest;
}

export function checkIsInCiputat(lat: number, lng: number): boolean {
  return isWithinCiputatServiceArea({ lat, lng });
}

export function useUserLiveLocation(): UserLiveLocationState {
  const [permissionState, setPermissionState] = useState<LocationPermissionState>('prompt');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [timestamp, setTimestamp] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isGpsEnabled, setIsGpsEnabled] = useState(false);
  const [showPermissionBanner, setShowPermissionBanner] = useState(true);

  const watchIdRef = useRef<number | null>(null);
  const isGpsEnabledRef = useRef(false);

  // Check initial permission status if available
  useEffect(() => {
    if (!navigator.geolocation) {
      setPermissionState('unsupported');
      setErrorMessage('Browser Anda tidak mendukung fitur geolokasi GPS.');
      return;
    }

    if ('permissions' in navigator) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          if (result.state === 'granted') {
            setPermissionState('granted');
            setIsGpsEnabled(true);
            isGpsEnabledRef.current = true;
            // Auto start watching if already granted
            startWatching();
          } else if (result.state === 'denied') {
            setPermissionState('denied');
            setIsGpsEnabled(false);
            isGpsEnabledRef.current = false;
          } else {
            setPermissionState('prompt');
          }

          result.onchange = () => {
            if (result.state === 'granted') {
              setPermissionState('granted');
              setErrorMessage(null);
              if (isGpsEnabledRef.current) {
                startWatching();
              }
            } else if (result.state === 'denied') {
              setPermissionState('denied');
              setIsGpsEnabled(false);
              isGpsEnabledRef.current = false;
              setUserCoords(null);
              setAccuracy(null);
              stopWatching();
            } else {
              setPermissionState('prompt');
            }
          };
        })
        .catch(() => {
          // Permissions API might throw on unsupported names
        });
    }

    return () => {
      stopWatching();
    };
  }, []);

  const handlePositionSuccess = (position: GeolocationPosition) => {
    if (!isGpsEnabledRef.current) return;
    const lat = position.coords.latitude;
    const lng = position.coords.longitude;
    setUserCoords({ lat, lng });
    setAccuracy(Math.round(position.coords.accuracy));
    setHeading(position.coords.heading);
    setSpeed(position.coords.speed);
    setTimestamp(position.timestamp);
    setPermissionState('granted');
    setIsGpsEnabled(true);
    setIsLoading(false);
    setErrorMessage(null);
  };

  const handlePositionError = (error: GeolocationPositionError) => {
    setIsLoading(false);
    if (error.code === error.PERMISSION_DENIED) {
      setPermissionState('denied');
      setErrorMessage(
        'Akses lokasi GPS ditolak oleh pengguna atau diblokir browser. Anda dapat memilih lokasi manual di peta Ciputat.'
      );
    } else if (error.code === error.POSITION_UNAVAILABLE) {
      setErrorMessage('Sinyal GPS tidak tersedia saat ini. Silakan tentukan lokasi secara manual di peta.');
    } else if (error.code === error.TIMEOUT) {
      setErrorMessage('Pencarian koordinat GPS melebihi batas waktu (timeout). Silakan coba lagi.');
    } else {
      setErrorMessage('Terjadi gangguan saat mengambil data lokasi GPS perangkat.');
    }
  };

  const startWatching = useCallback(() => {
    if (!navigator.geolocation) return;

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
    }

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        handlePositionSuccess,
        handlePositionError,
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 10000,
        }
      );
    } catch (e) {
      // fallback
    }
  }, []);

  const stopWatching = useCallback(() => {
    if (watchIdRef.current !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  }, []);

  const requestLocationCoords = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    if (!navigator.geolocation) {
      setPermissionState('unsupported');
      setIsGpsEnabled(false);
      isGpsEnabledRef.current = false;
      setErrorMessage('Browser tidak mendukung pendeteksian lokasi GPS.');
      return null;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setIsGpsEnabled(true);
    isGpsEnabledRef.current = true;
    setShowPermissionBanner(true);

    return new Promise<{ lat: number; lng: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          handlePositionSuccess(pos);
          startWatching();
          resolve({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => {
          if (err.code === err.PERMISSION_DENIED) {
            setIsGpsEnabled(false);
            isGpsEnabledRef.current = false;
            setUserCoords(null);
            setAccuracy(null);
          }
          handlePositionError(err);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 12000,
          maximumAge: 0,
        }
      );
    });
  }, [startWatching]);

  const requestLocation = useCallback(async (): Promise<boolean> => {
    const coords = await requestLocationCoords();
    return Boolean(coords);
  }, [requestLocationCoords]);

  const disableLocation = useCallback(() => {
    stopWatching();
    isGpsEnabledRef.current = false;
    setIsGpsEnabled(false);
    setIsLoading(false);
    setUserCoords(null);
    setAccuracy(null);
    setHeading(null);
    setSpeed(null);
    setTimestamp(null);
    setErrorMessage(null);
  }, [stopWatching]);

  const dismissBanner = useCallback(() => {
    setShowPermissionBanner(false);
  }, []);

  const currentLat = userCoords?.lat ?? DEFAULT_CIPUTAT_CENTER.lat;
  const currentLng = userCoords?.lng ?? DEFAULT_CIPUTAT_CENTER.lng;
  const geoDetection = userCoords ? detectKelurahanFromCoords(userCoords.lat, userCoords.lng) : null;

  const isInCiputat = Boolean(geoDetection?.isWithinServiceArea);
  const nearestKelurahan = geoDetection?.detectedKelurahan || findNearestKelurahan(currentLat, currentLng);
  const nearestLandmark = findNearestLandmark(currentLat, currentLng);
  const detectedKelurahan = geoDetection?.detectedKelurahan ?? null;
  const detectedLandmark = userCoords ? findNearestLandmark(userCoords.lat, userCoords.lng) : null;

  return {
    permissionState,
    userCoords,
    accuracy,
    heading,
    speed,
    timestamp,
    isLoading,
    errorMessage,
    isInCiputat,
    nearestKelurahan,
    nearestLandmark,
    detectedKelurahan,
    detectedLandmark,
    isGpsEnabled,
    showPermissionBanner,
    requestLocation,
    requestLocationCoords,
    disableLocation,
    stopWatching,
    dismissBanner,
  };
}
