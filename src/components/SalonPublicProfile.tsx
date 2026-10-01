// src/components/SalonPublicProfile.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, Star, MapPin, Phone, Scissors, Heart, X, Loader2,
  Route as RouteIcon, UserCheck, UserPlus as UserPlusIcon,
  Grid3x3, Share2, MessageCircle, Eye, Play, Music, Check, Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import SalonMapView from './SalonMapView';

interface PortfolioPost {
  id: string;
  profile_id: string;
  image_url: string;
  caption: string;
  media_type: 'image' | 'video';
  like_count: number;
  view_count: number;
  created_at: string;
}

interface SalonPublicProfileProps {
  salonId: string;
  isAuthenticated?: boolean;
  currentUserId?: string | null;
  isFollowing?: boolean;
  onFollowToggle?: (salonId: string) => void;
  onBack: () => void;
  onBook?: (slug: string | null) => void;
  onStartItinerary?: (salon: any) => void;
  userLocation?: { lat: number; lng: number } | null;
  showToast?: (msg: string) => void;
}

interface RouteState {
  distanceKm: number;
  durationMin: number;
  coords: [number, number][];
}

export function SalonPublicProfile({
  salonId,
  isAuthenticated = false,
  currentUserId = null,
  isFollowing: initialFollowing = false,
  onFollowToggle,
  onBack,
  onBook,
  userLocation = null,
  showToast,
}: SalonPublicProfileProps) {
  const [salon, setSalon] = useState<any>(null);
  const [posts, setPosts] = useState<PortfolioPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<PortfolioPost | null>(null);
  const [following, setFollowing] = useState(initialFollowing);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<'grid' | 'reels'>('grid');

  // 🔥 Itinéraire intégré (carte plein écran DANS cette page)
  const [showRouteMap, setShowRouteMap] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteState | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  // 🔥 Partage
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const mapRef = useRef<any>(null);

  // Charge salon + portfolio + likes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', salonId)
          .maybeSingle();

        if (cancelled) return;
        setSalon(profileData);

        const { data: postsData } = await supabase
          .from('portfolio_posts')
          .select('*')
          .eq('profile_id', salonId)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (cancelled) return;
        setPosts(postsData || []);

        if (isAuthenticated && currentUserId) {
          const { data: likes } = await supabase
            .from('likes')
            .select('target_id')
            .eq('profile_id', currentUserId)
            .eq('target_type', 'portfolio');
          if (!cancelled && likes) {
            setUserLikes(new Set(likes.map((l: any) => l.target_id)));
          }
        }
      } catch (err) {
        console.error('❌ Erreur chargement profil:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [salonId, isAuthenticated, currentUserId]);

  // 🔥 Calcul de l'itinéraire EN LOCAL — JAMAIS délégué au parent
  const handleStartItinerary = useCallback(async () => {
    if (!salon?.latitude || !salon?.longitude) {
      showToast?.('Position du salon indisponible');
      return;
    }
    if (!userLocation) {
      showToast?.('Activez votre position pour voir l\'itinéraire');
      return;
    }

    // 🔥 Ouvre la carte dans CETTE page
    setShowRouteMap(true);
    setRouteLoading(true);
    setRouteError(null);
    setRouteInfo(null);

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${userLocation.lng},${userLocation.lat};${salon.longitude},${salon.latitude}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.code !== 'Ok' || !data.routes?.[0]) {
        throw new Error('Route introuvable');
      }

      const route = data.routes[0];
      const coords: [number, number][] = route.geometry.coordinates.map(
        (c: [number, number]) => [c[1], c[0]] as [number, number]
      );

      setRouteInfo({
        distanceKm: route.distance / 1000,
        durationMin: route.duration / 60,
        coords,
      });
    } catch (err) {
      console.error('Erreur itinéraire:', err);
      setRouteError("Itinéraire indisponible");
      showToast?.('Ouverture dans Google Maps à la place...');
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${salon.latitude},${salon.longitude}`,
        '_blank'
      );
    } finally {
      setRouteLoading(false);
    }
  }, [salon, userLocation, showToast]);

  const closeRouteMap = useCallback(() => {
    setShowRouteMap(false);
    setRouteInfo(null);
    setRouteError(null);
  }, []);

  // 🔥 Partage fonctionnel
  const handleShare = useCallback(async () => {
    const shareUrl = `${window.location.origin}/salon/${salonId}`;
    const shareData = {
      title: salon?.salon_name || salon?.full_name || 'Salon',
      text: `Découvre ${salon?.salon_name || salon?.full_name || 'ce salon'} sur LE COUPE`,
      url: shareUrl,
    };

    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        setShareFeedback('Partagé !');
        setTimeout(() => setShareFeedback(null), 1800);
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        setShareFeedback('Lien copié !');
        setTimeout(() => setShareFeedback(null), 1800);
      } else {
        window.prompt('Copiez ce lien :', shareUrl);
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Erreur partage:', err);
        try {
          await navigator.clipboard.writeText(shareUrl);
          setShareFeedback('Lien copié !');
          setTimeout(() => setShareFeedback(null), 1800);
        } catch {
          setShareFeedback('Erreur partage');
          setTimeout(() => setShareFeedback(null), 1800);
        }
      }
    }
  }, [salon, salonId]);

  const toggleLike = useCallback(async (post: PortfolioPost) => {
    if (!isAuthenticated || !currentUserId) return;
    const wasLiked = userLikes.has(post.id);

    setUserLikes((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(post.id); else next.add(post.id);
      return next;
    });

    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, like_count: Math.max((p.like_count || 0) + (wasLiked ? -1 : 1), 0) }
          : p
      )
    );

    try {
      if (wasLiked) {
        await supabase
          .from('likes')
          .delete()
          .eq('profile_id', currentUserId)
          .eq('target_type', 'portfolio')
          .eq('target_id', post.id);
      } else {
        await supabase.from('likes').insert({
          profile_id: currentUserId,
          target_type: 'portfolio',
          target_id: post.id,
        });
      }
    } catch (err) {
      console.error('Erreur like:', err);
    }
  }, [isAuthenticated, currentUserId, userLikes]);

  if (loading) {
    return (
      <div translate="no" className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  if (!salon) {
    return (
      <div translate="no" className="min-h-screen bg-black flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-zinc-400">Profil introuvable</p>
        <button onClick={onBack} className="bg-white text-black px-4 py-2 rounded-full font-semibold">
          Retour
        </button>
      </div>
    );
  }

  const displayName = salon.salon_name || salon.full_name || 'Salon';
  const gridPosts = posts.filter((p) => p.media_type === 'image');
  const reelsPosts = posts.filter((p) => p.media_type === 'video');

  // 🔥 Affichage de la carte itinéraire plein écran — DANS cette page
  if (showRouteMap) {
    return (
      <div translate="no" className="fixed inset-0 z-[200] bg-zinc-950 flex flex-col">
        <header className="bg-black/95 backdrop-blur-md border-b border-zinc-800 flex items-center gap-3 px-4 h-14 flex-shrink-0">
          <button onClick={closeRouteMap} className="p-1 text-white hover:opacity-80">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base truncate">Itinéraire</h1>
            <p className="text-zinc-500 text-xs truncate">Vers {displayName}</p>
          </div>
        </header>

        <div className="flex-1 relative min-h-0">
          <div className="absolute inset-0">
            <SalonMapView
              ref={mapRef}
              salons={[{
                id: salon.id,
                user_id: salon.user_id,
                full_name: salon.full_name,
                salon_name: salon.salon_name,
                phone: salon.phone,
                email: salon.email,
                address: salon.address,
                latitude: salon.latitude,
                longitude: salon.longitude,
                avatar_url: salon.avatar_url,
                cover_image: salon.cover_image,
                description: salon.description,
                is_active: true,
                created_at: salon.created_at,
                slug: salon.slug,
              }]}
              userLocation={userLocation}
              radiusFilter={Infinity}
              activeSalonId={salon.id}
              onSelectSalon={() => {}}
              getDisplayName={() => displayName}
              hasUnviewedStory={() => false}
              routeCoords={routeInfo?.coords || null}
              height="100%"
            />
          </div>

          {routeLoading && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-20">
              <div className="bg-zinc-900 border border-zinc-700 rounded-2xl px-6 py-5 flex flex-col items-center gap-3 shadow-2xl">
                <Loader2 className="w-7 h-7 text-emerald-400 animate-spin" />
                <p className="text-white text-sm font-medium">Calcul de l'itinéraire...</p>
              </div>
            </div>
          )}

          {routeError && !routeLoading && (
            <div className="absolute top-4 left-4 right-4 bg-red-500/15 border border-red-500/40 rounded-xl p-3 flex items-start gap-2 z-20">
              <span className="text-red-400 text-xs">{routeError}</span>
            </div>
          )}

          {routeInfo && !routeLoading && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-transparent pt-10 pb-4 px-4">
              <div className="bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-2xl p-4 shadow-2xl">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0 border-2 border-emerald-400">
                    {salon.avatar_url ? (
                      <img src={salon.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Scissors className="w-5 h-5 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{displayName}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                        <RouteIcon className="w-3.5 h-3.5" />
                        {routeInfo.distanceKm.toFixed(1)} km
                      </span>
                      <span className="flex items-center gap-1 text-zinc-300 text-xs font-bold">
                        <Clock className="w-3.5 h-3.5" />
                        {routeInfo.durationMin < 60
                          ? `${Math.round(routeInfo.durationMin)} min`
                          : `${Math.floor(routeInfo.durationMin / 60)} h ${Math.round(routeInfo.durationMin % 60)} min`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => {
                      window.open(
                        `https://www.google.com/maps/dir/?api=1&destination=${salon.latitude},${salon.longitude}`,
                        '_blank'
                      );
                    }}
                    className="flex-1 bg-white text-black font-semibold py-2.5 rounded-xl text-sm hover:bg-zinc-200 transition"
                  >
                    Ouvrir dans Maps
                  </button>
                  {onBook && (
                    <button
                      onClick={() => {
                        closeRouteMap();
                        onBook(salon.slug);
                      }}
                      disabled={!salon.slug}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-40"
                    >
                      Réserver
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div translate="no" className="min-h-screen bg-black text-white pb-24">
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md border-b border-zinc-800 flex items-center gap-3 px-4 h-14">
        <button onClick={onBack} className="p-1 -ml-1 text-white hover:opacity-80">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="flex-1 font-bold text-base truncate">
          @{displayName.toLowerCase().replace(/\s/g, '_')}
        </h1>
        <button
          onClick={handleShare}
          className="p-1 text-white hover:opacity-80 relative"
          title="Partager"
        >
          {shareFeedback ? (
            <Check className="w-5 h-5 text-emerald-400" />
          ) : (
            <Share2 className="w-5 h-5" />
          )}
        </button>
      </header>

      {shareFeedback && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[150] bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl">
          {shareFeedback}
        </div>
      )}

      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 flex-shrink-0">
            <div className="w-full h-full rounded-full bg-black p-[2px]">
              <div className="w-full h-full rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center">
                {salon.avatar_url ? (
                  <img src={salon.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Scissors className="w-8 h-8 text-white" />
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-0 grid grid-cols-3 gap-2">
            <div className="text-center">
              <p className="font-bold text-lg">{posts.length}</p>
              <p className="text-zinc-400 text-xs">Publications</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg">{salon.followers_count || 0}</p>
              <p className="text-zinc-400 text-xs">Abonnés</p>
            </div>
            <div className="text-center">
              <p className="font-bold text-lg flex items-center justify-center gap-1">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                {(salon.rating || 0).toFixed(1)}
              </p>
              <p className="text-zinc-400 text-xs">Note</p>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <p className="font-bold text-sm">{displayName}</p>
          {salon.description && (
            <p className="text-zinc-300 text-xs mt-0.5 whitespace-pre-wrap">{salon.description}</p>
          )}
          {salon.address && (
            <p className="text-zinc-500 text-xs mt-1 flex items-center gap-1">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{salon.address}</span>
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-4">
          {onBook && (
            <button
              onClick={() => onBook(salon.slug)}
              disabled={!salon.slug}
              className="flex-1 bg-white text-black font-semibold py-2 rounded-lg text-sm hover:bg-zinc-200 transition disabled:opacity-40"
            >
              Réserver
            </button>
          )}
          <button
            onClick={handleStartItinerary}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2 rounded-lg text-sm transition flex items-center justify-center gap-1"
          >
            <RouteIcon className="w-4 h-4" /> Itinéraire
          </button>
          {isAuthenticated && currentUserId !== salon.user_id && (
            <button
              onClick={() => {
                onFollowToggle?.(salonId);
                setFollowing((f) => !f);
              }}
              className={`flex-1 font-semibold py-2 rounded-lg text-sm transition flex items-center justify-center gap-1 ${
                following
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {following ? (
                <><UserCheck className="w-4 h-4" /> Suivi</>
              ) : (
                <><UserPlusIcon className="w-4 h-4" /> Suivre</>
              )}
            </button>
          )}
          {salon.phone && (
            <a
              href={`tel:${salon.phone}`}
              className="p-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
            >
              <Phone className="w-5 h-5" />
            </a>
          )}
        </div>
      </div>

      <div className="flex border-t border-zinc-800 mt-3">
        <button
          onClick={() => setTab('grid')}
          className={`flex-1 py-3 flex items-center justify-center gap-2 text-xs font-semibold transition ${
            tab === 'grid' ? 'text-white border-t-2 border-white -mt-px' : 'text-zinc-500'
          }`}
        >
          <Grid3x3 className="w-4 h-4" /> PHOTOS
        </button>
        <button
          onClick={() => setTab('reels')}
          className={`flex-1 py-3 flex items-center justify-center gap-2 text-xs font-semibold transition ${
            tab === 'reels' ? 'text-white border-t-2 border-white -mt-px' : 'text-zinc-500'
          }`}
        >
          <Music className="w-4 h-4" /> VIDÉOS
        </button>
      </div>

      {tab === 'grid' && (
        <div>
          {gridPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-16 h-16 rounded-full border-2 border-zinc-700 flex items-center justify-center mb-3">
                <Grid3x3 className="w-7 h-7 text-zinc-600" />
              </div>
              <p className="text-white font-semibold text-sm">Aucune publication</p>
              <p className="text-zinc-500 text-xs mt-1">Ce salon n'a pas encore publié de coiffure</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5">
              {gridPosts.map((post) => (
                <button
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className="relative aspect-square bg-zinc-900 group overflow-hidden"
                >
                  <img
                    src={post.image_url}
                    alt=""
                    className="w-full h-full object-cover group-hover:opacity-90 transition"
                    loading="lazy"
                  />
                  {post.like_count > 0 && (
                    <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-white text-xs font-semibold drop-shadow-lg">
                      <Heart className="w-3.5 h-3.5 fill-white" />
                      {post.like_count}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'reels' && (
        <div>
          {reelsPosts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-6">
              <div className="w-16 h-16 rounded-full border-2 border-zinc-700 flex items-center justify-center mb-3">
                <Music className="w-7 h-7 text-zinc-600" />
              </div>
              <p className="text-white font-semibold text-sm">Aucune vidéo</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-0.5">
              {reelsPosts.map((post) => (
                <button
                  key={post.id}
                  onClick={() => setSelectedPost(post)}
                  className="relative aspect-[9/16] bg-zinc-900 group overflow-hidden"
                >
                  <video src={post.image_url} className="w-full h-full object-cover" muted />
                  <div className="absolute top-2 right-2 text-white">
                    <Play className="w-4 h-4 fill-white" />
                  </div>
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 text-white text-xs font-semibold drop-shadow-lg">
                    <Eye className="w-3.5 h-3.5" />
                    {post.view_count || 0}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {selectedPost && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-2 sm:p-4"
          onClick={() => setSelectedPost(null)}
        >
          <button
            onClick={() => setSelectedPost(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white z-10 p-2"
          >
            <X className="w-7 h-7" />
          </button>

          <div
            className="bg-zinc-900 rounded-2xl max-w-4xl w-full max-h-[92vh] overflow-hidden grid md:grid-cols-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-black flex items-center justify-center">
              {selectedPost.media_type === 'video' ? (
                <video
                  src={selectedPost.image_url}
                  className="w-full h-full object-contain max-h-[50vh] md:max-h-[92vh]"
                  controls
                  autoPlay
                  playsInline
                />
              ) : (
                <img
                  src={selectedPost.image_url}
                  alt=""
                  className="w-full h-full object-contain max-h-[50vh] md:max-h-[92vh]"
                />
              )}
            </div>

            <div className="flex flex-col bg-zinc-900 max-h-[50vh] md:max-h-[92vh]">
              <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
                <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden flex items-center justify-center">
                  {salon.avatar_url ? (
                    <img src={salon.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Scissors className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{displayName}</p>
                  <p className="text-zinc-500 text-xs">
                    {new Date(selectedPost.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              </div>

              <div className="flex-1 p-4 overflow-y-auto">
                {selectedPost.caption && (
                  <p className="text-white text-sm whitespace-pre-wrap">{selectedPost.caption}</p>
                )}
              </div>

              <div className="border-t border-zinc-800 p-3">
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => toggleLike(selectedPost)}
                    className="flex items-center gap-1.5 text-white"
                  >
                    <Heart
                      className={`w-6 h-6 transition ${
                        userLikes.has(selectedPost.id) ? 'fill-red-500 text-red-500' : ''
                      }`}
                    />
                    <span className="text-sm font-semibold">{selectedPost.like_count || 0}</span>
                  </button>
                  <button className="text-white">
                    <MessageCircle className="w-6 h-6" />
                  </button>
                  <button onClick={handleShare} className="text-white ml-auto">
                    <Share2 className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}