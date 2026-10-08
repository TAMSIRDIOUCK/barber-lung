// src/components/SalonPublicProfile.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronLeft, Star, MapPin, Phone, Scissors, Heart, X, Loader2,
  Route as RouteIcon, UserCheck, UserPlus as UserPlusIcon,
  Grid3x3, Share2, MessageCircle, Eye, Play, Music, Check, Clock,
  Send, Trash2, Loader, Navigation, Volume2, VolumeX
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
  comment_count: number;
  view_count: number;
  created_at: string;
}

interface Comment {
  id: string;
  post_id: string;
  profile_id: string | null;
  device_id: string | null;
  author_name: string;
  author_avatar: string | null;
  content: string;
  created_at: string;
}

interface Story {
  id: string;
  profile_id: string;
  image_url: string;
  created_at: string;
  expires_at: string;
}

interface SalonPublicProfileProps {
  salonId: string;
  initialPostId?: string | null;
  fromPublicFeed?: boolean;
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

function getDeviceId(): string {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

export function SalonPublicProfile({
  salonId,
  initialPostId = null,
  fromPublicFeed = false,
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
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [profileTab, setProfileTab] = useState<'grid' | 'reels'>('grid');
  const [following, setFollowing] = useState(initialFollowing);
  const [userLikes, setUserLikes] = useState<Set<string>>(new Set());

  // 🔥 MODE FEED : null = page profil, sinon = index du post ouvert
  const [feedIndex, setFeedIndex] = useState<number | null>(null);
  const [feedSoundOn, setFeedSoundOn] = useState(false);

  const [userRating, setUserRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);

  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const [showRouteMap, setShowRouteMap] = useState(false);
  const [routeInfo, setRouteInfo] = useState<RouteState | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);

  const [shareFeedback, setShareFeedback] = useState<string | null>(null);

  const mapRef = useRef<any>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // ═══════════════════════════════════════════════════════
  // 🔥 GESTION DU BOUTON RETOUR NATIF (Android / geste iOS)
  // ═══════════════════════════════════════════════════════
  useEffect(() => {
    window.history.pushState({ salonProfileOpen: true }, '');

    const handlePopState = () => {
      // 1. Si les commentaires sont ouverts → les fermer d'abord
      if (showComments) {
        setShowComments(false);
        setComments([]);
        window.history.pushState({ salonProfileOpen: true }, '');
        return;
      }
      // 2. Si on est sur la carte itinéraire → fermer la carte
      if (showRouteMap) {
        setShowRouteMap(false);
        setRouteInfo(null);
        window.history.pushState({ salonProfileOpen: true }, '');
        return;
      }
      // 3. Si on est dans le feed MAIS qu'on ne vient PAS de la page publique
      //    → retour au profil du salon
      if (feedIndex !== null && !fromPublicFeed) {
        setFeedIndex(null);
        window.history.pushState({ salonProfileOpen: true }, '');
        return;
      }
      // 4. Sinon → fermer complètement le profil (retour accueil)
      onBack();
    };

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [showComments, feedIndex, showRouteMap, fromPublicFeed, onBack]);

  // ═══════════════════════════════════════════════════════
  // CHARGEMENT INITIAL
  // ═══════════════════════════════════════════════════════
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: profileData, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', salonId)
          .maybeSingle();

        if (cancelled) return;

        if (profileError) {
          console.error('❌ Erreur chargement profil:', profileError);
        }

        if (!profileData) {
          setSalon(null);
          setLoading(false);
          return;
        }

        let salonSlug: string | null = null;
        let followersCount: number = 0;

        try {
          const { data: bookingRow } = await supabase
            .from('booking_settings')
            .select('slug, is_active')
            .eq('user_id', profileData.user_id)
            .maybeSingle();

          if (
            bookingRow?.slug &&
            typeof bookingRow.slug === 'string' &&
            bookingRow.slug.trim() &&
            bookingRow.is_active !== false
          ) {
            salonSlug = bookingRow.slug.trim();
          }
        } catch (err) {
          console.error('❌ Exception slug:', err);
        }

        try {
          const { count } = await supabase
            .from('followers')
            .select('*', { count: 'exact', head: true })
            .eq('following_id', profileData.id)
            .eq('status', 'active');
          followersCount = count || 0;
        } catch (err) {
          console.warn('⚠️ Erreur followers:', err);
        }

        let rating = 0;
        let reviewCount = 0;
        try {
          const { data: reviews } = await supabase
            .from('reviews')
            .select('rating')
            .eq('profile_id', profileData.id);

          if (reviews && reviews.length > 0) {
            rating = reviews.reduce((sum: number, r: any) => sum + r.rating, 0) / reviews.length;
            reviewCount = reviews.length;
          }
        } catch (err) {
          console.warn('⚠️ Erreur rating:', err);
        }

        if (cancelled) return;

        setSalon({
          ...profileData,
          slug: salonSlug,
          followers_count: followersCount,
          rating: rating,
          review_count: reviewCount,
        });

        const { data: postsData } = await supabase
          .from('portfolio_posts')
          .select('*')
          .eq('profile_id', salonId)
          .eq('is_active', true)
          .order('created_at', { ascending: false });

        if (cancelled) return;
        setPosts(postsData || []);

        try {
          const { data: storiesData } = await supabase
            .from('stories')
            .select('id, profile_id, image_url, created_at, expires_at')
            .eq('profile_id', salonId)
            .gte('expires_at', new Date().toISOString())
            .order('created_at', { ascending: false });

          if (!cancelled && storiesData) {
            setStories(storiesData);
          }
        } catch (err) {
          console.warn('⚠️ Erreur stories:', err);
        }

        await Promise.all([
          loadUserLikes(),
          loadUserRating(profileData.id),
        ]);
      } catch (err) {
        console.error('❌ Erreur chargement profil:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [salonId, isAuthenticated, currentUserId]);

  // 🔥 AUTO-OUVRIR LE FEED si initialPostId est fourni
  useEffect(() => {
    if (!initialPostId || posts.length === 0) return;

    const index = posts.findIndex(p => p.id === initialPostId);
    if (index >= 0 && feedIndex !== index) {
      setFeedIndex(index);
      setTimeout(() => {
        if (feedRef.current) {
          feedRef.current.scrollTop = index * feedRef.current.clientHeight;
        }
      }, 150);
    }
  }, [initialPostId, posts]);

  // 🔥 Reset feedIndex quand on revient sur la page (initialPostId devient null)
  useEffect(() => {
    if (initialPostId === null && feedIndex !== null && fromPublicFeed) {
      setFeedIndex(null);
    }
  }, [initialPostId, fromPublicFeed, feedIndex]);

  const loadUserLikes = useCallback(async () => {
    try {
      const likedIds: string[] = [];

      if (isAuthenticated && currentUserId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (profileData) {
          const { data, error } = await supabase
            .from('likes')
            .select('target_id')
            .eq('profile_id', profileData.id)
            .eq('target_type', 'portfolio');

          if (!error && data) {
            likedIds.push(...data.map((l: any) => l.target_id));
          }
        }
      } else {
        const deviceId = getDeviceId();
        const { data, error } = await supabase
          .from('likes')
          .select('target_id')
          .eq('device_id', deviceId)
          .eq('target_type', 'portfolio');

        if (!error && data) {
          likedIds.push(...data.map((l: any) => l.target_id));
        }
      }

      setUserLikes(new Set(likedIds));
    } catch (err) {
      console.warn('⚠️ Exception loadUserLikes:', err);
    }
  }, [isAuthenticated, currentUserId]);

  const loadUserRating = useCallback(async (profileId: string) => {
    try {
      if (isAuthenticated && currentUserId) {
        const { data } = await supabase
          .from('reviews')
          .select('rating')
          .eq('profile_id', profileId)
          .eq('reviewer_id', currentUserId)
          .maybeSingle();

        if (data) setUserRating(data.rating);
      } else {
        const deviceId = getDeviceId();
        const { data } = await supabase
          .from('reviews')
          .select('rating')
          .eq('profile_id', profileId)
          .eq('device_id', deviceId)
          .maybeSingle();

        if (data) setUserRating(data.rating);
      }
    } catch (err) {
      console.warn('⚠️ Erreur loadUserRating:', err);
    }
  }, [isAuthenticated, currentUserId]);

  const handleRateSalon = useCallback(async (rating: number) => {
    if (!salon || ratingLoading) return;

    if (isAuthenticated && currentUserId === salon.user_id) {
      showToast?.('Vous ne pouvez pas noter votre propre salon');
      return;
    }

    setRatingLoading(true);

    try {
      const deviceId = getDeviceId();

      if (isAuthenticated && currentUserId) {
        const { data: existing } = await supabase
          .from('reviews')
          .select('id')
          .eq('profile_id', salon.id)
          .eq('reviewer_id', currentUserId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('reviews')
            .update({ rating, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase.from('reviews').insert({
            profile_id: salon.id,
            reviewer_id: currentUserId,
            rating,
            device_id: deviceId,
          });
        }
      } else {
        const { data: existing } = await supabase
          .from('reviews')
          .select('id')
          .eq('profile_id', salon.id)
          .eq('device_id', deviceId)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('reviews')
            .update({ rating, updated_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase.from('reviews').insert({
            profile_id: salon.id,
            rating,
            device_id: deviceId,
          });
        }
      }

      const { data: allReviews } = await supabase
        .from('reviews')
        .select('rating')
        .eq('profile_id', salon.id);

      const newAvg = allReviews && allReviews.length > 0
        ? allReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / allReviews.length
        : 0;

      setUserRating(rating);
      setSalon((prev: any) => prev ? {
        ...prev,
        rating: newAvg,
        review_count: allReviews?.length || 0,
      } : prev);

      showToast?.(`✅ Note enregistrée : ${rating} ⭐`);
    } catch (err) {
      console.error('Erreur notation:', err);
      showToast?.('Erreur lors de la notation');
    } finally {
      setRatingLoading(false);
    }
  }, [salon, isAuthenticated, currentUserId, ratingLoading, showToast]);

  const openFeedAtPost = useCallback((postId: string) => {
    const index = posts.findIndex(p => p.id === postId);
    if (index >= 0) {
      setFeedIndex(index);
      setTimeout(() => {
        if (feedRef.current) {
          feedRef.current.scrollTop = index * feedRef.current.clientHeight;
        }
      }, 50);
    }
  }, [posts]);

  // 🔥 FERMETURE DU FEED
  // - Si on vient de la page publique → onBack() direct
  // - Sinon → retour à la page profil du salon
  const closeFeed = useCallback(() => {
    if (fromPublicFeed) {
      onBack();
      return;
    }
    setFeedIndex(null);
    setShowComments(false);
    setComments([]);
    setNewComment('');
  }, [fromPublicFeed, onBack]);

  const loadComments = useCallback(async (postId: string) => {
    setCommentsLoading(true);
    try {
      const { data, error } = await supabase
        .from('portfolio_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Erreur chargement commentaires:', error);
        setComments([]);
      } else {
        setComments(data || []);
      }
    } catch (err) {
      console.error('Exception loadComments:', err);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showComments && feedIndex !== null && posts[feedIndex]) {
      loadComments(posts[feedIndex].id);
    }
  }, [showComments, feedIndex, posts, loadComments]);

  useEffect(() => {
    if (showComments) {
      setTimeout(() => commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [comments.length, showComments]);

  const handleAddComment = useCallback(async () => {
    const currentPost = feedIndex !== null ? posts[feedIndex] : null;
    if (!currentPost || !newComment.trim() || postingComment) return;

    const content = newComment.trim();
    setPostingComment(true);

    try {
      const deviceId = getDeviceId();

      let authorName = 'Anonyme';
      let authorAvatar: string | null = null;

      if (isAuthenticated && currentUserId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, salon_name, avatar_url')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (profile) {
          authorName = profile.full_name || profile.salon_name || 'Utilisateur';
          authorAvatar = profile.avatar_url || null;
        }
      } else {
        const guestNumber = localStorage.getItem('guest_number');
        if (!guestNumber) {
          const num = Math.floor(1000 + Math.random() * 9000);
          localStorage.setItem('guest_number', num.toString());
          authorName = `Invité #${num}`;
        } else {
          authorName = `Invité #${guestNumber}`;
        }
      }

      const { data: inserted, error } = await supabase
        .from('portfolio_comments')
        .insert({
          post_id: currentPost.id,
          profile_id: isAuthenticated && currentUserId ? currentUserId : null,
          device_id: isAuthenticated ? null : deviceId,
          author_name: authorName,
          author_avatar: authorAvatar,
          content: content,
        })
        .select()
        .single();

      if (error) {
        console.error('Erreur insertion commentaire:', error);
        showToast?.('Erreur lors de l\'envoi');
        return;
      }

      setComments(prev => [...prev, inserted as Comment]);
      setNewComment('');

      setPosts(prev => prev.map(p =>
        p.id === currentPost.id
          ? { ...p, comment_count: (p.comment_count || 0) + 1 }
          : p
      ));

      await supabase
        .from('portfolio_posts')
        .update({ comment_count: (currentPost.comment_count || 0) + 1 })
        .eq('id', currentPost.id);

    } catch (err) {
      console.error('Exception addComment:', err);
      showToast?.('Erreur');
    } finally {
      setPostingComment(false);
    }
  }, [posts, feedIndex, newComment, postingComment, isAuthenticated, currentUserId, showToast]);

  const handleDeleteComment = useCallback(async (commentId: string) => {
    const currentPost = feedIndex !== null ? posts[feedIndex] : null;
    if (!currentPost) return;

    setDeletingCommentId(commentId);
    try {
      const { error } = await supabase
        .from('portfolio_comments')
        .delete()
        .eq('id', commentId);

      if (error) {
        console.error('Erreur suppression:', error);
        return;
      }

      setComments(prev => prev.filter(c => c.id !== commentId));

      setPosts(prev => prev.map(p =>
        p.id === currentPost.id
          ? { ...p, comment_count: Math.max((p.comment_count || 1) - 1, 0) }
          : p
      ));

      await supabase
        .from('portfolio_posts')
        .update({ comment_count: Math.max((currentPost.comment_count || 1) - 1, 0) })
        .eq('id', currentPost.id);

    } catch (err) {
      console.error('Exception deleteComment:', err);
    } finally {
      setDeletingCommentId(null);
    }
  }, [posts, feedIndex]);

  // 🔥 LIKE robuste avec upsert
  const toggleLike = useCallback(async (post: PortfolioPost) => {
    const wasLiked = userLikes.has(post.id);

    setUserLikes(prev => {
      const next = new Set(prev);
      if (wasLiked) next.delete(post.id); else next.add(post.id);
      return next;
    });

    setPosts(prev => prev.map(p =>
      p.id === post.id
        ? { ...p, like_count: Math.max((p.like_count || 0) + (wasLiked ? -1 : 1), 0) }
        : p
    ));

    try {
      const deviceId = getDeviceId();

      if (isAuthenticated && currentUserId) {
        const { data: userProfile } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', currentUserId)
          .maybeSingle();

        if (!userProfile) {
          console.warn('Profil introuvable pour like');
          return;
        }

        if (wasLiked) {
          await supabase
            .from('likes')
            .delete()
            .eq('profile_id', userProfile.id)
            .eq('target_type', 'portfolio')
            .eq('target_id', post.id);
        } else {
          const { error } = await supabase
            .from('likes')
            .upsert(
              {
                profile_id: userProfile.id,
                target_type: 'portfolio',
                target_id: post.id,
              },
              { onConflict: 'profile_id,target_type,target_id' }
            );
          if (error && error.code !== '23505') throw error;
        }
      } else {
        const { data: existing } = await supabase
          .from('likes')
          .select('id')
          .eq('device_id', deviceId)
          .eq('target_type', 'portfolio')
          .eq('target_id', post.id)
          .maybeSingle();

        if (wasLiked) {
          if (existing) {
            await supabase.from('likes').delete().eq('id', existing.id);
          }
        } else if (!existing) {
          const { error } = await supabase
            .from('likes')
            .insert({
              device_id: deviceId,
              target_type: 'portfolio',
              target_id: post.id,
            });
          if (error && error.code !== '23505') throw error;
        }
      }

      const newCount = Math.max((post.like_count || 0) + (wasLiked ? -1 : 1), 0);
      await supabase
        .from('portfolio_posts')
        .update({ like_count: newCount })
        .eq('id', post.id);

    } catch (err) {
      console.error('Erreur like:', err);
      setUserLikes(prev => {
        const next = new Set(prev);
        if (wasLiked) next.add(post.id); else next.delete(post.id);
        return next;
      });
      setPosts(prev => prev.map(p =>
        p.id === post.id
          ? { ...p, like_count: Math.max((p.like_count || 0) + (wasLiked ? 1 : -1), 0) }
          : p
      ));
    }
  }, [isAuthenticated, currentUserId, userLikes]);

  const handleStartItinerary = useCallback(async () => {
    if (!salon?.latitude || !salon?.longitude) {
      showToast?.('Position du salon indisponible');
      return;
    }
    if (!userLocation) {
      showToast?.('Activez votre position pour voir l\'itinéraire');
      return;
    }

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
        try {
          await navigator.clipboard.writeText(shareUrl);
          setShareFeedback('Lien copié !');
          setTimeout(() => setShareFeedback(null), 1800);
        } catch {}
      }
    }
  }, [salon, salonId]);

  const isMyComment = useCallback((comment: Comment): boolean => {
    if (isAuthenticated && currentUserId && comment.profile_id === currentUserId) {
      return true;
    }
    const deviceId = getDeviceId();
    if (!isAuthenticated && comment.device_id === deviceId) {
      return true;
    }
    return false;
  }, [isAuthenticated, currentUserId]);

  const formatRelativeTime = (dateStr: string): string => {
    try {
      const diff = Date.now() - new Date(dateStr).getTime();
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);

      if (seconds < 60) return 'à l\'instant';
      if (minutes < 60) return `il y a ${minutes} min`;
      if (hours < 24) return `il y a ${hours} h`;
      if (days < 7) return `il y a ${days} j`;
      return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    } catch {
      return '';
    }
  };

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
  const hasValidSlug = typeof salon.slug === 'string' && salon.slug.trim().length > 0;
  const canBook = hasValidSlug && !!onBook;
  const isOwnProfile = isAuthenticated && currentUserId === salon.user_id;
  const hasActiveStories = stories.length > 0;

  const gridPosts = posts.filter((p) => p.media_type === 'image');
  const reelsPosts = posts.filter((p) => p.media_type === 'video');

  // ═══════════════════════════════════════════════════════════
  // 🗺️ CARTE ITINÉRAIRE
  // ═══════════════════════════════════════════════════════════
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
                  {canBook && (
                    <button
                      onClick={() => {
                        closeRouteMap();
                        onBook?.(salon.slug);
                      }}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 rounded-xl text-sm transition"
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

  // ═══════════════════════════════════════════════════════════
  // 🎬 MODE FEED
  // ═══════════════════════════════════════════════════════════
  if (feedIndex !== null) {
    return (
      <div
        key={`feed-${fromPublicFeed ? 'public' : 'profile'}-${initialPostId || 'none'}`}
        translate="no"
        className="fixed inset-0 bg-black text-white overflow-hidden"
      >
        <header className="absolute top-0 left-0 right-0 z-40 bg-gradient-to-b from-black/90 to-transparent px-4 pt-4 pb-8 pointer-events-none">
          <div className="flex items-center gap-3 pointer-events-auto">
            <button onClick={closeFeed} className="p-1 text-white hover:opacity-80">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h1 className="flex-1 font-bold text-base truncate">
              @{displayName.toLowerCase().replace(/\s/g, '_')}
            </h1>
            {canBook && !isOwnProfile && (
              <button
                onClick={() => onBook?.(salon.slug)}
                className="bg-white text-black text-xs font-bold px-3 py-1.5 rounded-full"
              >
                Réserver
              </button>
            )}
          </div>
        </header>

        <div
          ref={feedRef}
          className="h-full overflow-y-scroll snap-y snap-mandatory"
          style={{ scrollSnapType: 'y mandatory', WebkitOverflowScrolling: 'touch' }}
        >
          {posts.map((post, index) => {
            const isLiked = userLikes.has(post.id);
            const isVideo = post.media_type === 'video';

            return (
              <div
                key={post.id}
                className="relative h-full w-full snap-start snap-always flex items-center justify-center"
                style={{ scrollSnapAlign: 'start', height: '100vh' }}
              >
                <div className="absolute inset-0 flex items-center justify-center bg-black">
                  {isVideo ? (
                    <video
                      src={post.image_url}
                      className="max-w-full max-h-full object-contain"
                      loop
                      playsInline
                      autoPlay={index === feedIndex}
                      muted={!feedSoundOn}
                    />
                  ) : (
                    <img
                      src={post.image_url}
                      alt=""
                      className="max-w-full max-h-full object-contain"
                      loading="lazy"
                    />
                  )}
                </div>

                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60 pointer-events-none" />

                {isVideo && (
                  <button
                    onClick={() => setFeedSoundOn(s => !s)}
                    className="absolute top-20 right-4 z-30 p-2.5 rounded-full bg-black/50 backdrop-blur-sm text-white active:scale-95"
                  >
                    {feedSoundOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                  </button>
                )}

                <div className="absolute right-3 bottom-32 z-30 flex flex-col items-center gap-5">
                  <button
                    onClick={() => toggleLike(post)}
                    className="flex flex-col items-center gap-1 active:scale-90 transition"
                  >
                    <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                      <Heart
                        className={`w-7 h-7 transition ${
                          isLiked ? 'fill-red-500 text-red-500' : 'text-white'
                        }`}
                      />
                    </div>
                    <span className="text-white text-xs font-semibold drop-shadow-lg">
                      {post.like_count || 0}
                    </span>
                  </button>

                  <button
                    onClick={() => {
                      setFeedIndex(index);
                      setShowComments(true);
                    }}
                    className="flex flex-col items-center gap-1 active:scale-90 transition"
                  >
                    <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                      <MessageCircle className="w-7 h-7 text-white" />
                    </div>
                    <span className="text-white text-xs font-semibold drop-shadow-lg">
                      {post.comment_count || 0}
                    </span>
                  </button>

                  <button
                    onClick={handleShare}
                    className="flex flex-col items-center gap-1 active:scale-90 transition"
                  >
                    <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                      <Share2 className="w-7 h-7 text-white" />
                    </div>
                    <span className="text-white text-xs font-semibold drop-shadow-lg">
                      Partager
                    </span>
                  </button>

                  {salon.latitude && salon.longitude && (
                    <button
                      onClick={handleStartItinerary}
                      className="flex flex-col items-center gap-1 active:scale-90 transition"
                    >
                      <div className="w-12 h-12 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center">
                        <RouteIcon className="w-7 h-7 text-white" />
                      </div>
                      <span className="text-white text-xs font-semibold drop-shadow-lg">
                        Route
                      </span>
                    </button>
                  )}
                </div>

                <div className="absolute left-3 right-20 bottom-6 z-30">
                  <button
                    onClick={closeFeed}
                    className="flex items-center gap-2 mb-2 active:opacity-80 transition text-left"
                  >
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-zinc-800 border border-white/20 flex-shrink-0">
                      {salon.avatar_url ? (
                        <img src={salon.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Scissors className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-white drop-shadow-lg truncate">
                        {displayName}
                      </p>
                      <div className="flex items-center gap-1 text-[10px] text-white/80">
                        <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                        <span>{(salon.rating || 0).toFixed(1)}</span>
                        <span>•</span>
                        <span>{salon.followers_count || 0} abonnés</span>
                      </div>
                    </div>
                  </button>

                  {post.caption && (
                    <p className="text-white text-sm leading-snug drop-shadow-lg line-clamp-2">
                      {post.caption}
                    </p>
                  )}

                  <div className="flex items-center gap-1.5 mt-1.5 text-white/90 text-xs">
                    <Music className="w-3 h-3" />
                    <span className="drop-shadow-lg truncate">
                      {post.media_type === 'video' ? 'Vidéo originale' : 'Publication'} • {formatRelativeTime(post.created_at)}
                    </span>
                  </div>
                </div>

                <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 text-white text-xs font-semibold bg-black/40 backdrop-blur-sm px-3 py-1 rounded-full">
                  {index + 1} / {posts.length}
                </div>
              </div>
            );
          })}
        </div>

        {/* MODAL COMMENTAIRES */}
        {showComments && posts[feedIndex] && (
          <div
            className="fixed inset-0 z-[100] bg-black/70 flex items-end sm:items-center sm:justify-center"
            onClick={() => setShowComments(false)}
          >
            <div
              className="bg-zinc-950 w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[85vh] sm:max-h-[80vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-1 bg-zinc-700 rounded-full mx-auto mt-3 sm:hidden flex-shrink-0" />

              <div className="flex items-center justify-between p-4 border-b border-zinc-800 flex-shrink-0">
                <h3 className="font-bold text-white text-base">Commentaires</h3>
                <button
                  onClick={() => setShowComments(false)}
                  className="p-1.5 rounded-full hover:bg-zinc-800 transition"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3">
                {commentsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <MessageCircle className="w-12 h-12 text-zinc-700 mb-3" />
                    <p className="text-white font-semibold text-sm">Aucun commentaire</p>
                    <p className="text-zinc-500 text-xs mt-1">Soyez le premier à commenter</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {comments.map((comment) => {
                      const isMine = isMyComment(comment);
                      const isDeleting = deletingCommentId === comment.id;

                      return (
                        <div key={comment.id} className="flex items-start gap-3 group">
                          <div className="w-9 h-9 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0 border border-zinc-700">
                            {comment.author_avatar ? (
                              <img src={comment.author_avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Scissors className="w-4 h-4 text-zinc-500" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm leading-relaxed break-words">
                              <span className="font-semibold text-white">{comment.author_name}</span>
                              {' '}
                              <span className="text-zinc-200">{comment.content}</span>
                            </p>
                            <p className="text-[10px] text-zinc-500 mt-0.5">
                              {formatRelativeTime(comment.created_at)}
                            </p>
                          </div>
                          {isMine && (
                            <button
                              onClick={() => handleDeleteComment(comment.id)}
                              disabled={isDeleting}
                              className="text-zinc-600 hover:text-red-400 transition p-1 flex-shrink-0 disabled:opacity-50"
                            >
                              {isDeleting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    <div ref={commentsEndRef} />
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-800 p-3 flex-shrink-0 bg-zinc-950 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center gap-2">
                  <input
                    ref={commentInputRef}
                    type="text"
                    placeholder="Ajouter un commentaire..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddComment();
                      }
                    }}
                    disabled={postingComment}
                    maxLength={500}
                    autoFocus
                    className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded-full px-4 py-2.5 text-white text-sm placeholder-zinc-500 focus:outline-none focus:border-zinc-500 transition disabled:opacity-50"
                    style={{ fontSize: '16px' }}
                  />
                  <button
                    onClick={handleAddComment}
                    disabled={!newComment.trim() || postingComment}
                    className="flex-shrink-0 w-11 h-11 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed transition active:scale-95 flex items-center justify-center shadow-lg shadow-emerald-500/20"
                  >
                    {postingComment ? (
                      <Loader2 className="w-5 h-5 text-white animate-spin" />
                    ) : (
                      <Send className="w-5 h-5 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // 👤 PAGE PROFIL
  // ═══════════════════════════════════════════════════════════
  return (
    <div translate="no" className="min-h-screen bg-black text-white pb-20">
      <header className="sticky top-0 z-40 bg-black/95 backdrop-blur-md border-b border-zinc-800 flex items-center gap-3 px-4 h-14">
        <button onClick={onBack} className="p-1 -ml-1 text-white hover:opacity-80">
          <ChevronLeft className="w-6 h-6" />
        </button>
        <h1 className="flex-1 font-bold text-base truncate">
          @{displayName.toLowerCase().replace(/\s/g, '_')}
        </h1>
        <button
          onClick={handleShare}
          className="p-1 text-white hover:opacity-80"
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

      <div className="relative">
        <div className="h-32 bg-gradient-to-br from-indigo-600 to-purple-600">
          {salon.cover_image && (
            <img src={salon.cover_image} alt="" className="w-full h-full object-cover" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
        </div>
      </div>

      <div className="px-4 -mt-12 relative">
        <div className="flex items-end gap-4 mb-4">
          <div className="flex-shrink-0 cursor-default">
            {hasActiveStories ? (
              <div className="w-24 h-24 rounded-full p-[3px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600">
                <div className="w-full h-full rounded-full bg-black p-[2px]">
                  <div className="w-full h-full rounded-full overflow-hidden bg-zinc-800 flex items-center justify-center">
                    {salon.avatar_url ? (
                      <img src={salon.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Scissors className="w-10 h-10 text-white" />
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center">
                {salon.avatar_url ? (
                  <img src={salon.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Scissors className="w-10 h-10 text-white" />
                )}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 pb-1">
            <h2 className="text-white font-bold text-lg truncate">{displayName}</h2>
            <p className="text-zinc-400 text-xs truncate">
              @{displayName.toLowerCase().replace(/\s/g, '_')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 py-4 border-y border-zinc-800 mb-4">
          <div className="text-center">
            <p className="text-white font-bold text-base">{posts.length}</p>
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Publications</p>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-base">{salon.followers_count || 0}</p>
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Abonnés</p>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-base flex items-center justify-center gap-0.5">
              <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />
              {(salon.rating || 0).toFixed(1)}
            </p>
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Note</p>
          </div>
          <div className="text-center">
            <p className="text-white font-bold text-base">{salon.review_count || 0}</p>
            <p className="text-zinc-500 text-[10px] uppercase tracking-wider">Avis</p>
          </div>
        </div>

        {salon.description && (
          <p className="text-zinc-300 text-sm mb-4 whitespace-pre-wrap">{salon.description}</p>
        )}

        {!isOwnProfile && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 mb-4">
            <p className="text-white font-semibold text-sm mb-3">
              {userRating ? 'Votre note' : 'Noter ce salon'}
            </p>
            <div className="flex items-center gap-2 mb-2">
              {[1, 2, 3, 4, 5].map((star) => {
                const isActive = hoverRating !== null
                  ? star <= hoverRating
                  : star <= (userRating || 0);

                return (
                  <button
                    key={star}
                    onClick={() => handleRateSalon(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(null)}
                    disabled={ratingLoading}
                    className="transition-transform hover:scale-110 active:scale-95 disabled:opacity-50"
                  >
                    <Star
                      className={`w-9 h-9 transition-colors ${
                        isActive ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-600'
                      }`}
                    />
                  </button>
                );
              })}
              {ratingLoading && (
                <Loader2 className="w-5 h-5 text-zinc-400 animate-spin ml-1" />
              )}
            </div>
            {userRating ? (
              <p className="text-emerald-400 text-xs font-medium">✅ Vous avez noté {userRating}/5</p>
            ) : (
              <p className="text-zinc-500 text-xs">Touchez une étoile pour noter</p>
            )}
          </div>
        )}

        <div className="space-y-2 mb-4">
          {salon.address && (
            <div className="flex items-start gap-3 bg-zinc-900 rounded-xl p-3">
              <MapPin className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-zinc-400 text-[10px] uppercase tracking-wider mb-0.5">Adresse</p>
                <p className="text-white text-sm break-words">{salon.address}</p>
              </div>
            </div>
          )}

          {salon.phone && (
            <a
              href={`tel:${salon.phone}`}
              className="flex items-center gap-3 bg-zinc-900 rounded-xl p-3 hover:bg-zinc-800 transition"
            >
              <Phone className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-zinc-400 text-[10px] uppercase tracking-wider mb-0.5">Téléphone</p>
                <p className="text-white text-sm">{salon.phone}</p>
              </div>
            </a>
          )}
        </div>

        <div className="space-y-2 mb-4">
          {canBook && !isOwnProfile && (
            <button
              onClick={() => onBook?.(salon.slug)}
              className="w-full bg-white text-black font-bold py-3.5 rounded-xl active:scale-[0.98] transition"
            >
              Réserver
            </button>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleStartItinerary}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 rounded-xl transition active:scale-[0.98]"
            >
              <Navigation className="w-4 h-4" /> Itinéraire
            </button>
            <button
              onClick={handleShare}
              className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-3 rounded-xl transition active:scale-[0.98]"
            >
              <Share2 className="w-4 h-4" /> Partager
            </button>
          </div>

          {isAuthenticated && !isOwnProfile && (
            <button
              onClick={() => {
                onFollowToggle?.(salonId);
                setFollowing((f) => !f);
              }}
              className={`w-full font-bold py-3 rounded-xl transition active:scale-[0.98] flex items-center justify-center gap-2 ${
                following
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              {following ? (
                <><UserCheck className="w-4 h-4" /> Suivi</>
              ) : (
                <><UserPlusIcon className="w-4 h-4" /> Suivre ce salon</>
              )}
            </button>
          )}
        </div>
      </div>

      {posts.length > 0 && (
        <>
          <div className="flex border-t border-b border-zinc-800">
            <button
              onClick={() => setProfileTab('grid')}
              className={`flex-1 py-3 flex items-center justify-center gap-2 text-xs font-semibold transition ${
                profileTab === 'grid' ? 'text-white border-b-2 border-white' : 'text-zinc-500'
              }`}
            >
              <Grid3x3 className="w-4 h-4" /> PHOTOS
            </button>
            <button
              onClick={() => setProfileTab('reels')}
              className={`flex-1 py-3 flex items-center justify-center gap-2 text-xs font-semibold transition ${
                profileTab === 'reels' ? 'text-white border-b-2 border-white' : 'text-zinc-500'
              }`}
            >
              <Music className="w-4 h-4" /> VIDÉOS
            </button>
          </div>

          {profileTab === 'grid' && (
            <div>
              {gridPosts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <div className="w-16 h-16 rounded-full border-2 border-zinc-700 flex items-center justify-center mb-3">
                    <Grid3x3 className="w-7 h-7 text-zinc-600" />
                  </div>
                  <p className="text-white font-semibold text-sm">Aucune photo</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-0.5">
                  {gridPosts.map((post) => (
                    <button
                      key={post.id}
                      onClick={() => openFeedAtPost(post.id)}
                      className="relative aspect-square bg-zinc-900 group overflow-hidden"
                    >
                      <img
                        src={post.image_url}
                        alt=""
                        className="w-full h-full object-cover group-hover:opacity-90 transition"
                        loading="lazy"
                      />
                      <div className="absolute bottom-1.5 left-1.5 flex items-center gap-2 text-white text-xs font-semibold drop-shadow-lg">
                        {post.like_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Heart className="w-3.5 h-3.5 fill-white" />
                            {post.like_count}
                          </span>
                        )}
                        {(post.comment_count || 0) > 0 && (
                          <span className="flex items-center gap-1">
                            <MessageCircle className="w-3.5 h-3.5 fill-white" />
                            {post.comment_count}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {profileTab === 'reels' && (
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
                      onClick={() => openFeedAtPost(post.id)}
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
        </>
      )}
    </div>
  );
}