// src/App.tsx
import { useState, useEffect, useMemo } from 'react';
import {
  Scissors, TrendingUp, DollarSign, LogOut, Crown, Menu, X,
  Share2, Check, Shield, CalendarCheck, CheckCircle2, Loader, AlertTriangle,
  Home, KeyRound
} from 'lucide-react';
import { ServiceSelector } from './components/ServiceSelector';
import TransactionHistory from './components/TransactionHistory';
import RevenuePage from './components/RevenuePage';
import ExpensesPage from './components/ExpensesPage';
import AdminPanel from './components/AdminPanel';
import { PromoBanner } from './components/PromoBanner';
import { BookingSettingsPage } from './components/BookingSettingsPage';
import { BookingPage } from './components/BookingPage';
import { ReferralProgram } from './components/ReferralProgram';
import RequirePhoneNumber from './components/Requirephonenumber';
import { SubscribePage } from './components/Subscribepage';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { useSubscriptionStatus } from './hooks/useSubscriptionStatus';
import { supabase } from './lib/supabase';
import type { AuthUser } from './components/Clientapp';
import PublicHomePage from './components/PublicHomePage';
import SalonProfile from './components/SalonProfile';

type Page = 'home' | 'revenue' | 'expenses' | 'bookings' | 'admin' | 'booking';

interface AppProps {
  authUser: AuthUser | null;
  onLogout: () => void;
  isAuthenticated: boolean;
  onNavigateToAuth: (page: 'login' | 'register') => void;
}

// ── Composant Page de Succès de Paiement ──
function PaymentSuccessPage({ onComplete }: { onComplete: () => void }) {
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState<'checking' | 'activating' | 'success'>('checking');
  const [error, setError] = useState<string | null>(null);
  const wasOpenedAsPopup = !!window.opener;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const subscriptionId = params.get('subscription_id');

    if (!subscriptionId) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            onComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }

    const checkSubscription = async () => {
      setStatus('activating');
      let attempts = 0;
      const maxAttempts = 15;

      const checkInterval = setInterval(async () => {
        attempts++;
        try {
          const { data: subscription } = await supabase
            .from('subscriptions')
            .select('status')
            .eq('id', parseInt(subscriptionId))
            .maybeSingle();

          if (subscription?.status === 'active') {
            clearInterval(checkInterval);
            setStatus('success');
            if (wasOpenedAsPopup) {
              setTimeout(() => window.close(), 2000);
            } else {
              setTimeout(() => onComplete(), 2000);
            }
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            setStatus('success');
            if (wasOpenedAsPopup) {
              setTimeout(() => window.close(), 2000);
            } else {
              setTimeout(() => onComplete(), 2000);
            }
          }
        } catch (err) {
          console.error('Erreur vérification:', err);
          if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            setError('Une erreur est survenue.');
            setStatus('success');
          }
        }
      }, 2000);

      return () => clearInterval(checkInterval);
    };

    checkSubscription();
  }, [onComplete, wasOpenedAsPopup]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {error && (
          <div className="mb-4 p-3 bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl">
            {error}
          </div>
        )}
        {status === 'checking' && (
          <>
            <Loader className="w-16 h-16 text-white mx-auto mb-4 animate-spin" />
            <h2 className="text-white text-xl font-bold">Vérification du paiement...</h2>
          </>
        )}
        {status === 'activating' && (
          <>
            <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <Loader className="w-8 h-8 text-yellow-400 animate-spin" />
            </div>
            <h2 className="text-white text-xl font-bold">Activation en cours...</h2>
          </>
        )}
        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-white text-2xl font-bold mb-2">Paiement réussi ! 🎉</h2>
            <p className="text-zinc-400 mb-4">Votre abonnement est maintenant actif.</p>
            {wasOpenedAsPopup ? (
              <p className="text-zinc-500 text-sm">Cet onglet va se fermer automatiquement.</p>
            ) : (
              <p className="text-zinc-500 text-sm">
                Redirection dans {countdown} seconde{countdown > 1 ? 's' : ''}...
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Composant Page d'Annulation ──
function PaymentCancelPage({ onComplete }: { onComplete: () => void }) {
  const [countdown, setCountdown] = useState(5);
  const wasOpenedAsPopup = !!window.opener;

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (wasOpenedAsPopup) {
            window.close();
          } else {
            onComplete();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [onComplete, wasOpenedAsPopup]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <X className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="text-white text-2xl font-bold mb-2">Paiement annulé</h2>
        <p className="text-zinc-400 mb-4">Vous n'avez pas confirmé le paiement.</p>
        {wasOpenedAsPopup ? (
          <p className="text-zinc-500 text-sm">Cet onglet va se fermer automatiquement.</p>
        ) : (
          <p className="text-zinc-500 text-sm">
            Redirection dans {countdown} seconde{countdown > 1 ? 's' : ''}...
          </p>
        )}
        <button
          onClick={() => {
            if (wasOpenedAsPopup) {
              window.close();
            } else {
              onComplete();
            }
          }}
          className="mt-4 bg-white text-black px-6 py-2 rounded-lg font-semibold hover:bg-zinc-200 transition"
        >
          {wasOpenedAsPopup ? 'Fermer' : 'Retour à l\'accueil'}
        </button>
      </div>
    </div>
  );
}

function App({ authUser, onLogout, isAuthenticated, onNavigateToAuth }: AppProps) {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [salonName] = useState<string>('LE COUPE');
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [showPaymentCancel, setShowPaymentCancel] = useState(false);
  const [hasActiveBanner, setHasActiveBanner] = useState(false);
  const [checkingBanner, setCheckingBanner] = useState(true);
  const [showRenewPage, setShowRenewPage] = useState(false);
  const [redirectToPage, setRedirectToPage] = useState<Page | null>(null);

  const [showPublicHome, setShowPublicHome] = useState(true);
  const [bookingSlug, setBookingSlug] = useState<string | null>(null);

  // ✅ Nouveau state pour le modal de changement de mot de passe
  const [showChangePassword, setShowChangePassword] = useState(false);

  const { daysLeft, needsRenewal } = useSubscriptionStatus(authUser?.id || '');

  // ✅ Vérification CORRECTE de l'abonnement actif
  // Un abonnement est actif si le statut est 'active' ou 'actif' ET que la date d'expiration n'est pas dépassée
  const hasActiveSubscription = useMemo(() => {
    if (!authUser?.subscription) return false;
    const status = authUser.subscription.status?.toLowerCase() || '';
    const isActive = status === 'active' || status === 'actif';
    const expiresAt = authUser.subscription.expires_at;
    const isNotExpired = !expiresAt || new Date(expiresAt) > new Date();
    return isActive && isNotExpired;
  }, [authUser]);

  // ✅ Gestion du retour de paiement depuis l'URL
  useEffect(() => {
    const handlePaymentReturn = () => {
      const params = new URLSearchParams(window.location.search);
      const isSuccess = params.get('payment_success') === 'true';
      const isCancelled = params.get('payment_cancelled') === 'true';
      
      if (isSuccess) {
        setShowPaymentSuccess(true);
        window.history.replaceState({}, document.title, '/');
      } else if (isCancelled) {
        setShowPaymentCancel(true);
        window.history.replaceState({}, document.title, '/');
      }
    };

    handlePaymentReturn();
  }, []);

  // Vérifier s'il y a une bannière active
  useEffect(() => {
    const checkActiveBanner = async () => {
      setCheckingBanner(true);
      try {
        const { data } = await supabase
          .from('public_banners')
          .select('id')
          .eq('is_active', true)
          .gte('expiry_date', new Date().toISOString())
          .maybeSingle();
        setHasActiveBanner(!!data);
      } catch (err) {
        console.error('Erreur vérification bannière:', err);
        setHasActiveBanner(false);
      } finally {
        setCheckingBanner(false);
      }
    };
    checkActiveBanner();
  }, []);

  const handlePaymentComplete = () => {
    setShowPaymentSuccess(false);
    setShowPaymentCancel(false);
    window.location.href = '/';
  };

  useEffect(() => {
    if (!authUser) return;
    const checkAdminRole = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles_v3')
          .select('role')
          .eq('id', authUser.id)
          .single();
        if (!error && data) setIsAdmin(data.role === 'admin');
      } catch (err) {
        console.error('Erreur vérification rôle admin:', err);
      } finally {
        setCheckingAdmin(false);
      }
    };
    checkAdminRole();
  }, [authUser]);

  // ✅ Si l'utilisateur se connecte, aller directement à la page Services
  useEffect(() => {
    if (isAuthenticated && authUser) {
      setShowPublicHome(false);
      setCurrentPage('home');
      setShowRenewPage(false);
    }
  }, [isAuthenticated, authUser]);

  const handleServiceConfirm = async () => setRefreshTrigger(prev => prev + 1);
  const handleExpenseAdded = () => setRefreshTrigger(prev => prev + 1);

  // 📌 NAVIGATION VERS LA PAGE DE RÉSERVATION
  const navigateToBooking = (slug: string) => {
    console.log('📅 Navigation vers la réservation du salon:', slug);
    setBookingSlug(slug);
    setShowPublicHome(false);
    setCurrentPage('booking');
    setMobileMenuOpen(false);
    setShowRenewPage(false);
  };

  // 📌 NAVIGATION UNIFIÉE - CORRIGÉE
  const navigateToPage = (page: 'publicHome' | 'home' | 'revenue' | 'expenses' | 'bookings') => {
    console.log(`📱 navigateToPage appelée avec: ${page}`);
    console.log(`📊 hasActiveSubscription: ${hasActiveSubscription}`);
    
    // ✅ Accueil public - toujours accessible
    if (page === 'publicHome') {
      console.log('🏠 Redirection vers Accueil public');
      setShowPublicHome(true);
      setBookingSlug(null);
      setCurrentPage('home');
      setMobileMenuOpen(false);
      setShowRenewPage(false);
      return;
    }

    // ✅ Services (home) - accessible sans abonnement mais nécessite connexion
    if (page === 'home') {
      if (!isAuthenticated || !authUser) {
        console.log('🔒 Non connecté, redirection vers login');
        onNavigateToAuth('login');
        return;
      }
      console.log('✂️ Redirection vers Services');
      setShowPublicHome(false);
      setBookingSlug(null);
      setCurrentPage('home');
      setMobileMenuOpen(false);
      setShowRenewPage(false);
      return;
    }

    // ✅ Pages payantes (revenue, expenses, bookings) - nécessitent connexion ET abonnement actif
    if (!isAuthenticated || !authUser) {
      console.log('🔒 Non connecté, redirection vers login');
      onNavigateToAuth('login');
      return;
    }

    const isPaidPage = page === 'revenue' || page === 'expenses' || page === 'bookings';
    
    if (isPaidPage && !hasActiveSubscription) {
      console.log('💳 Pas d\'abonnement actif, redirection vers paiement');
      const pageMap: Record<string, Page> = {
        revenue: 'revenue',
        expenses: 'expenses',
        bookings: 'bookings'
      };
      setRedirectToPage(pageMap[page] || null);
      setShowRenewPage(true);
      setMobileMenuOpen(false);
      return;
    }

    console.log(`✅ Navigation vers ${page} autorisée`);
    setShowPublicHome(false);
    setBookingSlug(null);
    setShowRenewPage(false);
    if (page === 'revenue') setCurrentPage('revenue');
    else if (page === 'expenses') setCurrentPage('expenses');
    else if (page === 'bookings') setCurrentPage('bookings');
    setMobileMenuOpen(false);
  };

  const handleNavigateToLogin = () => {
    onNavigateToAuth('login');
  };

  const handleNavigateToRegister = () => {
    onNavigateToAuth('register');
  };

  const handleShare = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'LE COUPE', text: 'Gérez votre salon comme un pro avec LE COUPE 💈', url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  // 📌 PAGES DE L'APPLICATION
  const appPages: { id: Page; label: string; Icon: any }[] = [
    { id: 'home', label: 'Services', Icon: Scissors },
    { id: 'bookings', label: 'Réservations', Icon: CalendarCheck },
    { id: 'revenue', label: 'Revenus', Icon: TrendingUp },
    { id: 'expenses', label: 'Dépenses', Icon: DollarSign },
  ];

  const pages = isAdmin
    ? [...appPages, { id: 'admin' as Page, label: 'Admin', Icon: Shield }]
    : appPages;

  const expiryDate = authUser?.subscription?.expires_at 
    ? new Date(authUser.subscription.expires_at).toLocaleDateString('fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric'
      })
    : 'N/A';

  // ── PAGE DE RÉSERVATION ──
  if (currentPage === 'booking' && bookingSlug) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <BookingPage slug={bookingSlug} />
      </div>
    );
  }

  // ── Affichage des pages de paiement ──
  if (showPaymentSuccess) {
    return <PaymentSuccessPage onComplete={handlePaymentComplete} />;
  }

  if (showPaymentCancel) {
    return <PaymentCancelPage onComplete={handlePaymentComplete} />;
  }

  // ── Flux de renouvellement ──
  if (showRenewPage && authUser) {
    return (
      <SubscribePage
        userId={authUser.id}
        userEmail={authUser.email}
        userFullName={authUser.fullName || ''}
        onSubscribed={() => {
          console.log('✅ Abonnement souscrit, rechargement...');
          setShowRenewPage(false);
          // Après souscription, rediriger vers la page demandée ou Services
          if (redirectToPage) {
            setCurrentPage(redirectToPage);
            setRedirectToPage(null);
          } else {
            setCurrentPage('home');
          }
          window.location.reload();
        }}
        onNavigateToPage={navigateToPage}
        isAuthenticated={isAuthenticated}
        onNavigateToLogin={handleNavigateToLogin}
      />
    );
  }

  // ── PAGE D'ACCUEIL PUBLIQUE ──
  if (showPublicHome) {
    return (
      <PublicHomePage
        onNavigateToBooking={navigateToBooking}
        onNavigateToLogin={handleNavigateToLogin}
        onNavigateToRegister={handleNavigateToRegister}
        isAuthenticated={isAuthenticated}
        currentUserId={authUser?.id || null}
        onNavigateToPage={navigateToPage}
      />
    );
  }

  // ── AUTHENTIFICATION EN COURS ──
  if (checkingAdmin || !authUser) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    );
  }

  // ── APPLICATION PRINCIPALE (Connecté) ──
  return (
    <RequirePhoneNumber userId={authUser.id}>
      {/* ✅ Modal de changement de mot de passe */}
      {showChangePassword && (
        <ChangePasswordModal onClose={() => setShowChangePassword(false)} />
      )}

      <div className="min-h-[100dvh] bg-zinc-950 overflow-x-hidden">
        {/* HEADER DESKTOP */}
        <header className="hidden md:block bg-black border-b border-zinc-800 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <div className="bg-white w-8 h-8 rounded-lg flex items-center justify-center">
                  <Scissors className="w-4 h-4 text-black" />
                </div>
                <span className="text-white font-bold tracking-widest text-sm uppercase">LE COUPE</span>
              </div>
              <nav className="flex items-center gap-1">
                {pages.map(({ id, label, Icon }) => {
                  const pageKey = id === 'admin' ? 'home' : id;
                  const isPaidPage = id === 'revenue' || id === 'expenses' || id === 'bookings';
                  const isLocked = isPaidPage && !hasActiveSubscription;
                  const isHome = id === 'home';
                  
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        if (id === 'booking') return;
                        if (isLocked) {
                          setRedirectToPage(id as Page);
                          setShowRenewPage(true);
                          return;
                        }
                        navigateToPage(pageKey as 'home' | 'revenue' | 'expenses' | 'bookings');
                      }}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        currentPage === id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                      } ${isLocked && !isHome ? 'opacity-50' : ''}`}
                    >
                      <Icon className="w-4 h-4" />{label}
                      {isLocked && !isHome && <Crown className="w-3 h-3 text-yellow-400" />}
                    </button>
                  );
                })}
              </nav>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => navigateToPage('publicHome')}
                  className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-zinc-700"
                >
                  <Home className="w-3.5 h-3.5" />
                  <span className="text-xs">Accueil</span>
                </button>
                <button
                  onClick={handleShare}
                  className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-zinc-700"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span className="text-xs">{copied ? 'Copié !' : 'Partager'}</span>
                </button>
                <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5">
                  <Crown className="w-3 h-3 text-yellow-400" />
                  <span className="text-white text-xs font-semibold">{authUser.subscription?.plan_name || 'Gratuit'}</span>
                  <span className="text-zinc-500 text-xs">· {expiryDate}</span>
                </div>

                {/* ✅ Bouton Modifier le mot de passe */}
                <button
                  onClick={() => setShowChangePassword(true)}
                  className="text-zinc-500 hover:text-white transition p-1.5 rounded-lg hover:bg-zinc-800"
                  title="Modifier le mot de passe"
                >
                  <KeyRound className="w-4 h-4" />
                </button>
                
                <button onClick={onLogout} className="text-zinc-500 hover:text-white transition p-1.5 rounded-lg hover:bg-zinc-800">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* HEADER MOBILE */}
        <header className="md:hidden bg-black border-b border-zinc-800 sticky top-0 z-40">
          <div className="flex items-center justify-between px-4 h-14 w-full max-w-full">
            <div className="flex items-center gap-2 min-w-0">
              <div className="bg-white w-7 h-7 rounded-lg flex items-center justify-center shrink-0">
                <Scissors className="w-3.5 h-3.5 text-black" />
              </div>
              <span className="text-white font-bold tracking-widest text-xs uppercase truncate">LE COUPE</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1">
                <Crown className="w-3 h-3 text-yellow-400" />
                <span className="text-white text-xs font-semibold">{authUser.subscription?.plan_name || 'Gratuit'}</span>
              </div>
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-zinc-400 hover:text-white p-1.5">
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
          {mobileMenuOpen && (
            <div className="border-t border-zinc-800 bg-black px-4 py-3 space-y-1 w-full">
              <button
                onClick={() => navigateToPage('publicHome')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                <Home className="w-4 h-4" /> Accueil
              </button>
              {pages.map(({ id, label, Icon }) => {
                const pageKey = id === 'admin' ? 'home' : id;
                const isPaidPage = id === 'revenue' || id === 'expenses' || id === 'bookings';
                const isLocked = isPaidPage && !hasActiveSubscription;
                const isHome = id === 'home';
                
                return (
                  <button
                    key={id}
                    onClick={() => {
                      if (id === 'booking') return;
                      if (isLocked) {
                        setRedirectToPage(id as Page);
                        setShowRenewPage(true);
                        setMobileMenuOpen(false);
                        return;
                      }
                      navigateToPage(pageKey as 'home' | 'revenue' | 'expenses' | 'bookings');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      currentPage === id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                    } ${isLocked && !isHome ? 'opacity-50' : ''}`}
                  >
                    <Icon className="w-4 h-4" />{label}
                    {isLocked && !isHome && <Crown className="w-3 h-3 text-yellow-400" />}
                  </button>
                );
              })}
              <div className="pt-2 border-t border-zinc-800 mt-2 space-y-2">
                <button
                  onClick={handleShare}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  {copied ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
                  {copied ? 'Lien copié !' : "Partager l'application"}
                </button>
                {/* ✅ Bouton Modifier le mot de passe (mobile) */}
                <button
                  onClick={() => { setShowChangePassword(true); setMobileMenuOpen(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
                >
                  <KeyRound className="w-4 h-4" />
                  Modifier le mot de passe
                </button>
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0 mr-2">
                    <p className="text-white text-sm font-medium truncate">{authUser.fullName || authUser.email}</p>
                    <p className="text-zinc-500 text-xs">Expire le {expiryDate}</p>
                  </div>
                  <button onClick={onLogout} className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition shrink-0">
                    <LogOut className="w-4 h-4" /> Déconnexion
                  </button>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* MAIN */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-8 w-full overflow-x-hidden">
          {/* ✅ BANNIÈRE DE RAPPEL DE RENOUVELLEMENT - UNIQUEMENT POUR REVENUS, DÉPENSES ET RÉSERVATIONS */}
          {needsRenewal && daysLeft !== null && currentPage !== 'home' && (
            <div className="bg-yellow-950 border border-yellow-700 text-yellow-300 text-sm rounded-xl px-4 py-3 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {daysLeft <= 0
                  ? 'Votre abonnement a expiré. Renouvelez-le pour accéder à vos revenus, dépenses et réservations.'
                  : `Votre abonnement expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}. Pensez à renouveler pour accéder à vos revenus, dépenses et réservations.`}
              </span>
              <button
                onClick={() => setShowRenewPage(true)}
                className="bg-white text-black px-4 py-2 rounded-lg font-bold whitespace-nowrap"
              >
                Payer maintenant
              </button>
            </div>
          )}

          {/* ── CONTENU DES PAGES ── */}
          {currentPage === 'home' && (
            <div className="space-y-8">
              <SalonProfile userId={authUser.id} />
              <PromoBanner />
              {!checkingBanner && !hasActiveBanner && (
                <ReferralProgram
                  userId={authUser.id}
                  userName={authUser.fullName || authUser.email}
                />
              )}
              <ServiceSelector
                userId={authUser.id}
                salonName={salonName}
                authUser={authUser}
                onConfirm={handleServiceConfirm}
              />
              <TransactionHistory 
                userId={authUser.id} 
                refreshTrigger={refreshTrigger}
              />
            </div>
          )}
          {currentPage === 'bookings' && (
            <BookingSettingsPage 
              userId={authUser.id}
            />
          )}
          {currentPage === 'revenue' && (
            <RevenuePage 
              userId={authUser.id} 
              refreshTrigger={refreshTrigger}
            />
          )}
          {currentPage === 'expenses' && (
            <ExpensesPage 
              userId={authUser.id} 
              onExpenseAdded={handleExpenseAdded}
            />
          )}
          {currentPage === 'admin' && <AdminPanel currentUserId={authUser.id} isAdmin={isAdmin} />}
        </main>

        {/* BOTTOM NAV MOBILE */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-black border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]">
          <div className="flex items-center justify-around px-2 py-2">
            <button 
              onClick={() => navigateToPage('publicHome')} 
              className="flex flex-col items-center gap-1 px-3 py-1"
            >
              <div className="p-1.5 rounded-xl transition-all flex items-center justify-center">
                <Home className="w-5 h-5 text-zinc-600" />
              </div>
              <span className="text-[10px] font-medium text-zinc-600">Accueil</span>
            </button>
            
            {pages.map(({ id, label, Icon }) => {
              const pageKey = id === 'admin' ? 'home' : id;
              const isPaidPage = id === 'revenue' || id === 'expenses' || id === 'bookings';
              const isLocked = isPaidPage && !hasActiveSubscription;
              const isHome = id === 'home';
              
              return (
                <button 
                  key={id} 
                  onClick={() => {
                    if (id === 'booking') return;
                    if (isLocked) {
                      setRedirectToPage(id as Page);
                      setShowRenewPage(true);
                      return;
                    }
                    navigateToPage(pageKey as 'home' | 'revenue' | 'expenses' | 'bookings');
                  }} 
                  className="flex flex-col items-center gap-1 px-3 py-1"
                >
                  <div className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${
                    currentPage === id ? 'bg-white' : ''
                  } ${isLocked && !isHome ? 'opacity-50' : ''}`}>
                    <Icon className={`w-5 h-5 ${currentPage === id ? 'text-black' : 'text-zinc-600'}`} />
                  </div>
                  <span className={`text-[10px] font-medium ${
                    currentPage === id ? 'text-white' : 'text-zinc-600'
                  }`}>
                    {label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </RequirePhoneNumber>
  );
}

export default App;