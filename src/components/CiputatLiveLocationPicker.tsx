import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import L from 'leaflet';
import {
  MapPin,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Compass,
  Info,
  RefreshCw,
  Maximize2,
  Minimize2,
  Building,
  Globe,
  Sparkles,
  Loader2,
  ArrowRightLeft,
} from 'lucide-react';
import { KelurahanCiputat, ReverseGeocodeResult, ServiceAreaStatus, ThemeAccent } from '../types';
import { CIPUTAT_KELURAHAN_LIST, CIPUTAT_LANDMARKS } from '../data/mockReports';
import { useUserLiveLocation, findNearestLandmark } from '../hooks/useUserLiveLocation';
import { reverseGeocodeOnServer } from '../utils/cigapApi';
import {
  DEFAULT_CIPUTAT_CENTER,
  KELURAHAN_CENTERS,
  buildFallbackLocationLabel,
  detectKelurahanFromCoords,
  isValidGeoCoordinate,
} from '../utils/ciputatGeo';
import { getThemeColors } from '../utils/themeColors';

export interface SmartLocationStatus {
  detectedKelurahan: KelurahanCiputat | null;
  nearestKelurahan: KelurahanCiputat;
  serviceAreaStatus: ServiceAreaStatus;
  reverseGeocode: ReverseGeocodeResult | null;
  isGeocoding: boolean;
  geocodeError: string | null;
  addressSource: 'auto' | 'manual' | 'landmark' | 'none';
}

interface CiputatLiveLocationPickerProps {
  selectedCoords: { lat: number; lng: number } | null;
  onCoordsChange: (coords: { lat: number; lng: number }) => void;
  kelurahan: KelurahanCiputat;
  onKelurahanChange: (k: KelurahanCiputat) => void;
  locationName: string;
  onLocationNameChange: (name: string) => void;
  landmarkNote: string;
  onLandmarkNoteChange: (note: string) => void;
  onSmartLocationStatusChange?: (status: SmartLocationStatus) => void;
  hasError?: boolean;
  resetSignal?: number;
  elderlyMode?: boolean;
  accent?: ThemeAccent;
}

const LEAFLET_CENTER: [number, number] = [DEFAULT_CIPUTAT_CENTER.lat, DEFAULT_CIPUTAT_CENTER.lng];

const TILE_LAYERS = {
  streets: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> kontributor',
    maxZoom: 19,
  },
  satellite: {
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution:
      'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
    maxZoom: 18,
  },
};

export const CiputatLiveLocationPicker: React.FC<CiputatLiveLocationPickerProps> = ({
  selectedCoords,
  onCoordsChange,
  kelurahan,
  onKelurahanChange,
  locationName,
  onLocationNameChange,
  landmarkNote,
  onLandmarkNoteChange,
  onSmartLocationStatusChange,
  hasError = false,
  resetSignal = 0,
  elderlyMode,
  accent = 'blue',
}) => {
  const themeColors = getThemeColors(accent);
  const liveLocation = useUserLiveLocation();
  const [mapType, setMapType] = useState<'streets' | 'satellite'>('streets');
  const [isSyncingWithUser, setIsSyncingWithUser] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Reverse geocoding & manual edit tracking states
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [reverseResult, setReverseResult] = useState<ReverseGeocodeResult | null>(null);
  const [isAddressManuallyEdited, setIsAddressManuallyEdited] = useState(false);
  const [addressSource, setAddressSource] = useState<'auto' | 'manual' | 'landmark' | 'none'>('none');
  const [pendingDetectedAddress, setPendingDetectedAddress] = useState<string | null>(null);

  const clientGeocodeCacheRef = useRef<Map<string, ReverseGeocodeResult>>(new Map());
  const geocodeAbortRef = useRef<AbortController | null>(null);
  const geocodeReqSeqRef = useRef(0);

  const hasValidCoords = isValidGeoCoordinate(selectedCoords);
  const displayCoords = hasValidCoords ? selectedCoords : DEFAULT_CIPUTAT_CENTER;

  // Spatial polygon check on current pin coordinates (client mirror of authoritative server check)
  const geoDetection = useMemo(
    () => detectKelurahanFromCoords(displayCoords.lat, displayCoords.lng),
    [displayCoords.lat, displayCoords.lng]
  );

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const currentTileLayerRef = useRef<L.TileLayer | null>(null);
  const incidentMarkerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const userAccuracyCircleRef = useRef<L.Circle | null>(null);

  // Latest callbacks/state refs for Leaflet listeners
  const onCoordsChangeRef = useRef(onCoordsChange);
  onCoordsChangeRef.current = onCoordsChange;
  const onKelurahanChangeRef = useRef(onKelurahanChange);
  onKelurahanChangeRef.current = onKelurahanChange;
  const isAddressManuallyEditedRef = useRef(isAddressManuallyEdited);
  isAddressManuallyEditedRef.current = isAddressManuallyEdited;
  const locationNameRef = useRef(locationName);
  locationNameRef.current = locationName;
  const onLocationNameChangeRef = useRef(onLocationNameChange);
  onLocationNameChangeRef.current = onLocationNameChange;

  // Notify parent form whenever spatial/geocode status updates
  useEffect(() => {
    onSmartLocationStatusChange?.({
      detectedKelurahan: geoDetection.detectedKelurahan,
      nearestKelurahan: geoDetection.nearestKelurahan,
      serviceAreaStatus: geoDetection.serviceAreaStatus,
      reverseGeocode: reverseResult,
      isGeocoding,
      geocodeError,
      addressSource,
    });
  }, [
    geoDetection.detectedKelurahan,
    geoDetection.nearestKelurahan,
    geoDetection.serviceAreaStatus,
    reverseResult,
    isGeocoding,
    geocodeError,
    addressSource,
    onSmartLocationStatusChange,
  ]);

  // Custom SVG DivIcon for Incident Target Pin (Draggable)
  const createIncidentIcon = () => {
    return L.divIcon({
      className: 'custom-incident-pin',
      html: `
        <div style="transform: translate(-50%, -100%); display: flex; flex-direction: column; align-items: center; cursor: grab;">
          <div style="background: #e11d48; color: white; padding: 4px 9px; border-radius: 9px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 14px rgba(225,29,72,0.45); border: 2px solid white; display: flex; align-items: center; gap: 4px; white-space: nowrap;">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            <span>Titik Kejadian</span>
          </div>
          <div style="width: 12px; height: 12px; background: #e11d48; transform: rotate(45deg); margin-top: -6px; border-right: 2px solid white; border-bottom: 2px solid white;"></div>
          <div style="width: 10px; height: 5px; background: rgba(0,0,0,0.35); border-radius: 50%; filter: blur(1.5px); margin-top: 1px;"></div>
        </div>
      `,
      iconSize: [0, 0],
    });
  };

  // Custom SVG DivIcon for User Real-Time Live Location Pin (Blue Pulse)
  const createUserLiveIcon = () => {
    return L.divIcon({
      className: 'custom-user-live-pin',
      html: `
        <div style="transform: translate(-50%, -50%); position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; background: rgba(2, 132, 199, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
          <div style="position: relative; width: 16px; height: 16px; border-radius: 50%; background: #0284c7; border: 3px solid white; box-shadow: 0 2px 10px rgba(0,0,0,0.4);"></div>
          <div style="position: absolute; top: -20px; left: 50%; transform: translateX(-50%); background: #0f172a; color: #38bdf8; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 6px; border: 1px solid #38bdf8; white-space: nowrap; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">
            Posisi Anda
          </div>
        </div>
      `,
      iconSize: [0, 0],
    });
  };

  const applyPolygonKelurahanFromCoords = (lat: number, lng: number) => {
    const detected = detectKelurahanFromCoords(lat, lng);
    if (detected.isWithinServiceArea && detected.detectedKelurahan) {
      onKelurahanChangeRef.current(detected.detectedKelurahan);
    }
  };

  // 1. Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapRef.current) return;

    const initialLat = displayCoords.lat;
    const initialLng = displayCoords.lng;

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: 15,
      zoomControl: false,
    });

    const tileConfig = TILE_LAYERS[mapType];
    const tileLayer = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
    }).addTo(map);
    currentTileLayerRef.current = tileLayer;

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const incidentMarker = L.marker([initialLat, initialLng], {
      icon: createIncidentIcon(),
      draggable: true,
      zIndexOffset: 1000,
    }).addTo(map);

    // Reverse geocode & kelurahan detection only triggers after pin stops moving (dragend)
    incidentMarker.on('dragend', (event) => {
      const marker = event.target;
      const position = marker.getLatLng();
      const newLat = Number(position.lat.toFixed(5));
      const newLng = Number(position.lng.toFixed(5));
      onCoordsChangeRef.current({ lat: newLat, lng: newLng });
      applyPolygonKelurahanFromCoords(newLat, newLng);
    });

    incidentMarkerRef.current = incidentMarker;

    map.on('click', (e: L.LeafletMouseEvent) => {
      const clickLat = Number(e.latlng.lat.toFixed(5));
      const clickLng = Number(e.latlng.lng.toFixed(5));

      incidentMarker.setLatLng([clickLat, clickLng]);
      onCoordsChangeRef.current({ lat: clickLat, lng: clickLng });
      applyPolygonKelurahanFromCoords(clickLat, clickLng);
    });

    mapRef.current = map;

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(timer);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Handle Map Type (Street vs Satellite) Switch
  useEffect(() => {
    if (!mapRef.current) return;
    if (currentTileLayerRef.current) {
      mapRef.current.removeLayer(currentTileLayerRef.current);
    }
    const tileConfig = TILE_LAYERS[mapType];
    const newLayer = L.tileLayer(tileConfig.url, {
      attribution: tileConfig.attribution,
      maxZoom: tileConfig.maxZoom,
    }).addTo(mapRef.current);
    currentTileLayerRef.current = newLayer;
  }, [mapType]);

  // 3. Sync Leaflet Incident Marker when coordinates prop updates externally
  useEffect(() => {
    if (!incidentMarkerRef.current || !hasValidCoords || !selectedCoords) return;
    const currentPos = incidentMarkerRef.current.getLatLng();
    if (
      Math.abs(currentPos.lat - selectedCoords.lat) > 0.00003 ||
      Math.abs(currentPos.lng - selectedCoords.lng) > 0.00003
    ) {
      incidentMarkerRef.current.setLatLng([selectedCoords.lat, selectedCoords.lng]);
    }
  }, [selectedCoords, hasValidCoords]);

  // 4. Debounced Reverse Geocoding (600ms) with AbortController, Sequence Guard & Client Cache
  useEffect(() => {
    if (!hasValidCoords || !selectedCoords) return;

    const normLat = Number(selectedCoords.lat.toFixed(5));
    const normLng = Number(selectedCoords.lng.toFixed(5));
    const cacheKey = `${normLat.toFixed(5)},${normLng.toFixed(5)}`;

    const applyResult = (res: ReverseGeocodeResult) => {
      setReverseResult(res);
      setGeocodeError(res.configured && res.error ? res.error : null);

      const candidateAddress = res.found && res.formattedAddress ? res.formattedAddress : null;
      if (candidateAddress) {
        if (!isAddressManuallyEditedRef.current) {
          if (locationNameRef.current !== candidateAddress) {
            onLocationNameChangeRef.current(candidateAddress);
          }
          setAddressSource('auto');
          setPendingDetectedAddress(null);
        } else if (locationNameRef.current.trim() !== candidateAddress) {
          setPendingDetectedAddress(candidateAddress);
        } else {
          setPendingDetectedAddress(null);
        }
      } else {
        setPendingDetectedAddress(null);
      }
    };

    const cached = clientGeocodeCacheRef.current.get(cacheKey);
    if (cached) {
      setIsGeocoding(false);
      applyResult(cached);
      return;
    }

    const reqSeq = ++geocodeReqSeqRef.current;
    setIsGeocoding(true);
    setGeocodeError(null);

    const debounceTimer = setTimeout(async () => {
      if (geocodeAbortRef.current) {
        geocodeAbortRef.current.abort();
      }
      const controller = new AbortController();
      geocodeAbortRef.current = controller;

      try {
        const res = await reverseGeocodeOnServer(normLat, normLng, controller.signal);
        if (reqSeq !== geocodeReqSeqRef.current) return;
        clientGeocodeCacheRef.current.set(cacheKey, res);
        applyResult(res);
      } catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          return;
        }
        if (reqSeq !== geocodeReqSeqRef.current) return;
        setGeocodeError(
          err instanceof Error
            ? err.message
            : 'Gagal menghubungi layanan pengenalan alamat. Koordinat tetap valid dan alamat dapat diisi manual.'
        );
      } finally {
        if (reqSeq === geocodeReqSeqRef.current) {
          setIsGeocoding(false);
        }
      }
    }, 600);

    return () => {
      clearTimeout(debounceTimer);
      if (geocodeAbortRef.current) {
        geocodeAbortRef.current.abort();
        geocodeAbortRef.current = null;
      }
    };
  }, [selectedCoords?.lat, selectedCoords?.lng, hasValidCoords]);

  // 5. Update or render Live User GPS Location on Map
  useEffect(() => {
    if (!mapRef.current) return;

    if (liveLocation.userCoords && liveLocation.permissionState === 'granted') {
      const userLat = liveLocation.userCoords.lat;
      const userLng = liveLocation.userCoords.lng;

      if (!userMarkerRef.current) {
        userMarkerRef.current = L.marker([userLat, userLng], {
          icon: createUserLiveIcon(),
          zIndexOffset: 500,
          interactive: false,
        }).addTo(mapRef.current);
      } else {
        userMarkerRef.current.setLatLng([userLat, userLng]);
      }

      if (liveLocation.accuracy) {
        if (!userAccuracyCircleRef.current) {
          userAccuracyCircleRef.current = L.circle([userLat, userLng], {
            radius: Math.min(liveLocation.accuracy, 200),
            color: '#0284c7',
            fillColor: '#38bdf8',
            fillOpacity: 0.15,
            weight: 1.5,
          }).addTo(mapRef.current);
        } else {
          userAccuracyCircleRef.current.setLatLng([userLat, userLng]);
          userAccuracyCircleRef.current.setRadius(Math.min(liveLocation.accuracy, 200));
        }
      }
    } else {
      if (userMarkerRef.current && mapRef.current) {
        mapRef.current.removeLayer(userMarkerRef.current);
        userMarkerRef.current = null;
      }
      if (userAccuracyCircleRef.current && mapRef.current) {
        mapRef.current.removeLayer(userAccuracyCircleRef.current);
        userAccuracyCircleRef.current = null;
      }
    }
  }, [liveLocation.userCoords, liveLocation.permissionState, liveLocation.accuracy]);

  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 200);
    }
  }, [isExpanded]);

  // 6. Reset internal picker/GPS/address-edit states when parent form resets
  useEffect(() => {
    if (resetSignal <= 0) return;
    if (geocodeAbortRef.current) {
      geocodeAbortRef.current.abort();
      geocodeAbortRef.current = null;
    }
    setMapType('streets');
    setIsExpanded(false);
    setIsSyncingWithUser(false);
    setIsGeocoding(false);
    setGeocodeError(null);
    setReverseResult(null);
    setIsAddressManuallyEdited(false);
    setAddressSource('none');
    setPendingDetectedAddress(null);
    liveLocation.disableLocation();
    if (incidentMarkerRef.current) {
      incidentMarkerRef.current.setLatLng(LEAFLET_CENTER);
    }
    if (mapRef.current) {
      mapRef.current.setView(LEAFLET_CENTER, 15);
    }
  }, [resetSignal]);

  // Single GPS Action: Request browser GPS, center map, and place incident pin
  const handleUseMyCurrentLocation = async () => {
    setIsSyncingWithUser(true);
    const freshCoords = await liveLocation.requestLocationCoords();
    const coords = freshCoords || liveLocation.userCoords;

    if (!coords) {
      setIsSyncingWithUser(false);
      return;
    }

    const initialLat = Number(coords.lat.toFixed(5));
    const initialLng = Number(coords.lng.toFixed(5));

    onCoordsChange({ lat: initialLat, lng: initialLng });
    applyPolygonKelurahanFromCoords(initialLat, initialLng);

    if (mapRef.current) {
      mapRef.current.flyTo([initialLat, initialLng], 17, { duration: 1.1 });
    }
    if (incidentMarkerRef.current) {
      incidentMarkerRef.current.setLatLng([initialLat, initialLng]);
    }
    setIsSyncingWithUser(false);
  };

  // Pan view to Ciputat without silently overwriting pin unless requested
  const handleCenterToCiputat = () => {
    if (mapRef.current) {
      mapRef.current.flyTo(LEAFLET_CENTER, 15, { duration: 1 });
    }
  };

  // Explicit correction action when pin is outside Ciputat
  const handleResetPinToCiputat = () => {
    onCoordsChange(DEFAULT_CIPUTAT_CENTER);
    onKelurahanChange('Ciputat');
    if (incidentMarkerRef.current) {
      incidentMarkerRef.current.setLatLng(LEAFLET_CENTER);
    }
    if (mapRef.current) {
      mapRef.current.flyTo(LEAFLET_CENTER, 15, { duration: 1 });
    }
  };

  // Quick landmark fly-to
  const handleSelectLandmarkFlyTo = (lm: (typeof CIPUTAT_LANDMARKS)[0]) => {
    onCoordsChange({ lat: lm.lat, lng: lm.lng });
    onKelurahanChange(lm.kelurahan as KelurahanCiputat);
    if (!isAddressManuallyEdited) {
      onLocationNameChange(lm.name);
      setAddressSource('landmark');
      setPendingDetectedAddress(null);
    } else if (locationName.trim() !== lm.name) {
      setPendingDetectedAddress(lm.name);
    }

    if (mapRef.current) {
      mapRef.current.flyTo([lm.lat, lm.lng], 16, { duration: 1 });
    }
    if (incidentMarkerRef.current) {
      incidentMarkerRef.current.setLatLng([lm.lat, lm.lng]);
    }
  };

  // Dropdown change: pan view to representative center WITHOUT silently moving incident pin!
  const handleKelurahanSelectChange = (k: KelurahanCiputat) => {
    onKelurahanChange(k);
    const center = KELURAHAN_CENTERS[k];
    if (center && mapRef.current) {
      mapRef.current.flyTo([center.lat, center.lng], 15, { duration: 0.9 });
    }
  };

  const handleMovePinToSelectedKelurahan = (k: KelurahanCiputat) => {
    const center = KELURAHAN_CENTERS[k];
    if (!center) return;
    onCoordsChange({ lat: center.lat, lng: center.lng });
    if (incidentMarkerRef.current) {
      incidentMarkerRef.current.setLatLng([center.lat, center.lng]);
    }
    if (mapRef.current) {
      mapRef.current.flyTo([center.lat, center.lng], 16, { duration: 0.9 });
    }
  };

  const handleApplyDetectedAddress = () => {
    if (!pendingDetectedAddress) return;
    onLocationNameChange(pendingDetectedAddress);
    setIsAddressManuallyEdited(false);
    setAddressSource('auto');
    setPendingDetectedAddress(null);
  };

  const hasKelurahanMismatch =
    hasValidCoords &&
    Boolean(geoDetection.detectedKelurahan) &&
    geoDetection.detectedKelurahan !== kelurahan;

  const isOutsideServiceArea = hasValidCoords && geoDetection.serviceAreaStatus === 'luar_wilayah';
  const isBoundaryServiceArea = hasValidCoords && geoDetection.serviceAreaStatus === 'batas_wilayah';

  return (
    <div className="space-y-3.5">
      {/* 1. Header with Title, Description & Single GPS Action */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5">
        <div className="space-y-0.5">
          <label
            className={`${
              elderlyMode ? 'text-base font-bold' : 'text-xs font-bold uppercase tracking-wider'
            } text-slate-800 dark:text-slate-200 flex items-center gap-1.5`}
          >
            <MapPin size={16} className="text-rose-500 shrink-0" />
            <span>Titik Lokasi Kejadian</span>
            <span className="text-rose-500 font-bold">*</span>
          </label>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tentukan titik kejadian pada peta; sistem mendeteksi kelurahan dan wilayah layanan Ciputat secara otomatis.
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={handleUseMyCurrentLocation}
          disabled={liveLocation.isLoading || isSyncingWithUser}
          className="px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer shrink-0 bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-75 disabled:cursor-wait self-start sm:self-center"
        >
          {liveLocation.isLoading || isSyncingWithUser ? (
            <>
              <RefreshCw size={13} className="animate-spin text-white" />
              <span>Mendeteksi Lokasi...</span>
            </>
          ) : (
            <>
              <Navigation size={13} className="text-white" />
              <span>Gunakan Lokasi Saya</span>
            </>
          )}
        </motion.button>
      </div>

      {/* 2. GPS STATUS BANNER */}
      <AnimatePresence mode="wait">
        {liveLocation.permissionState === 'denied' ||
        liveLocation.permissionState === 'unsupported' ||
        liveLocation.errorMessage ? (
          <motion.div
            key="gps-error"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 text-rose-900 dark:text-rose-200 text-xs shadow-xs flex items-start gap-2.5"
          >
            <AlertTriangle size={15} className="text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <p className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-200 leading-relaxed">
              {liveLocation.permissionState === 'denied'
                ? 'Izin lokasi belum diberikan. Anda tetap dapat menentukan lokasi kejadian secara manual melalui peta.'
                : liveLocation.errorMessage ||
                  'Lokasi GPS gagal dideteksi. Anda tetap dapat menentukan lokasi kejadian secara manual melalui peta.'}
            </p>
          </motion.div>
        ) : liveLocation.isLoading || isSyncingWithUser ? (
          <motion.div
            key="gps-loading"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/80 text-sky-900 dark:text-sky-200 text-xs shadow-xs flex items-center gap-2.5"
          >
            <RefreshCw size={14} className="animate-spin text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="text-[11px] sm:text-xs">
              Sedang mendeteksi koordinat GPS perangkat Anda...
            </span>
          </motion.div>
        ) : liveLocation.permissionState === 'granted' && liveLocation.userCoords ? (
          <motion.div
            key="gps-granted"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/80 text-emerald-900 dark:text-emerald-200 text-xs shadow-xs flex items-center gap-2.5"
          >
            <div className="w-6 h-6 rounded-lg bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <CheckCircle2 size={15} />
            </div>
            <p className="text-[11px] sm:text-xs text-slate-700 dark:text-slate-200">
              Posisi GPS perangkat terdeteksi:{' '}
              {liveLocation.detectedKelurahan ? (
                <strong>Kel. {liveLocation.detectedKelurahan}, Kec. Ciputat</strong>
              ) : (
                <strong>di luar batas Kecamatan Ciputat</strong>
              )}
              {liveLocation.accuracy ? ` (Akurasi GPS ±${liveLocation.accuracy} m)` : ''}.
            </p>
          </motion.div>
        ) : (
          <motion.div
            key="gps-idle"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-3 rounded-2xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs shadow-xs flex items-center gap-2.5"
          >
            <Info size={15} className="text-sky-600 dark:text-sky-400 shrink-0" />
            <p className="text-[11px] sm:text-xs">
              Klik peta, geser pin merah, atau tekan <strong>Gunakan Lokasi Saya</strong> untuk menentukan titik kejadian.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. INTERACTIVE LEAFLET MAP FOR MANUAL & GPS INCIDENT PIN PLACEMENT */}
      <div
        className={`relative rounded-2xl border-2 overflow-hidden bg-slate-100 dark:bg-slate-900 shadow-md ${
          hasError
            ? 'border-rose-500 ring-2 ring-rose-500/20'
            : 'border-slate-300 dark:border-slate-700'
        }`}
      >
        {/* Map Top Bar Controls */}
        <div className="p-2 sm:p-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs z-10 relative">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setMapType('streets')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                mapType === 'streets'
                  ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Building size={12} />
              <span>Peta Jalan</span>
            </button>
            <button
              type="button"
              onClick={() => setMapType('satellite')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                mapType === 'satellite'
                  ? 'bg-white dark:bg-slate-700 text-sky-600 dark:text-sky-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Globe size={12} />
              <span>Citra Satelit</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-1 rounded-lg">
              {hasValidCoords
                ? `${displayCoords.lat.toFixed(5)}, ${displayCoords.lng.toFixed(5)}`
                : 'Koordinat belum valid'}
            </span>
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              title={isExpanded ? 'Perkecil peta' : 'Perbesar peta'}
            >
              {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
            </button>
          </div>
        </div>

        {/* Map Container */}
        <div
          className={`w-full transition-all duration-300 relative ${
            isExpanded ? 'h-[440px]' : 'h-[280px] sm:h-[320px]'
          }`}
        >
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          <div className="absolute top-2.5 left-2.5 z-[500] pointer-events-auto">
            <button
              type="button"
              onClick={handleCenterToCiputat}
              className="px-2.5 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 text-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 shadow-md text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5 transition-all cursor-pointer"
              title="Kembalikan tampilan peta ke wilayah pusat Ciputat"
            >
              <Compass size={14} className="text-amber-500" />
              <span>Pusat Ciputat</span>
            </button>
          </div>

          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-[500] pointer-events-none w-max max-w-[92%]">
            <div className="px-3 py-1 rounded-full bg-slate-900/85 text-white text-[10px] font-bold shadow-lg border border-slate-700 backdrop-blur-md flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse shrink-0" />
              <span className="truncate">
                Geser pin merah atau klik peta untuk menentukan titik kejadian.
              </span>
            </div>
          </div>
        </div>

        {/* Map Footer Bar: Polygon & Geocoding Status */}
        <div className="p-2.5 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300">
          <div className="flex items-center gap-1.5 min-w-0">
            {isGeocoding ? (
              <>
                <Loader2 size={13} className="text-sky-600 animate-spin shrink-0" />
                <span className="truncate font-medium text-sky-700 dark:text-sky-300">
                  Mengenali alamat & wilayah dari titik peta...
                </span>
              </>
            ) : (
              <>
                <Info size={13} className="text-sky-600 dark:text-sky-400 shrink-0" />
                <span className="truncate">
                  {geoDetection.detectedKelurahan ? (
                    <>
                      Pin berada di <strong>Kel. {geoDetection.detectedKelurahan}</strong> (
                      {findNearestLandmark(displayCoords.lat, displayCoords.lng)})
                    </>
                  ) : (
                    <>
                      Pin berada di <strong>luar batas Kec. Ciputat</strong> (terdekat:{' '}
                      Kel. {geoDetection.nearestKelurahan})
                    </>
                  )}
                </span>
              </>
            )}
          </div>

          {hasValidCoords && (
            <span
              className={`text-[10px] font-bold shrink-0 px-2 py-0.5 rounded-md border ${
                geoDetection.serviceAreaStatus === 'dalam_wilayah'
                  ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : geoDetection.serviceAreaStatus === 'batas_wilayah'
                  ? 'bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800'
                  : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
              }`}
            >
              {geoDetection.serviceAreaStatus === 'dalam_wilayah'
                ? 'Dalam Wilayah Layanan'
                : geoDetection.serviceAreaStatus === 'batas_wilayah'
                ? 'Area Perbatasan Ciputat'
                : 'Di Luar Wilayah Ciputat'}
            </span>
          )}
        </div>
      </div>

      {/* Outside Ciputat Service Area Notice (Exact message + correction button; never classifies as fake) */}
      {isOutsideServiceArea && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 text-xs text-amber-950 dark:text-amber-100 space-y-2.5">
          <div className="flex items-start gap-2.5">
            <AlertTriangle size={17} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold">
                Lokasi yang Anda pilih berada di luar wilayah layanan CiGap. Silakan periksa kembali titik kejadian Anda.
              </div>
              <p className="text-[11px] text-amber-900/85 dark:text-amber-200/85 leading-relaxed">
                Koordinat ({displayCoords.lat.toFixed(5)}, {displayCoords.lng.toFixed(5)}) berada di luar batas administratif 7 kelurahan Kecamatan Ciputat. Anda dapat memusatkan kembali ke Ciputat atau tetap melanjutkan agar ditinjau petugas (laporan tidak dianggap hoaks).
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 pl-6">
            <button
              type="button"
              onClick={handleResetPinToCiputat}
              className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Compass size={13} />
              <span>Arahkan Pin ke Pusat Ciputat</span>
            </button>
            <button
              type="button"
              onClick={handleCenterToCiputat}
              className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-semibold text-[11px] hover:bg-amber-100/60 cursor-pointer transition-colors"
            >
              Lihat Peta Wilayah Ciputat
            </button>
          </div>
        </div>
      )}

      {/* Near Boundary Info Notice */}
      {isBoundaryServiceArea && (
        <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/35 border border-sky-200 dark:border-sky-800 text-xs text-sky-900 dark:text-sky-200 flex items-start gap-2.5">
          <Info size={15} className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            Titik pin berada di area perbatasan Kecamatan Ciputat (sekitar{' '}
            <strong>Kel. {geoDetection.detectedKelurahan}</strong>). Petugas dapat membantu memastikan koordinasi wilayah bila diperlukan.
          </p>
        </div>
      )}

      {/* Kelurahan Mismatch Banner when dropdown differs from detected pin polygon */}
      {hasKelurahanMismatch && geoDetection.detectedKelurahan && (
        <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 text-xs text-sky-950 dark:text-sky-100 space-y-2">
          <div className="flex items-start gap-2">
            <ArrowRightLeft size={15} className="text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Titik pin saat ini berada di wilayah <strong>Kelurahan {geoDetection.detectedKelurahan}</strong>, sedangkan dropdown memilih <strong>Kelurahan {kelurahan}</strong>. Nilai kelurahan final mengikuti koordinat titik pin pada peta.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            <button
              type="button"
              onClick={() => onKelurahanChange(geoDetection.detectedKelurahan!)}
              className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold cursor-pointer transition-colors"
            >
              Sesuaikan Dropdown ke {geoDetection.detectedKelurahan}
            </button>
            <button
              type="button"
              onClick={() => handleMovePinToSelectedKelurahan(kelurahan)}
              className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200 text-[11px] font-semibold hover:bg-sky-100/70 cursor-pointer transition-colors"
            >
              Pindahkan Pin ke Kel. {kelurahan}
            </button>
          </div>
        </div>
      )}

      {/* 4. Form inputs: Kelurahan, Alamat Lokasi Kejadian (Editable Auto-fill), & Patokan Tambahan */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="kelurahan-select"
            className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 flex items-center justify-between gap-2"
          >
            <span>Kelurahan di Ciputat:</span>
            {geoDetection.detectedKelurahan && (
              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
                Terdeteksi: {geoDetection.detectedKelurahan}
              </span>
            )}
          </label>
          <select
            id="kelurahan-select"
            value={kelurahan}
            onChange={(e) => handleKelurahanSelectChange(e.target.value as KelurahanCiputat)}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-semibold"
          >
            {CIPUTAT_KELURAHAN_LIST.map((k) => (
              <option key={k} value={k}>
                Kelurahan {k}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
            Mengganti kelurahan akan mengarahkan tampilan peta tanpa memindahkan pin secara diam-diam.
          </p>
        </div>

        <div>
          <label
            htmlFor="alamat-lokasi-input"
            className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 flex items-center justify-between gap-2"
          >
            <span>Alamat Lokasi Kejadian (Opsional):</span>
            {isGeocoding ? (
              <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 inline-flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />
                Mendeteksi...
              </span>
            ) : addressSource === 'auto' && locationName.trim() ? (
              <span className="text-[10px] font-semibold text-sky-700 dark:text-sky-300 inline-flex items-center gap-1">
                <Sparkles size={10} />
                dideteksi dari titik peta
              </span>
            ) : addressSource === 'landmark' && locationName.trim() ? (
              <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                dari lokasi populer
              </span>
            ) : (
              <span className="text-[10px] font-normal text-slate-400">Opsional jika koordinat valid</span>
            )}
          </label>
          <input
            id="alamat-lokasi-input"
            type="text"
            value={locationName}
            onChange={(e) => {
              const nextVal = e.target.value;
              onLocationNameChange(nextVal);
              if (nextVal.trim() === '') {
                setIsAddressManuallyEdited(false);
                setAddressSource('none');
              } else {
                setIsAddressManuallyEdited(true);
                setAddressSource('manual');
              }
            }}
            placeholder={`Contoh: Jl. Dewi Sartika / ${buildFallbackLocationLabel(
              geoDetection.detectedKelurahan || kelurahan,
              displayCoords
            )}`}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
          />

          {/* Explicit offer when pin moves after user manually edited address */}
          {pendingDetectedAddress && (
            <div className="mt-1.5 p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800 flex flex-col gap-1.5 text-[11px]">
              <span className="text-slate-700 dark:text-slate-200">
                Alamat baru terdeteksi dari titik peta: <strong>{pendingDetectedAddress}</strong>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyDetectedAddress}
                  className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-bold text-[10px] cursor-pointer transition-colors"
                >
                  Perbarui Alamat dari Titik Baru
                </button>
                <button
                  type="button"
                  onClick={() => setPendingDetectedAddress(null)}
                  className="text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:text-slate-400 cursor-pointer"
                >
                  Pertahankan Teks Saya
                </button>
              </div>
            </div>
          )}

          {/* Honest status note when reverse geocoding is unconfigured/unavailable or failed */}
          {!pendingDetectedAddress && (
            <div className="mt-1 text-[10px] text-slate-500 dark:text-slate-400 leading-snug">
              {geocodeError ? (
                <span className="text-amber-700 dark:text-amber-400">{geocodeError}</span>
              ) : reverseResult && !reverseResult.configured ? (
                <span>
                  Deteksi nama jalan otomatis belum aktif pada server; koordinat &amp; poligon kelurahan tetap akurat. Fallback: {buildFallbackLocationLabel(geoDetection.detectedKelurahan || kelurahan, displayCoords)}
                </span>
              ) : (
                <span className="truncate block">
                  Fallback otomatis jika kosong: {buildFallbackLocationLabel(geoDetection.detectedKelurahan || kelurahan, displayCoords)}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Separate Optional Landmark Field (Patokan Tambahan) */}
      <div>
        <label
          htmlFor="patokan-tambahan-input"
          className="text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1 flex items-center justify-between gap-2"
        >
          <span>Patokan Tambahan (Opsional):</span>
          <span className="text-[10px] font-normal text-slate-400">
            Misal: dekat halte, depan sekolah, seberang toko
          </span>
        </label>
        <input
          id="patokan-tambahan-input"
          type="text"
          maxLength={240}
          value={landmarkNote}
          onChange={(e) => onLandmarkNoteChange(e.target.value)}
          placeholder="Contoh: Depan SDN 01 / tepat sebelum tikungan gang masjid..."
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
        />
      </div>

      {/* 5. Quick Landmark Buttons (Covers all 7 Kelurahan including Serua & Sawah) */}
      <div>
        <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 block mb-1.5">
          Pilih Lokasi &amp; Patokan Populer 7 Kelurahan Ciputat:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {CIPUTAT_LANDMARKS.map((lm, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelectLandmarkFlyTo(lm)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer flex items-center gap-1 ${
                themeColors.subtleBg
              } bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:text-sky-600 border-slate-200 dark:border-slate-700`}
            >
              <span>📍</span>
              <span>{lm.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
