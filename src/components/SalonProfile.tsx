// src/components/SalonProfile.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Edit2, Camera, MapPin, Star, Users, Heart as HeartIcon,
  UserPlus, Plus, X, Upload, Save, AlertCircle, Check, ChevronLeft,
  ChevronRight, Scissors, Trash2, Play, Loader2, Eye, Heart, Navigation,
  Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { SalonLocationEditor } from './SalonLocationEditor';

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

// ── Fonction pour générer un device_id unique ──
function getDeviceId(): string {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

// ── Fonction pour supprimer les stories expirées (plus de 48h) ──
async function deleteExpiredStories() {
  try {
    const now = new Date();
    const expiryDate = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    
    console.log('🗑️ Vérification des stories expirées (48h)...');
    
    const { data: expiredStories, error: fetchError } = await supabase
      .from('stories')
      .select('id, image_url, profile_id')
      .lt('created_at', expiryDate.toISOString());

    if (fetchError) {
      console.error('❌ Erreur récupération stories expirées:', fetchError);
      return;
    }

    if (!expiredStories || expiredStories.length === 0) {
      console.log('✅ Aucune story expirée à supprimer');
      return;
    }

    console.log(`📊 ${expiredStories.length} stories expirées trouvées`);

    for (const story of expiredStories) {
      try {
        const path = story.image_url.split('/').pop();
        if (path) {
          const userId = story.profile_id;
          await supabase.storage
            .from('public-media')
            .remove([`stories/${userId}/${path}`]);
          console.log(`🗑️ Fichier supprimé: ${path}`);
        }
      } catch (storageErr) {
        console.warn('⚠️ Erreur suppression fichier:', storageErr);
      }
    }

    const storyIds = expiredStories.map(s => s.id);
    const { error: deleteError } = await supabase
      .from('stories')
      .delete()
      .in('id', storyIds);

    if (deleteError) {
      console.error('❌ Erreur suppression stories expirées:', deleteError);
    } else {
      console.log(`✅ ${storyIds.length} stories expirées supprimées`);
    }

  } catch (err) {
    console.error('❌ Erreur suppression stories expirées:', err);
  }
}

// ── Composant StoryViewer ──
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const viewCountedRef = useRef<Set<string>>(new Set());

  // Calculer le temps restant avant expiration
  const getTimeRemaining = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const diff = 48 * 60 * 60 * 1000 - (now.getTime() - created.getTime());
    if (diff <= 0) return 'Expirée';
    const hours = Math.floor(diff / (60 * 60 * 1000));
    const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
  };

  useEffect(() => {
    const currentStory = stories[index];
    if (currentStory && currentStory.id && !viewCountedRef.current.has(currentStory.id)) {
      viewCountedRef.current.add(currentStory.id);
      incrementViewCount(currentStory.id);
    }
  }, [index, stories]);

  const incrementViewCount = async (storyId: string) => {
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
  };

  useEffect(() => {
    if (isPaused) return;
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
        return prev + 1;
      });
    }, 50);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [index, isPaused, stories.length, onClose]);

  const currentStory = stories[index];
  if (!currentStory) return null;

  const isVideo = currentStory.media_type === 'video' || currentStory.image_url?.match(/\.(mp4|webm|mov|avi)$/i);
  const timeRemaining = getTimeRemaining(currentStory.created_at);

  const handleDeleteStory = async () => {
    if (!currentStory || !userId || isDeleting) return;
    
    setIsDeleting(true);
    try {
      console.log('🗑️ Suppression de la story:', currentStory.id);
      
      const { error: deleteError } = await supabase
        .from('stories')
        .delete()
        .eq('id', currentStory.id);

      if (deleteError) {
        console.error('❌ Erreur suppression base de données:', deleteError);
        throw deleteError;
      }

      console.log('✅ Story supprimée de la base de données');

      try {
        const path = currentStory.image_url.split('/').pop();
        if (path) {
          console.log('🗑️ Suppression du fichier:', path);
          await supabase.storage
            .from('public-media')
            .remove([`stories/${userId}/${path}`]);
          console.log('✅ Fichier supprimé du storage');
        }
      } catch (storageErr) {
        console.warn('⚠️ Erreur suppression fichier (non bloquante):', storageErr);
      }

      onClose();

      if (onStoryDeleted) {
        onStoryDeleted(currentStory.id);
      }

      if (onRefreshStories) {
        await onRefreshStories();
      }
      
      setShowDeleteConfirm(false);
    } catch (err) {
      console.error('❌ Erreur suppression story:', err);
      alert('Erreur lors de la suppression de la story');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black flex flex-col"
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
      onMouseDown={() => setIsPaused(true)}
      onMouseUp={() => setIsPaused(false)}
    >
      <div className="flex gap-1 p-4 pt-6">
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

      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden border-2 border-white">
            {currentStory.image_url ? (
              <img src={currentStory.image_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-indigo-600">
                <Scissors className="w-5 h-5 text-white" />
              </div>
            )}
          </div>
          <div>
            <p className="text-white font-semibold text-sm">Story</p>
            <div className="flex items-center gap-3 text-xs text-zinc-400">
              <span>{new Date(currentStory.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span className="flex items-center gap-0.5">
                <Clock className="w-3 h-3" />
                {timeRemaining}
              </span>
              <span className="flex items-center gap-0.5">
                <Eye className="w-3 h-3" />
                {currentStory.view_count || 0}
              </span>
              <span className="flex items-center gap-0.5">
                <Heart className="w-3 h-3" />
                {currentStory.like_count || 0}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="flex-1 flex items-center justify-center p-4">
        {isVideo ? (
          <video 
            src={currentStory.image_url} 
            className="max-h-full max-w-full object-contain rounded-xl"
            controls
            autoPlay
            muted={isPaused}
          />
        ) : (
          <img 
            src={currentStory.image_url} 
            alt=""
            className="max-h-full max-w-full object-contain rounded-xl"
          />
        )}
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

      {/* ✅ Pas de titre en bas pour éviter d'afficher le nom du fichier */}

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
                    Suppression...
                  </>
                ) : (
                  'Supprimer'
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
  const [profileImageError, setProfileImageError] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ── État de l'éditeur de position ──
  const [showLocationEditor, setShowLocationEditor] = useState(false);

  const MAX_STORIES = 10;
  const MAX_FILE_SIZE = 50 * 1024 * 1024;

  // ── Vérifier si la position est enregistrée ──
  const hasLocation = profile?.latitude && profile?.longitude && profile?.latitude !== 0 && profile?.longitude !== 0;

  // ── Fonction pour récupérer le profil complet ──
  const getProfile = useCallback(async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('❌ Erreur récupération profil:', error);
        return null;
      }

      if (data && data.length > 0) {
        console.log('✅ Profil trouvé:', data[0].id);
        return data[0];
      }

      console.log('⚠️ Aucun profil trouvé pour user_id:', userId);
      return null;
    } catch (err) {
      console.error('❌ Erreur récupération profil:', err);
      return null;
    }
  }, []);

  // ── Fonction pour créer un profil par défaut ──
  const createProfile = useCallback(async (userId: string) => {
    try {
      console.log('📝 Création d\'un profil pour:', userId);
      
      const defaultProfile = {
        user_id: userId,
        full_name: 'Mon Salon',
        salon_name: 'Mon Salon',
        description: '',
        address: '',
        phone: '',
        latitude: 0,
        longitude: 0,
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from('profiles')
        .insert(defaultProfile)
        .select()
        .single();

      if (error) {
        console.error('❌ Erreur création profil:', error);
        return null;
      }

      console.log('✅ Profil créé:', data);
      return data;
    } catch (err) {
      console.error('❌ Erreur création profil:', err);
      return null;
    }
  }, []);

  // ── Fonction pour récupérer l'ID du profil ──
  const getProfileId = useCallback(async (userId: string): Promise<string | null> => {
    try {
      let profile = await getProfile(userId);
      if (!profile) {
        profile = await createProfile(userId);
      }
      return profile?.id || null;
    } catch (err) {
      console.error('❌ Erreur récupération profile_id:', err);
      return null;
    }
  }, [getProfile, createProfile]);

  // ── Chargement du profil ──
  const loadProfile = useCallback(async () => {
    if (!userId) {
      setProfileLoading(false);
      return;
    }

    try {
      let profileData = await getProfile(userId);
      
      if (!profileData) {
        profileData = await createProfile(userId);
      }

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
        setProfile({
          id: userId,
          user_id: userId,
          full_name: 'Mon Salon',
          salon_name: 'Mon Salon',
          avatar_url: null,
          cover_image: null,
          description: '',
          address: '',
          latitude: 0,
          longitude: 0,
          phone: ''
        });
        setEditName('Mon Salon');
        setEditDescription('');
      }
    } catch (err) {
      console.error('❌ Erreur chargement profil:', err);
    } finally {
      setProfileLoading(false);
    }
  }, [userId, getProfile, createProfile]);

  // ── Chargement des stories avec suppression auto ──
  const loadStories = useCallback(async () => {
    if (!userId) return;

    const profileId = await getProfileId(userId);
    if (!profileId) {
      console.log('⚠️ Aucun profil trouvé pour charger les stories');
      return;
    }

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

  // ── Rafraîchissement des stories ──
  const refreshStories = useCallback(async () => {
    await loadStories();
  }, [loadStories]);

  // ── Chargement des statistiques ──
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

      const { count: profileLikesCount } = await supabase
        .from('likes')
        .select('*', { count: 'exact', head: true })
        .eq('target_id', profileId)
        .eq('target_type', 'profile');

      const { data: myStoryIdsData } = await supabase
        .from('stories')
        .select('id')
        .eq('profile_id', profileId);

      const myStoryIds = (myStoryIdsData || []).map((s: any) => s.id);

      let storyLikesCount = 0;
      if (myStoryIds.length > 0) {
        const { count } = await supabase
          .from('likes')
          .select('*', { count: 'exact', head: true })
          .eq('target_type', 'story')
          .in('target_id', myStoryIds);
        storyLikesCount = count || 0;
      }

      const totalLikesCount = (profileLikesCount || 0) + storyLikesCount;

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

  // ── Upload des stories ──
  const uploadSelectedStories = useCallback(async () => {
    if (selectedFiles.length === 0 || !userId) return;

    const profileId = await getProfileId(userId);
    if (!profileId) {
      alert('Erreur: impossible de trouver votre profil. Veuillez rafraîchir la page.');
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
          title: '', // ✅ Titre vide pour ne pas afficher le nom du fichier
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
  }, [selectedFiles, userId, getProfileId, refreshStories, loadStats]);

  // ── Sauvegarde du profil ──
  const handleSaveProfile = async () => {
    if (!userId || !profile) return;

    if (!profile.latitude || !profile.longitude || profile.latitude === 0 || profile.longitude === 0) {
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

      console.log('📝 Mise à jour du profil avec:', updateData);

      const { error: updateError } = await supabase
        .from('profiles')
        .update(updateData)
        .eq('user_id', userId);

      if (updateError) throw updateError;

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

  // ── Gestion des fichiers ──
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
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        continue;
      }

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
    setFilePreviews(prev => prev.filter((_, idx) => idx !== index));
    setSelectedFiles(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleStoryDeleted = async (storyId: string) => {
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
      alert('L\'image ne doit pas dépasser 5 Mo');
      return;
    }

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
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // ── Nettoyage périodique des stories expirées ──
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
    } else {
      setProfileLoading(false);
    }
  }, [userId, loadProfile, loadStories, loadStats]);

  // ── Loading ──
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
            setProfileLoading(true);
            await loadProfile();
            setProfileLoading(false);
          }}
          className="mt-3 bg-white text-black text-sm font-semibold px-4 py-2 rounded-lg hover:bg-zinc-200 transition"
        >
          Créer mon profil
        </button>
      </div>
    );
  }

  // ── Mode édition ──
  if (isEditing) {
    return (
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden mb-6">
        <div className="p-4 border-b border-zinc-800 flex items-center gap-3">
          <button
            onClick={() => {
              setIsEditing(false);
              setEditAvatarFile(null);
              setEditAvatarPreview(null);
            }}
            className="text-zinc-400 hover:text-white transition"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="text-white font-bold text-lg">Modifier le profil</h2>
        </div>

        <div className="p-4 space-y-6">
          <div className="flex flex-col items-center">
            <div 
              onClick={handleAvatarClick}
              className="relative cursor-pointer group"
            >
              <div className="w-24 h-24 rounded-full bg-zinc-800 border-4 border-zinc-700 overflow-hidden shadow-lg group-hover:opacity-80 transition">
                {editAvatarPreview ? (
                  <img 
                    src={editAvatarPreview} 
                    alt="Nouvel avatar" 
                    className="w-full h-full object-cover"
                  />
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
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/50 rounded-full">
                <Camera className="w-8 h-8 text-white" />
              </div>
            </div>
            <p className="text-zinc-500 text-xs mt-2">Cliquez sur la photo pour la changer</p>
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

            {/* ── Position du salon ── */}
            <div>
              <label className="block text-zinc-400 text-xs mb-1.5">
                Position <span className="text-red-400">*</span>
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
                {hasLocation ? 'Position partagée ✓' : 'Partager ma position'}
              </button>
              {!hasLocation && (
                <p className="text-red-400 text-[10px] mt-1 text-center">⚠️ Cliquez pour partager votre position</p>
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
                  Sauvegarde...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Sauvegarder
                </>
              )}
            </button>
            <button
              onClick={() => {
                setIsEditing(false);
                setEditAvatarFile(null);
                setEditAvatarPreview(null);
              }}
              className="flex-1 bg-zinc-800 text-white font-semibold py-3 rounded-xl transition"
            >
              Annuler
            </button>
          </div>

          {!hasLocation && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0" />
              <p className="text-yellow-400 text-sm">Partagez votre position pour sauvegarder</p>
            </div>
          )}
        </div>

        {showLocationEditor && (
          <SalonLocationEditor
            userId={userId}
            initialLatitude={profile.latitude}
            initialLongitude={profile.longitude}
            initialAddress={profile.address}
            onClose={() => setShowLocationEditor(false)}
            onSaved={(lat: number, lng: number, address?: string) => {
              setProfile((prev) => prev ? { ...prev, latitude: lat, longitude: lng, address: address || prev.address } : prev);
            }}
          />
        )}
      </div>
    );
  }

  // ── Vue normale du profil ──
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden mb-6">
      {/* Cover image */}
      <div className="relative h-32 bg-gradient-to-r from-indigo-600 to-purple-600">
        {profile.cover_image && (
          <img 
            src={profile.cover_image} 
            alt="Cover" 
            className="w-full h-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        
        <button
          onClick={() => setIsEditing(true)}
          className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white text-xs font-medium px-3 py-1.5 rounded-full transition border border-white/20"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Modifier
        </button>
      </div>

      {/* Profil info */}
      <div className="px-4 pb-4 -mt-10 relative">
        <div className="flex items-end gap-4">
          {/* Avatar */}
          <div 
            className="relative cursor-pointer"
            onClick={() => {
              if (stories.length > 0) {
                openStoryViewer(0);
              }
            }}
          >
            <div className={`w-20 h-20 rounded-full p-0.5 ${
              stories.length > 0 || isUploadingFromGallery ? 'bg-gradient-to-tr from-yellow-400 to-pink-500' : 'bg-transparent'
            }`}>
              <div className="w-full h-full rounded-full bg-zinc-800 border-4 border-zinc-900 overflow-hidden shadow-lg">
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
          </div>

          {/* Nom et description */}
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
            
            {/* Statut position - cliquable */}
            <button
              onClick={() => setShowLocationEditor(true)}
              className="flex items-center gap-2 mt-0.5 hover:opacity-80 transition"
            >
              {hasLocation ? (
                <span className="flex items-center gap-1 text-emerald-400 text-[10px]">
                  <MapPin className="w-3 h-3" />
                  Position partagée
                </span>
              ) : (
                <span className="flex items-center gap-1 text-red-400 text-[10px]">
                  <AlertCircle className="w-3 h-3" />
                  Position requise
                </span>
              )}
            </button>
          </div>

          <button className="bg-yellow-500/20 text-yellow-400 font-semibold text-sm px-6 py-2 rounded-full hover:bg-yellow-500/30 transition flex-shrink-0 flex items-center gap-1.5">
            <Star className="w-4 h-4 fill-yellow-400" />
            {salonStats.averageRating.toFixed(1)}
          </button>
        </div>

        {/* Alerte position obligatoire - cliquable */}
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
              Partager
            </span>
          </button>
        )}

        {/* Statistiques */}
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
      </div>

      {/* Input de sélection de fichiers */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* MODAL DE PRÉVISUALISATION */}
      {showPreviewModal && filePreviews.length > 0 && (
        <div className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-auto border border-zinc-700">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-lg">Aperçu</h3>
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setFilePreviews([]);
                  setSelectedFiles([]);
                }}
                className="text-zinc-400 hover:text-white transition p-1 rounded-full hover:bg-zinc-800"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-3">
              {filePreviews.map((item, i) => (
                <div key={i} className="relative aspect-square bg-zinc-800 rounded-lg overflow-hidden group">
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
                      Vidéo
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
                Publier {filePreviews.length} story{filePreviews.length > 1 ? 's' : ''}
              </button>
              <button
                onClick={() => {
                  setShowPreviewModal(false);
                  setFilePreviews([]);
                  setSelectedFiles([]);
                }}
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 rounded-xl transition"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STORY VIEWER */}
      {showStoryViewer && stories.length > 0 && (
        <StoryViewer
          stories={stories}
          onClose={() => {
            setShowStoryViewer(false);
          }}
          currentIndex={storyViewerIndex}
          onStoryDeleted={handleStoryDeleted}
          userId={userId}
          onRefreshStories={refreshStories}
        />
      )}

      {/* INDICATEUR DE CHARGEMENT */}
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

      {/* ÉDITEUR DE POSITION */}
      {showLocationEditor && (
        <SalonLocationEditor
          userId={userId}
          initialLatitude={profile.latitude}
          initialLongitude={profile.longitude}
          initialAddress={profile.address}
          onClose={() => setShowLocationEditor(false)}
          onSaved={(lat: number, lng: number, address?: string) => {
            setProfile((prev) => prev ? { ...prev, latitude: lat, longitude: lng, address: address || prev.address } : prev);
          }}
        />
      )}
    </div>
  );
}