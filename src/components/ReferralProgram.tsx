// src/components/ReferralProgram.tsx
import { useState, useEffect } from 'react';
import { Share2, Gift, Users, CheckCircle, Loader, X, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ReferralProgramProps {
  userId: string;
  userName: string;
}

export function ReferralProgram({ userId, userName }: ReferralProgramProps) {
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [referralCount, setReferralCount] = useState(0);
  const [rewardedCount, setRewardedCount] = useState(0);

  useEffect(() => {
    loadReferralStats();
  }, [userId]);

  const loadReferralStats = async () => {
    const { data } = await supabase
      .from('referrals')
      .select('status')
      .eq('referrer_user_id', userId);
    
    if (data) {
      setReferralCount(data.length);
      setRewardedCount(data.filter(r => r.status === 'rewarded').length);
    }
  };

  const generateReferralLink = () => {
    return `${window.location.origin}?ref=${userId}`;
  };

  // Nettoyer le numéro de téléphone pour WhatsApp
  const formatPhoneForWhatsApp = (phone: string): string => {
    let cleaned = phone.replace(/\s/g, '').replace(/^\+?221/, '');
    if (!cleaned.startsWith('77') && !cleaned.startsWith('78') && !cleaned.startsWith('76') && !cleaned.startsWith('70') && !cleaned.startsWith('75')) {
      cleaned = '77' + cleaned;
    }
    return `221${cleaned}`;
  };

  // Message complet pour le salon invité
  const getInvitationMessage = (salonName: string, salonPhone: string) => {
    return `🔥 *GAGNEZ 1000 FCFA AVEC LE COUPE* 🔥

Bonjour ${salonName} !

${userName || 'Un utilisateur'} vous invite à découvrir *LE COUPE*, l'application de gestion pour salons de coiffure.

Avec *LE COUPE*, parrainez d'autres salons et gagnez *1000 FCFA* !

✅ *Comment ça marche ?*
1. Inscrivez-vous via ce lien : ${generateReferralLink()}
2. Utilisez l'application
3. Parrainez d'autres salons
4. Gagnez 1000 FCFA par parrainage avec abonnement actif

💰 *CONDITION :* Les 1000 FCFA sont envoyés UNIQUEMENT si le salon parrainé a souscrit à un abonnement actif.

🔗 *LIEN D'INSCRIPTION :* ${generateReferralLink()}

📞 *Téléphone du parrain :* ${salonPhone}

💈 *LE COUPE* - La solution de gestion pour coiffeurs

*🔁 N'HÉSITEZ PAS À REPARTAGER CE MESSAGE À D'AUTRES SALONS !*

⚠️ *Rappel :* Les 1000 FCFA sont versés uniquement après activation de l'abonnement.`;
  };

  // Fonction qui fonctionne sur mobile ET desktop
  const openWhatsApp = (phoneNumber: string, message: string) => {
    if (!phoneNumber) return;
    
    const formattedPhone = formatPhoneForWhatsApp(phoneNumber);
    const encodedMessage = encodeURIComponent(message);
    
    // Utiliser window.location.href pour forcer la redirection
    // Cela fonctionne mieux sur mobile
    window.location.href = `https://wa.me/${formattedPhone}?text=${encodedMessage}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name.trim() || !formData.phone.trim()) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Enregistrer le parrainage dans la base de données
      const { error: insertError } = await supabase.from('referrals').insert({
        referrer_user_id: userId,
        referred_name: formData.name.trim(),
        referred_phone: formData.phone.trim(),
        status: 'pending'
      });

      if (insertError) throw insertError;
      
      // Réinitialiser le formulaire
      const invitedName = formData.name;
      const invitedPhone = formData.phone;
      setFormData({ name: '', phone: '' });
      loadReferralStats();
      
      setSuccess(true);
      
      // Fermer le modal après 2 secondes
      setTimeout(() => {
        setShowForm(false);
        setSuccess(false);
      }, 2000);
      
      // Rediriger vers WhatsApp APRES avoir fermé le modal
      // Petit délai pour que le modal se ferme correctement
      setTimeout(() => {
        const message = getInvitationMessage(invitedName, invitedPhone);
        openWhatsApp(invitedPhone, message);
      }, 500);
      
    } catch (err) {
      setError('Erreur lors de l\'enregistrement');
      console.error(err);
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const [formData, setFormData] = useState({ name: '', phone: '' });

  return (
    <div className="bg-gradient-to-r from-emerald-950/40 to-green-950/30 border border-emerald-500/30 rounded-xl p-3">
      {/* Ligne 1: Titre + stats compactes */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-emerald-500/20 rounded-full flex items-center justify-center">
            <Gift className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-white text-sm font-bold">Gagnez 1000 FCFA</p>
            <p className="text-emerald-400 text-[9px]">Parrainage avec abonnement actif</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-white text-sm font-bold">{referralCount}</p>
            <p className="text-zinc-500 text-[8px]">Parrainés</p>
          </div>
          <div className="text-center">
            <p className="text-white text-sm font-bold">{rewardedCount}</p>
            <p className="text-zinc-500 text-[8px]">Récompensés</p>
          </div>
          <div className="text-center bg-emerald-500/10 rounded-lg px-2 py-1">
            <p className="text-emerald-400 text-xs font-bold">{(referralCount * 1000).toLocaleString()} CFA</p>
            <p className="text-zinc-500 text-[8px]">Gains</p>
          </div>
        </div>
      </div>

      {/* Ligne 2: UNIQUEMENT bouton Inviter */}
      <button
        onClick={() => setShowForm(true)}
        className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition active:scale-[0.98]"
      >
        <Users className="w-4 h-4" />
        Inviter un salon et gagner 1000 FCFA
      </button>

      {/* Ligne 3: Message info compact */}
      <p className="text-zinc-600 text-[9px] text-center mt-2">
        💰 +1000 CFA par salon avec abonnement actif | 🔁 Le message peut être repartagé
      </p>

      {/* Modal Formulaire */}
      {showForm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-zinc-900 rounded-xl max-w-sm w-full p-4 border border-zinc-700" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-white font-bold text-base flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-400" />
                Inviter un salon
              </h3>
              <button onClick={() => setShowForm(false)} className="text-zinc-400 hover:text-white p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            {success ? (
              <div className="text-center py-4">
                <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-white font-bold text-sm">Invitation envoyée !</p>
                <p className="text-zinc-400 text-xs mt-1">1000 FCFA après abonnement actif</p>
                <p className="text-emerald-400/70 text-[10px] mt-2">Redirection vers WhatsApp...</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <label className="text-zinc-500 text-xs block mb-1">Nom du salon *</label>
                  <input
                    type="text"
                    placeholder="Ex: Aliou Coiffure"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full p-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-zinc-500 text-xs block mb-1">Téléphone du salon *</label>
                  <input
                    type="tel"
                    placeholder="77 123 45 67"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full p-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm focus:outline-none focus:border-emerald-500"
                    required
                  />
                  <p className="text-zinc-600 text-[10px] mt-1">Format Sénégal : 77 123 45 67</p>
                </div>
                {error && (
                  <p className="text-red-400 text-xs flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2 rounded-lg text-sm flex items-center justify-center gap-2 transition disabled:opacity-50 active:scale-[0.98]"
                >
                  {loading ? (
                    <Loader className="w-4 h-4 animate-spin" />
                  ) : (
                    <Share2 className="w-4 h-4" />
                  )}
                  {loading ? 'Envoi en cours...' : 'Inviter sur WhatsApp'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}