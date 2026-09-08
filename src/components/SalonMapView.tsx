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
  radiusFilter: number; // km, Infinity = pas de cercle
  activeSalonId?: string | null;
  onSelectSalon: (salon: T) => void;
  getDisplayName: (salon: T) => string;
  hasUnviewedStory?: (salonId: string) => boolean;
  routeCoords?: [number, number][] | null;
  height?: string;
}

// ── HTML du marqueur salon (photo de profil ronde + pointe) ──
function buildSalonMarkerHtml(
  salon: MapSalon,
  displayName: string,
  isActive: boolean,
  hasUnviewed: boolean
) {
  const initial = (displayName || 'S').charAt(0).toUpperCase();
  const ringClass = salon.has_active_subscription
    ? 'ring-2 ring-yellow-400'
    : 'ring-2 ring-white/70';
  const avatarHtml = salon.avatar_url
    ? `<img src="${salon.avatar_url}" class="w-full h-full object-cover" />`
    : `<div class="w-full h-full flex items-center justify-center bg-indigo-600 text-white font-bold text-sm">${initial}</div>`;

  return `
    <div class="relative flex flex-col items-center" style="filter: drop-shadow(0 4px 6px rgba(0,0,0,0.5));">
      ${
        hasUnviewed
          ? '<div class="absolute -inset-1 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-500 animate-pulse" style="z-index:0;"></div>'
          : ''
      }
      <div class="relative rounded-full overflow-hidden border-2 ${
        isActive ? 'border-emerald-400' : 'border-black'
      } ${ringClass} bg-zinc-800 transition-transform"
        style="width:44px;height:44px;z-index:1;transform:${isActive ? 'scale(1.15)' : 'scale(1)'};">
        ${avatarHtml}
      </div>
      <div class="rotate-45 ${isActive ? 'bg-emerald-400' : 'bg-white'}"
        style="width:9px;height:9px;margin-top:-6px;z-index:1;"></div>
    </div>
  `;
}

// ── HTML du marqueur "ma position" (point bleu pulsant) ──
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

  // ── Initialisation de la carte ──
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: userLocation ? [userLocation.lat, userLocation.lng] : [14.7167, -17.4677],
      zoom: 13,
      zoomControl: false,
      attributionControl: true,
    });

    // Fond de carte sombre et moderne (CartoDB Dark Matter)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      maxZoom: 19,
      subdomains: 'abcd',
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

  // ── Exposer les commandes à l'extérieur ──
  useImperativeHandle(
    ref,
    () => ({
      zoomIn: () => mapRef.current?.zoomIn(),
      zoomOut: () => mapRef.current?.zoomOut(),
      centerOnUser: () => {
        if (userLocation && mapRef.current) {
          mapRef.current.flyTo([userLocation.lat, userLocation.lng], 14, { duration: 0.8 });
        }
      },
      centerOnSalon: (salon) => {
        if (salon.latitude && salon.longitude && mapRef.current) {
          mapRef.current.flyTo([salon.latitude, salon.longitude], 15, { duration: 0.8 });
        }
      },
      invalidateSize: () => mapRef.current?.invalidateSize(),
    }),
    [userLocation]
  );

  // ── Recalcule la taille quand le conteneur change (ex: passage en plein écran) ──
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
        weight: 1,
        fillColor: '#10b981',
        fillOpacity: 0.06,
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
      if (!salon.latitude || !salon.longitude) return;
      const displayName = getDisplayName(salon);
      const isActive = activeSalonId === salon.id;
      const unviewed = hasUnviewedStory ? hasUnviewedStory(salon.id) : false;
      const html = buildSalonMarkerHtml(salon, displayName, isActive, unviewed);
      const icon = L.divIcon({
        html,
        className: '',
        iconSize: [50, 60],
        iconAnchor: [25, 56],
      });

      let marker = markersRef.current[salon.id];
      if (marker) {
        marker.setIcon(icon);
        marker.setLatLng([salon.latitude, salon.longitude]);
        marker.setZIndexOffset(isActive ? 500 : 0);
      } else {
        marker = L.marker([salon.latitude, salon.longitude], {
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

  // ── Ajustement automatique du zoom au premier chargement ──
  useEffect(() => {
    if (!mapRef.current || hasAutoFitRef.current) return;
    if (!userLocation || salons.length === 0) return;
    if (routeCoords && routeCoords.length > 0) return;

    const bounds = L.latLngBounds([[userLocation.lat, userLocation.lng]]);
    salons.forEach((s) => {
      if (s.latitude && s.longitude) bounds.extend([s.latitude, s.longitude]);
    });
    mapRef.current.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 });
    hasAutoFitRef.current = true;
  }, [salons, userLocation, routeCoords]);

  // ── Tracé de l'itinéraire (effet "glow" façon Yango) ──
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

    routeOutlineRef.current = L.polyline(routeCoords, {
      color: '#000',
      weight: 9,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    routeLineRef.current = L.polyline(routeCoords, {
      color: '#10b981',
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);

    if (!hasFitRouteRef.current) {
      map.fitBounds(L.latLngBounds(routeCoords), { padding: [70, 90], maxZoom: 16 });
      hasFitRouteRef.current = true;
    }
  }, [routeCoords]);

  return <div ref={containerRef} style={{ height: height || '100%', width: '100%' }} className="bg-zinc-900" />;
}

const SalonMapView = forwardRef(SalonMapViewInner) as <T extends MapSalon>(
  props: SalonMapViewProps<T> & { ref?: React.Ref<SalonMapHandle> }
) => ReturnType<typeof SalonMapViewInner>;

export default SalonMapView;