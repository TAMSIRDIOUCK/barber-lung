// src/components/SalonProfile.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Edit2, Camera, MapPin, Star, Plus, X, Upload, Save, AlertCircle, ChevronLeft,
  ChevronRight, Scissors, Trash2, Play, Loader2, Eye, Heart, Navigation, Clock,
  Grid3x3, Image as ImageIcon
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SalonLocationEditor } from './SalonLocationEditor';
import { ErrorBoundary } from './ErrorBoundary';

interface SalonProfileProps {
  userId: string;
}

interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  salon_name: string;
  avatar_url: string | null;
  cover_image: string | null;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  phone: string;
}

interface SalonStats {
  followers: number;
  following: number;
  likes: number;
  totalReviews: number;
  averageRating: number;
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

interface PortfolioPost {
  id: string;
  profile_id: string;
  user_id: string;
  image_url: string;
  caption: string;
  media_type: 'image' | 'video';
  like_count: number;
  view_count: number;
  created_at: string;
}

// ── Validation des coordonnées ──
function isValidCoords(lat?: number | null, lng?: number | null): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false;
  return true;
}

// ── Chemin de stockage à partir de l'URL publique ──
function storagePathFromUrl(url: string): string | null {
  const marker = '/public-media/';
  const i = url.indexOf(marker);
  if (i === -1) return null;
  return decodeURIComponent(url.slice(i + marker.length).split('?')[0]);
}

// ── Accès profil, hors composant ──
async function fetchProfileRow(uid: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: true })
    .limit(1);

  if (error) {
    console.error('❌ Erreur récupération profil:', error);
    return null;
  }
  return data && data.length > 0 ? data[0] : null;
}

async function insertProfileRow(uid: string) {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      user_id: uid,
      full_name: 'Mon Salon',
      salon_name: 'Mon Salon',
      description: '',
      address: '',
      phone: '',
      latitude: 0,
      longitude: 0,
      is_active: true,
      created_at: now,
      updated_at: now,
    })
    .select()
    .single();

  if (error) {
    if (error.code !== '23505') console.error('❌ Erreur création profil:', error);
    return null;
  }
  return data;
}

// ── Suppression des stories expirées (plus de 48h) ──
async function deleteExpiredStories() {
  try {
    const expiryDate = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const { data: expiredStories, error: fetchError } = await supabase
      .from('stories')
      .select('id, image_url')
      .lt('created_at', expiryDate.toISOString());

    if (fetchError) {
      console.error('❌ Erreur récupération stories expirées:', fetchError);
      return;
    }
    if (!expiredStories || expiredStories.length === 0) return;

    const paths = expiredStories
      .map((s) => storagePathFromUrl(s.image_url))
      .filter((p): p is string => !!p);

    if (paths.length > 0) {
      const { error: storageErr } = await supabase.storage.from('public-media').remove(paths);
      if (storageErr) console.warn('⚠️ Erreur suppression fichiers:', storageErr);
    }

    await supabase.from('stories').delete().in('id', expiredStories.map((s) => s.id));
  } catch (err) {
    console.error('❌ Erreur suppression stories expirées:', err);
  }
}

// ── Visionneuse de stories ──
function StoryViewer({
  stories,
  onClose,
  currentIndex = 0,
  onStoryDeleted,
  userId,
  onRefreshStories
}: {
  stories: Story[];
  onClose: () => void;
  currentIndex?: number;
  onStoryDeleted?: (storyId: string) => void;
  userId?: string;
  onRefreshStories?: () => Promise<void>;
}) {
  const [index, setIndex] = useState(currentIndex);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const viewCountedRef = useRef<Set<string>>(new Set());
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const getTimeRemaining = (createdAt: string) => {
    const created = new Date(createdAt);
    const diff = 48 * 60 * 60 * 1000 - (Date.now() - created.getTime());
    if (diff <= 0) return 'Expirée';
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h`;
    return `${minutes}min`;
  };

  useEffect(() => {
    const nextStory = stories[index + 1];
    if (nextStory) {
      const img = new Image();
      img.src = nextStory.image_url;
    }
  }, [index, stories]);

  const incrementViewCount = useCallback(async (storyId: string) => {
    try {
      const { data: current } = await supabase
        .from('stories')
        .select('view_count')
        .eq('id', storyId)
        .single();

      if (current) {
        await supabase
          .from('stories')
          .update({ view_count: (current.view_count || 0) + 1 })
          .eq('id', storyId);
      }
    } catch (err) {
      console.error('Erreur incrémentation vues:', err);
    }
  }, []);

  useEffect(() => {
    const currentStory = stories[index];
    if (currentStory && currentStory.id && !viewCountedRef.current.has(currentStory.id)) {
      viewCountedRef.current.add(currentStory.id);
      incrementViewCount(currentStory.id);
    }
  }, [index, stories, incrementViewCount]);

  useEffect(() => {
    setIsLoading(true);
    setIsImageLoaded(false);
    setProgress(0);
  }, [index]);

  useEffect(() => {
    if (isPaused || !isImageLoaded) return;

    timerRef.current = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          if (index < stories.length - 1) {
            setIndex((p) => p + 1);
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
  }, [index, isPaused, isImageLoaded, stories.length, onClose]);

  const currentStory = stories[index];
  if (!currentStory) return null;

  const isVideo = currentStory.media_type === 'video' || currentStory.image_url?.match(/\.(mp4|webm|mov|avi)$/i);
  const timeRemaining = getTimeRemaining(currentStory.created_at);

  const handleDeleteStory = async () => {
    if (!currentStory || !userId || isDeleting) return;

    setIsDeleting(true);
    try {
      const { error: deleteError } = await supabase
        .from('stories')
        .delete()
        .eq('id', currentStory.id);

      if (deleteError) throw deleteError;

      try {
        const path = storagePathFromUrl(currentStory.image_url);
        if (path) {
          await supabase.storage.from('public-media').remove([path]);
        }
      } catch (storageErr) {
        console.warn('⚠️ Erreur suppression fichier:', storageErr);
      }

      onClose();
      if (onStoryDeleted) onStoryDeleted(currentStory.id);
      if (onRefreshStories) await onRefreshStories();

      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('❌ Erreur suppression story:', err);
      alert('Erreur lors de la suppression de la story');
    } finally {
      setIsDeleting(false);
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
      if (index < stories.length - 1) {
        setIndex((p) => p + 1);
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

  return (
    <div
      translate="no"
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      onMouseDown={() => setIsPaused(true)}
      onMouseUp={() => setIsPaused(false)}
    >
      <div className="flex gap-1 px-3 pt-3 pb-2 flex-shrink-0">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 bg-zinc-600 rounded-full overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-100"
              style={{
                width: i < index ? '100%' : i === index ? `${progress}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden border-2 border-white flex-shrink-0">
            {currentStory.image_url ? (
              <img src={currentStory.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                <Scissors className="w-4 h-4 text-white" />
              </div>
            )}
          </div>
          <div className="text-left min-w-0">
            <p className="text-white font-semibold text-sm truncate">Story</p>
            <div className="flex items-center gap-2 text-xs text-zinc-400">
              <span>{new Date(currentStory.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                <span>{timeRemaining}</span>
              </span>
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                <span>{currentStory.view_count || 0}</span>
              </span>
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                <span>{currentStory.like_count || 0}</span>
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
            className="text-white/70 hover:text-red-400 transition p-1.5 rounded-full hover:bg-red-500/20 disabled:opacity-50"
          >
            <Trash2 className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="text-white/70 hover:text-white transition p-1.5 rounded-full hover:bg-white/10">
            <X className="w-6 h-6" />
          </button>
        </div>
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

      <button
        onClick={() => index > 0 && setIndex((p) => p - 1)}
        className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-24 flex items-center justify-start pl-2 text-white/30 hover:text-white/60 transition"
      >
        <ChevronLeft className="w-8 h-8" />
      </button>
      <button
        onClick={() => index < stories.length - 1 && setIndex((p) => p + 1)}
        className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-24 flex items-center justify-end pr-2 text-white/30 hover:text-white/60 transition"
      >
        <ChevronRight className="w-8 h-8" />
      </button>

      {showDeleteConfirm && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-10">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full mx-4 border border-zinc-700">
            <h3 className="text-white font-bold text-lg mb-2">Supprimer la story ?</h3>
            <p className="text-zinc-400 text-sm mb-4">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button
                onClick={handleDeleteStory}
                disabled={isDeleting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                    <span>Suppression...</span>
                  </>
                ) : (
                  <span>Supprimer</span>
                )}
              </button>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl transition"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Composant principal ──
export default function SalonProfile({ userId }: SalonProfileProps) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [salonStats, setSalonStats] = useState<SalonStats>({
    followers: 0,
    following: 0,
    likes: 0,
    totalReviews: 0,
    averageRating: 0
  });

  const [stories, setStories] = useState<Story[]>([]);
  const [uploadingStories, setUploadingStories] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [filePreviews, setFilePreviews] = useState<{ file: File; preview: string; type: 'image' | 'video' }[]>([]);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingFromGallery, setIsUploadingFromGallery] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string>('');
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showStoryViewer, setShowStoryViewer] = useState(false);
  const [storyViewerIndex, setStoryViewerIndex] = useState(0);

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAvatarFile, setEditAvatarFile] = useState<File | null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [, setProfileImageError] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [showLocationEditor, setShowLocationEditor] = useState(false);

  // ── PORTFOLIO (photos de coiffures permanentes) ──
  const [portfolioPosts, setPortfolioPosts] = useState<PortfolioPost[]>([]);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
  const [showPortfolioManager, setShowPortfolioManager] = useState(false);
  const [portfolioDeleteConfirm, setPortfolioDeleteConfirm] = useState<string | null>(null);
  const portfolioInputRef = useRef<HTMLInputElement>(null);

  const MAX_STORIES = 10;
  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  const hasLocation = isValidCoords(profile?.latitude, profile?.longitude);

  const profilePromiseRef = useRef<{ userId: string; promise: Promise<any | null> } | null>(null);

  const ensureProfile = useCallback((uid: string): Promise<any | null> => {
    if (profilePromiseRef.current?.userId === uid) {
      return profilePromiseRef.current.promise;
    }

    const promise = (async () => {
      const existing = await fetchProfileRow(uid);
      if (existing) return existing;

      const created = await insertProfileRow(uid);
      if (created) return created;

      return await fetchProfileRow(uid);
    })().then((p) => {
      if (!p && profilePromiseRef.current?.userId === uid) profilePromiseRef.current = null;
      return p;
    });

    profilePromiseRef.current = { userId: uid, promise };
    return promise;
  }, []);

  const getProfileId = useCallback(async (uid: string): Promise<string | null> => {
    const p = await ensureProfile(uid);
    return p?.id || null;
  }, [ensureProfile]);

  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfileLoading(false);
      return;
    }

    try {
      const profileData = await ensureProfile(userId);

      if (profileData) {
        setProfile({
          id: profileData.id,
          user_id: profileData.user_id,
          full_name: profileData.full_name || 'Mon Salon',
          salon_name: profileData.salon_name || 'Mon Salon',
          avatar_url: profileData.avatar_url || null,
          cover_image: profileData.cover_image || null,
          description: profileData.description || '',
          address: profileData.address || '',
          latitude: profileData.latitude || 0,
          longitude: profileData.longitude || 0,
          phone: profileData.phone || ''
        });
        setEditName(profileData.full_name || 'Mon Salon');
        setEditDescription(profileData.description || '');
      } else {
        setProfile(null);
      }
    } catch (err) {
      console.error('❌ Erreur chargement profil:', err);
    } finally {
      setProfileLoading(false);
    }
  }, [userId, ensureProfile]);

  const loadStories = useCallback(async () => {
    if (!userId) return;

    const profileId = await getProfileId(userId);
    if (!profileId) return;

    try {
      await deleteExpiredStories();

      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .eq('profile_id', profileId)
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (!error && data) {
        setStories(data);
      }
    } catch (err) {
      console.error('Erreur chargement stories:', err);
    }
  }, [userId, getProfileId]);

  const refreshStories = useCallback(async () => {
    await loadStories();
  }, [loadStories]);

  const loadStats = useCallback(async () => {
    if (!userId) return;

    try {
      const profileId = await getProfileId(userId);
      if (!profileId) return;

      const { count: followersCount } = await supabase
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('following_id', profileId)
        .eq('status', 'active');

      const { count: followingCount } = await supabase
        .from('followers')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', profileId)
        .eq('status', 'active');

      const { data: myStoryIdsData } = await supabase
        .from('stories')
        .select('id')
        .eq('profile_id', profileId);

      const myStoryIds = (myStoryIdsData || []).map((s: any) => s.id);

      let totalLikesCount = 0;
      if (myStoryIds.length > 0) {
        const { count, error: likesError } = await supabase
          .from('likes')
          .select('*', { count: 'exact', head: true })
          .eq('target_type', 'story')
          .in('target_id', myStoryIds);

        if (likesError) {
          console.error('❌ Erreur chargement likes:', likesError);
        } else {
          totalLikesCount = count || 0;
        }
      }

      const { data: reviews } = await supabase
        .from('reviews')
        .select('rating')
        .eq('profile_id', profileId);

      const avgRating = reviews && reviews.length > 0
        ? reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length
        : 0;

      setSalonStats({
        followers: followersCount || 0,
        following: followingCount || 0,
        likes: totalLikesCount,
        totalReviews: reviews?.length || 0,
        averageRating: avgRating
      });
    } catch (err) {
      console.error('Erreur chargement stats:', err);
    }
  }, [userId, getProfileId]);

  // ── PORTFOLIO : charger ──
  const loadPortfolio = useCallback(async () => {
    if (!userId) return;
    const profileId = await getProfileId(userId);
    if (!profileId) return;

    try {
      const { data, error } = await supabase
        .from('portfolio_posts')
        .select('*')
        .eq('profile_id', profileId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erreur chargement portfolio:', error);
        return;
      }
      setPortfolioPosts(data || []);
    } catch (err) {
      console.error('Erreur chargement portfolio:', err);
    }
  }, [userId, getProfileId]);

  // ── PORTFOLIO : upload ──
  const handlePortfolioUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !userId) return;

    const profileId = await getProfileId(userId);
    if (!profileId) {
      alert('Profil introuvable');
      return;
    }

    setUploadingPortfolio(true);
    try {
      const uploaded: any[] = [];

      for (const file of Array.from(files)) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
        if (file.size > 50 * 1024 * 1024) {
          alert(`${file.name} dépasse 50 Mo`);
          continue;
        }

        const ext = file.name.split('.').pop();
        const fileName = `portfolio/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from('public-media')
          .upload(fileName, file, { cacheControl: '3600', upsert: false });

        if (upErr) throw upErr;

        const { data: urlData } = supabase.storage
          .from('public-media')
          .getPublicUrl(fileName);

        uploaded.push({
          profile_id: profileId,
          user_id: userId,
          image_url: urlData.publicUrl,
          media_type: file.type.startsWith('video/') ? 'video' : 'image',
          caption: '',
        });
      }

      if (uploaded.length > 0) {
        const { error: insertError } = await supabase
          .from('portfolio_posts')
          .insert(uploaded);

        if (insertError) throw insertError;

        await loadPortfolio();
        alert(`✅ ${uploaded.length} publication${uploaded.length > 1 ? 's' : ''} ajoutée${uploaded.length > 1 ? 's' : ''} !`);
      }
    } catch (err) {
      console.error('Erreur upload portfolio:', err);
      alert('Erreur lors de l\'upload');
    } finally {
      setUploadingPortfolio(false);
      if (e.target) e.target.value = '';
    }
  }, [userId, getProfileId, loadPortfolio]);

  // ── PORTFOLIO : supprimer ──
  const handleDeletePortfolioPost = useCallback(async (postId: string, imageUrl: string) => {
    try {
      const { error } = await supabase
        .from('portfolio_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      const path = storagePathFromUrl(imageUrl);
      if (path) {
        await supabase.storage.from('public-media').remove([path]).catch(() => {});
      }

      setPortfolioPosts((prev) => prev.filter((p) => p.id !== postId));
      setPortfolioDeleteConfirm(null);
    } catch (err) {
      console.error('Erreur suppression:', err);
      alert('Erreur lors de la suppression');
    }
  }, []);

  const uploadSelectedStories = useCallback(async () => {
    if (selectedFiles.length === 0 || !userId) return;

    const profileId = await getProfileId(userId);
    if (!profileId) {
      alert('Erreur: impossible de trouver votre profil.');
      return;
    }

    setUploadingStories(true);
    setUploadProgress(0);
    setUploadStatus('Préparation des fichiers...');

    try {
      const totalFiles = selectedFiles.length;

      const uploadPromises = selectedFiles.map(async (file, i) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `stories/${userId}/${Date.now()}_${i}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('public-media')
          .upload(fileName, file, {
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('public-media')
          .getPublicUrl(fileName);

        const mediaType = file.type.startsWith('video/') ? 'video' : 'image';

        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 48);

        return {
          profile_id: profileId,
          image_url: urlData.publicUrl,
          title: '',
          expires_at: expiresAt.toISOString(),
          media_type: mediaType,
          view_count: 0,
          like_count: 0,
          is_active: true
        };
      });

      setUploadStatus(`Upload de ${totalFiles} fichiers...`);

      const storyData = await Promise.all(uploadPromises);
      setUploadProgress(50);

      setUploadStatus('Publication...');
      const { error: insertError } = await supabase
        .from('stories')
        .insert(storyData);

      if (insertError) throw insertError;

      setUploadProgress(100);
      filePreviews.forEach((p) => URL.revokeObjectURL(p.preview));
      setSelectedFiles([]);
      setFilePreviews([]);
      setShowPreviewModal(false);
      await refreshStories();
      await loadStats();
      setUploadStatus('✅ Terminé !');

      setTimeout(() => {
        setIsUploadingFromGallery(false);
        setUploadingStories(false);
        setUploadProgress(0);
        setUploadStatus('');
      }, 1500);
    } catch (err) {
      console.error('Erreur upload stories:', err);
      setUploadStatus('❌ Erreur');
      setTimeout(() => {
        setIsUploadingFromGallery(false);
        setUploadingStories(false);
        setUploadProgress(0);
        setUploadStatus('');
      }, 2000);
    }
  }, [selectedFiles, filePreviews, userId, getProfileId, refreshStories, loadStats]);

  const handleSaveProfile = async () => {
    if (!userId || !profile) return;

    if (!isValidCoords(profile.latitude, profile.longitude)) {
      alert('⚠️ Veuillez partager votre position avant de sauvegarder.');
      return;
    }

    setSavingProfile(true);
    try {
      const newName = editName.trim() || profile.full_name;
      const newDescription = editDescription.trim() || profile.description;

      const updateData: Record<string, any> = {
        full_name: newName,
        salon_name: newName,
        description: newDescription,
        updated_at: new Date().toISOString()
      };

      let avatarUrl = profile.avatar_url;
      if (editAvatarFile) {
        const fileExt = editAvatarFile.name.split('.').pop();
        const timestamp = Date.now();
        const randomStr = Math.random().toString(36).substring(2, 8);
        const fileName = `profiles/${userId}/avatar_${timestamp}_${randomStr}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from('public-media')
          .upload(fileName, editAvatarFile, {
            cacheControl: '3600',
            upsert: true
          });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('public-media')
          .getPublicUrl(fileName);

        avatarUrl = urlData.publicUrl;
        updateData.avatar_url = avatarUrl;
      }

      const { data: updated, error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('user_id', userId)
        .select('id');

      if (updateError) throw updateError;
      if (!updated || updated.length === 0) {
        throw new Error('Aucun profil modifié (vérifiez la politique RLS).');
      }

      setProfile({
        ...profile,
        full_name: newName,
        salon_name: newName,
        description: newDescription,
        avatar_url: avatarUrl
      });

      setIsEditing(false);
      setEditAvatarFile(null);
      setEditAvatarPreview(null);
      alert('Profil mis à jour avec succès !');
    } catch (err) {
      console.error('❌ Erreur sauvegarde profil:', err);
      alert('Erreur lors de la sauvegarde du profil');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (files.length > MAX_STORIES) {
      alert(`Vous ne pouvez pas sélectionner plus de ${MAX_STORIES} stories à la fois`);
      return;
    }

    const newFiles: File[] = [];
    const newPreviews: { file: File; preview: string; type: 'image' | 'video' }[] = [];

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) continue;
      if (file.size > MAX_FILE_SIZE) {
        alert(`${file.name} dépasse 50 Mo`);
        continue;
      }

      const isVideo = file.type.startsWith('video/');
      newFiles.push(file);
      newPreviews.push({
        file,
        preview: URL.createObjectURL(file),
        type: isVideo ? 'video' : 'image'
      });
    }

    if (newFiles.length > 0) {
      setSelectedFiles(prev => [...prev, ...newFiles]);
      setFilePreviews(prev => [...prev, ...newPreviews]);
      setShowPreviewModal(true);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const confirmUpload = () => {
    setShowPreviewModal(false);
    setIsUploadingFromGallery(true);
    setUploadProgress(0);
    uploadSelectedStories();
  };

  const removePreviewFile = (index: number) => {
    setFilePreviews(prev => {
      const removed = prev[index];
      if (removed) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, idx) => idx !== index);
    });
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  const cancelPreview = () => {
    filePreviews.forEach((p) => URL.revokeObjectURL(p.preview));
    setShowPreviewModal(false);
    setFilePreviews([]);
    setSelectedFiles([]);
  };

  const handleStoryDeleted = async () => {
    await refreshStories();
    await loadStats();
    setShowStoryViewer(false);
  };

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Veuillez sélectionner une image');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert("L'image ne doit pas dépasser 5 Mo");
      return;
    }

    if (editAvatarPreview) URL.revokeObjectURL(editAvatarPreview);
    setEditAvatarFile(file);
    setEditAvatarPreview(URL.createObjectURL(file));
  };

  const handleAvatarClick = () => {
    if (isEditing) {
      avatarInputRef.current?.click();
    }
  };

  const openStoryViewer = (index: number) => {
    setStoryViewerIndex(index);
    setShowStoryViewer(true);
  };

  const openGallery = () => {
    fileInputRef.current?.click();
  };

  const closeEditing = () => {
    setIsEditing(false);
    setEditAvatarFile(null);
    setEditAvatarPreview(null);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      deleteExpiredStories();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (userId) {
      loadProfile();
      loadStories();
      loadStats();
      loadPortfolio();
    } else {
      setProfileLoading(false);
    }
  }, [userId, loadProfile, loadStories, loadStats, loadPortfolio]);

  const locationEditorNode =
    showLocationEditor && profile ? (
      <ErrorBoundary>
        <SalonLocationEditor
          userId={userId}
          initialLatitude={profile.latitude}
          initialLongitude={profile.longitude}
          initialAddress={profile.address}
          onClose={() => setShowLocationEditor(false)}
          onSaved={(lat: number, lng: number, address?: string) => {
            setProfile((prev) =>
              prev ? { ...prev, latitude: lat, longitude: lng, address: address || prev.address } : prev
            );
          }}
        />
      </ErrorBoundary>
    ) : null;

  if (profileLoading) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 mb-6">
        <div className="animate-pulse flex items-center gap-4">
          <div className="w-20 h-20 rounded-full bg-zinc-700" />
          <div className="flex-1 space-y-2">
            <div className="h-5 bg-zinc-700 rounded w-32" />
            <div className="h-3 bg-zinc-700 rounded w-24" />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 mb-6 text-center">
        <p className="text-zinc-400 text-sm">Aucun profil trouvé.</p>
        <button
          onClick={async () => {
            profilePromiseRef.current = null;
            setProfileLoading(true);
            await loadProfile();
          }}
          className="mt-3 bg-white text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition"
        >
          Créer mon profil
        </button>
      </div>
    );
  }

  if (isEditing) {
    return (
      <div translate="no" className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden mb-6">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
          <button onClick={closeEditing} className="text-zinc-400 hover:text-white transition">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="text-white font-bold text-lg">Modifier le profil</h2>
        </div>

        <div className="p-4 space-y-6">
          <div className="flex flex-col items-center">
            <div onClick={handleAvatarClick} className="relative cursor-pointer group">
              <div className="w-24 h-24 rounded-full bg-zinc-800 border-4 border-zinc-700 overflow-hidden shadow-lg group-hover:opacity-80 transition">
                {editAvatarPreview ? (
                  <img src={editAvatarPreview} alt="Nouvel avatar" className="w-full h-full object-cover" />
                ) : profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.salon_name || profile.full_name}
                    className="w-full h-full object-cover"
                    onError={() => setProfileImageError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                    <span className="text-white text-3xl font-bold">
                      {(profile.salon_name || profile.full_name || 'S')[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              <div className="absolute bottom-0 right-0 bg-emerald-500 rounded-full p-1.5 border-2 border-zinc-900 shadow-lg">
                <Camera className="w-4 h-4 text-white" />
              </div>

              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40 rounded-full">
                <div className="flex flex-col items-center">
                  <Camera className="w-8 h-8 text-white" />
                  <span className="text-white text-xs font-medium mt-1">Changer</span>
                </div>
              </div>
            </div>
            <p className="text-zinc-400 text-xs mt-2">Cliquez sur la photo pour la changer</p>
            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              className="hidden"
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-zinc-400 text-xs mb-1.5">Nom du salon</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-white transition"
                placeholder="Nom du salon"
              />
            </div>

            <div>
              <label className="block text-zinc-400 text-xs mb-1.5">Description</label>
              <textarea
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-white transition resize-none"
                placeholder="Description de votre salon"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-zinc-400 text-xs mb-1.5">
                <span>Position</span> <span className="text-red-400">*</span>
              </label>

              <button
                type="button"
                onClick={() => setShowLocationEditor(true)}
                className={`w-full flex items-center justify-center gap-2 bg-zinc-800 border rounded-xl px-4 py-3 text-sm transition ${
                  hasLocation
                    ? 'border-emerald-500 text-emerald-400 hover:bg-emerald-500/10'
                    : 'border-red-500 text-red-400 hover:bg-red-500/10'
                }`}
              >
                <MapPin className="w-4 h-4" />
                <span>{hasLocation ? 'Position partagée ✓ (modifier)' : 'Définir la position du salon'}</span>
              </button>

              {hasLocation && profile.address && (
                <p className="text-zinc-500 text-xs mt-1.5 break-words">{profile.address}</p>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSaveProfile}
              disabled={savingProfile || !hasLocation}
              className={`flex-1 font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2 ${
                hasLocation
                  ? 'bg-white text-black hover:bg-zinc-200'
                  : 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
              }`}
            >
              {savingProfile ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black" />
                  <span>Sauvegarde...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Sauvegarder</span>
                </>
              )}
            </button>
            <button
              onClick={closeEditing}
              className="flex-1 bg-zinc-800 text-white font-semibold py-3 rounded-xl transition"
            >
              Annuler
            </button>
          </div>
        </div>

        {locationEditorNode}
      </div>
    );
  }

  // 🔥 LOGIQUE DU CERCLE : story active → dégradé Insta | pas de story → gris
  const hasActiveStories = stories.length > 0;

  return (
    <div translate="no" className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden mb-6">
      <div className="relative h-32 bg-gradient-to-r from-indigo-600 to-purple-600">
        {profile.cover_image && (
          <img src={profile.cover_image} alt="Cover" className="w-full h-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />

        <button
          onClick={() => setIsEditing(true)}
          className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white text-xs font-medium px-3 py-1.5 rounded-full transition border border-white/20"
        >
          <Edit2 className="w-3.5 h-3.5" />
          <span>Modifier</span>
        </button>
      </div>

      <div className="px-4 pb-4 -mt-10 relative">
        <div className="flex items-end gap-4">
          <div
            className="relative cursor-pointer group"
            onClick={() => {
              if (hasActiveStories) {
                openStoryViewer(0);
              }
            }}
          >
            {/* 🔥 CERCLE : gris si pas de story, dégradé Insta sinon */}
            <div
              className={`w-20 h-20 rounded-full p-[3px] group-hover:scale-105 transition ${
                hasActiveStories
                  ? 'bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600'
                  : 'bg-zinc-600'
              }`}
              style={
                hasActiveStories
                  ? { background: 'linear-gradient(to top right, #facc15, #ec4899, #a855f7)' }
                  : {}
              }
            >
              <div className="w-full h-full rounded-full bg-zinc-800 border-[3px] border-zinc-900 overflow-hidden shadow-lg">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.salon_name || profile.full_name}
                    className="w-full h-full object-cover"
                    onError={() => setProfileImageError(true)}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-500 to-pink-500">
                    <span className="text-white text-2xl font-bold">
                      {(profile.salon_name || profile.full_name || 'S')[0].toUpperCase()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {isUploadingFromGallery && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-zinc-900 animate-pulse">
                <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
              </div>
            )}

            <div
              onClick={(e) => {
                e.stopPropagation();
                openGallery();
              }}
              className="absolute bottom-0 right-0 bg-emerald-500 rounded-full p-0.5 border-2 border-zinc-900 cursor-pointer hover:scale-110 transition"
            >
              <Plus className="w-3.5 h-3.5 text-white" />
            </div>

            {hasActiveStories && (
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/40 rounded-full">
                <span className="text-white text-xs font-medium">Voir</span>
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pb-1">
            <h2 className="text-white font-bold text-lg truncate">
              {profile.salon_name || profile.full_name}
            </h2>
            <p className="text-zinc-400 text-sm truncate">
              @{(profile.salon_name || profile.full_name || 'salon').toLowerCase().replace(/\s/g, '_')}
            </p>
            {profile.description && (
              <p className="text-zinc-400 text-xs truncate mt-0.5">{profile.description}</p>
            )}

            <button
              onClick={() => setShowLocationEditor(true)}
              className="flex items-center gap-2 mt-0.5 hover:opacity-80 transition"
            >
              {hasLocation ? (
                <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
                  <MapPin className="w-3 h-3" />
                  <span>Position partagée</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-400 text-[10px]">
                  <AlertCircle className="w-3 h-3" />
                  <span>Position requise</span>
                </span>
              )}
            </button>
          </div>

          <button className="bg-yellow-500/20 text-yellow-400 font-semibold text-sm px-6 py-2 rounded-full hover:bg-yellow-500/30 transition flex-shrink-0 flex items-center gap-1.5">
            <Star className="w-4 h-4 fill-yellow-400" />
            <span>{salonStats.averageRating.toFixed(1)}</span>
          </button>
        </div>

        {!hasLocation && (
          <button
            onClick={() => setShowLocationEditor(true)}
            className="mt-3 w-full p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between gap-3 hover:bg-red-500/20 transition"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
              <span className="text-red-400 text-sm font-medium">Partagez votre position</span>
            </div>
            <span className="text-red-400 text-sm font-medium flex items-center gap-1.5">
              <Navigation className="w-4 h-4" />
              <span>Partager</span>
            </span>
          </button>
        )}

        <div className="flex items-center gap-6 mt-3 pt-3 border-t border-zinc-800">
          <div className="text-center">
            <p className="text-white font-bold text-base">{salonStats.followers}</p>
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Followers</p>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-base">{salonStats.likes}</p>
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">J'aime</p>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-base">{salonStats.totalReviews}</p>
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Avis</p>
          </div>
          <div className="text-center">
            <div className="flex items-center gap-0.5 justify-center">
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              <span className="text-white font-bold text-base">
                {salonStats.averageRating.toFixed(1)}
              </span>
            </div>
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Note</p>
          </div>
        </div>

        {/* 🔥 Bouton Mes réalisations (portfolio) */}
        <button
          onClick={() => setShowPortfolioManager(true)}
          className="mt-3 w-full flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-semibold py-3 rounded-xl text-sm transition shadow-lg shadow-emerald-900/30"
        >
          <Grid3x3 className="w-4 h-4" />
          Mes réalisations {portfolioPosts.length > 0 && `(${portfolioPosts.length})`}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {showPreviewModal && filePreviews.length > 0 && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto border border-zinc-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Aperçu</h3>
              <button
                onClick={cancelPreview}
                className="text-zinc-400 hover:text-white transition p-1 rounded-full hover:bg-zinc-800"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              {filePreviews.map((item, i) => (
                <div key={item.preview} className="relative aspect-square bg-zinc-800 rounded-lg overflow-hidden group">
                  {item.type === 'video' ? (
                    <video src={item.preview} className="w-full h-full object-cover" muted />
                  ) : (
                    <img src={item.preview} alt="" className="w-full h-full object-cover" />
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                    <button
                      onClick={() => removePreviewFile(i)}
                      className="bg-red-600 hover:bg-red-700 rounded-full p-2 transition"
                    >
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                  {item.type === 'video' && (
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Play className="w-3 h-3 fill-white" />
                      <span>Vidéo</span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={confirmUpload}
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-xl transition flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                <span>Publier {filePreviews.length} story{filePreviews.length > 1 ? 's' : ''}</span>
              </button>
              <button
                onClick={cancelPreview}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 rounded-xl transition"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {showStoryViewer && stories.length > 0 && (
        <StoryViewer
          stories={stories}
          onClose={() => setShowStoryViewer(false)}
          currentIndex={storyViewerIndex}
          onStoryDeleted={handleStoryDeleted}
          userId={userId}
          onRefreshStories={refreshStories}
        />
      )}

      {isUploadingFromGallery && uploadingStories && (
        <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <div className="flex flex-col items-center text-center">
              <div className="relative w-16 h-16 mb-4">
                <div className="absolute inset-0 rounded-full border-4 border-zinc-700" />
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-emerald-400" />
                </div>
              </div>

              <h3 className="text-white font-bold text-lg mb-1">Publication</h3>
              <p className="text-zinc-400 text-sm mb-3">{uploadStatus || 'Téléchargement...'}</p>

              <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-zinc-500 text-xs mt-2">{uploadProgress}%</p>
            </div>
          </div>
        </div>
      )}

      {/* 🔥 Modal Gestion des réalisations */}
      {showPortfolioManager && (
        <div
          translate="no"
          className="fixed inset-0 z-[130] bg-black/90 flex items-center justify-center p-3 sm:p-4"
          onClick={() => setShowPortfolioManager(false)}
        >
          <div
            className="bg-zinc-900 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-zinc-700 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-zinc-800 flex-shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Grid3x3 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <h3 className="text-white font-bold text-lg truncate">Mes réalisations</h3>
                <span className="text-zinc-500 text-xs flex-shrink-0">
                  {portfolioPosts.length} photo{portfolioPosts.length > 1 ? 's' : ''}
                </span>
              </div>
              <button
                onClick={() => setShowPortfolioManager(false)}
                className="text-zinc-400 hover:text-white transition p-1 rounded-lg hover:bg-zinc-800 flex-shrink-0"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-4 border-b border-zinc-800 flex-shrink-0">
              <input
                ref={portfolioInputRef}
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handlePortfolioUpload}
                className="hidden"
              />
              <button
                onClick={() => portfolioInputRef.current?.click()}
                disabled={uploadingPortfolio}
                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl text-sm transition disabled:opacity-50"
              >
                {uploadingPortfolio ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Téléchargement...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Ajouter des photos de mes coiffures
                  </>
                )}
              </button>
             
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {portfolioPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <div className="w-16 h-16 rounded-full border-2 border-dashed border-zinc-700 flex items-center justify-center mb-3">
                    <ImageIcon className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="text-white font-semibold text-sm">Aucune réalisation</p>
                  <p className="text-zinc-500 text-xs mt-1">
                    Ajoutez vos plus belles coiffures pour les montrer à vos clients
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {portfolioPosts.map((post) => (
                    <div
                      key={post.id}
                      className="relative aspect-square bg-zinc-800 rounded-xl overflow-hidden group"
                    >
                      {post.media_type === 'video' ? (
                        <video
                          src={post.image_url}
                          className="w-full h-full object-cover"
                          muted
                          playsInline
                        />
                      ) : (
                        <img
                          src={post.image_url}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      )}

                      {post.media_type === 'video' && (
                        <div className="absolute top-2 left-2 bg-black/70 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                          <Play className="w-3 h-3 fill-white" />
                          Vidéo
                        </div>
                      )}

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPortfolioDeleteConfirm(post.id);
                        }}
                        className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-1.5 transition opacity-0 group-hover:opacity-100 sm:opacity-100"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {portfolioDeleteConfirm && (
        <div
          translate="no"
          className="fixed inset-0 z-[140] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPortfolioDeleteConfirm(null)}
        >
          <div
            className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-white font-bold text-lg mb-2">Supprimer cette réalisation ?</h3>
            <p className="text-zinc-400 text-sm mb-4">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  const post = portfolioPosts.find((p) => p.id === portfolioDeleteConfirm);
                  if (post) handleDeletePortfolioPost(post.id, post.image_url);
                }}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition"
              >
                Supprimer
              </button>
              <button
                onClick={() => setPortfolioDeleteConfirm(null)}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl transition"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {locationEditorNode}
    </div>
  );
}