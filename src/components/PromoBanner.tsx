
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { X, Play } from 'lucide-react';

interface Banner {
  id: number;
  type: 'image' | 'video';
  url: string;
  redirect_url: string | null;
  is_active: boolean;
  display_duration: number;
  expiry_date: string;
}

export function PromoBanner() {
  const [banner, setBanner] = useState<Banner | null>(null);
  const [visible, setVisible] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(100);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timerRef = useRef<number | null>(null);

  // Chargement de la bannière active
  useEffect(() => {
    let cancelled = false;

    const loadActiveBanner = async () => {
      try {
        const now = new Date().toISOString();

        const { data, error } = await supabase
          .from('public_banners')
          .select('*')
          .eq('is_active', true)
          .gt('expiry_date', now)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (error) {
          console.error(
            'Erreur chargement bannière:',
            error.message
          );
          setBanner(null);
          return;
        }

        if (!data) {
          setBanner(null);
          return;
        }

        setBanner(data as Banner);
        setVisible(true);
        setProgress(100);
        setIsPlaying(true);
      } catch (error) {
        if (!cancelled) {
          console.error(
            'Erreur chargement bannière:',
            error
          );
          setBanner(null);
        }
      }
    };

    loadActiveBanner();

    return () => {
      cancelled = true;

      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
      }
    };
  }, []);

  // Gestion du chronomètre vidéo
  useEffect(() => {
    if (
      banner &&
      visible &&
      banner.type === 'video' &&
      isPlaying
    ) {
      startProgressTimer();
    }

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [banner, visible, isPlaying]);

  const startProgressTimer = () => {
    const duration = Math.max(
      1,
      banner?.display_duration || 5
    );

    const interval = 100;
    let elapsed = 0;

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
    }

    timerRef.current = window.setInterval(() => {
      elapsed += interval;

      const newProgress = Math.max(
        0,
        100 - (elapsed / (duration * 1000)) * 100
      );

      setProgress(newProgress);

      if (elapsed >= duration * 1000) {
        if (timerRef.current !== null) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }

        setVisible(false);
      }
    }, interval);
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setProgress(0);
  };

  const handleReplay = () => {
    if (!videoRef.current) return;

    videoRef.current.currentTime = 0;

    videoRef.current
      .play()
      .then(() => {
        setIsPlaying(true);
        setProgress(100);
      })
      .catch((error) => {
        console.error('Erreur lecture vidéo:', error);
      });
  };

  const handleClick = () => {
    if (banner?.redirect_url) {
      window.open(
        banner.redirect_url,
        '_blank',
        'noopener,noreferrer'
      );
    }
  };

  const handleClose = () => {
    setVisible(false);

    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  if (!banner || !visible) {
    return null;
  }

  return (
    <div className="relative overflow-hidden rounded-xl mb-6 bg-zinc-900 border border-zinc-800 shadow-lg">

      {/* Bouton fermer */}
      <button
        onClick={handleClose}
        aria-label="Fermer la bannière"
        className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 hover:bg-black/80 transition text-white backdrop-blur-sm"
      >
        <X className="w-3.5 h-3.5" />
      </button>

      {/* Contenu de la bannière */}
      <div
        onClick={handleClick}
        className={
          banner.redirect_url
            ? 'cursor-pointer relative'
            : 'relative'
        }
      >
        {banner.type === 'image' ? (
          <img
            src={banner.url}
            alt="Promotion"
            className="w-full h-auto object-cover"
            style={{ maxHeight: '180px' }}
            loading="lazy"
          />
        ) : (
          <div className="relative">
            <video
              ref={videoRef}
              src={banner.url}
              autoPlay
              muted
              playsInline
              className="w-full object-cover"
              style={{ maxHeight: '180px' }}
              onEnded={handleVideoEnded}
              onPlay={() => setIsPlaying(true)}
              onError={() => {
                console.error(
                  'Impossible de charger la vidéo promotionnelle.'
                );
              }}
            />

            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleReplay();
                  }}
                  aria-label="Revoir la vidéo"
                  className="p-2 rounded-full bg-white/20 hover:bg-white/30 transition backdrop-blur-sm"
                >
                  <Play className="w-5 h-5 text-white" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Barre de progression */}
      {banner.type === 'video' && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20">
          <div
            className="h-full bg-gradient-to-r from-yellow-400 to-orange-500 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
