// src/components/Clientapp.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AuthPage } from './Authpage';
import { SubscribePage } from './Subscribepage';
import { LandingPage } from './LandingPage';
import { Scissors } from 'lucide-react';
import type { User, Session } from '@supabase/supabase-js';

type AppState = 'loading' | 'landing' | 'auth' | 'subscribe' | 'app';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
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
  const initLock = useRef(false);
  const [AppComponent, setAppComponent] = useState<React.ComponentType<{ authUser: AuthUser; onLogout: () => void }> | null>(null);

  // ✅ Vérifier le retour de paiement
  useEffect(() => {
    const handlePaymentReturn = async () => {
      const params = new URLSearchParams(window.location.search);
      const isSuccess = params.get('payment_success') === 'true';
      const isCancelled = params.get('payment_cancelled') === 'true';
      
      // Vérifier si on a un token dans sessionStorage
      const paymentToken = sessionStorage.getItem('payment_token');
      const subscriptionId = sessionStorage.getItem('payment_subscription_id');
      
      console.log('🔍 Vérification retour paiement:', {
        isSuccess,
        isCancelled,
        hasToken: !!paymentToken,
        subscriptionId
      });
      
      // Si on a un token de paiement, restaurer la session
      if (paymentToken) {
        console.log('🔑 Token de paiement trouvé, restauration...');
        
        try {
          const { data, error } = await supabase.auth.setSession({
            access_token: paymentToken,
            refresh_token: ''
          });
          
          if (error) {
            console.warn('⚠️ Erreur restauration:', error);
            sessionStorage.removeItem('payment_token');
            sessionStorage.removeItem('payment_subscription_id');
          } else if (data.session) {
            console.log('✅ Session restaurée avec succès');
            
            // Nettoyer le token après restauration
            sessionStorage.removeItem('payment_token');
            sessionStorage.removeItem('payment_subscription_id');
            
            // Vérifier le statut de l'abonnement
            if (subscriptionId) {
              await checkSubscriptionStatus(subscriptionId);
            } else if (data.session.user) {
              await initUser(data.session.user);
            }
            
            // Nettoyer l'URL
            window.history.replaceState({}, document.title, '/');
            return;
          }
        } catch (err) {
          console.warn('⚠️ Erreur restauration:', err);
          sessionStorage.removeItem('payment_token');
          sessionStorage.removeItem('payment_subscription_id');
        }
      }
      
      // Si pas de token mais qu'on a un retour de paiement, recharger l'utilisateur
      if (isSuccess || isCancelled) {
        console.log('🔄 Retour de paiement détecté, rechargement...');
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await initUser(session.user);
        }
        window.history.replaceState({}, document.title, '/');
      }
    };

    handlePaymentReturn();
  }, []);

  // ✅ Vérifier le statut de l'abonnement après paiement
  const checkSubscriptionStatus = async (subscriptionId: string) => {
    try {
      let attempts = 0;
      const maxAttempts = 15;
      
      const checkInterval = setInterval(async () => {
        attempts++;
        console.log(`🔄 Vérification abonnement ${attempts}/${maxAttempts}`);
        
        try {
          const { data: subscription } = await supabase
            .from('subscriptions')
            .select('status')
            .eq('id', parseInt(subscriptionId))
            .maybeSingle();

          if (subscription?.status === 'active') {
            clearInterval(checkInterval);
            console.log('✅ Abonnement actif, rechargement...');
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              await initUser(session.user);
            }
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            console.log('⏰ Délai dépassé, rechargement...');
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              await initUser(session.user);
            }
          }
        } catch (err) {
          console.error('Erreur vérification:', err);
          if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              await initUser(session.user);
            }
          }
        }
      }, 2000);

      return () => clearInterval(checkInterval);
    } catch (err) {
      console.error('Erreur:', err);
    }
  };

  const initUser = useCallback(async (u: User) => {
    if (initLock.current) return;
    initLock.current = true;

    console.log('👤 Initialisation utilisateur:', u.id);
    setUser(u);

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
        setAppState('subscribe');
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
        console.log('📭 Aucun abonnement actif');
        setActiveSub(null);
        setAppState('subscribe');
        return;
      }

      const s = validSubs[0];
      console.log('📋 Abonnement trouvé:', s.id, s.status);

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

      setAppState('app');
      console.log('✅ App prête');
    } catch (err) {
      console.error('Erreur initUser:', err);
      setAppState('subscribe');
    } finally {
      initLock.current = false;
    }
  }, []);

  useEffect(() => {
    let handled = false;

    const {
      data: { subscription: authSub },
    } = supabase.auth.onAuthStateChange(async (event, session: Session | null) => {
      console.log('🔐 Auth event:', event);
      
      if (event === 'INITIAL_SESSION') {
        handled = true;
        if (session?.user) {
          await initUser(session.user);
        } else {
          setAppState('landing');
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
        setAppState('landing');
      }
    });

    return () => authSub.unsubscribe();
  }, [initUser]);

  const handleLogout = async () => {
    initLock.current = false;
    setAppState('loading');
    await supabase.auth.signOut();
  };

  const handleSubscribed = useCallback(async () => {
    if (!user) return;
    initLock.current = false;
    console.log('🔄 Abonnement souscrit, rechargement...');
    await initUser(user);
  }, [user, initUser]);

  const handleAuthSuccess = useCallback(async () => {
    initLock.current = false;
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      await initUser(session.user);
    }
  }, [initUser]);

  // Importer App dynamiquement
  useEffect(() => {
    if (appState === 'app') {
      import('../App').then(module => {
        setAppComponent(() => module.default);
      });
    }
  }, [appState]);

  // UI
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

  if (appState === 'landing')
    return <LandingPage onGetStarted={() => setAppState('auth')} />;

  if (appState === 'auth')
    return (
      <AuthPage
        onBack={() => setAppState('landing')}
        onAuthSuccess={handleAuthSuccess}
      />
    );

  if (appState === 'subscribe' && user) {
    return (
      <SubscribePage
        userId={user.id}
        userEmail={user.email ?? ''}
        userFullName={user.user_metadata?.full_name ?? ''}
        onSubscribed={handleSubscribed}
      />
    );
  }

  if (appState === 'app' && user && activeSub && AppComponent) {
    const authUser: AuthUser = {
      id: user.id,
      email: user.email ?? '',
      fullName: user.user_metadata?.full_name ?? user.email ?? '',
      subscription: activeSub,
    };
    return <AppComponent authUser={authUser} onLogout={handleLogout} />;
  }

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