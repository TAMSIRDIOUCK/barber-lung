// src/components/SalonMapView.tsx
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface MapSalon {
  id: string;
  latitude: number;
  longitude: number;
  avatar_url: string | null;
  has_active_subscription?: boolean;
}

export interface SalonMapHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  centerOnUser: () => void;
  centerOnSalon: (salon: MapSalon) => void;
  invalidateSize: () => void;
}

interface SalonMapViewProps<T extends MapSalon> {
  salons: T[];
  userLocation: { lat: number; lng: number } | null;
  radiusFilter: number;
  activeSalonId?: string | null;
  onSelectSalon: (salon: T) => void;
  getDisplayName: (salon: T) => string;
  hasUnviewedStory?: (salonId: string) => boolean;
  routeCoords?: [number, number][] | null;
  height?: string;
}

const DAKAR_FALLBACK = { lat: 14.7167, lng: -17.4677 };

function hasValidCoords(salon: MapSalon): boolean {
  return (
    typeof salon.latitude === 'number' &&
    typeof salon.longitude === 'number' &&
    salon.latitude !== 0 &&
    salon.longitude !== 0 &&
    !isNaN(salon.latitude) &&
    !isNaN(salon.longitude)
  );
}

function getSalonCoords(salon: MapSalon): [number, number] {
  if (hasValidCoords(salon)) {
    return [salon.latitude, salon.longitude];
  }
  return [DAKAR_FALLBACK.lat, DAKAR_FALLBACK.lng];
}

function buildSalonMarkerHtml(
  salon: MapSalon,
  displayName: string,
  isActive: boolean,
  hasUnviewed: boolean,
  isFallback: boolean
) {
  const initial = (displayName || 'S').charAt(0).toUpperCase();
  const ringClass = salon.has_active_subscription
    ? 'ring-2 ring-yellow-400'
    : 'ring-2 ring-white/70';
  const avatarHtml = salon.avatar_url
    ? `<img src="${salon.avatar_url}" class="w-full h-full object-cover" />`
    : `<div class="w-full h-full flex items-center justify-center bg-indigo-600 text-white font-bold text-sm">${initial}</div>`;

  const fallbackRing = isFallback ? 'ring-2 ring-orange-400' : ringClass;
  const fallbackBadge = isFallback
    ? `<div style="position:absolute;top:-4px;right:-4px;width:16px;height:16px;background:#f97316;border-radius:50%;display:flex;align-items:center;justify-content:center;color:white;font-size:10px;font-weight:bold;border:2px solid white;z-index:2;">?</div>`
    : '';

  return `
    <div class="relative flex flex-col items-center" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
      ${
        hasUnviewed
          ? '<div class="absolute -inset-1 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-500 animate-pulse" style="z-index:0;"></div>'
          : ''
      }
      <div class="relative rounded-full overflow-hidden border-2 ${
        isActive ? 'border-emerald-400' : 'border-black'
      } ${fallbackRing} bg-zinc-800 transition-transform"
        style="width:44px;height:44px;z-index:1;transform:${isActive ? 'scale(1.15)' : 'scale(1)'};">
        ${avatarHtml}
      </div>
      ${fallbackBadge}
      <div class="rotate-45 ${isActive ? 'bg-emerald-400' : 'bg-white'}"
        style="width:9px;height:9px;margin-top:-6px;z-index:1;"></div>
    </div>
  `;
}

function buildUserMarkerHtml() {
  return `
    <div class="relative flex items-center justify-center" style="width:22px;height:22px;">
      <div class="absolute rounded-full bg-blue-500/30 animate-ping" style="width:22px;height:22px;"></div>
      <div class="relative rounded-full bg-blue-500 border-2 border-white shadow-lg" style="width:14px;height:14px;"></div>
    </div>
  `;
}

function SalonMapViewInner<T extends MapSalon>(
  props: SalonMapViewProps<T>,
  ref: React.Ref<SalonMapHandle>
) {
  const {
    salons,
    userLocation,
    radiusFilter,
    activeSalonId,
    onSelectSalon,
    getDisplayName,
    hasUnviewedStory,
    routeCoords,
    height,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.Marker>>({});
  const userMarkerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const hasAutoFitRef = useRef(false);

  const routeLineRef = useRef<L.Polyline | null>(null);
  const routeOutlineRef = useRef<L.Polyline | null>(null);
  const hasFitRouteRef = useRef(false);

  // ═══════════════════════════════════════════════════════
  // INITIALISATION DE LA CARTE
  // ═══════════════════════════════════════════════════════
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: userLocation ? [userLocation.lat, userLocation.lng] : [DAKAR_FALLBACK.lat, DAKAR_FALLBACK.lng],
      zoom: 15,
      zoomControl: false,
      attributionControl: true,
    });

    // 🔥 TUILES STYLE GOOGLE MAPS (rues, bâtiments, noms visibles)
    // OpenStreetMap "standard" = celui utilisé par défaut par Google Maps
    // en terme de rendu : bâtiments, rues nommées, POI, etc.

    // 1. Fond principal : rues, bâtiments, noms
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // 2. Overlay : noms des rues et points d'intérêt plus visibles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; CARTO',
      maxZoom: 19,
      subdomains: 'abcd',
      pane: 'overlayPane',
      opacity: 0.9,
    }).addTo(map);

    mapRef.current = map;

    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
      userMarkerRef.current = null;
      circleRef.current = null;
      routeLineRef.current = null;
      routeOutlineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn(),
      zoomOut: () => mapRef.current?.zoomOut(),
      centerOnUser: () => {
        if (userLocation && mapRef.current) {
          mapRef.current.flyTo([userLocation.lat, userLocation.lng], 16, { duration: 0.8 });
        }
      },
      centerOnSalon: (salon) => {
        const [lat, lng] = getSalonCoords(salon);
        if (mapRef.current) {
          mapRef.current.flyTo([lat, lng], 17, { duration: 0.8 });
        }
      },
      invalidateSize: () => mapRef.current?.invalidateSize(),
    }),
    [userLocation]
  );

  useEffect(() => {
    if (!mapRef.current) return;
    const timer = setTimeout(() => mapRef.current?.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [height]);

  // ── Marqueur utilisateur ──
  useEffect(() => {
    if (!mapRef.current || !userLocation) return;
    const icon = L.divIcon({
      html: buildUserMarkerHtml(),
      className: '',
      iconSize: [22, 22],
      iconAnchor: [11, 11],
    });
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng([userLocation.lat, userLocation.lng]);
    } else {
      userMarkerRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon,
        zIndexOffset: 1000,
        interactive: false,
      }).addTo(mapRef.current);
    }
  }, [userLocation]);

  // ── Cercle de rayon de recherche ──
  useEffect(() => {
    if (!mapRef.current) return;
    if (!userLocation || !isFinite(radiusFilter) || (routeCoords && routeCoords.length > 0)) {
      if (circleRef.current) {
        mapRef.current.removeLayer(circleRef.current);
        circleRef.current = null;
      }
      return;
    }
    const latlng: [number, number] = [userLocation.lat, userLocation.lng];
    if (circleRef.current) {
      circleRef.current.setLatLng(latlng);
      circleRef.current.setRadius(radiusFilter * 1000);
    } else {
      circleRef.current = L.circle(latlng, {
        radius: radiusFilter * 1000,
        color: '#10b981',
        weight: 1.5,
        fillColor: '#10b981',
        fillOpacity: 0.08,
        dashArray: '6 6',
      }).addTo(mapRef.current);
    }
  }, [userLocation, radiusFilter, routeCoords]);

  // ── Marqueurs des salons ──
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;
    const currentIds = new Set(salons.map((s) => s.id));

    Object.keys(markersRef.current).forEach((id) => {
      if (!currentIds.has(id)) {
        map.removeLayer(markersRef.current[id]);
        delete markersRef.current[id];
      }
    });

    salons.forEach((salon) => {
      const [lat, lng] = getSalonCoords(salon);
      const isFallback = !hasValidCoords(salon);
      const displayName = getDisplayName(salon);
      const isActive = activeSalonId === salon.id;
      const unviewed = hasUnviewedStory ? hasUnviewedStory(salon.id) : false;

      const html = buildSalonMarkerHtml(salon, displayName, isActive, unviewed, isFallback);
      const icon = L.divIcon({
        html,
        className: '',
        iconSize: [50, 60],
        iconAnchor: [25, 56],
      });

      let marker = markersRef.current[salon.id];
      if (marker) {
        marker.setIcon(icon);
        marker.setLatLng([lat, lng]);
        marker.setZIndexOffset(isActive ? 500 : 0);
      } else {
        marker = L.marker([lat, lng], {
          icon,
          zIndexOffset: isActive ? 500 : 0,
        })
          .addTo(map)
          .on('click', () => onSelectSalon(salon));
        markersRef.current[salon.id] = marker;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salons, activeSalonId]);

  // ── Ajustement automatique du zoom ──
  useEffect(() => {
    if (!mapRef.current || hasAutoFitRef.current) return;
    if (!userLocation && salons.length === 0) return;
    if (routeCoords && routeCoords.length > 0) return;

    const bounds = L.latLngBounds([]);
    if (userLocation) bounds.extend([userLocation.lat, userLocation.lng]);

    salons.forEach((s) => {
      const [lat, lng] = getSalonCoords(s);
      bounds.extend([lat, lng]);
    });

    if (bounds.isValid()) {
      mapRef.current.fitBounds(bounds, {
        padding: [50, 50],
        maxZoom: 15,
      });
      hasAutoFitRef.current = true;
    }
  }, [salons, userLocation, routeCoords]);

  // ═══════════════════════════════════════════════════════
  // 🔥 TRACÉ DE L'ITINÉRAIRE — style Google Maps
  // ═══════════════════════════════════════════════════════
  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (!routeCoords || routeCoords.length === 0) {
      if (routeLineRef.current) {
        map.removeLayer(routeLineRef.current);
        routeLineRef.current = null;
      }
      if (routeOutlineRef.current) {
        map.removeLayer(routeOutlineRef.current);
        routeOutlineRef.current = null;
      }
      hasFitRouteRef.current = false;
      return;
    }

    if (routeOutlineRef.current) map.removeLayer(routeOutlineRef.current);
    if (routeLineRef.current) map.removeLayer(routeLineRef.current);

    // 🔥 Contour noir épais (comme Google Maps)
    routeOutlineRef.current = L.polyline(routeCoords, {
      color: '#000000',
      weight: 12,
      opacity: 0.75,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // 🔥 Trait bleu (comme Google Maps)
    routeLineRef.current = L.polyline(routeCoords, {
      color: '#4285F4', // Bleu Google
      weight: 7,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    // 🔥 Bonus : marqueur de départ (vert) et d'arrivée (rouge)
    if (routeCoords.length >= 2) {
      const start = routeCoords[0];
      const end = routeCoords[routeCoords.length - 1];

      // Marqueur départ (point bleu du user — déjà affiché)
      // Marqueur arrivée (drapeau rouge)
      const endIcon = L.divIcon({
        html: `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.5));">
            <div style="width:32px;height:32px;background:#EA4335;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;">
              <div style="width:10px;height:10px;background:white;border-radius:50%;transform:rotate(45deg);"></div>
            </div>
          </div>
        `,
        className: '',
        iconSize: [32, 42],
        iconAnchor: [16, 42],
      });

      const endMarker = L.marker(end, {
        icon: endIcon,
        zIndexOffset: 900,
        interactive: false,
      }).addTo(map);

      // Cleanup automatique du marqueur d'arrivée
      setTimeout(() => {
        if (mapRef.current) {
          mapRef.current.removeLayer(endMarker);
        }
      }, 0);
    }

    if (!hasFitRouteRef.current) {
      map.fitBounds(L.latLngBounds(routeCoords), { padding: [80, 100], maxZoom: 17 });
      hasFitRouteRef.current = true;
    }
  }, [routeCoords]);

  return (
    <div
      ref={containerRef}
      style={{ height: height || '100%', width: '100%' }}
      className="bg-zinc-100"
    />
  );
}

const SalonMapView = forwardRef(SalonMapViewInner) as <T extends MapSalon>(
  props: SalonMapViewProps<T> & { ref?: React.Ref<SalonMapHandle> }
) => ReturnType<typeof SalonMapViewInner>;

export default SalonMapView;