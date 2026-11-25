// src/components/Clientapp.tsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { AuthPage } from './Authpage';
import { SubscribePage } from './Subscribepage';
import { LandingPage } from './LandingPage';
import { Scissors } from 'lucide-react';
import type { User, Session } from '@supabase/supabase-js';
import PublicHomePage from './PublicHomePage';

type AppState = 'loading' | 'publicHome' | 'landing' | 'auth' | 'subscribe' | 'app';
type AccountType = 'salon' | 'barber';

// Type exporté pour App.tsx
export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  accountType?: AccountType;
  subscription: {
    id: string;
    status: string;
    expires_at: string;
    plan_name: string;
    plan_price: number;
  };
}

type Subscription = {
  id: string;
  status: string;
  expires_at: string | null;
  plan_id: string | null;
};

type Plan = {
  name: string;
  price: number | string;
};

function withTimeout<T>(promiseLike: PromiseLike<T>, ms: number): Promise<T> {
  const promise = Promise.resolve(promiseLike);
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
  );
  return Promise.race([promise, timeout]);
}

async function retryWithTimeout<T>(
  operation: () => Promise<T>,
  retries: number,
  timeout: number
): Promise<T> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await withTimeout(operation(), timeout);
    } catch (error) {
      if (attempt === retries) throw error;
      console.warn(`Retry ${attempt}/${retries}`, error);
    }
  }
  throw new Error('Failed after retries');
}

export function ClientApp() {
  const [appState, setAppState] = useState<AppState>('loading');
  const [user, setUser] = useState<User | null>(null);
  const [activeSub, setActiveSub] = useState<AuthUser['subscription'] | null>(null);
  // Type de compte chargé depuis profiles_v3 : 'salon' (complet) ou 'barber' (limité)
  const [accountType, setAccountType] = useState<AccountType>('salon');
  const initLock = useRef(false);
  const [AppComponent, setAppComponent] = useState<React.ComponentType<{
    authUser: AuthUser;
    onLogout: () => void;
    isAuthenticated: boolean;
    onNavigateToAuth: (page: 'login' | 'register') => void;
  }> | null>(null);
  const [authScreen, setAuthScreen] = useState<'login' | 'register' | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ────────────────────────────────────────────────────────────────
  // initUser : charge le type de compte, puis l'abonnement.
  // - Sans abonnement actif, l'utilisateur entre quand même dans l'app
  //   (App.tsx verrouille les pages payantes).
  // - Si le type de compte n'est pas encore choisi et qu'il n'y a pas
  //   d'abonnement actif, on envoie vers SubscribePage, qui affiche
  //   l'écran de choix Salon / Barber.
  // ────────────────────────────────────────────────────────────────
  const initUser = useCallback(async (u: User) => {
    if (initLock.current) return;
    initLock.current = true;

    setUser(u);
    setIsAuthenticated(true);

    let typeMissing = false;
    try {
      const { data: profile } = await supabase
        .from('profiles_v3')
        .select('account_type')
        .eq('id', u.id)
        .maybeSingle();
      const t = profile?.account_type;
      typeMissing = t !== 'barber' && t !== 'salon';
      setAccountType(t === 'barber' ? 'barber' : 'salon');
    } catch (err) {
      console.warn('Lecture account_type échouée, compte salon par défaut:', err);
    }

    try {
      const { data: subs, error } = await retryWithTimeout(
        async () =>
          await supabase
            .from('subscriptions')
            .select('id, status, expires_at, plan_id')
            .eq('user_id', u.id)
            .limit(20),
        3,
        10000
      );

      if (error) {
        console.error('Erreur chargement abonnement:', error.message);
        setActiveSub(null);
        setAppState(typeMissing ? 'subscribe' : 'app');
        return;
      }

      const now = new Date();

      const validSubs = (subs || []).filter((s: Subscription) => {
        const statusOk = ['active', 'actif'].includes(
          (s.status ?? '').toLowerCase().trim()
        );
        const dateOk = !s.expires_at || new Date(s.expires_at) > now;
        return statusOk && dateOk;
      });

      if (validSubs.length === 0) {
        setActiveSub(null);
        setAppState(typeMissing ? 'subscribe' : 'app');
        return;
      }

      const s = validSubs[0];

      let planName = 'Mensuel';
      let planPrice: number = 5000;

      if (s.plan_id) {
        try {
          const { data: plan } = await withTimeout(
            supabase
              .from('subscription_plans')
              .select('name, price')
              .eq('id', s.plan_id)
              .maybeSingle(),
            5000
          );

          if (plan) {
            const p = plan as Plan;
            planName = p.name ?? 'Mensuel';
            planPrice =
              typeof p.price === 'number'
                ? p.price
                : parseFloat(p.price) || 5000;
          }
        } catch {
          console.warn('Plan fetch failed');
        }
      }

      setActiveSub({
        id: s.id,
        status: s.status,
        expires_at:
          s.expires_at ??
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        plan_name: planName,
        plan_price: planPrice,
      });

      // Abonné actif : on entre dans l'app (sans type enregistré = traité comme salon)
      setAppState('app');
    } catch (err) {
      console.error('Erreur initUser:', err);
      setActiveSub(null);
      setAppState(typeMissing ? 'subscribe' : 'app');
    } finally {
      initLock.current = false;
    }
  }, []);

  // Vérifier le statut de l'abonnement après paiement
  const checkSubscriptionStatus = useCallback(async (subscriptionId: string) => {
    let attempts = 0;
    const maxAttempts = 15;

    const finish = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await initUser(session.user);
      }
    };

    const checkInterval = setInterval(async () => {
      attempts++;

      try {
        const { data: subscription, error } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('id', parseInt(subscriptionId))
          .maybeSingle();

        if (error) {
          console.error('Erreur requête:', error);
        }

        if (subscription?.status === 'active' || attempts >= maxAttempts) {
          clearInterval(checkInterval);
          await finish();
        }
      } catch (err) {
        console.error('Erreur vérification:', err);
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          await finish();
        }
      }
    }, 2000);
  }, [initUser]);

  // Vérifier le retour de paiement
  useEffect(() => {
    const handlePaymentReturn = async () => {
      const params = new URLSearchParams(window.location.search);
      const isSuccess = params.get('payment_success') === 'true';
      const isCancelled = params.get('payment_cancelled') === 'true';

      const paymentToken = sessionStorage.getItem('payment_token');
      const subscriptionId = sessionStorage.getItem('payment_subscription_id');
      const paymentStatus = sessionStorage.getItem('payment_status');

      if (paymentToken) {
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: paymentToken,
            refresh_token: ''
          });

          if (error) {
            console.warn('⚠️ Erreur restauration:', error);
            sessionStorage.removeItem('payment_token');
            sessionStorage.removeItem('payment_subscription_id');
            sessionStorage.removeItem('payment_status');
          } else if (data.session) {
            sessionStorage.removeItem('payment_token');
            sessionStorage.removeItem('payment_subscription_id');

            if (subscriptionId) {
              await checkSubscriptionStatus(subscriptionId);
            } else if (data.session.user) {
              await initUser(data.session.user);
            }

            window.history.replaceState({}, document.title, '/');
            return;
          }
        } catch (err) {
          console.warn('⚠️ Erreur restauration:', err);
          sessionStorage.removeItem('payment_token');
          sessionStorage.removeItem('payment_subscription_id');
          sessionStorage.removeItem('payment_status');
        }
      }

      if (paymentStatus === 'success' || paymentStatus === 'cancelled') {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await initUser(session.user);
        }

        sessionStorage.removeItem('payment_status');
        window.history.replaceState({}, document.title, '/');
        return;
      }

      if (isSuccess || isCancelled) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await initUser(session.user);
        }
        window.history.replaceState({}, document.title, '/');
      }
    };

    handlePaymentReturn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Écoute de l'état d'authentification
  useEffect(() => {
    let handled = false;

    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(async (event, session: Session | null) => {
      if (event === 'INITIAL_SESSION') {
        handled = true;
        if (session?.user) {
          await initUser(session.user);
        } else {
          setAppState('publicHome');
          setIsAuthenticated(false);
        }
      }

      if (event === 'SIGNED_IN') {
        if (!handled && session?.user) {
          handled = true;
          await initUser(session.user);
        }
      }

      if (event === 'SIGNED_OUT') {
        handled = false;
        initLock.current = false;
        setUser(null);
        setActiveSub(null);
        setAccountType('salon');
        setIsAuthenticated(false);
        setAppState('publicHome');
        setAuthScreen(null);
      }
    });

    return () => authSub.unsubscribe();
  }, [initUser]);

  const handleLogout = async () => {
    initLock.current = false;
    setAppState('loading');
    setIsAuthenticated(false);
    await supabase.auth.signOut();
  };

  // Après paiement / essai : on recharge l'abonnement
  const handleSubscribed = useCallback(async () => {
    if (!user) return;
    await initUser(user);
  }, [user, initUser]);

  // Après connexion (AuthPage). Le verrou d'initUser évite le double chargement.
  const handleAuthSuccess = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await initUser(session.user);
    }
    setAuthScreen(null);
  }, [initUser]);

  // Navigation depuis la page publique vers l'authentification
  const handleNavigateToAuth = useCallback((page: 'login' | 'register') => {
    setAuthScreen(page);
    setAppState('landing');
  }, []);

  // Navigation vers la réservation d'un salon
  const handleNavigateToBooking = useCallback((slug: string) => {
    window.location.href = `/booking/${slug}`;
  }, []);

  // ────────────────────────────────────────────────────────────────
  // Navigation depuis la page publique ET la page d'abonnement.
  // - "history" : accessible à tous
  // - Barber : jamais Revenus / Dépenses
  // - Pages payantes sans abonnement actif -> page d'abonnement
  // ────────────────────────────────────────────────────────────────
  const handleNavigateToPage = useCallback((page: 'publicHome' | 'home' | 'revenue' | 'expenses' | 'bookings' | 'history') => {
    if (page === 'publicHome') {
      setAppState('publicHome');
      return;
    }

    if (page === 'history') {
      return;
    }

    if (!isAuthenticated || !user) {
      handleNavigateToAuth('login');
      return;
    }

    // Un Barber n'a pas accès à Revenus / Dépenses
    if (accountType === 'barber' && (page === 'revenue' || page === 'expenses')) {
      setAppState('app');
      return;
    }

    const isPaidPage = page === 'revenue' || page === 'expenses' || page === 'bookings';

    if (isPaidPage && !activeSub) {
      setAppState('subscribe');
    } else {
      setAppState('app');
    }
  }, [isAuthenticated, user, activeSub, accountType, handleNavigateToAuth]);

  // Importer App dynamiquement
  useEffect(() => {
    if (appState === 'app') {
      import('../App').then(module => {
        setAppComponent(() => module.default);
      });
    }
  }, [appState]);

  // authUser mémorisé : sans ça, App.tsx reçoit un nouvel objet à chaque rendu
  // et ses useEffect se relancent en boucle.
  const authUser: AuthUser | null = useMemo(() => {
    if (!user) return null;
    return {
      id: user.id,
      email: user.email ?? '',
      fullName: user.user_metadata?.full_name ?? user.email ?? '',
      accountType,
      subscription: activeSub ?? {
        id: '',
        status: 'inactive',
        expires_at: '',
        plan_name: 'Gratuit',
        plan_price: 0,
      },
    };
  }, [user, accountType, activeSub]);

  // ── UI ──

  if (appState === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center mx-auto mb-4 animate-pulse">
            <Scissors className="w-6 h-6 text-black" />
          </div>
          <p className="text-zinc-500 text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  if (appState === 'publicHome') {
    return (
      <PublicHomePage
        onNavigateToBooking={handleNavigateToBooking}
        onNavigateToLogin={() => handleNavigateToAuth('login')}
        onNavigateToRegister={() => handleNavigateToAuth('register')}
        isAuthenticated={isAuthenticated}
        currentUserId={user?.id || null}
        onNavigateToPage={handleNavigateToPage}
      />
    );
  }

  if (appState === 'landing') {
    return (
      <LandingPage
        onGetStarted={() => {
          setAuthScreen('login');
          setAppState('auth');
        }}
        onBack={() => {
          setAppState('publicHome');
          setAuthScreen(null);
        }}
        initialScreen={authScreen}
      />
    );
  }

  if (appState === 'auth') {
    return (
      <AuthPage
        onBack={() => {
          setAppState('landing');
          setAuthScreen(null);
        }}
        onAuthSuccess={handleAuthSuccess}
      />
    );
  }

  // Page d'abonnement : choix du type si absent, puis offres de ce type uniquement
  if (appState === 'subscribe' && user) {
    return (
      <SubscribePage
        userId={user.id}
        userEmail={user.email ?? ''}
        userFullName={user.user_metadata?.full_name ?? ''}
        accountType={accountType}
        onAccountTypeChosen={setAccountType}
        onSubscribed={handleSubscribed}
        onNavigateToPage={handleNavigateToPage}
        isAuthenticated={isAuthenticated}
        onNavigateToLogin={() => handleNavigateToAuth('login')}
      />
    );
  }

  if (appState === 'app' && authUser && AppComponent) {
    return (
      <AppComponent
        authUser={authUser}
        onLogout={handleLogout}
        isAuthenticated={isAuthenticated}
        onNavigateToAuth={handleNavigateToAuth}
      />
    );
  }

  // Fallback
  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-zinc-400 text-sm">Problème de connexion</p>
        <button
          onClick={() => supabase.auth.signOut()}
          className="bg-white text-black px-6 py-3 rounded-xl text-sm font-bold"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}