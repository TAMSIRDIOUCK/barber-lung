// src/components/SalonLocationEditor.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin, X, Loader2, Check, Navigation, AlertCircle, Store, Users, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';

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
  const [locationFound, setLocationFound] = useState(false);
  const [nearbySalons, setNearbySalons] = useState<SalonLocation[]>([]);
  const [loadingSalons, setLoadingSalons] = useState(false);
  const [showNearbySalons, setShowNearbySalons] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<any>(null);
  const [marker, setMarker] = useState<any>(null);
  const [userMarker, setUserMarker] = useState<any>(null);
  const [salonMarkers, setSalonMarkers] = useState<any[]>([]);

  // ── Obtenir la position actuelle ──
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('La géolocalisation n\'est pas supportée par votre navigateur');
      return;
    }

    setIsGettingLocation(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        console.log('📍 Position obtenue:', latitude, longitude);
        
        // Mettre à jour les coordonnées
        setLatitude(latitude);
        setLongitude(longitude);
        setLocationFound(true);
        
        // Centrer la carte sur la position
        if (map) {
          map.setView([latitude, longitude], 16);
        }
        
        // Mettre à jour le marqueur
        if (marker) {
          marker.setLatLng([latitude, longitude]);
        }
        
        // Récupérer l'adresse
        try {
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18`
          );
          const data = await response.json();
          if (data.display_name) {
            setAddress(data.display_name);
          }
        } catch (err) {
          console.error('Erreur géocodification:', err);
        }

        // Charger les salons à proximité
        await loadNearbySalons(latitude, longitude);
        
        setIsGettingLocation(false);
      },
      (err) => {
        console.error('Erreur géolocalisation:', err);
        setError('Impossible d\'obtenir votre position. Vérifiez les autorisations.');
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [map, marker]);

  // ── Charger les salons à proximité ──
  const loadNearbySalons = useCallback(async (lat: number, lng: number) => {
    setLoadingSalons(true);
    try {
      const { data: profiles, error } = await supabase
        .from('profiles')
        .select('id, user_id, salon_name, full_name, latitude, longitude, address, avatar_url')
        .eq('is_active', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (error) {
        console.error('Erreur chargement salons:', error);
        return;
      }

      const userIds = profiles?.map(p => p.user_id) || [];
      let subscriptionMap: Record<string, boolean> = {};
      
      if (userIds.length > 0) {
        const { data: subscriptions } = await supabase
          .from('subscriptions')
          .select('user_id, status')
          .in('user_id', userIds)
          .eq('status', 'active');

        if (subscriptions) {
          subscriptions.forEach((sub) => {
            subscriptionMap[sub.user_id] = true;
          });
        }
      }

      const salonsWithDistance = (profiles || [])
        .map((p) => {
          const distance = calculateDistance(lat, lng, p.latitude || 0, p.longitude || 0);
          return {
            id: p.id,
            user_id: p.user_id,
            salon_name: p.salon_name || p.full_name || 'Salon',
            full_name: p.full_name || p.salon_name || 'Salon',
            latitude: p.latitude || 0,
            longitude: p.longitude || 0,
            address: p.address || '',
            avatar_url: p.avatar_url || null,
            has_active_subscription: subscriptionMap[p.user_id] || false,
            distance: distance
          };
        })
        .filter(s => s.distance <= 50)
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 20);

      setNearbySalons(salonsWithDistance);

      if (map) {
        addSalonMarkers(salonsWithDistance);
      }

    } catch (err) {
      console.error('Erreur chargement salons:', err);
    } finally {
      setLoadingSalons(false);
    }
  }, [map]);

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const addSalonMarkers = useCallback(async (salons: SalonLocation[]) => {
    if (!map) return;

    salonMarkers.forEach(m => {
      if (m && m.remove) {
        m.remove();
      }
    });
    setSalonMarkers([]);

    try {
      const L = await import('leaflet');
      const newMarkers: any[] = [];

      salons.forEach((salon) => {
        if (salon.user_id === userId) return;

        const icon = L.divIcon({
          html: `<div class="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 border-2 border-emerald-400 shadow-lg">
            <Store class="w-4 h-4 text-emerald-400" />
          </div>`,
          className: 'custom-marker',
          iconSize: [32, 32],
          iconAnchor: [16, 32],
        });

        const marker = L.marker([salon.latitude, salon.longitude], { icon })
          .addTo(map)
          .bindPopup(`
            <div class="text-center p-2">
              <div class="font-bold text-sm">${salon.salon_name}</div>
              <div class="text-xs text-gray-500">${salon.distance ? salon.distance.toFixed(1) + ' km' : ''}</div>
              ${salon.has_active_subscription ? '<div class="text-xs text-yellow-500">⭐ Abonné</div>' : ''}
            </div>
          `);

        newMarkers.push(marker);
      });

      setSalonMarkers(newMarkers);
    } catch (err) {
      console.error('Erreur ajout marqueurs:', err);
    }
  }, [map, userId]);

  // ── Initialisation de la carte ──
  useEffect(() => {
    const loadMap = async () => {
      try {
        const L = await import('leaflet');
        
        if (!mapRef.current) return;

        const mapInstance = L.map(mapRef.current, {
          center: [latitude, longitude],
          zoom: 14,
          zoomControl: false,
        });

        L.control.zoom({
          position: 'bottomright'
        }).addTo(mapInstance);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution: '© OpenStreetMap'
        }).addTo(mapInstance);

        // Marqueur du salon (draggable)
        const salonIcon = L.divIcon({
          html: `<div class="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-500 border-2 border-white shadow-lg">
            <MapPin class="w-5 h-5 text-white" />
          </div>`,
          className: 'custom-marker',
          iconSize: [40, 40],
          iconAnchor: [20, 40],
        });

        const salonMarkerInstance = L.marker([latitude, longitude], {
          draggable: true,
          icon: salonIcon,
        }).addTo(mapInstance);

        salonMarkerInstance.on('dragend', () => {
          const pos = salonMarkerInstance.getLatLng();
          setLatitude(pos.lat);
          setLongitude(pos.lng);
          setLocationFound(true);
          reverseGeocode(pos.lat, pos.lng);
        });

        setMap(mapInstance);
        setMarker(salonMarkerInstance);

        // Si aucune position n'est définie, demander automatiquement la position
        if (!initialLatitude || !initialLongitude || initialLatitude === 0 || initialLongitude === 0) {
          setTimeout(() => {
            getCurrentLocation();
          }, 500);
        } else {
          setLocationFound(true);
          // Charger les salons à proximité
          loadNearbySalons(initialLatitude, initialLongitude);
        }

        return () => {
          mapInstance.remove();
        };
      } catch (err) {
        console.warn('⚠️ Leaflet non disponible:', err);
        setError('La carte n\'est pas disponible. Veuillez entrer les coordonnées manuellement.');
      }
    };

    loadMap();
  }, []);

  useEffect(() => {
    if (map && marker) {
      map.setView([latitude, longitude], 15);
      marker.setLatLng([latitude, longitude]);
    }
  }, [latitude, longitude, map, marker]);

  const reverseGeocode = async (lat: number, lng: number) => {
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`
      );
      const data = await response.json();
      if (data.display_name) {
        setAddress(data.display_name);
      }
    } catch (err) {
      console.error('Erreur géocodification inverse:', err);
    }
  };

  const handleSave = async () => {
    if (!locationFound) {
      setError('Veuillez d\'abord obtenir votre position');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          latitude: latitude,
          longitude: longitude,
          address: address || null,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) {
        throw new Error(updateError.message);
      }

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
    if (map) {
      map.setView([salon.latitude, salon.longitude], 15);
    }
  };

  return (
    <div className="fixed inset-0 z-[150] bg-black/80 flex items-center justify-center p-4">
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
          {/* Message d'erreur */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Bouton principal - Partager ma position */}
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
                  <Target className="w-5 h-5" />
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

          {/* Carte */}
          <div className="relative">
            <div 
              ref={mapRef} 
              className="w-full h-72 bg-zinc-800 rounded-xl border border-zinc-700 overflow-hidden relative"
            >
              <div className="absolute inset-0 flex flex-col items-center justify-center text-zinc-500">
                {isGettingLocation ? (
                  <>
                    <Loader2 className="w-8 h-8 mb-2 animate-spin text-blue-400" />
                    <p className="text-sm">Recherche de votre position...</p>
                  </>
                ) : (
                  <>
                    <MapPin className="w-12 h-12 mb-2 text-zinc-600" />
                    <p className="text-sm">Chargement de la carte...</p>
                  </>
                )}
              </div>
            </div>

            {/* Légende */}
            <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-xl px-3 py-2 text-xs text-zinc-300 flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-emerald-500 border border-white"></div>
                <span>Mon salon</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Store className="w-3 h-3 text-emerald-400" />
                <span>Salons</span>
              </div>
            </div>
          </div>

          {/* Salons à proximité */}
          {nearbySalons.length > 0 && (
            <div>
              <button
                onClick={() => setShowNearbySalons(!showNearbySalons)}
                className="flex items-center gap-2 text-zinc-400 text-sm font-medium hover:text-white transition"
              >
                <Users className="w-4 h-4" />
                Salons à proximité ({nearbySalons.length})
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
                        <div className="flex-1 text-left">
                          <p className="text-white text-sm font-medium">{salon.salon_name}</p>
                          <p className="text-zinc-400 text-xs">
                            {salon.distance ? salon.distance.toFixed(1) : '0.0'} km
                          </p>
                        </div>
                        {salon.has_active_subscription && (
                          <span className="text-yellow-400 text-xs">⭐</span>
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
              <p className="text-white text-sm">{address}</p>
            </div>
          )}

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
                  Enregistrer la position
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