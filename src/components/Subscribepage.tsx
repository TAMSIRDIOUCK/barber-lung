// src/components/SubscribePage.tsx
import { useState, useEffect, useRef } from 'react';
import { Scissors, Check, LogOut, Loader, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Plan {
  id: number;
  name: string;
  price: number;
  duration_days: number;
  is_free?: boolean;
}

interface SubscribePageProps {
  userId: string;
  userEmail: string;
  userFullName: string;
  onSubscribed: () => void;
}

// Un mois d'essai gratuit (30 jours).
const FREE_TRIAL_DAYS = 30;

export function SubscribePage({
  userId,
  userEmail,
  userFullName,
  onSubscribed,
}: SubscribePageProps) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansError, setPlansError] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'wave' | 'orange_money' | null>(null);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'choose' | 'pay' | 'pending'>('choose');
  const [error, setError] = useState('');
  const [subscriptionId, setSubscriptionId] = useState<number | null>(null);
  const [hasUsedFreeTrial, setHasUsedFreeTrial] = useState(false);

  const isSubmittingRef = useRef(false);

  const salonName = userFullName?.trim() || userEmail || 'LA COUPE';

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const edgeFunctionUrl = supabaseUrl
    ? `${supabaseUrl}/functions/v1/initiate-payment`
    : null;

  useEffect(() => {
    const init = async () => {
      // Verifier si l'utilisateur a deja utilise l'essai gratuit
      const { data, error: trialCheckError } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_free_trial', true)
        .limit(1)
        .maybeSingle();

      if (trialCheckError) {
        console.error('Erreur verification essai gratuit:', trialCheckError.message);
      }
      if (data) setHasUsedFreeTrial(true);

      // Charger les plans d'abonnement
      const { data: plansData, error: plansErr } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price');

      if (plansErr) setPlansError('Impossible de charger les plans : ' + plansErr.message);
      if (plansData) {
        // Garantir que le plan gratuit affiche bien un mois d'essai.
        const modifiedPlans = plansData.map((plan: Plan) => {
          if (plan.is_free === true) {
            return { ...plan, duration_days: FREE_TRIAL_DAYS };
          }
          return plan;
        });
        setPlans(modifiedPlans);
      }
    };

    init();
  }, [userId]);

  // Verification du statut du paiement
  useEffect(() => {
    if (step !== 'pending' || !subscriptionId) return;

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      const { data } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('id', subscriptionId)
        .maybeSingle();

      if (data?.status === 'active') {
        clearInterval(interval);
        onSubscribed();
      } else if (attempts > 20) {
        clearInterval(interval);
        setError('Le paiement prend plus de temps que prevu. Verifiez votre compte ou contactez le support.');
        setStep('choose');
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [step, subscriptionId, onSubscribed]);

  const handleFreeTrial = async () => {
    if (isSubmittingRef.current) return;
    if (!selectedPlan) return;

    isSubmittingRef.current = true;
    setError('');
    setLoading(true);

    try {
      // Verifier si l'utilisateur a deja utilise l'essai gratuit
      const { data: existingTrial, error: trialCheckError } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_free_trial', true)
        .limit(1)
        .maybeSingle();

      if (trialCheckError) {
        throw new Error('Impossible de verifier votre eligibilite : ' + trialCheckError.message);
      }

      if (existingTrial) {
        throw new Error('Vous avez deja utilise votre essai gratuit');
      }

      // La date utilisee par le reste de l'application est expires_at.
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + FREE_TRIAL_DAYS);

      console.log(`✅ Essai gratuit de ${FREE_TRIAL_DAYS} jours:`, {
        start: startDate.toISOString(),
        end: endDate.toISOString()
      });

      const { error: subErr } = await supabase
        .from('subscriptions')
        .insert([{
          user_id: userId,
          plan_id: selectedPlan.id,
          status: 'active',
          is_free_trial: true,
          start_date: startDate.toISOString(),
          expires_at: endDate.toISOString(),
        }])
        .select()
        .single();

      if (subErr) throw new Error('Erreur creation abonnement : ' + subErr.message);

      onSubscribed();
    } catch (e: any) {
      setError(e.message ?? "Erreur lors de l'activation de l'essai gratuit");
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handlePay = async () => {
    if (isSubmittingRef.current) return;
    if (!selectedPlan || !paymentMethod || !phone.trim()) {
      return setError('Remplissez tous les champs');
    }

    if (!edgeFunctionUrl) {
      return setError(
        'Configuration manquante : VITE_SUPABASE_URL n\'est pas defini dans votre fichier .env'
      );
    }

    isSubmittingRef.current = true;
    setError('');
    setLoading(true);
    let redirecting = false;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('Session expiree. Merci de vous reconnecter.');
      }

      // Nettoyer les abonnements "pending" residuels
      const { error: cleanupErr } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('user_id', userId)
        .eq('status', 'pending');

      if (cleanupErr) {
        console.warn('Nettoyage des abonnements pending residuels echoue :', cleanupErr.message);
      }

      // Creer l'abonnement
      const { data: sub, error: subErr } = await supabase
        .from('subscriptions')
        .insert([{
          user_id: userId,
          plan_id: selectedPlan.id,
          status: 'pending',
          is_free_trial: false
        }])
        .select()
        .single();

      if (subErr) throw new Error('Erreur creation abonnement : ' + subErr.message);

      // Creer l'enregistrement de paiement
      const { error: payErr } = await supabase.from('payments').insert([{
        user_id: userId,
        subscription_id: sub.id,
        amount: selectedPlan.price,
        provider: paymentMethod,
        status: 'pending',
      }]);

      if (payErr) throw new Error('Erreur creation paiement : ' + payErr.message);

      setSubscriptionId(sub.id);

      // Construire les URLs avec le token pour maintenir la session
      const appUrl = window.location.origin;
      const token = session.access_token;
      
      const returnUrl = `${appUrl}/auth/callback#payment_success?subscription_id=${sub.id}&token=${token}`;
      const cancelUrl = `${appUrl}/auth/callback#payment_cancelled?subscription_id=${sub.id}&token=${token}`;
      const callbackUrl = `https://vzhcjvvgpbtfolxnpapy.supabase.co/functions/v1/ipn?subscription_id=${sub.id}`;

      console.log('URLs construites avec token:', { returnUrl, cancelUrl, callbackUrl });

      // Appeler la fonction Edge
      const res = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          subscription_id: sub.id,
          amount: selectedPlan.price,
          phone: phone.replace(/\s/g, '').replace(/^\+221/, ''),
          method: paymentMethod,
          customer_name: salonName,
          customer_email: userEmail,
          description: `Abonnement ${selectedPlan.name} - ID:${sub.id}`,
          plan_name: selectedPlan.name,
          return_url: returnUrl,
          cancel_url: cancelUrl,
          callback_url: callbackUrl,
        }),
      });

      const data = await res.json();
      console.log('Reponse de la fonction Edge:', data);

      if (!res.ok) {
        throw new Error(data.error || `Erreur ${res.status}: ${res.statusText}`);
      }

      if (data.success && data.invoice_url) {
        redirecting = true;
        // Passer en mode pending avant la redirection
        setStep('pending');
        window.location.href = data.invoice_url;
        return;
      }

      throw new Error(data.error || "Erreur lors de l'initiation du paiement");
      
    } catch (e: any) {
      console.error('Erreur complete:', e);
      
      if (e.message?.includes('fetch') || e.message?.includes('network')) {
        setError('Impossible de contacter le serveur de paiement. Verifiez votre connexion internet et reessayez.');
      } else {
        setError(e.message || 'Erreur lors du paiement');
      }
      
      setStep('choose');
    } finally {
      if (!redirecting) {
        setLoading(false);
        isSubmittingRef.current = false;
      }
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const formatCFA = (v: number) => v.toLocaleString('fr-FR') + ' CFA';

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">

        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <Scissors className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-white font-bold uppercase tracking-wider">{salonName}</h1>
              <p className="text-zinc-500 text-xs">La Coupe — Gestion de salon</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-zinc-500 hover:text-white transition flex items-center gap-1.5 text-sm"
          >
            <LogOut className="w-4 h-4" /> Deconnexion
          </button>
        </div>

        {/* Alertes de configuration */}
        {!supabaseUrl && (
          <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3 mb-6">
            <span>⚠️ </span><strong>VITE_SUPABASE_URL</strong> est manquant dans votre fichier <code>.env</code>.
          </div>
        )}

        {/* Etape 1 : choisir un plan */}
        {step === 'choose' && (
          <div>
            <h2 className="text-white text-2xl font-bold mb-2">Choisissez votre abonnement</h2>
            <p className="text-zinc-400 text-sm mb-8">
              Accedez a tous les services du salon avec un abonnement actif.
            </p>

            {plansError && (
              <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">
                {plansError}
              </div>
            )}

            {plans.length === 0 && !plansError && (
              <div className="text-zinc-500 text-sm text-center py-8 animate-pulse">
                Chargement des plans...
              </div>
            )}

            <div className="grid gap-4 mb-8">
              {plans.map((plan) => {
                const isAnnual = plan.duration_days >= 365;
                const isFree = plan.is_free === true;
                const isSelected = selectedPlan?.id === plan.id;
                const isFreeDisabled = isFree && hasUsedFreeTrial;

                return (
                  <button
                    key={plan.id}
                    onClick={() => !isFreeDisabled && setSelectedPlan(plan)}
                    disabled={isFreeDisabled}
                    className={`relative w-full bg-zinc-900 border-2 rounded-2xl p-6 text-left transition ${
                      isSelected ? 'border-white' : 'border-zinc-700 hover:border-zinc-500'
                    } ${isFreeDisabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {isAnnual && (
                      <span className="absolute top-4 right-4 bg-white text-black text-xs font-bold px-3 py-1 rounded-full">
                        ECONOMIE 17%
                      </span>
                    )}
                    {isFree && !hasUsedFreeTrial && (
                      <span className="absolute top-4 right-4 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                        OFFERT
                      </span>
                    )}
                    {isFree && hasUsedFreeTrial && (
                      <span className="absolute top-4 right-4 bg-zinc-700 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full">
                        DEJA UTILISE
                      </span>
                    )}
                    <div className="flex items-center gap-3 mb-1">
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition ${
                        isSelected ? 'border-white bg-white' : 'border-zinc-600'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 text-black" />}
                      </div>
                      <h3 className="text-white text-xl font-bold">{plan.name}</h3>
                    </div>
                    <p className="text-3xl font-bold text-white ml-8">
                      {isFree ? 'GRATUIT' : formatCFA(plan.price)}
                    </p>
                    <p className="text-zinc-400 text-sm ml-8 mt-0.5">
                      {isFree
                        ? "1 mois d'essai gratuit"
                        : isAnnual
                          ? 'par an — soit ' + formatCFA(Math.round(plan.price / 12)) + '/mois'
                          : 'par mois'}
                    </p>
                    {isFree && !hasUsedFreeTrial && (
                      <p className="text-green-400 text-xs ml-8 mt-2">
                        Offre valable une seule fois
                      </p>
                    )}
                    {isFree && hasUsedFreeTrial && (
                      <p className="text-zinc-500 text-xs ml-8 mt-2">
                        Vous avez deja utilise votre essai gratuit
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
                  <Loader className="w-4 h-4 animate-spin" /> Activation...
                </span>
              ) : (
                selectedPlan?.is_free ? 'Commencer mon essai gratuit' : 'Continuer'
              )}
            </button>
          </div>
        )}

        {/* Etape 2 : paiement */}
        {step === 'pay' && selectedPlan && (
          <div>
            <button onClick={() => setStep('choose')} className="text-zinc-400 mb-6 text-sm">
              Retour
            </button>
            <h2 className="text-white text-2xl font-bold mb-2">Paiement</h2>
            <p className="text-zinc-400 text-sm mb-8">
              Abonnement <span className="text-white font-bold">{selectedPlan.name}</span>{' '}
              — {formatCFA(selectedPlan.price)}
            </p>

            <div className="mb-6">
              <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-3 block">
                Methode de paiement
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'wave', label: 'Wave', logo: '/assets/wavw.png' },
                  { id: 'orange_money', label: 'Orange Money', logo: '/assets/orange.png' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setPaymentMethod(m.id as any)}
                    className={`border-2 rounded-xl p-4 font-bold transition flex flex-col items-center gap-2 ${
                      paymentMethod === m.id
                        ? 'border-white text-white'
                        : 'border-zinc-700 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    <img
                      src={m.logo}
                      alt={m.label}
                      className="w-10 h-10 object-contain rounded-lg"
                      onError={(e) => { e.currentTarget.style.display = 'none'; }}
                    />
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">
                Numero de telephone
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
              <span className="text-zinc-400 text-sm">Total a payer</span>
              <span className="text-white text-xl font-bold">{formatCFA(selectedPlan.price)}</span>
            </div>

            <button
              onClick={handlePay}
              disabled={loading}
              className="w-full bg-white text-black py-4 rounded-xl font-bold text-base hover:bg-zinc-200 transition disabled:opacity-50"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader className="w-4 h-4 animate-spin" /> Traitement...
                </span>
              ) : (
                `Payer ${formatCFA(selectedPlan.price)}`
              )}
            </button>
          </div>
        )}

        {/* Etape 3 : en attente */}
        {step === 'pending' && selectedPlan && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <Loader className="w-8 h-8 text-yellow-400 animate-spin" />
            </div>
            <h2 className="text-white text-2xl font-bold mb-3">Paiement en attente</h2>
            <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
              Confirmez le paiement sur votre telephone.<br />
              Cette page se mettra a jour automatiquement une fois le paiement valide.
            </p>
            <div className="mt-8 bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 inline-block">
              <p className="text-zinc-400 text-xs">Montant</p>
              <p className="text-white text-2xl font-bold">{formatCFA(selectedPlan.price)}</p>
            </div>
            {error && (
              <div className="mt-4 p-3 bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}