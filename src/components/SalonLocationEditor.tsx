// src/components/SalonLocationEditor.tsx
import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { MapPin, X, Loader2, Check, Navigation, AlertCircle, Users, Store } from 'lucide-react';
import { supabase } from '../lib/supabase';
import 'leaflet/dist/leaflet.css';

interface SalonLocationEditorProps {
  userId: string;
  initialLatitude?: number;
  initialLongitude?: number;
  initialAddress?: string;
  onClose: () => void;
  onSaved: (lat: number, lng: number, address?: string) => void;
}

interface SalonLocation {
  id: string;
  user_id: string;
  salon_name: string;
  full_name: string;
  latitude: number;
  longitude: number;
  address: string;
  avatar_url: string | null;
  has_active_subscription: boolean;
  distance: number;
}

// ────────────────────────────────────────────────────────────────
// 🗺️ COMPOSANT CARTE ISOLÉ
// Leaflet ne vit QUE dans ce composant. Aucun state React ne déclenche
// de re-render ici → React ne touche jamais au DOM de Leaflet.
// ────────────────────────────────────────────────────────────────
const LeafletMap = memo(function LeafletMap({
  initialLat,
  initialLng,
  onMarkerMoved,
  onReady,
}: {
  initialLat: number;
  initialLng: number;
  onMarkerMoved: (lat: number, lng: number) => void;
  onReady: (api: {
    setView: (lat: number, lng: number, zoom?: number) => void;
    setMarker: (lat: number, lng: number) => void;
    addSalonMarkers: (salons: SalonLocation[], currentUserId: string) => void;
  }) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const salonMarkersRef = useRef<any[]>([]);
  const leafletRef = useRef<any>(null);
  const onMarkerMovedRef = useRef(onMarkerMoved);
  const onReadyRef = useRef(onReady);

  // Garde les callbacks à jour sans relancer l'effet
  useEffect(() => { onMarkerMovedRef.current = onMarkerMoved; }, [onMarkerMoved]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  useEffect(() => {
    let cancelled = false;
    let mapInstance: any = null;

    (async () => {
      try {
        const L = (await import('leaflet')).default;
        if (cancelled || !containerRef.current) return;

        leafletRef.current = L;

        mapInstance = L.map(containerRef.current, {
          center: [initialLat, initialLng],
          zoom: 14,
          zoomControl: false,
          attributionControl: true,
        });

        L.control.zoom({ position: 'bottomright' }).addTo(mapInstance);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap',
        }).addTo(mapInstance);

        const salonIcon = L.divIcon({
          html: `<div style="display:flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:50%;background:#10b981;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          </div>`,
          className: '',
          iconSize: [40, 40],
          iconAnchor: [20, 40],
        });

        const markerInstance = L.marker([initialLat, initialLng], {
          draggable: true,
          icon: salonIcon,
        }).addTo(mapInstance);

        markerInstance.on('dragend', () => {
          const pos = markerInstance.getLatLng();
          onMarkerMovedRef.current(pos.lat, pos.lng);
        });

        mapRef.current = mapInstance;
        markerRef.current = markerInstance;

        // API exposée au parent
        onReadyRef.current({
          setView: (lat, lng, zoom = 15) => {
            mapRef.current?.setView([lat, lng], zoom);
          },
          setMarker: (lat, lng) => {
            markerRef.current?.setLatLng([lat, lng]);
          },
          addSalonMarkers: (salons, currentUserId) => {
            const L2 = leafletRef.current;
            if (!L2 || !mapRef.current) return;

            // Nettoyer les anciens marqueurs
            salonMarkersRef.current.forEach((m) => m?.remove?.());
            salonMarkersRef.current = [];

            salons.forEach((salon) => {
              if (salon.user_id === currentUserId) return;

              const icon = L2.divIcon({
                html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:50%;background:rgba(16,185,129,0.2);border:2px solid #34d399;box-shadow:0 2px 6px rgba(0,0,0,0.3)">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/></svg>
                </div>`,
                className: '',
                iconSize: [32, 32],
                iconAnchor: [16, 32],
              });

              const m = L2.marker([salon.latitude, salon.longitude], { icon })
                .addTo(mapRef.current)
                .bindPopup(
                  `<div style="text-align:center;padding:4px">
                    <div style="font-weight:700;font-size:13px">${salon.salon_name}</div>
                    <div style="font-size:11px;color:#666">${salon.distance.toFixed(1)} km</div>
                    ${salon.has_active_subscription ? '<div style="font-size:11px;color:#eab308">⭐ Abonné</div>' : ''}
                  </div>`
                );

              salonMarkersRef.current.push(m);
            });
          },
        });
      } catch (err) {
        console.warn('⚠️ Erreur init Leaflet:', err);
      }
    })();

    return () => {
      cancelled = true;
      // Cleanup PROPRE : on retire tous les marqueurs AVANT la carte
      try {
        salonMarkersRef.current.forEach((m) => m?.remove?.());
        salonMarkersRef.current = [];
        markerRef.current?.remove?.();
        markerRef.current = null;
        if (mapInstance) {
          mapInstance.off();
          mapInstance.remove();
        }
        mapRef.current = null;
      } catch (e) {
        // silencieux : Leaflet peut déjà avoir nettoyé
      }
    };
    // ⚠️ Volontairement : deps vides → la carte ne se réinitialise JAMAIS
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={containerRef}
      translate="no"
      className="w-full h-72 bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden"
      style={{ position: 'relative', zIndex: 0 }}
    />
  );
});

// ────────────────────────────────────────────────────────────────
// 🎛️ COMPOSANT PRINCIPAL
// ────────────────────────────────────────────────────────────────
export function SalonLocationEditor({
  userId,
  initialLatitude,
  initialLongitude,
  initialAddress,
  onClose,
  onSaved,
}: SalonLocationEditorProps) {
  const [latitude, setLatitude] = useState<number>(initialLatitude || 14.7167);
  const [longitude, setLongitude] = useState<number>(initialLongitude || -17.4677);
  const [address, setAddress] = useState<string>(initialAddress || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationFound, setLocationFound] = useState(
    !!(initialLatitude && initialLongitude && (initialLatitude !== 0 || initialLongitude !== 0))
  );
  const [nearbySalons, setNearbySalons] = useState<SalonLocation[]>([]);
  const [loadingSalons, setLoadingSalons] = useState(false);
  const [showNearbySalons, setShowNearbySalons] = useState(true);

  // API de la carte exposée par l'enfant
  const mapApiRef = useRef<{
    setView: (lat: number, lng: number, zoom?: number) => void;
    setMarker: (lat: number, lng: number) => void;
    addSalonMarkers: (salons: SalonLocation[], currentUserId: string) => void;
  } | null>(null);

  // ── Calcul distance Haversine ──
  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // ── Chargement des salons ──
  const loadNearbySalons = useCallback(async (lat: number, lng: number) => {
    setLoadingSalons(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, user_id, salon_name, full_name, latitude, longitude, address, avatar_url')
        .eq('is_active', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (profilesError) {
        console.error('Erreur chargement salons:', profilesError);
        return;
      }

      const userIds = profiles?.map((p) => p.user_id) || [];
      const subscriptionMap: Record<string, boolean> = {};

      if (userIds.length > 0) {
        const { data: subscriptions } = await supabase
          .from('subscriptions')
          .select('user_id, status')
          .in('user_id', userIds)
          .eq('status', 'active');

        subscriptions?.forEach((sub) => {
          subscriptionMap[sub.user_id] = true;
        });
      }

      const salonsWithDistance = (profiles || [])
        .filter((p) => p.latitude !== 0 && p.longitude !== 0)
        .map((p) => ({
          id: p.id,
          user_id: p.user_id,
          salon_name: p.salon_name || p.full_name || 'Salon',
          full_name: p.full_name || p.salon_name || 'Salon',
          latitude: p.latitude || 0,
          longitude: p.longitude || 0,
          address: p.address || '',
          avatar_url: p.avatar_url || null,
          has_active_subscription: subscriptionMap[p.user_id] || false,
          distance: calculateDistance(lat, lng, p.latitude || 0, p.longitude || 0),
        }))
        .sort((a, b) => a.distance - b.distance);

      setNearbySalons(salonsWithDistance);
      mapApiRef.current?.addSalonMarkers(salonsWithDistance, userId);
    } catch (err) {
      console.error('Erreur chargement salons:', err);
    } finally {
      setLoadingSalons(false);
    }
  }, [userId]);

  // ── Reverse geocoding ──
  const reverseGeocode = useCallback(async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`
      );
      const data = await response.json();
      if (data.display_name) setAddress(data.display_name);
    } catch (err) {
      console.error('Erreur géocodification inverse:', err);
    }
  }, []);

  // ── Géolocalisation ──
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError("La géolocalisation n'est pas supportée par votre navigateur");
      return;
    }

    setIsGettingLocation(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude: lat, longitude: lng } = position.coords;
        setLatitude(lat);
        setLongitude(lng);
        setLocationFound(true);
        mapApiRef.current?.setView(lat, lng, 16);
        mapApiRef.current?.setMarker(lat, lng);
        await reverseGeocode(lat, lng);
        await loadNearbySalons(lat, lng);
        setIsGettingLocation(false);
      },
      (err) => {
        console.error('Erreur géolocalisation:', err);
        setError("Impossible d'obtenir votre position. Vérifiez les autorisations.");
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [reverseGeocode, loadNearbySalons]);

  // ── Callback quand l'utilisateur déplace le marqueur ──
  const handleMarkerMoved = useCallback(
    (lat: number, lng: number) => {
      setLatitude(lat);
      setLongitude(lng);
      setLocationFound(true);
      reverseGeocode(lat, lng);
    },
    [reverseGeocode]
  );

  // ── Callback quand la carte est prête ──
  const handleMapReady = useCallback(
    (api: any) => {
      mapApiRef.current = api;
      // Charge les salons dès que la carte est prête
      loadNearbySalons(latitude, longitude);
    },
    [latitude, longitude, loadNearbySalons]
  );

  // ── Sauvegarde ──
  const handleSave = async () => {
    if (!locationFound) {
      setError("Veuillez d'abord obtenir votre position");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          latitude,
          longitude,
          address: address || null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (updateError) throw new Error(updateError.message);

      onSaved(latitude, longitude, address);
      onClose();
    } catch (err: any) {
      console.error('Erreur sauvegarde:', err);
      setError(err.message || 'Erreur lors de la sauvegarde');
    } finally {
      setSaving(false);
    }
  };

  const centerOnSalon = (salon: SalonLocation) => {
    mapApiRef.current?.setView(salon.latitude, salon.longitude, 15);
  };

  return (
    <div
      translate="no"
      className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4"
    >
      <div className="bg-zinc-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-zinc-700 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h3 className="text-white font-bold text-lg flex items-center gap-2">
            <MapPin className="w-5 h-5 text-emerald-400" />
            Définir la position du salon
          </h3>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-white transition p-1 rounded-lg hover:bg-zinc-800"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-col items-center gap-3">
            <button
              onClick={getCurrentLocation}
              disabled={isGettingLocation}
              className={`w-full flex items-center justify-center gap-3 py-4 rounded-xl font-semibold text-base transition ${
                locationFound
                  ? 'bg-emerald-500/20 border-2 border-emerald-400 text-emerald-400 hover:bg-emerald-500/30'
                  : 'bg-blue-500 hover:bg-blue-600 text-white'
              } disabled:opacity-50`}
            >
              {isGettingLocation ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Recherche de votre position...
                </>
              ) : locationFound ? (
                <>
                  <Check className="w-5 h-5" />
                  Position trouvée ✓
                </>
              ) : (
                <>
                  <Navigation className="w-5 h-5" />
                  📍 Partager ma position actuelle
                </>
              )}
            </button>

            {locationFound && (
              <p className="text-zinc-500 text-xs">
                ✅ Position trouvée • Vous pouvez aussi déplacer le marqueur sur la carte
              </p>
            )}

            {!locationFound && !isGettingLocation && (
              <p className="text-yellow-500 text-xs text-center">
                ⚠️ Cliquez sur le bouton pour partager votre position actuelle
              </p>
            )}
          </div>

          {/* 🗺️ Carte isolée */}
          <LeafletMap
            initialLat={latitude}
            initialLng={longitude}
            onMarkerMoved={handleMarkerMoved}
            onReady={handleMapReady}
          />

          {/* Salons à proximité */}
          {nearbySalons.length > 0 && (
            <div>
              <button
                onClick={() => setShowNearbySalons(!showNearbySalons)}
                className="flex items-center gap-2 text-zinc-400 text-sm font-medium hover:text-white transition"
              >
                <Users className="w-4 h-4" />
                Tous les salons ({nearbySalons.length})
                <span className="text-xs">{showNearbySalons ? '▼' : '▶'}</span>
              </button>

              {showNearbySalons && (
                <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
                  {loadingSalons ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                    </div>
                  ) : (
                    nearbySalons.map((salon) => (
                      <button
                        key={salon.id}
                        onClick={() => centerOnSalon(salon)}
                        className="w-full flex items-center gap-3 p-2 bg-zinc-800 rounded-xl hover:bg-zinc-700 transition border border-zinc-700"
                      >
                        <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                          {salon.avatar_url ? (
                            <img src={salon.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-emerald-500/20">
                              <Store className="w-4 h-4 text-emerald-400" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-white text-sm font-medium truncate">{salon.salon_name}</p>
                          <p className="text-zinc-400 text-xs">
                            {salon.distance.toFixed(1)} km
                          </p>
                        </div>
                        {salon.has_active_subscription && (
                          <span className="text-yellow-400 text-xs shrink-0">⭐</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Adresse */}
          {address && (
            <div className="bg-zinc-800 rounded-xl p-3 border border-zinc-700">
              <p className="text-zinc-400 text-xs mb-1">Adresse trouvée</p>
              <p className="text-white text-sm break-words">{address}</p>
            </div>
          )}

          {/* Coordonnées */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 text-xs mb-1.5">Latitude</label>
              <input
                type="number"
                step="0.000001"
                value={latitude}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setLatitude(v);
                  mapApiRef.current?.setMarker(v, longitude);
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-white transition"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-xs mb-1.5">Longitude</label>
              <input
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setLongitude(v);
                  mapApiRef.current?.setMarker(latitude, v);
                }}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2 text-white text-sm focus:outline-none focus:border-white transition"
              />
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving || !locationFound}
              className={`flex-1 font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 ${
                locationFound
                  ? 'bg-emerald-500 hover:bg-emerald-600 text-white'
                  : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              }`}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Enregistrer
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 rounded-xl transition"
            >
              Annuler
            </button>
          </div>

          {!locationFound && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-400 text-sm">
                ⚠️ Cliquez sur "Partager ma position actuelle" pour définir votre position
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}