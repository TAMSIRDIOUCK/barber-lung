// src/App.tsx — VERSION MISE À JOUR
// Ajout de l'onglet "Réservations" avec BookingSettingsPage
// Ajout de la page de succès de paiement
// Ajout du programme de parrainage (affiche en haut si pas de bannière)

import { useState, useEffect } from 'react';
import {
  Scissors, TrendingUp, DollarSign, LogOut, Crown, Menu, X,
  Share2, Check, Shield, CalendarCheck, CheckCircle2, Loader
} from 'lucide-react';
import { ServiceSelector } from './components/ServiceSelector';
import TransactionHistory from './components/TransactionHistory';
import RevenuePage from './components/RevenuePage';
import ExpensesPage from './components/ExpensesPage';
import AdminPanel from './components/AdminPanel';
import { PromoBanner } from './components/PromoBanner';
import { BookingSettingsPage } from './components/BookingSettingsPage';
import { ReferralProgram } from './components/ReferralProgram';
import { supabase } from './lib/supabase';
import type { AuthUser } from './components/Clientapp';

type Page = 'home' | 'revenue' | 'expenses' | 'bookings' | 'admin';

interface AppProps {
  authUser: AuthUser;
  onLogout: () => void;
}

// Composant Page de Succès de Paiement
function PaymentSuccessPage({ onComplete }: { onComplete: () => void }) {
  const [countdown, setCountdown] = useState(3);
  const [status, setStatus] = useState<'checking' | 'activating' | 'success'>('checking');
  
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
      const maxAttempts = 10;
      
      const checkInterval = setInterval(async () => {
        attempts++;
        
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('id', parseInt(subscriptionId))
          .maybeSingle();
        
        if (subscription?.status === 'active') {
          clearInterval(checkInterval);
          setStatus('success');
          setTimeout(() => {
            onComplete();
          }, 2000);
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          setStatus('success');
          setTimeout(() => {
            onComplete();
          }, 2000);
        }
      }, 2000);
      
      return () => clearInterval(checkInterval);
    };
    
    checkSubscription();
  }, [onComplete]);
  
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center max-w-md">
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
            <p className="text-zinc-400 mt-2">Votre abonnement est en cours d'activation</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-white text-2xl font-bold mb-2">Paiement réussi ! 🎉</h2>
            <p className="text-zinc-400 mb-4">Votre abonnement est maintenant actif.</p>
            <p className="text-zinc-500 text-sm">Redirection dans {countdown} seconde{countdown > 1 ? 's' : ''}...</p>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mx-auto mt-4" />
          </>
        )}
      </div>
    </div>
  );
}

// Composant Page d'Annulation
function PaymentCancelPage({ onComplete }: { onComplete: () => void }) {
  const [countdown, setCountdown] = useState(5);
  
  useEffect(() => {
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
  }, [onComplete]);
  
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <X className="w-10 h-10 text-red-400" />
        </div>
        <h2 className="text-white text-2xl font-bold mb-2">Paiement annulé</h2>
        <p className="text-zinc-400 mb-4">Vous n'avez pas confirmé le paiement.</p>
        <p className="text-zinc-500 text-sm">Redirection dans {countdown} seconde{countdown > 1 ? 's' : ''}...</p>
        <button 
          onClick={onComplete}
          className="mt-6 bg-white text-black px-6 py-2 rounded-lg font-semibold hover:bg-zinc-200 transition"
        >
          Retour à l'accueil
        </button>
      </div>
    </div>
  );
}

function App({ authUser, onLogout }: AppProps) {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [salonName] = useState<string>('LE COUPE');
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAdmin, setCheckingAdmin] = useState(true);
  
  // État pour les pages de paiement
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const [showPaymentCancel, setShowPaymentCancel] = useState(false);

  // État pour vérifier s'il y a une bannière active
  const [hasActiveBanner, setHasActiveBanner] = useState(false);
  const [checkingBanner, setCheckingBanner] = useState(true);

  // Vérifier l'URL pour les pages de paiement
  useEffect(() => {
    const pathname = window.location.pathname;
    const params = new URLSearchParams(window.location.search);
    
    if (pathname === '/payment-success' || params.get('success') === 'true') {
      setShowPaymentSuccess(true);
      window.history.replaceState({}, '', '/');
    } else if (pathname === '/payment-cancel' || params.get('cancelled') === 'true') {
      setShowPaymentCancel(true);
      window.history.replaceState({}, '', '/');
    }
  }, []);

  // Vérifier s'il y a une bannière active
  useEffect(() => {
    const checkActiveBanner = async () => {
      setCheckingBanner(true);
      try {
        const { data, error } = await supabase
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
    window.location.reload();
  };

  useEffect(() => {
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
  }, [authUser.id]);

  const handleServiceConfirm = async () => setRefreshTrigger(prev => prev + 1);
  const handleExpenseAdded = () => setRefreshTrigger(prev => prev + 1);

  const navigate = (page: Page) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
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

  const userPages: { id: Page; label: string; Icon: any }[] = [
    { id: 'home',     label: 'Services',     Icon: Scissors },
    { id: 'revenue',  label: 'Revenus',      Icon: TrendingUp },
    { id: 'expenses', label: 'Dépenses',     Icon: DollarSign },
    { id: 'bookings', label: 'Réservations', Icon: CalendarCheck },
  ];

  const pages = isAdmin
    ? [...userPages, { id: 'admin' as Page, label: 'Admin', Icon: Shield }]
    : userPages;

  const expiryDate = new Date(authUser.subscription.expires_at).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  // Affichage des pages de paiement
  if (showPaymentSuccess) {
    return <PaymentSuccessPage onComplete={handlePaymentComplete} />;
  }
  
  if (showPaymentCancel) {
    return <PaymentCancelPage onComplete={handlePaymentComplete} />;
  }

  if (checkingAdmin) {
    return (
      <div className="min-h-[100dvh] bg-zinc-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
      </div>
    );
  }

  return (
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
              {pages.map(({ id, label, Icon }) => (
                <button key={id} onClick={() => navigate(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    currentPage === id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}>
                  <Icon className="w-4 h-4" />{label}
                </button>
              ))}
            </nav>
            <div className="flex items-center gap-3">
              <button onClick={handleShare} className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm px-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-zinc-700">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
                <span className="text-xs">{copied ? 'Copié !' : 'Partager'}</span>
              </button>
              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5">
                <Crown className="w-3 h-3 text-yellow-400" />
                <span className="text-white text-xs font-semibold">{authUser.subscription.plan_name}</span>
                <span className="text-zinc-500 text-xs">· {expiryDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">
                    {(authUser.fullName || authUser.email)[0].toUpperCase()}
                  </span>
                </div>
                <span className="text-zinc-400 text-sm truncate max-w-[120px]">{authUser.fullName || authUser.email}</span>
              </div>
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
              <span className="text-white text-xs font-semibold">{authUser.subscription.plan_name}</span>
            </div>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-zinc-400 hover:text-white p-1.5">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className="border-t border-zinc-800 bg-black px-4 py-3 space-y-1 w-full">
            {pages.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => navigate(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  currentPage === id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
            <div className="pt-2 border-t border-zinc-800 mt-2 space-y-2">
              <button onClick={handleShare} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
                {copied ? 'Lien copié !' : "Partager l'application"}
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
        {currentPage === 'home' && (
          <div className="space-y-8">
            {/* Bannière publicitaire (toujours affichée si active) */}
            <PromoBanner />
            
            {/* Parrainage - Affiche UNIQUEMENT si pas de bannière active */}
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
            <TransactionHistory userId={authUser.id} refreshTrigger={refreshTrigger} />
          </div>
        )}
        {currentPage === 'revenue'   && <RevenuePage userId={authUser.id} refreshTrigger={refreshTrigger} />}
        {currentPage === 'expenses'  && <ExpensesPage userId={authUser.id} onExpenseAdded={handleExpenseAdded} />}
        {currentPage === 'bookings'  && <BookingSettingsPage userId={authUser.id} />}
        {currentPage === 'admin'     && <AdminPanel currentUserId={authUser.id} isAdmin={isAdmin} />}
      </main>

      {/* BOTTOM NAV MOBILE */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-black border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 py-2">
          {pages.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => navigate(id)} className="flex flex-col items-center gap-1 px-3 py-1">
              <div className={`p-1.5 rounded-xl transition-all ${currentPage === id ? 'bg-white' : ''}`}>
                <Icon className={`w-5 h-5 ${currentPage === id ? 'text-black' : 'text-zinc-600'}`} />
              </div>
              <span className={`text-[10px] font-medium ${currentPage === id ? 'text-white' : 'text-zinc-600'}`}>{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default App;