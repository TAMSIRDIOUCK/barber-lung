// src/components/RequirePhoneNumber.tsx
import { useEffect, useState } from 'react';
import { Phone, CheckCircle2, Loader2, X, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface RequirePhoneNumberProps {
  userId: string;
  children: React.ReactNode;
}

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
  const [profileRowId, setProfileRowId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    checkPhone();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const checkPhone = async () => {
    setChecking(true);
    try {
      console.log('[RequirePhoneNumber] Vérification pour userId =', userId);

      // 🔥 ESSAI 1 : chercher par user_id
      let { data, error } = await supabase
        .from('profiles_v3')
        .select('id, phone')
        .eq('user_id', userId)
        .maybeSingle();

      console.log('[RequirePhoneNumber] Résultat (user_id):', { data, error });

      // 🔥 ESSAI 2 : si rien, chercher par id (ancien schéma)
      if (!data && !error) {
        const { data: dataById, error: errorById } = await supabase
          .from('profiles_v3')
          .select('id, phone')
          .eq('id', userId)
          .maybeSingle();
        console.log('[RequirePhoneNumber] Résultat (id):', { data: dataById, error: errorById });
        data = dataById;
        error = errorById;
      }

      // 🔥 Si toujours rien → créer le profil automatiquement
      if (!data && !error) {
        console.warn('[RequirePhoneNumber] Aucun profil trouvé, création automatique...');
        const { data: created, error: createErr } = await supabase
          .from('profiles_v3')
          .insert({
            user_id: userId,
            phone: null,
            role: 'user',
            created_at: new Date().toISOString(),
          })
          .select('id, phone')
          .single();

        if (createErr) {
          console.error('[RequirePhoneNumber] Erreur création profil:', createErr);
          setNeedsPhone(false);
          return;
        }
        data = created;
      }

      if (error) {
        console.error('[RequirePhoneNumber] Erreur Supabase:', error.message);
        setNeedsPhone(false);
        return;
      }

      if (!data) {
        console.warn('[RequirePhoneNumber] Aucun profil accessible');
        setNeedsPhone(false);
        return;
      }

      setProfileRowId(data.id);
      const hasPhone = !!(data.phone && data.phone.trim() !== '');
      console.log('[RequirePhoneNumber] phone en base =', JSON.stringify(data.phone), '→ needsPhone =', !hasPhone);
      setNeedsPhone(!hasPhone);
    } catch (err) {
      console.error('[RequirePhoneNumber] Exception:', err);
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

    if (!profileRowId) {
      setError("Impossible de trouver votre profil.");
      return;
    }

    setSaving(true);
    try {
      const cleaned = cleanPhone(phoneInput);
      const { error: updateError } = await supabase
        .from('profiles_v3')
        .update({ phone: cleaned })
        .eq('id', profileRowId);

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

  if (checking) return <>{children}</>;
  if (!needsPhone) return <>{children}</>;

  return (
    <>
      {children}

      {showAlert && !showForm && !success && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl px-4">
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
                  <button onClick={() => setShowAlert(false)} className="flex-shrink-0 text-amber-400/60 hover:text-amber-300 transition p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => { setShowAlert(false); setShowForm(true); }}
                    className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition"
                  >
                    Ajouter mon numéro
                  </button>
                  <button onClick={() => setShowAlert(false)} className="px-4 py-1.5 bg-amber-800/40 hover:bg-amber-800/60 text-amber-200 text-xs font-medium rounded-lg transition">
                    Plus tard
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showForm && !success && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-600/20 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-amber-400" />
                </div>
                <h3 className="text-white font-bold text-lg">Ajouter un numéro</h3>
              </div>
              <button onClick={() => setShowForm(false)} className="text-zinc-500 hover:text-zinc-300 transition p-1">
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
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded-xl font-medium transition">
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={saving || phoneInput.trim() === ''}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white rounded-xl font-medium transition"
                >
                  {saving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Enregistrement...</>) : ('Valider')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {success && (
        <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-green-700/50 rounded-2xl w-full max-w-sm p-6 text-center shadow-2xl">
            <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto mb-3" />
            <h3 className="text-white font-bold text-lg">Numéro enregistré !</h3>
            <p className="text-zinc-400 text-sm mt-1">Votre compte est maintenant complet.</p>
          </div>
        </div>
      )}
    </>
  );
}