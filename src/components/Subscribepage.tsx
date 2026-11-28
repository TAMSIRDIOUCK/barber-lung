import { useState, useEffect, useRef } from 'react';
import {
  Scissors,
  Check,
  LogOut,
  Loader,
  Home,
  TrendingUp,
  DollarSign,
  CalendarCheck,
} from 'lucide-react';

import { supabase } from '../lib/supabase';
import { BARBER_PLANS, BARBER_PRICE_TEXT } from '../lib/plans';
import {
  AccountTypeSelect,
  type AccountType,
} from './AccountTypeSelect';

type NavPage = 'publicHome' | 'home' | 'revenue' | 'expenses' | 'bookings';

interface Plan {
  id: number;
  name: string;
  price: number;
  duration_days: number;
  is_free?: boolean;
  account_type?: AccountType | null;
  badge?: string;
  planKey?: string;
  durationMonths?: number;
}

interface SubscribePageProps {
  userId: string;
  userEmail: string;
  userFullName: string;
  accountType?: AccountType;
  onAccountTypeChosen?: (type: AccountType) => void;
  onSubscribed: () => void;
  onNavigateToPage?: (page: NavPage) => void;
  isAuthenticated?: boolean;
  onNavigateToLogin?: () => void;
}

export function SubscribePage({
  userId,
  userEmail,
  userFullName,
  onAccountTypeChosen,
  onSubscribed,
  onNavigateToPage,
}: SubscribePageProps) {
  const [accountType, setAccountType] = useState<AccountType | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const [plansContext, setPlansContext] = useState<string | null>(null);

  const [editingType, setEditingType] = useState(false);
  const [savingType, setSavingType] = useState(false);
  const [typeError, setTypeError] = useState('');

  const [plans, setPlans] = useState<Plan[]>([]);
  const [freeTrialPlan, setFreeTrialPlan] = useState<Plan | null>(null);
  const [plansLoaded, setPlansLoaded] = useState(false);
  const [plansError, setPlansError] = useState('');

  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<'wave' | 'orange_money' | null>(null);

  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'choose' | 'pay' | 'pending'>('choose');

  const [error, setError] = useState('');
  const [subscriptionId, setSubscriptionId] = useState<number | null>(null);
  const [hasUsedFreeTrial, setHasUsedFreeTrial] = useState(false);

  const isSubmittingRef = useRef(false);
  const restoringPendingRef = useRef(false);

  // Garde toujours la dernière version de onSubscribed sans relancer le polling
  const onSubscribedRef = useRef(onSubscribed);
  useEffect(() => {
    onSubscribedRef.current = onSubscribed;
  }, [onSubscribed]);

  const isBarber = accountType === 'barber';
  const salonName = userFullName?.trim() || userEmail || 'LA COUPE';

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;

  // SASPAY
  const edgeFunctionUrl = supabaseUrl
    ? `${supabaseUrl.replace(/\/$/, '')}/functions/v1/initiate-saspay-payment`
    : null;

  // =====================================================
  // 1. CHARGEMENT DU TYPE DE COMPTE
  // =====================================================

  useEffect(() => {
    let cancelled = false;

    setProfileLoaded(false);
    setProfileUserId(null);
    setTypeError('');
    setAccountType(null);
    setPlans([]);
    setFreeTrialPlan(null);
    setPlansLoaded(false);
    setPlansContext(null);
    setSelectedPlan(null);
    setHasUsedFreeTrial(false);
    setSubscriptionId(null);
    setStep('choose');

    const loadAccountType = async () => {
      try {
        const { data: authData, error: authError } =
          await supabase.auth.getUser();

        if (authError) throw authError;

        if (!authData.user || authData.user.id !== userId) {
          throw new Error(
            'La session utilisateur a changé ou a expiré. Reconnectez-vous.'
          );
        }

        const { data, error: profErr } = await supabase
          .from('profiles_v3')
          .select('account_type, account_type_confirmed')
          .eq('id', userId)
          .maybeSingle();

        if (profErr) throw profErr;
        if (cancelled) return;

        const type = data?.account_type;
        const typeConfirmed = data?.account_type_confirmed === true;

        const validType: AccountType | null =
          typeConfirmed && (type === 'barber' || type === 'salon')
            ? type
            : null;

        setAccountType(validType);
        setProfileUserId(userId);
      } catch (err) {
        if (cancelled) return;

        console.error('[SUBSCRIBE] Erreur lecture profil :', err);

        setAccountType(null);
        setProfileUserId(userId);

        setTypeError(
          'Impossible de vérifier votre type de compte. Vérifiez votre connexion puis réessayez.'
        );
      } finally {
        if (!cancelled) setProfileLoaded(true);
      }
    };

    loadAccountType();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // =====================================================
  // 2. CHANGEMENT DU TYPE DE COMPTE
  // =====================================================

  const handleChooseType = async (type: AccountType) => {
    if (savingType) return;

    setTypeError('');
    setSavingType(true);

    try {
      setPlans([]);
      setPlansLoaded(false);
      setSelectedPlan(null);
      setStep('choose');
      setError('');
      setAccountType(null);

      const { data: updated, error: updErr } = await supabase
        .from('profiles_v3')
        .update({
          account_type: type,
          account_type_confirmed: true,
        })
        .eq('id', userId)
        .select('id')
        .maybeSingle();

      if (updErr) throw new Error(updErr.message);

      if (!updated) {
        const { error: upsertErr } = await supabase
          .from('profiles_v3')
          .upsert(
            {
              id: userId,
              account_type: type,
              account_type_confirmed: true,
            },
            { onConflict: 'id' }
          );

        if (upsertErr) throw new Error(upsertErr.message);
      }

      setAccountType(type);
      setEditingType(false);

      onAccountTypeChosen?.(type);
    } catch (e: any) {
      console.error('Erreur changement de compte :', e);

      setTypeError(
        "Impossible d'enregistrer votre choix : " +
          (e.message ?? 'erreur inconnue')
      );

      const { data } = await supabase
        .from('profiles_v3')
        .select('account_type, account_type_confirmed')
        .eq('id', userId)
        .maybeSingle();

      const actualType = data?.account_type;
      const actualConfirmed = data?.account_type_confirmed === true;

      setAccountType(
        actualConfirmed && (actualType === 'barber' || actualType === 'salon')
          ? actualType
          : null
      );
    } finally {
      setSavingType(false);
    }
  };

  // =====================================================
  // 3. CONSTRUCTION DES OFFRES BARBER
  // =====================================================

  const buildBarberPlans = (dbPlans: Plan[]): Plan[] => {
    const paidPlans = dbPlans.filter((plan) => !plan.is_free);

    const result: Plan[] = [];
    const usedPlanIds = new Set<number>();

    for (const cfg of BARBER_PLANS) {
      const dbPlan = paidPlans.find(
        (plan) =>
          !usedPlanIds.has(plan.id) &&
          (cfg.durationMonths >= 12
            ? plan.duration_days >= 365
            : plan.duration_days < 365)
      );

      if (!dbPlan) continue;

      usedPlanIds.add(dbPlan.id);

      // ⚠️ Le prix affiché vient de BARBER_PLANS (front).
      // Le serveur facture le prix de subscription_plans (base) :
      // les deux doivent être identiques.
      result.push({
        ...dbPlan,
        name: cfg.name,
        price: cfg.price,
        badge: cfg.badge,
        planKey: cfg.id,
        durationMonths: cfg.durationMonths,
        account_type: 'barber',
      });
    }

    return result.sort((a, b) => a.price - b.price);
  };

  // =====================================================
  // 4. CHARGEMENT DES ABONNEMENTS
  // =====================================================

  useEffect(() => {
    if (
      !profileLoaded ||
      profileUserId !== userId ||
      !accountType ||
      editingType
    ) {
      return;
    }

    let cancelled = false;
    const currentType = accountType;

    const loadPlans = async () => {
      setPlans([]);
      setFreeTrialPlan(null);
      setSelectedPlan(null);
      setPlansLoaded(false);
      setPlansContext(null);
      setPlansError('');

      try {
        if (currentType === 'salon') {
          const { data: trial, error: trialError } = await supabase
            .from('subscriptions')
            .select('id')
            .eq('user_id', userId)
            .eq('is_free_trial', true)
            .maybeSingle();

          if (cancelled) return;
          if (trialError) throw trialError;

          setHasUsedFreeTrial(!!trial);
        } else {
          setHasUsedFreeTrial(false);
        }

        const { data, error: fetchError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('account_type', currentType)
          .eq('is_active', true)
          .order('price');

        if (cancelled) return;
        if (fetchError) throw fetchError;

        const filteredPlans = ((data ?? []) as Plan[]).filter(
          (plan) => plan.account_type === currentType
        );

        let finalPlans: Plan[] = [];

        if (currentType === 'barber') {
          finalPlans = buildBarberPlans(filteredPlans).slice(0, 2);

          if (finalPlans.length === 0) {
            setPlansError(
              'Aucune offre Barber disponible en base de données.'
            );
          }
        }

        if (currentType === 'salon') {
          const trialPlan =
            filteredPlans.find((plan) => plan.is_free === true) ?? null;

          setFreeTrialPlan(trialPlan);

          const paidSalonPlans = filteredPlans
            .filter(
              (plan) =>
                !plan.is_free && !/barber/i.test(plan.name)
            )
            .sort(
              (a, b) =>
                a.duration_days - b.duration_days ||
                a.price - b.price
            );

          const monthlyPlan = paidSalonPlans.find(
            (plan) => plan.duration_days < 365
          );

          const annualPlan = paidSalonPlans.find(
            (plan) => plan.duration_days >= 365
          );

          finalPlans = [monthlyPlan, annualPlan].filter(
            (plan): plan is Plan => Boolean(plan)
          );

          if (finalPlans.length === 0) {
            setPlansError(
              'Aucune offre Salon disponible pour le moment.'
            );
          } else if (finalPlans.length !== 2) {
            setPlansError(
              'Deux formules Salon (mensuelle et annuelle) ne sont pas toutes disponibles.'
            );
          }
        } else {
          setFreeTrialPlan(null);
        }

        if (!cancelled) {
          const safePlans = finalPlans
            .filter((plan) => plan.account_type === currentType)
            .slice(0, 2);

          setPlans(safePlans);
          setPlansContext(`${userId}:${currentType}`);
        }
      } catch (e: any) {
        if (!cancelled) {
          setPlans([]);
          setFreeTrialPlan(null);
          setPlansContext(`${userId}:${currentType}`);

          setPlansError(
            'Erreur de chargement des abonnements : ' +
              (e.message ?? 'erreur inconnue')
          );
        }
      } finally {
        if (!cancelled) setPlansLoaded(true);
      }
    };

    loadPlans();

    return () => {
      cancelled = true;
    };
  }, [userId, accountType, profileLoaded, profileUserId, editingType]);

  // =====================================================
  // 5. REPRISE ET VÉRIFICATION DU PAIEMENT
  // =====================================================

  // Après un retour depuis Wave ou une réouverture de l'application,
  // retrouver la dernière tentative en attente pour cet utilisateur.
  useEffect(() => {
    if (
      !profileLoaded ||
      profileUserId !== userId ||
      !accountType ||
      subscriptionId !== null ||
      restoringPendingRef.current
    ) {
      return;
    }

    let cancelled = false;
    restoringPendingRef.current = true;

    const restorePendingSubscription = async () => {
      try {
        const { data: pendingSub, error: pendingError } = await supabase
          .from('subscriptions')
          .select('id, plan_id')
          .eq('user_id', userId)
          .eq('status', 'pending')
          .eq('is_free_trial', false)
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (pendingError) throw pendingError;
        if (!pendingSub || cancelled) return;

        const { data: plan, error: planError } = await supabase
          .from('subscription_plans')
          .select('*')
          .eq('id', pendingSub.plan_id)
          .maybeSingle();

        if (planError) throw planError;
        if (!plan || plan.account_type !== accountType || cancelled) return;

        setSelectedPlan(plan as Plan);
        setSubscriptionId(Number(pendingSub.id));
        setStep('pending');
        setError('');
        console.info('[SASPAY] Tentative de paiement en attente restaurée.');
      } catch (restoreError) {
        console.error('[SASPAY] Erreur reprise paiement :', restoreError);
      } finally {
        restoringPendingRef.current = false;
      }
    };

    restorePendingSubscription();

    return () => {
      cancelled = true;
      restoringPendingRef.current = false;
    };
  }, [profileLoaded, profileUserId, userId, accountType, subscriptionId]);

  // Vérifier immédiatement, puis toutes les 5 secondes.
  // Ne jamais quitter l'écran d'attente automatiquement : un débit peut
  // avoir eu lieu même si le webhook met du temps à confirmer le paiement.
  useEffect(() => {
    if (step !== 'pending' || !subscriptionId) return;

    let cancelled = false;
    let checking = false;

    const checkSubscription = async () => {
      if (checking) return;
      checking = true;

      try {
        const { data, error: statusError } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('id', subscriptionId)
          .eq('user_id', userId)
          .maybeSingle();

        if (cancelled) return;
        if (statusError) throw statusError;

        if (data?.status === 'active') {
          onSubscribedRef.current();
        } else if (data?.status === 'cancelled') {
          setError(
            'Cette tentative est indiquée comme annulée. Si Wave a débité votre compte, ne payez pas une deuxième fois et contactez le support pour vérifier la transaction.'
          );
        }
      } catch (statusError) {
        if (!cancelled) {
          console.error('[SASPAY] Vérification abonnement :', statusError);
        }
      } finally {
        checking = false;
      }
    };

    checkSubscription();
    const interval = setInterval(checkSubscription, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [step, subscriptionId, userId]);

  // =====================================================
  // 6. ESSAI GRATUIT
  // =====================================================

  const handleFreeTrial = async () => {
    if (isSubmittingRef.current || !selectedPlan) return;

    if (
      accountType !== 'salon' ||
      selectedPlan.account_type !== 'salon'
    ) {
      setError('Cette offre gratuite est réservée aux comptes Salon.');
      return;
    }

    isSubmittingRef.current = true;
    setError('');
    setLoading(true);

    try {
      const { data: existingTrial, error: trialCheckError } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_free_trial', true)
        .maybeSingle();

      if (trialCheckError) throw trialCheckError;

      if (existingTrial) {
        throw new Error('Vous avez déjà utilisé votre essai gratuit.');
      }

      // Les dates sont de toute façon imposées par le trigger SQL côté serveur.
      const endDate = new Date(
        Date.now() + selectedPlan.duration_days * 24 * 60 * 60 * 1000
      ).toISOString();

      const { error: subErr } = await supabase
        .from('subscriptions')
        .insert([
          {
            user_id: userId,
            plan_id: selectedPlan.id,
            status: 'active',
            is_free_trial: true,
            start_date: new Date().toISOString(),
            end_date: endDate,
            expires_at: endDate,
          },
        ])
        .select()
        .single();

      if (subErr) {
        throw new Error(
          'Erreur création abonnement : ' + subErr.message
        );
      }

      onSubscribedRef.current();
    } catch (e: any) {
      setError(
        e.message ?? "Erreur lors de l'activation de l'essai gratuit."
      );

      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  // =====================================================
  // 7. PAIEMENT SASPAY
  // =====================================================

  const handlePay = async () => {
    if (isSubmittingRef.current) return;

    if (!selectedPlan || !paymentMethod || !phone.trim()) {
      setError('Remplissez tous les champs.');
      return;
    }

    if (
      !accountType ||
      selectedPlan.account_type !== accountType
    ) {
      setError('Cette offre ne correspond pas à votre type de compte.');
      return;
    }

    if (!edgeFunctionUrl) {
      setError('Configuration Supabase manquante.');
      return;
    }

    const cleanPhone = phone.replace(/\s/g, '').replace(/-/g, '');

    const internationalPhone = cleanPhone.startsWith('+221')
      ? cleanPhone
      : cleanPhone.startsWith('221')
        ? `+${cleanPhone}`
        : `+221${cleanPhone}`;

    if (!/^\+221(70|75|76|77|78)\d{7}$/.test(internationalPhone)) {
      setError('Numéro sénégalais invalide. Exemple : +221770000000.');
      return;
    }

    isSubmittingRef.current = true;
    setError('');
    setLoading(true);

    let redirecting = false;
    let createdSubscriptionId: number | null = null;

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error('Session expirée. Reconnectez-vous.');
      }

      const { data: profile, error: profileError } = await supabase
        .from('profiles_v3')
        .select('account_type, account_type_confirmed')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      if (
        profile.account_type !== accountType ||
        profile.account_type_confirmed !== true
      ) {
        throw new Error('Votre type de compte a changé. Rechargez la page.');
      }

      const { data: dbPlan, error: planError } = await supabase
        .from('subscription_plans')
        .select('id, account_type, is_active, is_free')
        .eq('id', selectedPlan.id)
        .single();

      if (planError) throw planError;

      if (
        dbPlan.account_type !== accountType ||
        dbPlan.is_active !== true ||
        dbPlan.is_free === true
      ) {
        throw new Error('Cette formule est indisponible.');
      }

      // Ne pas annuler les anciennes tentatives en attente :
      // un paiement Wave peut avoir été débité sans retour immédiat du webhook.

      // Création de l'abonnement.
      const { data: sub, error: subErr } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          plan_id: selectedPlan.id,
          status: 'pending',
          is_free_trial: false,
        })
        .select()
        .single();

      if (subErr) throw subErr;

      createdSubscriptionId = sub.id;
      setSubscriptionId(sub.id);

      // Création du paiement.
      const { error: payErr } = await supabase
        .from('payments')
        .insert({
          user_id: userId,
          subscription_id: sub.id,
          amount: selectedPlan.price,
          provider: paymentMethod,
          status: 'pending',
        });

      if (payErr) throw payErr;

      const nameParts = (userFullName || 'Client LA COUPE')
        .trim()
        .split(/\s+/);

      const firstName = nameParts[0] || 'Client';
      const lastName = nameParts.slice(1).join(' ') || 'LA COUPE';

      const network =
        paymentMethod === 'wave'
          ? 'wave_sn'
          : 'orange_money_sn';

      // Le montant n'est plus envoyé : le serveur le relit en base.
      const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          phone: internationalPhone,
          firstName,
          lastName,
          email: userEmail,
          network,
          subscription_id: sub.id,
        }),
      });

      const responseText = await response.text();

      let data: any;

      try {
        data = responseText ? JSON.parse(responseText) : {};
      } catch {
        throw new Error(
          `Réponse invalide du serveur SasPay : ${responseText.slice(0, 300)}`
        );
      }

      if (!response.ok) {
        const serverError =
          typeof data.error === 'string'
            ? data.error
            : JSON.stringify(data.error || data);

        // Affiche la référence technique renvoyée par la fonction Edge
        // pour retrouver facilement l'appel dans les logs Supabase.
        const requestInfo = data.request_id
          ? ` (Référence : ${data.request_id})`
          : '';

        const providerInfo = Array.isArray(data.provider_response_keys)
          ? ` — Champs reçus de SasPay : ${data.provider_response_keys.join(', ')}`
          : '';

        throw new Error(
          `${serverError || `Erreur serveur (${response.status}).`}${requestInfo}${providerInfo}`
        );
      }

      // La transaction reste en attente jusqu'à confirmation serveur.
      setStep('pending');
      setSubscriptionId(sub.id);

      const checkoutUrl =
        typeof data.checkout_url === 'string'
          ? data.checkout_url.trim()
          : '';

      if (checkoutUrl) {
        try {
          const parsedCheckoutUrl = new URL(checkoutUrl);

          // N'autoriser que le domaine officiel du checkout SASPAY.
          // Refuser les domaines de démonstration, les ports et identifiants intégrés.
          const isAllowedUrl =
            parsedCheckoutUrl.protocol === 'https:' &&
            parsedCheckoutUrl.origin === 'https://pay.saspay.me' &&
            parsedCheckoutUrl.username === '' &&
            parsedCheckoutUrl.password === '';

          if (!isAllowedUrl) {
            throw new Error('URL de paiement SASPAY non autorisée');
          }

          redirecting = true;
          window.location.assign(parsedCheckoutUrl.toString());
        } catch (urlError) {
          console.error('[SASPAY] URL de redirection refusée :', urlError);

          setError(
            'Le paiement a été initié, mais SASPAY a renvoyé une adresse de redirection invalide. Ne payez pas une deuxième fois. Votre abonnement reste en attente de confirmation.'
          );
        }
      } else {
        setError(
          'Demande de paiement envoyée. Confirmez sur votre téléphone si une notification est affichée. Nous attendons la confirmation SASPAY.'
        );
      }
    } catch (e: any) {
      console.error('[SASPAY] Erreur paiement :', e);

      // IMPORTANT : ne jamais annuler automatiquement l'abonnement ici.
      // L'appel SASPAY a pu être accepté et le compte Wave débité même si
      // le navigateur n'a pas reçu une réponse exploitable.
      if (createdSubscriptionId !== null) {
        setSubscriptionId(createdSubscriptionId);
        setStep('pending');
        setError(
          `${e.message || 'Réponse incertaine du service de paiement.'} Si votre compte Wave a été débité, ne recommencez pas le paiement. Nous conservons cette tentative pour vérification.`
        );
      } else {
        setError(
          e.message ||
            "Une erreur est survenue avant la création du paiement."
        );
        setStep('choose');
      }
    } finally {
      if (!redirecting) {
        setLoading(false);
        isSubmittingRef.current = false;
      }
    }
  };

  // =====================================================
  // 8. NAVIGATION ET OUTILS
  // =====================================================

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const formatCFA = (value: number) =>
    value.toLocaleString('fr-FR') + ' CFA';

  const monthlyRef = plans.find(
    (plan) =>
      !plan.is_free &&
      plan.price > 0 &&
      plan.duration_days < 365
  );

  const getSavingsPercent = (plan: Plan) => {
    if (isBarber) return 0;

    if (!monthlyRef || plan.is_free || plan.duration_days < 365) {
      return 0;
    }

    const pct = Math.round(
      (1 - plan.price / (monthlyRef.price * 12)) * 100
    );

    return pct > 0 ? pct : 0;
  };

  const handleNavigation = (page: NavPage) => {
    if (onNavigateToPage) {
      onNavigateToPage(page);
    } else if (page === 'publicHome') {
      window.location.href = '/';
    } else if (page === 'home') {
      window.location.href = '/app';
    } else {
      window.location.href = `/${page}`;
    }
  };

  const navItems: {
    id: string;
    label: string;
    Icon: any;
    page: NavPage;
    salonOnly?: boolean;
  }[] = [
    {
      id: 'home',
      label: 'Accueil',
      Icon: Home,
      page: 'publicHome',
    },
    {
      id: 'services',
      label: 'Services',
      Icon: Scissors,
      page: 'home',
    },
    {
      id: 'bookings',
      label: 'Réservations',
      Icon: CalendarCheck,
      page: 'bookings',
    },
    {
      id: 'revenue',
      label: 'Revenus',
      Icon: TrendingUp,
      page: 'revenue',
      salonOnly: true,
    },
    {
      id: 'expenses',
      label: 'Dépenses',
      Icon: DollarSign,
      page: 'expenses',
      salonOnly: true,
    },
  ];

  const visibleNavItems = navItems.filter(
    (item) => !(isBarber && item.salonOnly)
  );

  // =====================================================
  // 9. CHARGEMENT
  // =====================================================

  if (!profileLoaded || profileUserId !== userId) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader className="w-6 h-6 text-zinc-500 animate-spin" />
      </div>
    );
  }

  // =====================================================
  // 10. CHOIX DU TYPE DE COMPTE
  // =====================================================

  if (!accountType || editingType) {
    return (
      <AccountTypeSelect
        userFullName={userFullName}
        initialType={accountType}
        saving={savingType}
        error={typeError}
        onConfirm={handleChooseType}
        onCancel={
          accountType
            ? () => {
                setTypeError('');
                setEditingType(false);
              }
            : undefined
        }
        onLogout={handleLogout}
      />
    );
  }

  // =====================================================
  // 11. PROTECTION DES OFFRES
  // =====================================================

  const expectedPlansContext = `${userId}:${accountType}`;

  const visiblePlans =
    plansContext === expectedPlansContext &&
    profileLoaded &&
    profileUserId === userId
      ? plans
          .filter(
            (plan) =>
              plan.account_type === accountType &&
              plan.is_free !== true
          )
          .slice(0, 2)
      : [];

  // =====================================================
  // 12. AFFICHAGE
  // =====================================================

  return (
    <div className="min-h-screen bg-black pb-20">
      <div className="max-w-lg mx-auto px-4 py-12">

        {/* HEADER */}

        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <Scissors className="w-5 h-5 text-black" />
            </div>

            <div>
              <h1 className="text-white font-bold uppercase tracking-wider">
                {salonName}
              </h1>

              <p className="text-zinc-500 text-xs">
                {isBarber
                  ? 'La Coupe — Espace Barber'
                  : 'La Coupe — Gestion de salon'}
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="text-zinc-500 hover:text-white transition flex items-center gap-1.5 text-sm"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>

        {!supabaseUrl && (
          <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3 mb-6">
            ⚠️ <strong>VITE_SUPABASE_URL</strong> est manquant dans votre fichier .env.
          </div>
        )}

        {/* ÉTAPE 1 : CHOIX ABONNEMENT */}

        {step === 'choose' && (
          <div>
            <h2 className="text-white text-2xl font-bold mb-2">
              Choisissez votre abonnement
            </h2>

            <p className="text-zinc-400 text-sm mb-3">
              {isBarber
                ? `Formule Barber : ${BARBER_PRICE_TEXT}, pour recevoir et gérer vos réservations clients.`
                : 'Accédez à tous les services du salon avec un abonnement actif.'}
            </p>

            <button
              onClick={() => {
                setTypeError('');
                setEditingType(true);
              }}
              className="text-zinc-500 hover:text-white transition text-xs underline mb-8"
            >
              {isBarber ? 'Compte Barber' : 'Compte Salon'} — changer de type de compte
            </button>

            {plansError && (
              <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">
                {plansError}
              </div>
            )}

            {(plansContext !== expectedPlansContext || !plansLoaded) && (
              <div className="text-zinc-500 text-sm text-center py-8 animate-pulse">
                Chargement des abonnements...
              </div>
            )}

            {accountType === 'salon' &&
              freeTrialPlan?.account_type === 'salon' && (
                <button
                  type="button"
                  onClick={() => {
                    if (hasUsedFreeTrial) return;
                    setSelectedPlan(freeTrialPlan);
                    setError('');
                  }}
                  disabled={hasUsedFreeTrial || loading}
                  className={`w-full mb-5 rounded-2xl border-2 p-4 text-left transition ${
                    selectedPlan?.is_free
                      ? 'border-white bg-zinc-900'
                      : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                  } ${hasUsedFreeTrial ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-white font-bold">Essai gratuit</p>
                      <p className="text-zinc-400 text-xs mt-1">
                        {freeTrialPlan.duration_days} jours pour découvrir LA COUPE
                      </p>
                    </div>

                    <span className="text-green-400 font-bold text-sm">
                      {hasUsedFreeTrial ? 'DÉJÀ UTILISÉ' : 'GRATUIT'}
                    </span>
                  </div>
                </button>
              )}

            {plansContext === expectedPlansContext &&
              plansLoaded &&
              visiblePlans.length > 0 && (
                <div className="mb-4 text-xs text-zinc-500 uppercase tracking-widest">
                  {isBarber
                    ? 'Offres réservées aux Barbers'
                    : 'Offres réservées aux Salons'}
                </div>
              )}

            <div className="grid gap-4 mb-8">
              {visiblePlans.map((plan) => {
                const isAnnual = plan.duration_days >= 365;
                const isFree = plan.is_free === true;
                const isSelected = selectedPlan?.id === plan.id;

                const savings = getSavingsPercent(plan);

                return (
                  <button
                    key={plan.id}
                    onClick={() => {
                      setSelectedPlan(plan);
                      setError('');
                    }}
                    className={`relative w-full bg-zinc-900 border-2 rounded-2xl p-6 text-left transition ${
                      isSelected
                        ? 'border-white'
                        : 'border-zinc-700 hover:border-zinc-500'
                    }`}
                  >
                    {plan.badge ? (
                      <span className="absolute top-4 right-4 bg-white text-black text-xs font-bold px-3 py-1 rounded-full uppercase">
                        {plan.badge}
                      </span>
                    ) : isAnnual && savings > 0 ? (
                      <span className="absolute top-4 right-4 bg-white text-black text-xs font-bold px-3 py-1 rounded-full">
                        ÉCONOMIE {savings}%
                      </span>
                    ) : null}

                    <div className="flex items-center gap-3 mb-1">
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                          isSelected
                            ? 'border-white bg-white'
                            : 'border-zinc-600'
                        }`}
                      >
                        {isSelected && (
                          <Check className="w-3 h-3 text-black" />
                        )}
                      </div>

                      <h3 className="text-white text-xl font-bold">
                        {plan.name}
                      </h3>
                    </div>

                    <p className="text-3xl font-bold text-white ml-8">
                      {isFree ? 'GRATUIT' : formatCFA(plan.price)}
                    </p>

                    <p className="text-zinc-400 text-sm ml-8 mt-0.5">
                      {isFree
                        ? `${plan.duration_days} jours d'essai gratuit`
                        : isAnnual
                          ? `par an — soit ${formatCFA(Math.round(plan.price / 12))}/mois`
                          : 'par mois'}
                    </p>

                    {isBarber && isAnnual && plan.badge && (
                      <p className="text-green-400 text-xs ml-8 mt-2">
                        ✨ {plan.badge}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            {error && (
              <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">
                {error}
              </div>
            )}

            <button
              onClick={() => {
                if (!selectedPlan) return;

                if (selectedPlan.account_type !== accountType) {
                  setError('Type de compte incorrect.');
                  return;
                }

                if (selectedPlan.is_free) {
                  handleFreeTrial();
                } else {
                  setStep('pay');
                }
              }}
              disabled={!selectedPlan || loading}
              className="w-full bg-white text-black py-4 rounded-xl font-bold text-base hover:bg-zinc-200 transition disabled:opacity-30"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Activation...
                </span>
              ) : selectedPlan?.is_free ? (
                'Commencer mon essai gratuit →'
              ) : (
                'Continuer →'
              )}
            </button>
          </div>
        )}

        {/* ÉTAPE 2 : PAIEMENT SASPAY */}

        {step === 'pay' && selectedPlan && (
          <div>
            <button
              onClick={() => setStep('choose')}
              className="text-zinc-400 mb-6 text-sm"
            >
              ← Retour
            </button>

            <h2 className="text-white text-2xl font-bold mb-2">
              Paiement sécurisé
            </h2>

            <p className="text-zinc-400 text-sm mb-8">
              Abonnement{' '}
              <span className="text-white font-bold">
                {selectedPlan.name}
              </span>
              {' '}— {formatCFA(selectedPlan.price)}
            </p>

            <div className="mb-6">
              <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-3 block">
                Méthode de paiement
              </label>

              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    id: 'wave',
                    label: 'Wave',
                    logo: '/assets/wavw.png',
                  },
                  {
                    id: 'orange_money',
                    label: 'Orange Money',
                    logo: '/assets/orange.png',
                  },
                ].map((method) => (
                  <button
                    key={method.id}
                    onClick={() =>
                      setPaymentMethod(
                        method.id as 'wave' | 'orange_money'
                      )
                    }
                    className={`border-2 rounded-xl p-4 font-bold transition flex flex-col items-center gap-2 ${
                      paymentMethod === method.id
                        ? 'border-white text-white'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    <img
                      src={method.logo}
                      alt={method.label}
                      className="w-10 h-10 object-contain rounded-lg"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                    {method.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">
                Numéro de téléphone
              </label>

              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="77 000 00 00"
                className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 border border-zinc-600 focus:outline-none focus:border-white transition"
              />
            </div>

            {error && (
              <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">
                {error}
              </div>
            )}

            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mb-6 flex justify-between items-center">
              <span className="text-zinc-400 text-sm">
                Total à payer
              </span>

              <span className="text-white text-xl font-bold">
                {selectedPlan ? formatCFA(selectedPlan.price) : 'En vérification'}
              </span>
            </div>

            <button
              onClick={handlePay}
              disabled={loading || !paymentMethod || !phone.trim()}
              className="w-full bg-white text-black py-4 rounded-xl font-bold text-base hover:bg-zinc-200 transition disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" />
                  Connexion à SasPay...
                </span>
              ) : (
                `Payer ${formatCFA(selectedPlan.price)}`
              )}
            </button>

            <p className="text-center text-zinc-600 text-xs mt-4">
              Paiement sécurisé avec SasPay
            </p>
          </div>
        )}

        {/* ÉTAPE 3 : PAIEMENT EN ATTENTE */}

        {step === 'pending' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader className="w-8 h-8 text-yellow-400 animate-spin" />
            </div>

            <h2 className="text-white text-2xl font-bold mb-3">
              Paiement en attente
            </h2>

            <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
              Si vous avez déjà confirmé le paiement, ne recommencez pas.
              <br />
              Votre abonnement sera activé après confirmation du paiement par SASPAY.
            </p>

            <div className="mt-8 bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 inline-block">
              <p className="text-zinc-400 text-xs">
                Montant
              </p>

              <p className="text-white text-2xl font-bold">
                {selectedPlan ? formatCFA(selectedPlan.price) : 'En vérification'}
              </p>
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* NAVIGATION INFÉRIEURE */}

      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-black border-t border-zinc-800 pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
          {visibleNavItems.map(({ id, label, Icon, page }) => {
            const isHome = id === 'home';

            return (
              <button
                key={id}
                onClick={() => handleNavigation(page)}
                className="flex flex-col items-center gap-1 px-3 py-1 group"
              >
                <div
                  className={`p-1.5 rounded-xl transition-all flex items-center justify-center ${
                    isHome
                      ? 'bg-white'
                      : 'group-hover:bg-white/10'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 ${
                      isHome
                        ? 'text-black'
                        : 'text-zinc-600 group-hover:text-white'
                    }`}
                  />
                </div>

                <span
                  className={`text-[8px] font-medium ${
                    isHome
                      ? 'text-white'
                      : 'text-zinc-600 group-hover:text-white'
                  }`}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}