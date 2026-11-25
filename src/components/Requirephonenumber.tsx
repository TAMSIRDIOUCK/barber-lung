// src/components/Requirephonenumber.tsx
import { useEffect, useState } from 'react';
import { Phone, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Props {
  userId: string;
  children: React.ReactNode;
}

const VALID_PREFIXES = ['77', '78', '76', '70', '75'];

function cleanPhone(raw: string) {
  return raw.replace(/[^\d+]/g, '').replace(/^\+?221/, '');
}

function isValidSenegalPhone(raw: string) {
  const c = cleanPhone(raw);
  return /^\d{9}$/.test(c) && VALID_PREFIXES.some(p => c.startsWith(p));
}

export default function RequirePhoneNumber({ userId, children }: Props) {
  const [checking, setChecking] = useState(true);
  const [needsPhone, setNeedsPhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!userId) { setChecking(false); return; }

    supabase
      .from('profiles_v3')
      .select('id, phone')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('[RequirePhoneNumber] Erreur lecture:', error);
        }
        if (data) {
          setNeedsPhone(!data.phone?.trim());
        } else {
          // Profil manquant → on considère qu'on a besoin du téléphone (mais on ne crée rien)
          setNeedsPhone(true);
        }
        setChecking(false);
      });
  }, [userId]);

  const savePhone = async () => {
    if (!isValidSenegalPhone(phone)) {
      setError('Numéro invalide. Ex: 77 123 45 67');
      return;
    }
    setSaving(true);
    setError('');

    const { error: updErr } = await supabase
      .from('profiles_v3')
      .update({ phone: cleanPhone(phone) })
      .eq('id', userId);

    if (updErr) {
      setError(updErr.message);
      setSaving(false);
      return;
    }

    setNeedsPhone(false);
    setShowForm(false);
    setSaving(false);
  };

  if (checking) return <>{children}</>;

  return (
    <>
      {children}
      {needsPhone && showForm && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm space-y-4">
            <h2 className="text-white font-bold text-lg">Ajouter un numéro</h2>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="77 123 45 67"
              className="w-full bg-zinc-800 text-white px-4 py-3 rounded-xl"
            />
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setShowForm(false)} className="flex-1 bg-zinc-700 text-white py-2 rounded-xl">Annuler</button>
              <button onClick={savePhone} disabled={saving} className="flex-1 bg-white text-black py-2 rounded-xl font-bold">
                {saving ? 'Sauvegarde...' : 'Valider'}
              </button>
            </div>
          </div>
        </div>
      )}

      {needsPhone && !showForm && (
        <div className="fixed bottom-4 right-4 z-50 max-w-xs bg-amber-900/90 border border-amber-600 rounded-xl p-4">
          <p className="text-white text-sm font-semibold">📱 Numéro requis</p>
          <button onClick={() => setShowForm(true)} className="mt-2 bg-amber-500 text-black px-3 py-1 rounded text-xs font-bold">
            Ajouter
          </button>
        </div>
      )}
    </>
  );
}