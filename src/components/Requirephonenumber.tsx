// src/components/RequirePhoneNumber.tsx
//
// À placer une seule fois, tout en haut de l'app (dans App.tsx ou Dashboard.tsx),
// juste au-dessus / autour du reste du contenu, une fois l'utilisateur connecté :
//
//   <RequirePhoneNumber userId={currentUserId}>
//     {/* ... le reste de ton app ... */}
//   </RequirePhoneNumber>
//
// Si le champ "phone" de profiles_v3 est vide pour cet utilisateur,
// un message d'alerte s'affiche dans le dashboard pour l'inviter à renseigner son numéro.
// Une fois enregistré dans Supabase, il apparaît automatiquement dans AdminPanel.

import { useEffect, useState } from 'react';
import { Phone, CheckCircle2, Loader2, X, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RequirePhoneNumberProps {
  userId: string;
  children: React.ReactNode;
}

// Préfixes mobiles sénégalais valides (mêmes que dans AdminPanel)
const VALID_PREFIXES = ['77', '78', '76', '70', '75'];

function cleanPhone(raw: string): string {
  return raw.replace(/\s/g, '').replace(/^\+?221/, '');
}

function isValidSenegalPhone(raw: string): boolean {
  const cleaned = cleanPhone(raw);
  if (!/^\d{9}$/.test(cleaned)) return false;
  return VALID_PREFIXES.some(p => cleaned.startsWith(p));
}

export default function RequirePhoneNumber({ userId, children }: RequirePhoneNumberProps) {
  const [checking, setChecking] = useState(true);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showAlert, setShowAlert] = useState(true);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!userId) return;
    checkPhone();
  }, [userId]);

  const checkPhone = async () => {
    setChecking(true);
    try {
      console.log('[RequirePhoneNumber] Vérification pour userId =', userId);

      const { data, error } = await supabase
        .from('profiles_v3')
        .select('phone')
        .eq('id', userId)
        .maybeSingle();

      console.log('[RequirePhoneNumber] Résultat Supabase:', { data, error });

      if (error) {
        console.error('[RequirePhoneNumber] Erreur Supabase:', error.message, error);
        setNeedsPhone(false);
        return;
      }

      if (!data) {
        console.warn('[RequirePhoneNumber] Aucune ligne profiles_v3 trouvée pour id =', userId);
        setNeedsPhone(false);
        return;
      }

      const hasPhone = !!(data.phone && data.phone.trim() !== '');
      console.log('[RequirePhoneNumber] phone en base =', JSON.stringify(data.phone), '→ needsPhone =', !hasPhone);
      setNeedsPhone(!hasPhone);
    } catch (err) {
      console.error('[RequirePhoneNumber] Exception inattendue:', err);
      setNeedsPhone(false);
    } finally {
      setChecking(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isValidSenegalPhone(phoneInput)) {
      setError('Numéro invalide. Exemple : 77 123 45 67');
      return;
    }

    setSaving(true);
    try {
      const cleaned = cleanPhone(phoneInput);
      const { error: updateError } = await supabase
        .from('profiles_v3')
        .update({ phone: cleaned })
        .eq('id', userId);

      if (updateError) throw updateError;

      setSuccess(true);
      setTimeout(() => {
        setNeedsPhone(false);
        setShowForm(false);
        setSuccess(false);
      }, 2000);
    } catch (err) {
      console.error('Erreur enregistrement téléphone:', err);
      setError("Une erreur est survenue, réessayez.");
    } finally {
      setSaving(false);
    }
  };

  // Pendant la vérification initiale, on ne bloque pas l'affichage
  if (checking) {
    return <>{children}</>;
  }

  if (!needsPhone) {
    return <>{children}</>;
  }

  return (
    <>
      {children}

      {/* Bannière d'alerte non-bloquante */}
      {showAlert && !showForm && !success && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4 animate-in slide-in-from-top-2 duration-300">
          <div className="bg-gradient-to-r from-amber-900/90 to-amber-800/90 backdrop-blur-sm border border-amber-700/50 rounded-2xl p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-10 h-10 rounded-full bg-amber-600/20 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-white font-semibold text-sm">Numéro de téléphone requis</h4>
                    <p className="text-amber-200/80 text-sm mt-0.5">
                      Pour finaliser votre compte et profiter de toutes les fonctionnalités, veuillez ajouter votre numéro de téléphone.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAlert(false)}
                    className="flex-shrink-0 text-amber-400/60 hover:text-amber-300 transition p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      setShowAlert(false);
                      setShowForm(true);
                    }}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition"
                  >
                    Ajouter mon numéro
                  </button>
                  <button
                    onClick={() => setShowAlert(false)}
                    className="px-4 py-1.5 bg-amber-800/40 hover:bg-amber-800/60 text-amber-200 text-xs font-medium rounded-lg transition"
                  >
                    Plus tard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Formulaire compact (non-bloquant) */}
      {showForm && !success && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-0 duration-200">
          <div 
            className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-600/20 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-white font-bold text-lg">Ajouter un numéro</h3>
              </div>
              <button
                onClick={() => setShowForm(false)}
                className="text-zinc-500 hover:text-zinc-300 transition p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-zinc-400 text-sm mb-4">
              Entrez votre numéro de téléphone sénégalais pour finaliser votre compte.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-zinc-400 text-xs mb-1.5">Numéro de téléphone</label>
                <input
                  type="tel"
                  inputMode="numeric"
                  autoFocus
                  placeholder="77 123 45 67"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-amber-500 transition"
                />
                {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl font-medium transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving || phoneInput.trim() === ''}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Enregistrement...
                    </>
                  ) : (
                    'Valider'
                  )}
                </button>
              </div>

              <p className="text-zinc-600 text-xs text-center">
                Ce numéro nous permet de vous contacter concernant votre abonnement et vos réservations.
              </p>
            </form>
          </div>
        </div>
      )}

      {/* Message de succès */}
      {success && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in-0 duration-200">
          <div className="bg-zinc-900 border border-green-700/50 rounded-2xl w-full max-w-sm p-6 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-3" />
            <h3 className="text-white font-bold text-lg">Numéro enregistré !</h3>
            <p className="text-zinc-400 text-sm mt-1">Votre compte est maintenant complet.</p>
          </div>
        </div>
      )}
    </>
  );
}