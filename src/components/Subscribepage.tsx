// src/components/SubscribePage.tsx
import { useState, useEffect } from 'react';
import { Scissors, Check, LogOut, Loader } from 'lucide-react';
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

  const salonName = userFullName?.trim() || userEmail || 'LA COUPE';

  useEffect(() => {
    // Vérifier si l'utilisateur a déjà utilisé un essai gratuit
    const checkFreeTrialUsage = async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_free_trial', true)
        .single();

      if (data && !error) {
        setHasUsedFreeTrial(true);
      }
    };

    checkFreeTrialUsage();

    supabase
      .from('subscription_plans')
      .select('*')
      .order('price')
      .then(({ data, error: e }) => {
        if (e) setPlansError('Impossible de charger les plans : ' + e.message);
        if (data) setPlans(data);
      });
  }, [userId]);

  useEffect(() => {
    if (step !== 'pending' || !subscriptionId) return;
    const interval = setInterval(async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('status')
        .eq('id', subscriptionId)
        .single();
      if (data?.status === 'active') {
        clearInterval(interval);
        onSubscribed();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [step, subscriptionId, onSubscribed]);

  const handleFreeTrial = async () => {
    if (!selectedPlan) return;

    setError('');
    setLoading(true);

    try {
      // Vérifier une dernière fois si l'utilisateur a déjà utilisé l'essai gratuit
      const { data: existingTrial, error: checkError } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', userId)
        .eq('is_free_trial', true)
        .single();

      if (existingTrial) {
        throw new Error('Vous avez déjà utilisé votre essai gratuit');
      }

      // Créer l'abonnement gratuit directement actif
      const { data: sub, error: subErr } = await supabase
        .from('subscriptions')
        .insert([{
          user_id: userId,
          plan_id: selectedPlan.id,
          status: 'active',
          is_free_trial: true,
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + selectedPlan.duration_days * 24 * 60 * 60 * 1000).toISOString()
        }])
        .select()
        .single();

      if (subErr) throw new Error('Erreur création abonnement : ' + subErr.message);

      // Rediriger directement vers le dashboard
      onSubscribed();

    } catch (e: any) {
      setError(e.message ?? 'Erreur lors de l\'activation de l\'essai gratuit');
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (!selectedPlan || !paymentMethod || !phone.trim())
      return setError('Remplissez tous les champs');

    setError('');
    setLoading(true);
    let redirecting = false;

    try {
      const { data: sub, error: subErr } = await supabase
        .from('subscriptions')
        .insert([{ user_id: userId, plan_id: selectedPlan.id, status: 'pending', is_free_trial: false }])
        .select()
        .single();

      if (subErr) throw new Error('Erreur création abonnement : ' + subErr.message);

      const { error: payErr } = await supabase.from('payments').insert([{
        user_id: userId,
        subscription_id: sub.id,
        amount: selectedPlan.price,
        provider: paymentMethod,
        status: 'pending',
      }]);

      if (payErr) throw new Error('Erreur création paiement : ' + payErr.message);

      setSubscriptionId(sub.id);

      const res = await fetch(
        'https://vzhcjvvgpbtfolxnpapy.supabase.co/functions/v1/initiate-payment',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            subscription_id: sub.id,
            amount: selectedPlan.price,
            phone,
            method: paymentMethod,
            customer_name: salonName,
            customer_email: userEmail,
            description: `Abonnement ${selectedPlan.name} - La Coupe`,
          }),
        }
      );

      const data = await res.json();

      if (data.success && data.invoice_url) {
        redirecting = true;
        window.location.href = data.invoice_url;
        return;
      }

      throw new Error(data.error || "Erreur lors de l'initiation du paiement");

    } catch (e: any) {
      setError(e.message ?? 'Erreur lors du paiement');
    } finally {
      if (!redirecting) setLoading(false);
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
              <h1 className="text-white font-bold uppercase tracking-wider">
                {salonName}
              </h1>
              <p className="text-zinc-500 text-xs">La Coupe — Gestion de salon</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-zinc-500 hover:text-white transition flex items-center gap-1.5 text-sm"
          >
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>

        {/* ── Étape 1 : choisir un plan ── */}
        {step === 'choose' && (
          <div>
            <h2 className="text-white text-2xl font-bold mb-2">Choisissez votre abonnement</h2>
            <p className="text-zinc-400 text-sm mb-8">
              Accédez à tous les services du salon avec un abonnement actif.
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
                        ÉCONOMIE 17%
                      </span>
                    )}
                    {isFree && !hasUsedFreeTrial && (
                      <span className="absolute top-4 right-4 bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                        OFFERT
                      </span>
                    )}
                    {isFree && hasUsedFreeTrial && (
                      <span className="absolute top-4 right-4 bg-zinc-700 text-zinc-400 text-xs font-bold px-3 py-1 rounded-full">
                        DÉJÀ UTILISÉ
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
                        ? '1 mois d\'essai gratuit' 
                        : isAnnual
                          ? 'par an — soit ' + formatCFA(Math.round(plan.price / 12)) + '/mois'
                          : 'par mois'
                      }
                    </p>
                    {isFree && !hasUsedFreeTrial && (
                      <p className="text-green-400 text-xs ml-8 mt-2">
                        ✨ Offre valable une seule fois
                      </p>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                if (selectedPlan) {
                  if (selectedPlan.is_free) {
                    handleFreeTrial();
                  } else {
                    setStep('pay');
                  }
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
                selectedPlan?.is_free ? 'Commencer mon essai gratuit →' : 'Continuer →'
              )}
            </button>
          </div>
        )}

        {/* ── Étape 2 : paiement ── */}
        {step === 'pay' && selectedPlan && (
          <div>
            <button onClick={() => setStep('choose')} className="text-zinc-400 mb-6 text-sm">
              ← Retour
            </button>
            <h2 className="text-white text-2xl font-bold mb-2">Paiement</h2>
            <p className="text-zinc-400 text-sm mb-8">
              Abonnement <span className="text-white font-bold">{selectedPlan.name}</span>{' '}
              — {formatCFA(selectedPlan.price)}
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
                      onError={(e) => {
                        e.currentTarget.src = '../images/fallback.png';
                      }}
                    />
                    {m.label}
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
                placeholder="+221 77 000 00 00"
                className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 border border-zinc-600 focus:outline-none focus:border-white transition"
              />
            </div>

            {error && (
              <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">
                {error}
              </div>
            )}

            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mb-6 flex justify-between items-center">
              <span className="text-zinc-400 text-sm">Total à payer</span>
              <span className="text-white text-xl font-bold">{formatCFA(selectedPlan.price)}</span>
            </div>

            <button
              onClick={handlePay}
              disabled={loading}
              className="w-full bg-white text-black py-4 rounded-xl font-bold text-base hover:bg-zinc-200 transition disabled:opacity-50"
            >
              {loading
                ? <span className="flex items-center justify-center gap-2">
                    <Loader className="w-4 h-4 animate-spin" /> Traitement...
                  </span>
                : `Payer ${formatCFA(selectedPlan.price)}`
              }
            </button>
          </div>
        )}

        {/* ── Étape 3 : en attente ── */}
        {step === 'pending' && selectedPlan && (
          <div className="text-center py-12">
            <Loader className="w-12 h-12 text-white mx-auto mb-6 animate-spin" />
            <h2 className="text-white text-2xl font-bold mb-3">Paiement en attente</h2>
            <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
              Confirmez le paiement sur votre téléphone.<br />
              Cette page se mettra à jour automatiquement une fois le paiement validé.
            </p>
            <div className="mt-8 bg-zinc-900 border border-zinc-700 rounded-xl px-6 py-4 inline-block">
              <p className="text-zinc-400 text-xs">Montant</p>
              <p className="text-white text-2xl font-bold">{formatCFA(selectedPlan.price)}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}