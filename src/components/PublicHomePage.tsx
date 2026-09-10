// src/components/PublicHomePage.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Scissors, MapPin, Navigation, Star, ChevronLeft,
  ChevronRight, Phone, Calendar, ExternalLink, X,
  Search, Filter, Store, LogIn, UserPlus, AlertCircle, Sparkles,
  Crown, TrendingUp, Instagram, Facebook, Twitter, Youtube,
  Heart, Share2, Home, DollarSign, CalendarCheck,
  ChevronDown, Plus, Minus, Maximize2, User,
  Eye, UserPlus as UserPlusIcon, UserCheck, Lock, Clock, Route as RouteIcon, Loader2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import SalonMapView, { type SalonMapHandle } from './SalonMapView';

interface SalonProfile {
  id: string;
  user_id: string;
  full_name: string;
  salon_name: string;
  phone: string;
  email: string;
  address: string;
  latitude: number;
  longitude: number;
  avatar_url: string | null;
  cover_image: string | null;
  description: string;
  is_active: boolean;
  created_at: string;
  rating?: number;
  // ✅ FIX: le slug peut être null si le salon n'a pas activé ses réservations.
  slug: string | null;
  has_active_subscription?: boolean;
  is_following?: boolean;
  followers_count?: number;
  is_own_profile?: boolean;
  user_rating?: number | null;
}

interface Story {
  id: string;
  profile_id: string;
  image_url: string;
  title: string;
  created_at: string;
  expires_at: string;
  view_count: number;
  like_count: number;
  media_type?: 'image' | 'video';
}

interface RouteInfo {
  salon: SalonProfile;
  distanceKm: number;
  durationMin: number;
  coords: [number, number][];
}

interface PublicHomePageProps {
  onNavigateToBooking?: (slug: string) => void;
  onNavigateToLogin?: () => void;
  onNavigateToRegister?: () => void;
  isAuthenticated?: boolean;
  currentUserId?: string | null;
  onNavigateToPage?: (page: 'publicHome' | 'home' | 'revenue' | 'expenses' | 'bookings') => void;
}

type SortMode = 'distance' | 'rating';
type MapFilterMode = 'all' | 'subscribed';

const RADIUS_OPTIONS: { value: number; label: string }[] = [
  { value: 5, label: '5 km' },
  { value: 10, label: '10 km' },
  { value: 20, label: '20 km' },
  { value: Infinity, label: 'Tout' },
];

// ── Fonction utilitaire pour récupérer un nom de salon ──
function getSalonDisplayName(salon: Partial<SalonProfile>): string {
  if (salon.salon_name && typeof salon.salon_name === 'string' && salon.salon_name.trim()) {
    return salon.salon_name.trim();
  }
  if (salon.full_name && typeof salon.full_name === 'string' && salon.full_name.trim()) {
    return salon.full_name.trim();
  }
  return 'Salon';
}

// ── Affichage d'adresse raccourci ──
function shortAddress(address?: string | null, maxLen = 28): string {
  if (!address || !address.trim()) return '';
  const first = address.split(',')[0].trim();
  return first.length > maxLen ? first.slice(0, maxLen).trim() + '…' : first;
}

// ── Générer un device_id unique ──
function getDeviceId(): string {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

// ── Statut des stories d'un salon ──
function getStoryStatus(
  salonId: string,
  stories: Story[],
  viewedStories: Set<string>
): { hasStories: boolean; allViewed: boolean; hasUnviewed: boolean } {
  const salonStories = stories.filter(s => s.profile_id === salonId);
  const hasStories = salonStories.length > 0;

  if (!hasStories) {
    return { hasStories: false, allViewed: false, hasUnviewed: false };
  }

  const allViewed = salonStories.every(s => viewedStories.has(s.id));
  const hasUnviewed = salonStories.some(s => !viewedStories.has(s.id));

  return { hasStories, allViewed, hasUnviewed };
}

// ── Formatage de la durée ──
function formatDuration(minutes: number): string {
  if (minutes < 1) return '< 1 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h} h ${m > 0 ? m + ' min' : ''}`.trim();
}

// ── Composant StoryViewer ──
function StoryViewer({
  stories,
  onClose,
  salonName,
  salonLogo,
  salonId,
  onViewProfile,
  onStoryViewed,
  onLikeStory,
  userLikes,
}: {
  stories: Story[];
  onClose: () => void;
  salonName: string;
  salonLogo: string | null;
  salonId: string;
  onViewProfile: (salonId: string) => void;
  onStoryViewed?: (salonId: string) => void;
  onLikeStory?: (storyId: string, profileId: string) => void;
  userLikes?: Set<string>;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const hasViewedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < stories.length) {
      const nextStory = stories[nextIndex];
      if (nextStory) {
        const img = new Image();
        img.src = nextStory.image_url;
      }
    }
  }, [currentIndex, stories]);

  useEffect(() => {
    if (!hasViewedRef.current) {
      hasViewedRef.current = true;
      if (onStoryViewed) {
        onStoryViewed(salonId);
      }
    }
  }, [salonId, onStoryViewed]);

  useEffect(() => {
    setIsLoading(true);
    setIsImageLoaded(false);
    setProgress(0);
  }, [currentIndex]);

  useEffect(() => {
    if (isPaused || !isImageLoaded) return;

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (currentIndex < stories.length - 1) {
            setCurrentIndex((p) => p + 1);
            return 0;
          } else {
            onClose();
            return 100;
          }
        }
        return prev + 1.5;
      });
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [currentIndex, isPaused, isImageLoaded, stories.length, onClose]);

  const currentStory = stories[currentIndex];
  if (!currentStory) return null;

  const isVideo = currentStory.media_type === 'video' || currentStory.image_url?.match(/\.(mp4|webm|mov|avi)$/i);
  const isLiked = userLikes?.has(currentStory.id) || false;

  const handleAvatarClick = () => {
    onClose();
    onViewProfile(salonId);
  };

  const handleLikeClick = () => {
    if (onLikeStory) {
      onLikeStory(currentStory.id, currentStory.profile_id);
    }
  };

  const handleImageLoad = () => {
    setIsImageLoaded(true);
    setIsLoading(false);
  };

  const handleImageError = () => {
    setIsImageLoaded(true);
    setIsLoading(false);
    setTimeout(() => {
      if (currentIndex < stories.length - 1) {
        setCurrentIndex((p) => p + 1);
      } else {
        onClose();
      }
    }, 2000);
  };

  const handleVideoLoad = () => {
    setIsImageLoaded(true);
    setIsLoading(false);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  };

  const getTimeRemaining = () => {
    const created = new Date(currentStory.created_at);
    const now = new Date();
    const diff = 48 * 60 * 60 * 1000 - (now.getTime() - created.getTime());
    if (diff <= 0) return 'Expirée';
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h`;
    return `${minutes}min`;
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      onMouseDown={() => setIsPaused(true)}
      onMouseUp={() => setIsPaused(false)}
    >
      <div className="flex gap-1 px-3 pt-3 pb-2 flex-shrink-0">
        {stories.map((_, index) => (
          <div key={index} className="flex-1 h-0.5 bg-zinc-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-100"
              style={{
                width: index < currentIndex ? '100%' : index === currentIndex ? `${progress}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
        <button
          onClick={handleAvatarClick}
          className="flex items-center gap-3 hover:opacity-80 transition group min-w-0"
        >
          <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden border-2 border-white flex-shrink-0">
            {salonLogo ? (
              <img src={salonLogo} alt={salonName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                <Scissors className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          <div className="text-left min-w-0">
            <p className="text-white font-semibold text-sm truncate">{salonName}</p>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span>{new Date(currentStory.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {getTimeRemaining()}
              </span>
            </div>
          </div>
        </button>
        <button onClick={onClose} className="text-white/70 hover:text-white transition p-1 flex-shrink-0">
          <X className="w-6 h-6" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-2 py-1 min-h-0 relative">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-10 h-10 border-3 border-zinc-600 border-t-white rounded-full animate-spin" />
          </div>
        )}

        <div className="relative w-full h-full flex items-center justify-center">
          {isVideo ? (
            <video
              ref={videoRef}
              src={currentStory.image_url}
              className="w-full h-full object-contain rounded-lg"
              playsInline
              muted={isPaused}
              onLoadedData={handleVideoLoad}
              onError={handleImageError}
              style={{ backgroundColor: 'black' }}
            />
          ) : (
            <img
              src={currentStory.image_url}
              alt=""
              className={`w-full h-full object-contain rounded-lg transition-opacity duration-300 ${
                isImageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          )}
        </div>
      </div>

      <div className="absolute bottom-20 left-0 right-0 flex justify-center px-4 flex-shrink-0">
        <button
          onClick={handleLikeClick}
          className="flex items-center gap-2 text-white/80 hover:text-white transition"
        >
          <Heart className={`w-8 h-8 ${isLiked ? 'fill-red-500 text-red-500' : ''}`} />
          <span className="text-sm font-medium">{currentStory.like_count || 0}</span>
        </button>
      </div>

      <button
        onClick={() => currentIndex > 0 && setCurrentIndex((p) => p - 1)}
        className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-24 flex items-center justify-start pl-2 text-white/30 hover:text-white/60 transition"
      >
        <ChevronLeft className="w-8 h-8" />
      </button>
      <button
        onClick={() => currentIndex < stories.length - 1 && setCurrentIndex((p) => p + 1)}
        className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-24 flex items-center justify-end pr-2 text-white/30 hover:text-white/60 transition"
      >
        <ChevronRight className="w-8 h-8" />
      </button>
    </div>
  );
}

// ── Composant principal ──
export default function PublicHomePage({
  onNavigateToBooking,
  onNavigateToLogin,
  onNavigateToRegister,
  isAuthenticated = false,
  currentUserId = null,
  onNavigateToPage,
}: PublicHomePageProps): React.ReactElement {
  const navigate = useNavigate();

  const [salons, setSalons] = useState<SalonProfile[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStory, setSelectedStory] = useState<{ stories: Story[]; salonName: string; salonLogo: string | null; salonId: string } | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSalon, setSelectedSalon] = useState<SalonProfile | null>(null);
  const [subscriptionSalons, setSubscriptionSalons] = useState<SalonProfile[]>([]);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [guestFollowingIds, setGuestFollowingIds] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mapSectionRef = useRef<HTMLDivElement>(null);

  const salonMapRef = useRef<SalonMapHandle>(null);
  const [activeMapSalonId, setActiveMapSalonId] = useState<string | null>(null);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [radiusFilter, setRadiusFilter] = useState<number>(15);
  const [sortBy, setSortBy] = useState<SortMode>('distance');
  const [mapFilterMode, setMapFilterMode] = useState<MapFilterMode>('all');
  const [showSortMenu, setShowSortMenu] = useState(false);

  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());

  const [viewedStories, setViewedStories] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem('viewed_stories');
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });

  const [ratingLoading, setRatingLoading] = useState<Record<string, boolean>>({});

  const showToast = useCallback((message: string) => {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2200);
  }, []);

  const markStoryAsViewed = useCallback((salonId: string) => {
    const salonStories = stories.filter(s => s.profile_id === salonId);

    setViewedStories(prev => {
      const newSet = new Set(prev);
      salonStories.forEach(s => newSet.add(s.id));
      localStorage.setItem('viewed_stories', JSON.stringify(Array.from(newSet)));
      return newSet;
    });
  }, [stories]);

  const isStoryViewed = useCallback((storyId: string) => {
    return viewedStories.has(storyId);
  }, [viewedStories]);

  const getStoryStatusForSalon = useCallback((salonId: string) => {
    return getStoryStatus(salonId, stories, viewedStories);
  }, [stories, viewedStories]);

  const viewProfile = useCallback((salonId: string) => {
    const salon = salons.find(s => s.id === salonId);
    if (salon) {
      setSelectedSalon(salon);
    }
  }, [salons]);

  const toggleLikeStory = useCallback(async (storyId: string, profileId: string) => {
    try {
      const deviceId = getDeviceId();

      let existing = null;

      if (isAuthenticated && currentUserId) {
        const { data } = await supabase
          .from('likes')
          .select('id')
          .eq('profile_id', currentUserId)
          .eq('target_type', 'story')
          .eq('target_id', storyId)
          .maybeSingle();
        existing = data;
      } else {
        const { data } = await supabase
          .from('likes')
          .select('id')
          .eq('device_id', deviceId)
          .eq('target_type', 'story')
          .eq('target_id', storyId)
          .maybeSingle();
        existing = data;
      }

      if (existing) {
        await supabase.from('likes').delete().eq('id', existing.id);
        showToast('Like retiré');

        setUserLikes(prev => {
          const newSet = new Set(prev);
          newSet.delete(storyId);
          return newSet;
        });
        setStories(prev => prev.map(s =>
          s.id === storyId ? { ...s, like_count: (s.like_count || 0) - 1 } : s
        ));
      } else {
        const insertData: any = {
          target_type: 'story',
          target_id: storyId,
          device_id: deviceId
        };

        if (isAuthenticated && currentUserId) {
          insertData.profile_id = currentUserId;
        }

        await supabase.from('likes').insert(insertData);
        showToast('Like ajouté ❤️');

        setUserLikes(prev => new Set(prev).add(storyId));
        setStories(prev => prev.map(s =>
          s.id === storyId ? { ...s, like_count: (s.like_count || 0) + 1 } : s
        ));
      }
    } catch (err: any) {
      console.error('Erreur like:', err);
      if (err.code === '23505') {
        showToast('Vous avez déjà liké cette story');
      } else {
        showToast('Erreur lors de l\'opération');
      }
    }
  }, [isAuthenticated, currentUserId, showToast]);

  const loadUserLikes = useCallback(async () => {
    try {
      const deviceId = getDeviceId();
      let likedIds: string[] = [];

      if (isAuthenticated && currentUserId) {
        const { data, error } = await supabase
          .from('likes')
          .select('target_id')
          .eq('profile_id', currentUserId)
          .eq('target_type', 'story');

        if (error) {
          console.error('Erreur chargement likes:', error);
          return;
        }
        likedIds = data?.map((l: any) => l.target_id) || [];
      } else {
        const { data, error } = await supabase
          .from('likes')
          .select('target_id')
          .eq('device_id', deviceId)
          .eq('target_type', 'story');

        if (error) {
          console.error('Erreur chargement likes invité:', error);
          return;
        }
        likedIds = data?.map((l: any) => l.target_id) || [];
      }

      setUserLikes(new Set(likedIds));
    } catch (err) {
      console.error('Erreur chargement likes:', err);
    }
  }, [isAuthenticated, currentUserId]);

  const rateSalon = useCallback(async (salonId: string, rating: number) => {
    const deviceId = getDeviceId();

    if (isAuthenticated && currentUserId) {
      const salon = salons.find(s => s.id === salonId);
      if (salon && salon.user_id === currentUserId) {
        showToast('Vous ne pouvez pas noter votre propre salon');
        return;
      }
    }

    setRatingLoading(prev => ({ ...prev, [salonId]: true }));

    try {
      let reviewerId = null;
      let reviewerType = 'device';

      if (isAuthenticated && currentUserId) {
        const { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (profileError) {
          console.error('Erreur récupération profil:', profileError);
          throw profileError;
        }

        if (userProfile) {
          reviewerId = userProfile.id;
          reviewerType = 'profile';
        }
      }

      let existingReview = null;

      if (reviewerType === 'profile' && reviewerId) {
        const { data, error } = await supabase
          .from('reviews')
          .select('id, rating')
          .eq('profile_id', salonId)
          .eq('reviewer_id', reviewerId)
          .maybeSingle();

        if (error) {
          console.error('Erreur vérification note:', error);
          throw error;
        }
        existingReview = data;
      } else {
        const { data, error } = await supabase
          .from('reviews')
          .select('id, rating')
          .eq('profile_id', salonId)
          .eq('device_id', deviceId)
          .maybeSingle();

        if (error) {
          console.error('Erreur vérification note invité:', error);
          throw error;
        }
        existingReview = data;
      }

      if (existingReview) {
        const { error: updateError } = await supabase
          .from('reviews')
          .update({
            rating,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingReview.id);

        if (updateError) {
          console.error('Erreur mise à jour note:', updateError);
          throw updateError;
        }
        showToast(`Note mise à jour : ${rating} ⭐`);
      } else {
        const insertData: any = {
          profile_id: salonId,
          rating: rating,
          device_id: deviceId,
          created_at: new Date().toISOString()
        };

        if (reviewerType === 'profile' && reviewerId) {
          insertData.reviewer_id = reviewerId;
        }

        const { error: insertError } = await supabase
          .from('reviews')
          .insert(insertData);

        if (insertError) {
          console.error('Erreur insertion note:', insertError);
          throw insertError;
        }
        showToast(`Note ajoutée : ${rating} ⭐`);
      }

      const { data: allReviews, error: fetchError } = await supabase
        .from('reviews')
        .select('rating')
        .eq('profile_id', salonId);

      if (fetchError) {
        console.error('Erreur récupération notes:', fetchError);
        throw fetchError;
      }

      const total = allReviews?.reduce((sum, r) => sum + r.rating, 0) || 0;
      const count = allReviews?.length || 0;
      const newAvg = count > 0 ? total / count : 0;

      setSalons(prev => prev.map(s =>
        s.id === salonId
          ? { ...s, rating: newAvg, user_rating: rating }
          : s
      ));

      if (selectedSalon && selectedSalon.id === salonId) {
        setSelectedSalon(prev => prev ? { ...prev, rating: newAvg, user_rating: rating } : null);
      }

    } catch (err: any) {
      console.error('Erreur notation:', err);
      showToast('Erreur lors de la notation: ' + (err.message || ''));
    } finally {
      setRatingLoading(prev => ({ ...prev, [salonId]: false }));
    }
  }, [isAuthenticated, currentUserId, salons, selectedSalon, showToast]);

  const loadUserRatings = useCallback(async () => {
    const deviceId = getDeviceId();

    try {
      let ratingMap: Record<string, number> = {};

      if (isAuthenticated && currentUserId) {
        const { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (profileError) {
          console.error('Erreur récupération profil:', profileError);
          return;
        }

        if (userProfile) {
          const { data, error } = await supabase
            .from('reviews')
            .select('profile_id, rating')
            .eq('reviewer_id', userProfile.id);

          if (error) {
            console.error('Erreur chargement notes:', error);
            return;
          }

          data?.forEach((r: any) => {
            ratingMap[r.profile_id] = r.rating;
          });
        }
      } else {
        const { data, error } = await supabase
          .from('reviews')
          .select('profile_id, rating')
          .eq('device_id', deviceId);

        if (error) {
          console.error('Erreur chargement notes invité:', error);
          return;
        }

        data?.forEach((r: any) => {
          ratingMap[r.profile_id] = r.rating;
        });
      }

      setSalons(prev => prev.map(s => ({
        ...s,
        user_rating: ratingMap[s.id] || null
      })));

    } catch (err) {
      console.error('Erreur chargement notes utilisateur:', err);
    }
  }, [isAuthenticated, currentUserId]);

  const toggleFollow = useCallback(async (salonId: string) => {
    if (isAuthenticated && currentUserId === salonId) {
      showToast("Vous ne pouvez pas vous abonner à votre propre compte");
      return;
    }

    setFollowLoading(prev => ({ ...prev, [salonId]: true }));

    try {
      const deviceId = getDeviceId();
      let existingFollow = null;

      if (isAuthenticated && currentUserId) {
        const { data: userProfile, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (profileError) {
          console.error('Erreur récupération profil:', profileError);
          throw profileError;
        }

        let profileId = userProfile?.id;

        if (!profileId) {
          const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert({
              user_id: currentUserId,
              full_name: 'Utilisateur',
              is_active: true,
              created_at: new Date().toISOString()
            })
            .select()
            .single();

          if (createError) {
            console.error('Erreur création profil:', createError);
            throw createError;
          }

          if (newProfile) {
            profileId = newProfile.id;
          } else {
            showToast('Erreur lors de la création du profil');
            return;
          }
        }

        const { data, error } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', profileId)
          .eq('following_id', salonId)
          .maybeSingle();

        if (error) {
          console.error('Erreur vérification follow:', error);
          throw error;
        }
        existingFollow = data;
      } else {
        const { data, error } = await supabase
          .from('followers')
          .select('id')
          .eq('device_id', deviceId)
          .eq('following_id', salonId)
          .maybeSingle();

        if (error) {
          console.error('Erreur vérification follow invité:', error);
          throw error;
        }
        existingFollow = data;
      }

      if (existingFollow) {
        const { error: deleteError } = await supabase
          .from('followers')
          .delete()
          .eq('id', existingFollow.id);

        if (deleteError) {
          console.error('Erreur unfollow:', deleteError);
          throw deleteError;
        }

        showToast('Vous ne suivez plus ce salon');

        setSalons(prev => prev.map(s =>
          s.id === salonId
            ? { ...s, is_following: false, followers_count: Math.max((s.followers_count || 1) - 1, 0) }
            : s
        ));

        if (isAuthenticated && currentUserId) {
          setFollowingIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(salonId);
            return newSet;
          });
        } else {
          setGuestFollowingIds(prev => {
            const newSet = new Set(prev);
            newSet.delete(salonId);
            return newSet;
          });
        }

        if (selectedSalon && selectedSalon.id === salonId) {
          setSelectedSalon(prev => prev ? { ...prev, is_following: false, followers_count: Math.max((prev.followers_count || 1) - 1, 0) } : null);
        }

        setSubscriptionSalons(prev => prev.filter(s => s.id !== salonId));

      } else {
        const insertData: any = {
          following_id: salonId,
          device_id: deviceId,
          status: 'active'
        };

        if (isAuthenticated && currentUserId) {
          const { data: userProfile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('user_id', currentUserId)
            .maybeSingle();

          if (profileError) {
            console.error('Erreur récupération profil:', profileError);
            throw profileError;
          }

          let profileId = userProfile?.id;

          if (!profileId) {
            const { data: newProfile, error: createError } = await supabase
              .from('profiles')
              .insert({
                user_id: currentUserId,
                full_name: 'Utilisateur',
                is_active: true,
                created_at: new Date().toISOString()
              })
              .select()
              .single();

            if (createError) {
              console.error('Erreur création profil:', createError);
              throw createError;
            }

            if (newProfile) {
              profileId = newProfile.id;
            } else {
              showToast('Erreur lors de la création du profil');
              return;
            }
          }

          insertData.follower_id = profileId;
          delete insertData.device_id;
        }

        const { error: insertError } = await supabase
          .from('followers')
          .insert(insertData);

        if (insertError) {
          console.error('Erreur follow:', insertError);
          throw insertError;
        }

        showToast('Vous suivez maintenant ce salon');

        setSalons(prev => prev.map(s =>
          s.id === salonId
            ? { ...s, is_following: true, followers_count: (s.followers_count || 0) + 1 }
            : s
        ));

        if (isAuthenticated && currentUserId) {
          setFollowingIds(prev => new Set(prev).add(salonId));
        } else {
          setGuestFollowingIds(prev => new Set(prev).add(salonId));
        }

        if (selectedSalon && selectedSalon.id === salonId) {
          setSelectedSalon(prev => prev ? { ...prev, is_following: true, followers_count: (prev.followers_count || 0) + 1 } : null);
        }

        const salonToAdd = salons.find(s => s.id === salonId);
        if (salonToAdd) {
          setSubscriptionSalons(prev => [...prev, { ...salonToAdd, is_following: true }]);
        }
      }

    } catch (err: any) {
      console.error('Erreur follow/unfollow:', err);
      if (err.code === '23505') {
        showToast('Vous suivez déjà ce salon');
      } else {
        showToast('Erreur lors de l\'opération: ' + (err.message || ''));
      }
    } finally {
      setFollowLoading(prev => ({ ...prev, [salonId]: false }));
    }
  }, [isAuthenticated, currentUserId, salons, selectedSalon, showToast]);

  // ── Chargement des données ──
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      console.log('🔄 Chargement des profils...');

      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (profilesError) {
        console.error('❌ Erreur chargement profiles:', profilesError);
        throw profilesError;
      }

      console.log('📊 Profils récupérés:', profiles?.length || 0);

      // ⚠️ IMPORTANT : on distingue deux identifiants différents
      // - profiles.id      → utilisé par followers/reviews/stories (FK vers profiles)
      // - profiles.user_id → utilisé par subscriptions/booking_settings (FK vers auth.users)
      const profileIds = profiles?.map((p) => p.id) || [];
      const authUserIds = (profiles?.map((p) => p.user_id).filter(Boolean) as string[]) || [];

      // ── Subscriptions (utilise auth.users.id) ──
      let subscriptionMap: Record<string, boolean> = {};
      if (authUserIds.length > 0) {
        const { data: subscriptions } = await supabase
          .from('subscriptions')
          .select('user_id, status')
          .in('user_id', authUserIds)
          .eq('status', 'active');

        if (subscriptions) {
          subscriptions.forEach((sub) => {
            subscriptionMap[sub.user_id] = true;
          });
        }
      }

      // ── Slug de réservation (utilise auth.users.id) ──
      // ✅ FIX : on interroge booking_settings avec les authUserIds (et non profileIds).
      // Avant, on passait profiles.id → booking_settings.user_id, ce qui ne matchait jamais.
      let slugMap: Record<string, string> = {};
      if (authUserIds.length > 0) {
        const { data: bookingSettingsRows, error: bsError } = await supabase
          .from('booking_settings')
          .select('user_id, slug')
          .in('user_id', authUserIds)
          .eq('is_active', true);

        if (bsError) {
          console.error('Erreur chargement booking_settings:', bsError);
        }

        if (bookingSettingsRows) {
          bookingSettingsRows.forEach((row: any) => {
            if (row.user_id && row.slug) slugMap[row.user_id] = row.slug;
          });
        }
      }

      // ── Following (utilise profiles.id) ──
      let userFollowingIds: Set<string> = new Set();
      let guestFollowingIdsSet: Set<string> = new Set();
      const deviceId = getDeviceId();

      if (isAuthenticated && currentUserId) {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (userProfile) {
          const { data: userFollowing } = await supabase
            .from('followers')
            .select('following_id')
            .eq('follower_id', userProfile.id)
            .eq('status', 'active');

          if (userFollowing) {
            userFollowingIds = new Set(userFollowing.map(f => f.following_id));
            setFollowingIds(userFollowingIds);
          }
        }
      } else {
        const { data: guestFollowing } = await supabase
          .from('followers')
          .select('following_id')
          .eq('device_id', deviceId)
          .eq('status', 'active');

        if (guestFollowing) {
          guestFollowingIdsSet = new Set(guestFollowing.map(f => f.following_id));
          setGuestFollowingIds(guestFollowingIdsSet);
        }
      }

      // ── Followers count (utilise profiles.id) ──
      let followersMap: Record<string, number> = {};
      if (profileIds.length > 0) {
        const { data: followers } = await supabase
          .from('followers')
          .select('following_id')
          .in('following_id', profileIds)
          .eq('status', 'active');

        if (followers) {
          followers.forEach((f) => {
            followersMap[f.following_id] = (followersMap[f.following_id] || 0) + 1;
          });
        }
      }

      // ── Reviews (utilise profiles.id) ──
      let reviewsMap: Record<string, { count: number; avg: number }> = {};
      if (profileIds.length > 0) {
        const { data: reviews } = await supabase
          .from('reviews')
          .select('profile_id, rating')
          .in('profile_id', profileIds);

        if (reviews) {
          reviews.forEach((r) => {
            if (!reviewsMap[r.profile_id]) {
              reviewsMap[r.profile_id] = { count: 0, avg: 0 };
            }
            reviewsMap[r.profile_id].count += 1;
            reviewsMap[r.profile_id].avg += r.rating;
          });
        }

        Object.keys(reviewsMap).forEach((key) => {
          reviewsMap[key].avg = reviewsMap[key].avg / reviewsMap[key].count;
        });
      }

      // ── Stories ──
      const { data: storiesData, error: storiesError } = await supabase
        .from('stories')
        .select('*')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (storiesError) console.error('Erreur stories:', storiesError);

      // ── Construction de la liste ──
      const salonsWithStats = (profiles || []).map((p) => {
        const isFollowed = userFollowingIds.has(p.id) || guestFollowingIdsSet.has(p.id);
        const isOwnProfile = isAuthenticated && currentUserId === p.user_id;
        const reviewData = reviewsMap[p.id];
        const displayName = getSalonDisplayName(p);

        // ✅ FIX : slug = slugMap[p.user_id] (jamais p.id en fallback).
        // Si le salon n'a pas de booking_settings actif, slug = null → le bouton
        // Réserver sera désactivé et le client ne sera pas envoyé vers une 404.
        const slug = slugMap[p.user_id] || null;

        return {
          id: p.id,
          user_id: p.user_id,
          full_name: p.full_name || p.salon_name || 'Salon',
          salon_name: p.salon_name || p.full_name || 'Salon',
          phone: p.phone || '',
          email: p.email || '',
          address: p.address || '',
          latitude: p.latitude || 0,
          longitude: p.longitude || 0,
          avatar_url: p.avatar_url || null,
          cover_image: p.cover_image || null,
          description: p.description || '',
          is_active: p.is_active !== undefined ? p.is_active : true,
          created_at: p.created_at || new Date().toISOString(),
          rating: reviewData?.avg || 0,
          slug,
          has_active_subscription: subscriptionMap[p.user_id] || false,
          is_following: isFollowed && !isOwnProfile,
          followers_count: followersMap[p.id] || 0,
          is_own_profile: isOwnProfile,
          user_rating: null,
        };
      });

      const followedSalons = salonsWithStats.filter(s => s.is_following || s.is_own_profile);

      setSalons(salonsWithStats);
      setSubscriptionSalons(followedSalons);
      setStories(storiesData || []);

      await loadUserLikes();
      await loadUserRatings();

      console.log('📊 Salons chargés:', salonsWithStats.length);

    } catch (err) {
      console.error('Erreur chargement:', err);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, currentUserId, loadUserLikes, loadUserRatings]);

  useEffect(() => {
    loadData();
    getUserLocation();
  }, [loadData]);

  useEffect(() => {
    if (mapFullscreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mapFullscreen]);

  const getUserLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("La géolocalisation n'est pas supportée par votre navigateur");
      showToast("Veuillez activer votre localisation pour voir les salons");
      const defaultPos = { lat: 14.7167, lng: -17.4677 };
      setUserLocation(defaultPos);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setLocationError(null);
      },
      (err) => {
        console.error('Erreur géoloc:', err);
        setLocationError('Position introuvable — position par défaut utilisée');
        showToast("Position introuvable, utilisation de la position par défaut");
        const defaultPos = { lat: 14.7167, lng: -17.4677 };
        setUserLocation(defaultPos);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const calculateDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const filteredSalons = salons.filter((salon) => {
    const matchesSearch =
      searchQuery === '' ||
      salon.salon_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      salon.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      salon.address?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const nearbySalons = useMemo(() => {
    let list = filteredSalons.filter((salon) => {
      if (!userLocation || radiusFilter === Infinity) return true;
      const dist = calculateDistance(userLocation.lat, userLocation.lng, salon.latitude || 0, salon.longitude || 0);
      return dist <= radiusFilter;
    });

    if (mapFilterMode === 'subscribed') list = list.filter((s) => s.is_following);

    return [...list].sort((a, b) => {
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      if (!userLocation) return 0;
      const distA = calculateDistance(userLocation.lat, userLocation.lng, a.latitude || 0, a.longitude || 0);
      const distB = calculateDistance(userLocation.lat, userLocation.lng, b.latitude || 0, b.longitude || 0);
      return distA - distB;
    });
  }, [filteredSalons, userLocation, radiusFilter, sortBy, mapFilterMode]);

  const mapSalons = useMemo(() => nearbySalons.filter((s) => !s.is_own_profile), [nearbySalons]);

  const startItinerary = useCallback(async (salon: SalonProfile) => {
    if (!salon.latitude || !salon.longitude) {
      showToast('Position du salon indisponible');
      return;
    }
    if (!userLocation) {
      showToast('Activez votre position pour voir l\'itinéraire');
      return;
    }

    setSelectedSalon(null);
    setRouteError(null);
    setRouteLoading(true);
    setActiveMapSalonId(salon.id);
    setMapFullscreen(true);
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
        salon,
        distanceKm: route.distance / 1000,
        durationMin: route.duration / 60,
        coords,
      });
    } catch (err) {
      console.error('Erreur itinéraire:', err);
      setRouteError("Itinéraire indisponible pour le moment");
      showToast('Ouverture dans Google Maps à la place...');
      window.open(
        `https://www.google.com/maps/dir/?api=1&destination=${salon.latitude},${salon.longitude}`,
        '_blank'
      );
    } finally {
      setRouteLoading(false);
    }
  }, [userLocation, showToast]);

  const closeItinerary = useCallback(() => {
    setRouteInfo(null);
    setRouteError(null);
  }, []);

  const openInExternalMaps = (salon: SalonProfile) => {
    if (!salon.latitude || !salon.longitude) return;
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${salon.latitude},${salon.longitude}`, '_blank');
  };

  const centerOnSalon = useCallback((salon: SalonProfile) => {
    if (salon.latitude && salon.longitude) {
      salonMapRef.current?.centerOnSalon(salon);
      setActiveMapSalonId(salon.id);
    }
  }, []);

  const jumpToSalonOnMap = (salon: SalonProfile) => {
    setSelectedSalon(null);
    setMapFilterMode('all');
    mapSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => centerOnSalon(salon), 350);
  };

  const centerOnUser = useCallback(() => {
    salonMapRef.current?.centerOnUser();
  }, []);

  // ✅ FIX : handleBooking bloque la redirection si le salon n'a pas de slug.
  const handleBooking = (salon: SalonProfile) => {
    if (!salon.slug) {
      showToast("Ce salon n'a pas encore activé les réservations en ligne");
      return;
    }
    console.log('🔍 Redirection vers la réservation du salon:', salon.slug);
    navigate(`/booking/${salon.slug}`);
  };

  const StarRating = ({
    rating,
    onRate,
    isLoading,
    isOwnProfile,
    isAuthenticated
  }: {
    rating: number | null | undefined;
    onRate: (value: number) => void;
    isLoading: boolean;
    isOwnProfile: boolean;
    isAuthenticated: boolean;
  }) => {
    const [hover, setHover] = useState<number | null>(null);

    if (isOwnProfile) {
      return (
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 opacity-50">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star key={star} className="w-5 h-5 text-zinc-600 fill-zinc-600" />
            ))}
          </div>
          <span className="text-zinc-500 text-xs">(Vous ne pouvez pas noter votre propre salon)</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <div className="flex gap-0.5">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              onClick={() => onRate(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(null)}
              disabled={isLoading}
              className="transition-transform hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!isAuthenticated ? "Connectez-vous pour noter" : ""}
            >
              <Star
                className={`w-6 h-6 ${
                  (hover !== null ? star <= hover : star <= (rating || 0))
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-zinc-600 fill-zinc-600'
                } transition-colors`}
              />
            </button>
          ))}
        </div>
        {rating && rating > 0 && (
          <span className="text-zinc-400 text-xs">
            {rating.toFixed(1)} ⭐
          </span>
        )}
        {isLoading && (
          <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin ml-1" />
        )}
        {!isAuthenticated && (
          <span className="text-zinc-500 text-[10px]">(Invité)</span>
        )}
      </div>
    );
  };

  const StoryAvatar = ({
    salon,
    onClick,
    size = 'md'
  }: {
    salon: SalonProfile;
    onClick: () => void;
    size?: 'sm' | 'md' | 'lg';
  }) => {
    const { hasStories, allViewed, hasUnviewed } = getStoryStatusForSalon(salon.id);
    const displayName = getSalonDisplayName(salon);
    const isOwnProfile = isAuthenticated && currentUserId === salon.user_id;

    const sizeClasses = {
      sm: 'w-12 h-12',
      md: 'w-16 h-16',
      lg: 'w-20 h-20'
    };

    const textSize = {
      sm: 'text-[8px]',
      md: 'text-[10px]',
      lg: 'text-xs'
    };

    let circleColor = 'border-zinc-600';

    if (hasStories) {
      if (hasUnviewed) {
        circleColor = 'bg-gradient-to-tr from-yellow-400 to-pink-500';
      } else if (allViewed) {
        circleColor = 'bg-zinc-600';
      }
    }

    if (isOwnProfile) {
      circleColor = 'border-2 border-blue-500';
    }

    return (
      <button
        onClick={onClick}
        className="flex flex-col items-center gap-1 group flex-shrink-0"
      >
        <div
          className={`${sizeClasses[size]} rounded-full ${hasStories ? 'p-0.5' : ''} ${circleColor} group-hover:scale-105 transition`}
          style={hasStories && hasUnviewed ? { background: 'linear-gradient(to top right, #facc15, #ec4899)' } : {}}
        >
          <div className={`w-full h-full rounded-full overflow-hidden bg-zinc-800 border-2 border-black ${sizeClasses[size]}`}>
            {salon.avatar_url ? (
              <img src={salon.avatar_url} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                <Scissors className={`${size === 'sm' ? 'w-5 h-5' : size === 'md' ? 'w-6 h-6' : 'w-9 h-9'} text-white`} />
              </div>
            )}
          </div>
        </div>
        <p className={`text-zinc-400 ${textSize[size]} truncate max-w-[${size === 'sm' ? '48' : '64'}px]`}>
          {displayName}
        </p>
      </button>
    );
  };

  const renderFollowedSection = (): React.ReactElement | null => {
    const allFollowed = [...subscriptionSalons];

    if (isAuthenticated && currentUserId) {
      const ownProfile = salons.find((s) => s.user_id === currentUserId);
      if (ownProfile && !allFollowed.find((s) => s.id === ownProfile.id)) {
        allFollowed.unshift(ownProfile);
      }
    }

    if (allFollowed.length === 0) return null;

    return (
      <div className="mb-4">
        <div className="flex items-center justify-between mb-3 px-4">
          <h2 className="text-white text-sm font-semibold flex items-center gap-2">
            <Crown className="w-4 h-4 text-yellow-400" />
            {isAuthenticated ? 'Mes salons' : 'Salons suivis'}
          </h2>
          <span className="text-zinc-500 text-xs">
            {allFollowed.length} salon{allFollowed.length > 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-2 scrollbar-none">
          {allFollowed.map((salon) => {
            const salonStoriesList = stories.filter((s) => s.profile_id === salon.id);
            const hasStory = salonStoriesList.length > 0;

            return (
              <StoryAvatar
                key={salon.id}
                salon={salon}
                size="md"
                onClick={() => {
                  if (hasStory) {
                    setSelectedStory({
                      stories: salonStoriesList,
                      salonName: getSalonDisplayName(salon),
                      salonLogo: salon.avatar_url,
                      salonId: salon.id,
                    });
                  } else {
                    setSelectedSalon(salon);
                  }
                }}
              />
            );
          })}
        </div>
      </div>
    );
  };

  const renderMap = (): React.ReactElement => {
    const sortLabel: Record<SortMode, string> = {
      distance: 'Plus proche',
      rating: 'Mieux notés',
    };

    return (
      <div
        ref={mapSectionRef}
        className={
          mapFullscreen
            ? 'fixed inset-0 z-[95] bg-zinc-950 flex flex-col'
            : 'bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden mx-4 shadow-2xl shadow-black/40 relative z-10'
        }
      >
        <div className="border-b border-zinc-800 bg-zinc-950/60 backdrop-blur-sm">
          <div className="flex items-center justify-between p-3">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4.5 h-4.5 text-emerald-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-white font-semibold text-sm leading-tight truncate">
                  {routeInfo ? `Itinéraire vers ${getSalonDisplayName(routeInfo.salon)}` : 'Salons à proximité'}
                </h3>
                <p className="text-zinc-500 text-[10px] leading-tight">
                  {routeInfo ? 'Trajet en voiture' : `${mapSalons.length} résultat${mapSalons.length > 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={centerOnUser}
                disabled={!userLocation}
                className="p-2 bg-zinc-800/80 rounded-lg hover:bg-zinc-700 transition text-zinc-400 hover:text-white disabled:opacity-40"
                title="Centrer sur ma position"
              >
                <Navigation className="w-4 h-4" />
              </button>
              <div className="flex items-center bg-zinc-800/80 rounded-lg overflow-hidden">
                <button
                  onClick={() => salonMapRef.current?.zoomIn()}
                  className="p-2 hover:bg-zinc-700 transition text-zinc-400 hover:text-white"
                  title="Zoom avant"
                >
                  <Plus className="w-4 h-4" />
                </button>
                <div className="w-px h-4 bg-zinc-700" />
                <button
                  onClick={() => salonMapRef.current?.zoomOut()}
                  className="p-2 hover:bg-zinc-700 transition text-zinc-400 hover:text-white"
                  title="Zoom arrière"
                >
                  <Minus className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => {
                  if (routeInfo) closeItinerary();
                  setMapFullscreen((f) => !f);
                }}
                className="p-2 bg-zinc-800/80 rounded-lg hover:bg-zinc-700 transition text-zinc-400 hover:text-white"
                title={mapFullscreen ? 'Réduire' : 'Plein écran'}
              >
                {mapFullscreen ? <X className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {locationError && !routeInfo && (
            <div className="flex items-center gap-1.5 px-3 pb-2 text-amber-400">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <p className="text-[10px]">{locationError}</p>
            </div>
          )}

          {!routeInfo && (
            <div className="flex items-center gap-2 px-3 pb-3 overflow-x-auto scrollbar-none">
              <div className="flex items-center gap-1 flex-shrink-0">
                <Filter className="w-3.5 h-3.5 text-zinc-600" />
              </div>
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.label}
                  onClick={() => setRadiusFilter(opt.value)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium transition border ${
                    radiusFilter === opt.value
                      ? 'bg-white text-black border-white'
                      : 'bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <div className="w-px h-4 bg-zinc-800 flex-shrink-0" />
              {(
                [
                  { id: 'all', label: 'Tous' },
                  { id: 'subscribed', label: '⭐ Abonnés' },
                ] as { id: MapFilterMode; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setMapFilterMode(f.id)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium transition border ${
                    mapFilterMode === f.id
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40'
                      : 'bg-transparent text-zinc-400 border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <div className="w-px h-4 bg-zinc-800 flex-shrink-0" />
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => setShowSortMenu((s) => !s)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-[11px] font-medium bg-transparent text-zinc-400 border border-zinc-700 hover:border-zinc-500 transition"
                >
                  {sortLabel[sortBy]}
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showSortMenu && (
                  <div className="absolute top-full right-0 mt-1.5 bg-zinc-800 border border-zinc-700 rounded-xl overflow-hidden shadow-xl z-10 w-40">
                    {(
                      [
                        { id: 'distance', label: 'Plus proche', Icon: Navigation },
                        { id: 'rating', label: 'Mieux notés', Icon: Star },
                      ] as { id: SortMode; label: string; Icon: typeof Navigation }[]
                    ).map(({ id, label, Icon }) => (
                      <button
                        key={id}
                        onClick={() => {
                          setSortBy(id);
                          setShowSortMenu(false);
                        }}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-zinc-700 transition ${
                          sortBy === id ? 'text-white bg-zinc-700/60' : 'text-zinc-400'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={mapFullscreen ? 'relative flex-1' : 'relative'} style={mapFullscreen ? undefined : { height: '420px' }}>
          <div className="absolute inset-0">
            <SalonMapView
              ref={salonMapRef}
              salons={mapSalons}
              userLocation={userLocation}
              radiusFilter={radiusFilter}
              activeSalonId={activeMapSalonId}
              onSelectSalon={(salon) => {
                if (!routeInfo) {
                  setSelectedSalon(salon);
                  setActiveMapSalonId(salon.id);
                }
              }}
              getDisplayName={getSalonDisplayName}
              hasUnviewedStory={(id) => getStoryStatusForSalon(id).hasUnviewed}
              routeCoords={routeInfo?.coords || null}
              height={mapFullscreen ? '100%' : '420px'}
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

          {!routeInfo && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/95 via-black/60 to-transparent pt-8 pb-3 pointer-events-none">
              <div className="flex gap-2 overflow-x-auto px-3 pb-1 snap-x scrollbar-none pointer-events-auto">
                {mapSalons.slice(0, 10).map((salon) => {
                  const distance = userLocation
                    ? calculateDistance(userLocation.lat, userLocation.lng, salon.latitude || 0, salon.longitude || 0)
                    : null;
                  const isActive = activeMapSalonId === salon.id;
                  const displayName = getSalonDisplayName(salon);
                  return (
                    <button
                      key={salon.id}
                      onClick={() => centerOnSalon(salon)}
                      className={`flex-shrink-0 snap-start flex items-center gap-2 backdrop-blur-md rounded-full pl-1.5 pr-3 py-1.5 border transition shadow-lg ${
                        isActive ? 'bg-white border-white' : 'bg-black/70 border-zinc-600 hover:border-white'
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-zinc-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                        {salon.avatar_url ? (
                          <img src={salon.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Scissors className={`w-3.5 h-3.5 ${isActive ? 'text-black' : 'text-zinc-400'}`} />
                        )}
                      </div>
                      <span className={`text-[11px] truncate max-w-[90px] font-medium ${isActive ? 'text-black' : 'text-white'}`}>
                        {displayName}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Star className={`w-3 h-3 ${isActive ? 'text-yellow-600 fill-yellow-600' : 'text-yellow-400 fill-yellow-400'}`} />
                        <span className={`text-[10px] font-bold ${isActive ? 'text-black' : 'text-white'}`}>
                          {salon.rating?.toFixed(1) || '0.0'}
                        </span>
                      </div>
                      {distance !== null && (
                        <span className={`text-[10px] font-bold ${isActive ? 'text-emerald-700' : 'text-emerald-400'}`}>
                          {distance.toFixed(1)} km
                        </span>
                      )}
                      {salon.has_active_subscription && <span className="text-[9px]">⭐</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {routeInfo && !routeLoading && (
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/95 to-transparent pt-10 pb-4 px-4">
              <div className="bg-zinc-900/95 backdrop-blur-md border border-zinc-700 rounded-2xl p-4 shadow-2xl">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0 border-2 border-emerald-400">
                      {routeInfo.salon.avatar_url ? (
                        <img src={routeInfo.salon.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                          <Scissors className="w-5 h-5 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-white font-semibold text-sm truncate">{getSalonDisplayName(routeInfo.salon)}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="flex items-center gap-1 text-emerald-400 text-xs font-bold">
                          <RouteIcon className="w-3.5 h-3.5" />
                          {routeInfo.distanceKm.toFixed(1)} km
                        </span>
                        <span className="flex items-center gap-1 text-zinc-300 text-xs font-bold">
                          <Clock className="w-3.5 h-3.5" />
                          {formatDuration(routeInfo.durationMin)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={closeItinerary}
                    className="p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition text-zinc-400 hover:text-white flex-shrink-0"
                    title="Fermer l'itinéraire"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => openInExternalMaps(routeInfo.salon)}
                    className="flex-1 flex items-center justify-center gap-2 bg-white text-black font-semibold py-2.5 rounded-xl text-sm hover:bg-zinc-200 transition"
                  >
                    <ExternalLink className="w-4 h-4" /> Ouvrir dans Maps
                  </button>
                  <button
                    onClick={() => handleBooking(routeInfo.salon)}
                    disabled={!routeInfo.salon.slug}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Calendar className="w-4 h-4" /> {routeInfo.salon.slug ? 'Réserver' : 'Indisponible'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {!routeInfo && (
          <div className={`${mapFullscreen ? '' : 'max-h-[220px]'} overflow-y-auto bg-zinc-950/30 border-t border-zinc-800/60`}>
            {mapSalons.length === 0 ? (
              <div className="text-center py-8 px-4">
                <MapPin className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                <p className="text-zinc-500 text-xs">Aucun salon trouvé dans ce rayon</p>
                <button
                  onClick={() => {
                    setRadiusFilter(Infinity);
                    showToast("Affichage de tous les salons");
                  }}
                  className="text-emerald-400 text-xs font-medium mt-1 hover:underline"
                >
                  Voir tous les salons
                </button>
              </div>
            ) : (
              <div className="p-3 space-y-1.5">
                {mapSalons.map((salon) => {
                  const distance = userLocation
                    ? calculateDistance(userLocation.lat, userLocation.lng, salon.latitude || 0, salon.longitude || 0)
                    : null;
                  const isFollowing = followingIds.has(salon.id) || guestFollowingIds.has(salon.id);
                  const isLoading = followLoading[salon.id] || false;
                  const displayName = getSalonDisplayName(salon);

                  return (
                    <div
                      key={salon.id}
                      className="w-full flex items-center gap-3 p-2.5 bg-zinc-800/80 rounded-xl border border-zinc-700/50 hover:border-zinc-500 transition cursor-pointer"
                      onClick={() => setSelectedSalon(salon)}
                    >
                      <div className="w-11 h-11 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0 border-2 border-zinc-600">
                        {salon.avatar_url ? (
                          <img src={salon.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                            <Scissors className="w-5 h-5 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-white font-semibold text-sm truncate">
                            {displayName}
                          </p>
                          {salon.has_active_subscription && <span className="text-yellow-400 text-[10px]">⭐</span>}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                          <span className="flex items-center gap-0.5">
                            <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                            {salon.rating?.toFixed(1) || '0.0'}
                          </span>
                          <span className="flex items-center gap-0.5">
                            <User className="w-3 h-3 text-emerald-400" />
                            {salon.followers_count || 0}
                          </span>
                          {distance !== null && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-400">{distance.toFixed(1)} km</span>
                            </>
                          )}
                        </div>
                        {salon.address && <p className="text-zinc-500 text-[10px] truncate">{shortAddress(salon.address)}</p>}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            startItinerary(salon);
                          }}
                          className="p-1.5 rounded-lg hover:bg-zinc-700 transition"
                          title="Itinéraire"
                        >
                          <RouteIcon className="w-4 h-4 text-emerald-400" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFollow(salon.id);
                          }}
                          disabled={isLoading}
                          className="p-1.5 rounded-lg hover:bg-zinc-700 transition disabled:opacity-50"
                          title={isFollowing ? 'Ne plus suivre' : 'Suivre'}
                        >
                          {isLoading ? (
                            <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                          ) : isFollowing ? (
                            <UserCheck className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <UserPlusIcon className="w-4 h-4 text-zinc-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderAllSalons = (): React.ReactElement => {
    const sortedAll = [...filteredSalons]
      .filter(s => !s.is_own_profile)
      .sort((a, b) => {
        if (a.has_active_subscription && !b.has_active_subscription) return -1;
        if (!a.has_active_subscription && b.has_active_subscription) return 1;
        return (b.rating || 0) - (a.rating || 0);
      });

    if (sortedAll.length === 0) {
      return (
        <div className="px-4 mt-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
            <Scissors className="w-12 h-12 text-zinc-700 mx-auto mb-3" />
            <p className="text-zinc-500">Aucun salon trouvé</p>
          </div>
        </div>
      );
    }

    return (
      <div className="px-4 mt-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white text-sm font-semibold flex items-center gap-2">
            <Store className="w-4 h-4 text-blue-400" />
            Tous les salons
          </h2>
          <span className="text-zinc-500 text-xs">{sortedAll.length} salons</span>
        </div>

        <div className="space-y-2">
          {sortedAll.map((salon) => {
            const distance = userLocation
              ? calculateDistance(userLocation.lat, userLocation.lng, salon.latitude || 0, salon.longitude || 0)
              : null;
            const isFollowing = followingIds.has(salon.id) || guestFollowingIds.has(salon.id);
            const isLoading = followLoading[salon.id] || false;
            const displayName = getSalonDisplayName(salon);

            const salonStories = stories.filter(s => s.profile_id === salon.id);
            const hasStories = salonStories.length > 0;
            const { hasUnviewed } = getStoryStatusForSalon(salon.id);

            return (
              <div
                key={salon.id}
                className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden hover:border-zinc-500 transition cursor-pointer"
                onClick={() => {
                  if (hasStories) {
                    setSelectedStory({
                      stories: salonStories,
                      salonName: displayName,
                      salonLogo: salon.avatar_url,
                      salonId: salon.id,
                    });
                  } else {
                    setSelectedSalon(salon);
                  }
                }}
              >
                <div className="flex items-center p-3 gap-3">
                  <div className="relative">
                    {hasStories && (
                      <div
                        className={`absolute -inset-0.5 rounded-full ${
                          hasUnviewed
                            ? 'bg-gradient-to-tr from-yellow-400 to-pink-500'
                            : 'bg-zinc-600'
                        }`}
                      />
                    )}
                    <div className="w-14 h-14 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0 border-2 border-zinc-900 relative z-10">
                      {salon.avatar_url ? (
                        <img src={salon.avatar_url} alt={displayName} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                          <Scissors className="w-6 h-6 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-white font-semibold text-sm truncate">
                        {displayName}
                      </p>
                      {salon.has_active_subscription && <span className="text-yellow-400 text-[10px]">⭐ Abonné</span>}
                      {hasStories && hasUnviewed && (
                        <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-yellow-400 to-pink-500 flex-shrink-0" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
                      <span className="flex items-center gap-0.5">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        {salon.rating?.toFixed(1) || '0.0'}
                      </span>
                      <span className="flex items-center gap-0.5">
                        <User className="w-3 h-3 text-emerald-400" />
                        {salon.followers_count || 0}
                      </span>
                      {distance !== null && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-400">{distance.toFixed(1)} km</span>
                        </>
                      )}
                    </div>
                    {salon.address && <p className="text-zinc-500 text-[10px] truncate mt-0.5">{shortAddress(salon.address)}</p>}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startItinerary(salon);
                      }}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 transition"
                      title="Itinéraire"
                    >
                      <RouteIcon className="w-4 h-4 text-emerald-400" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFollow(salon.id);
                      }}
                      disabled={isLoading}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 transition disabled:opacity-50"
                      title={isFollowing ? 'Ne plus suivre' : 'Suivre'}
                    >
                      {isLoading ? (
                        <div className="w-4 h-4 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                      ) : isFollowing ? (
                        <UserCheck className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <UserPlusIcon className="w-4 h-4 text-zinc-400" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSalon(salon);
                      }}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 transition"
                    >
                      <ChevronRight className="w-4 h-4 text-zinc-500" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderSalonModal = (): React.ReactElement | null => {
    if (!selectedSalon) return null;

    const distance = userLocation
      ? calculateDistance(userLocation.lat, userLocation.lng, selectedSalon.latitude || 0, selectedSalon.longitude || 0)
      : null;
    const isFollowing = followingIds.has(selectedSalon.id) || guestFollowingIds.has(selectedSalon.id);
    const isLoading = followLoading[selectedSalon.id] || false;
    const isOwnProfile = isAuthenticated && currentUserId === selectedSalon.user_id;
    const displayName = getSalonDisplayName(selectedSalon);
    const isRatingLoading = ratingLoading[selectedSalon.id] || false;

    const handleRate = (rating: number) => {
      rateSalon(selectedSalon.id, rating);
    };

    return (
      <div className="fixed inset-0 z-[90] bg-black/80 flex items-center justify-center p-4" onClick={() => setSelectedSalon(null)}>
        <div
          className="bg-zinc-900 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-zinc-700 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative h-48 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-t-2xl">
            {selectedSalon.cover_image && (
              <img src={selectedSalon.cover_image} alt="" className="w-full h-full object-cover rounded-t-2xl" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent rounded-t-2xl" />

            <button onClick={() => setSelectedSalon(null)} className="absolute top-4 right-4 text-white/80 hover:text-white transition bg-black/30 rounded-full p-1.5">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 -mt-12 relative">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full bg-zinc-800 border-4 border-zinc-900 overflow-hidden flex-shrink-0">
                {selectedSalon.avatar_url ? (
                  <img src={selectedSalon.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                    <Scissors className="w-9 h-9 text-white" />
                  </div>
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-white font-bold text-xl">
                    {displayName}
                  </h3>
                  {selectedSalon.has_active_subscription && <span className="text-yellow-400 text-xs">⭐</span>}
                </div>
                {selectedSalon.address && (
                  <p className="text-zinc-400 text-sm flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {shortAddress(selectedSalon.address)}
                  </p>
                )}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3 bg-zinc-800/50 rounded-xl p-3">
              <div className="flex items-center gap-1">
                <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
                <span className="text-white font-bold text-lg">{selectedSalon.rating?.toFixed(1) || '0.0'}</span>
              </div>
              <span className="text-zinc-500 text-sm">•</span>
              <span className="text-zinc-400 text-sm flex items-center gap-0.5">
                <User className="w-3.5 h-3.5" />
                {selectedSalon.followers_count || 0}
              </span>
            </div>

            <div className="mt-4 bg-zinc-800/30 rounded-xl p-3">
              <p className="text-zinc-400 text-xs mb-2">Noter ce salon</p>
              <StarRating
                rating={selectedSalon.user_rating}
                onRate={handleRate}
                isLoading={isRatingLoading}
                isOwnProfile={isOwnProfile}
                isAuthenticated={isAuthenticated}
              />
            </div>

            {selectedSalon.description && (
              <div className="mt-3">
                <p className="text-zinc-400 text-xs mb-1">Description</p>
                <p className="text-white text-sm">{selectedSalon.description}</p>
              </div>
            )}

            {distance !== null && (
              <div className="mt-3 flex items-center gap-2 text-zinc-400 text-xs bg-zinc-800/30 rounded-xl py-2 px-3">
                <Navigation className="w-3.5 h-3.5 text-emerald-400" />
                <span>{distance.toFixed(1)} km de votre position</span>
              </div>
            )}

            <div className="mt-4 flex flex-col gap-2">
              {/* ✅ FIX : bouton désactivé si pas de slug */}
              <button
                onClick={() => handleBooking(selectedSalon)}
                disabled={!selectedSalon.slug}
                className="w-full flex items-center justify-center gap-2 bg-white text-black font-semibold py-3 rounded-xl text-sm hover:bg-zinc-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Calendar className="w-4 h-4" />
                {selectedSalon.slug ? 'Réserver' : 'Réservation indisponible'}
              </button>

              <div className="flex gap-2">
                <button
                  onClick={() => startItinerary(selectedSalon)}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm transition"
                >
                  <RouteIcon className="w-4 h-4" /> Itinéraire
                </button>

                {selectedSalon.phone && (
                  <a
                    href={`tel:${selectedSalon.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl text-sm transition"
                  >
                    <Phone className="w-4 h-4" /> Appeler
                  </a>
                )}

                {!isOwnProfile && (
                  <button
                    onClick={() => toggleFollow(selectedSalon.id)}
                    disabled={isLoading}
                    className={`flex-1 flex items-center justify-center gap-2 font-semibold py-2.5 rounded-xl text-sm transition disabled:opacity-50 ${
                      isFollowing
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    {isLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : isFollowing ? (
                      <>
                        <UserCheck className="w-4 h-4" /> Se désabonner
                      </>
                    ) : (
                      <>
                        <UserPlusIcon className="w-4 h-4" /> S'abonner
                      </>
                    )}
                  </button>
                )}
              </div>

              {!isAuthenticated && (
                <p className="text-zinc-500 text-[10px] text-center mt-1">
                  Vous pouvez réserver et suivre des salons sans compte •
                  <button
                    onClick={onNavigateToLogin}
                    className="text-blue-400 hover:underline ml-1"
                  >
                    Se connecter
                  </button>
                  {" ou "}
                  <button
                    onClick={onNavigateToRegister}
                    className="text-blue-400 hover:underline"
                  >
                    Créer un compte
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 pb-20 animate-pulse">
        <div className="h-14 bg-black/90 border-b border-zinc-800" />
        <div className="max-w-lg mx-auto pt-4 px-4 space-y-4">
          <div className="h-10 bg-zinc-900 rounded-xl w-40" />
          <div className="flex gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="w-16 h-16 rounded-full bg-zinc-900 flex-shrink-0" />
            ))}
          </div>
          <div className="h-[420px] bg-zinc-900 rounded-2xl" />
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 bg-zinc-900 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-md border-b border-zinc-800 px-4 py-2">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Scissors className="w-5 h-5 text-black" />
            </div>
            <h1 className="text-white font-black text-lg tracking-tight">LE COUPE</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-36 sm:w-48 md:w-56 bg-zinc-800/80 border border-zinc-700 rounded-full px-4 py-1.5 text-white placeholder-zinc-500 text-sm focus:outline-none focus:border-white transition"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            </div>
            {!isAuthenticated && (
              <button
                onClick={onNavigateToLogin}
                className="text-sm text-blue-400 font-medium hover:text-blue-300 transition"
              >
                Connexion
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-lg mx-auto pt-3">
        {renderFollowedSection()}

        {renderMap()}

        {!mapFullscreen && renderAllSalons()}

        {!mapFullscreen && (
          <div className="mt-8 pb-4 text-center">
            <p className="text-zinc-600 text-[10px]">
              {salons.length} salons disponibles • Propulsé par <span className="text-white font-semibold">LE COUPE</span>
            </p>
            <div className="flex justify-center gap-4 mt-2">
              <a href="#" className="text-zinc-500 hover:text-white transition"><Instagram className="w-4 h-4" /></a>
              <a href="#" className="text-zinc-500 hover:text-white transition"><Facebook className="w-4 h-4" /></a>
              <a href="#" className="text-zinc-500 hover:text-white transition"><Twitter className="w-4 h-4" /></a>
              <a href="#" className="text-zinc-500 hover:text-white transition"><Youtube className="w-4 h-4" /></a>
            </div>
          </div>
        )}
      </div>

      {!mapFullscreen && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 bg-black border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
            <button
              onClick={() => {
                if (onNavigateToPage) {
                  onNavigateToPage('publicHome');
                }
              }}
              className="flex flex-col items-center gap-0.5 px-2 py-1 group"
            >
              <div className="p-1 rounded-xl transition-all flex items-center justify-center">
                <Home className="w-5 h-5 text-zinc-600 group-hover:text-white" />
              </div>
              <span className="text-[8px] font-medium text-zinc-600 group-hover:text-white">Accueil</span>
            </button>

            <button
              onClick={() => {
                if (onNavigateToPage) {
                  onNavigateToPage('home');
                }
              }}
              className="flex flex-col items-center gap-0.5 px-2 py-1 group"
            >
              <div className="p-1 rounded-xl transition-all flex items-center justify-center">
                <Scissors className="w-5 h-5 text-zinc-600 group-hover:text-white" />
              </div>
              <span className="text-[8px] font-medium text-zinc-600 group-hover:text-white">Services</span>
            </button>

            <button
              onClick={() => {
                if (onNavigateToPage) {
                  onNavigateToPage('bookings');
                }
              }}
              className="flex flex-col items-center gap-0.5 px-2 py-1 group"
            >
              <div className="p-1 rounded-xl transition-all flex items-center justify-center">
                <CalendarCheck className="w-5 h-5 text-zinc-600 group-hover:text-white" />
              </div>
              <span className="text-[8px] font-medium text-zinc-600 group-hover:text-white">Réservations</span>
            </button>

            <button
              onClick={() => {
                if (onNavigateToPage) {
                  onNavigateToPage('revenue');
                }
              }}
              className="flex flex-col items-center gap-0.5 px-2 py-1 group"
            >
              <div className="p-1 rounded-xl transition-all flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-zinc-600 group-hover:text-white" />
              </div>
              <span className="text-[8px] font-medium text-zinc-600 group-hover:text-white">Revenus</span>
            </button>

            <button
              onClick={() => {
                if (onNavigateToPage) {
                  onNavigateToPage('expenses');
                }
              }}
              className="flex flex-col items-center gap-0.5 px-2 py-1 group"
            >
              <div className="p-1 rounded-xl transition-all flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-zinc-600 group-hover:text-white" />
              </div>
              <span className="text-[8px] font-medium text-zinc-600 group-hover:text-white">Dépenses</span>
            </button>
          </div>
        </nav>
      )}

      {selectedStory && (
        <StoryViewer
          stories={selectedStory.stories}
          onClose={() => setSelectedStory(null)}
          salonName={selectedStory.salonName}
          salonLogo={selectedStory.salonLogo}
          salonId={selectedStory.salonId}
          onViewProfile={viewProfile}
          onStoryViewed={markStoryAsViewed}
          onLikeStory={toggleLikeStory}
          userLikes={userLikes}
        />
      )}

      {renderSalonModal()}

      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[110] bg-zinc-800 border border-zinc-700 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-2xl">
          {toast}
        </div>
      )}
    </div>
  );
}