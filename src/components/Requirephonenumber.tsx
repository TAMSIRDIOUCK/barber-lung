// src/components/RequirePhoneNumber.tsx
//
// À placer une seule fois, tout en haut de l'app (dans App.tsx ou Dashboard.tsx),
// juste au-dessus / autour du reste du contenu, une fois l'utilisateur connecté :
//
//   <RequirePhoneNumber userId={currentUserId}>
//     {/* ... le reste de ton app ... */}
//   </RequirePhoneNumber>
//
// Tant que le champ "phone" de profiles_v3 est vide pour cet utilisateur,
// une modale bloquante s'affiche par-dessus tout et l'empêche d'utiliser
// l'app tant qu'il n'a pas renseigné son numéro. Une fois enregistré dans
// Supabase, il apparaît automatiquement dans AdminPanel comme les autres
// (AdminPanel lit déjà profiles_v3.phone).

import { useEffect, useState } from 'react';
import { Phone, CheckCircle2, Loader2 } from 'lucide-react';
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

  useEffect(() => {
    if (!userId) return;
    checkPhone();
  }, [userId]);

  const checkPhone = async () => {
    setChecking(true);
    try {
      const { data, error } = await supabase
        .from('profiles_v3')
        .select('phone')
        .eq('id', userId)
        .single();

      if (error) throw error;

      const hasPhone = !!(data?.phone && data.phone.trim() !== '');
      setNeedsPhone(!hasPhone);
    } catch (err) {
      console.error('Erreur vérification téléphone:', err);
      // en cas d'erreur réseau on ne bloque pas l'utilisateur
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
      }, 1200);
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

      {/* Overlay bloquant */}
      <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-sm p-6 shadow-2xl">
          {success ? (
            <div className="text-center py-6">
              <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-3" />
              <h3 className="text-white font-bold text-lg">Numéro enregistré !</h3>
              <p className="text-zinc-400 text-sm mt-1">Votre compte est maintenant complet.</p>
            </div>
          ) : (
            <>
              <div className="flex flex-col items-center text-center mb-5">
                <div className="w-14 h-14 rounded-full bg-green-600/20 flex items-center justify-center mb-3">
                  <Phone className="w-7 h-7 text-green-500" />
                </div>
                <h3 className="text-white font-bold text-lg">Terminez votre inscription</h3>
                <p className="text-zinc-400 text-sm mt-1">
                  Ajoutez votre numéro de téléphone pour finaliser votre compte et accéder à l'application.
                </p>
              </div>

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
                    className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder-zinc-600 focus:outline-none focus:border-green-500 transition"
                  />
                  {error && <p className="text-red-400 text-xs mt-1.5">{error}</p>}
                </div>

                <button
                  type="submit"
                  disabled={saving || phoneInput.trim() === ''}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Enregistrement...
                    </>
                  ) : (
                    'Valider mon numéro'
                  )}
                </button>

                <p className="text-zinc-600 text-xs text-center">
                  Ce numéro nous permet de vous contacter concernant votre abonnement et vos réservations.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </>
  );
}