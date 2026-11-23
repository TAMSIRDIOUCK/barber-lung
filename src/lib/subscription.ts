// src/lib/subscription.ts
import { supabase } from './supabase';

export interface SubscriptionState {
  isActive: boolean;
  status: string | null;
  reason?: string;
}

export async function checkSalonSubscription(
  salonUserId: string
): Promise<SubscriptionState> {
  if (!salonUserId) {
    return { isActive: false, status: null, reason: 'user_id manquant' };
  }

  try {
    const { data: subs, error } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', salonUserId);

    // 🔥 LOG POUR VOIR CE QUI SE PASSE
    console.log('🔍 CHECK SUBSCRIPTION:', {
      salonUserId,
      subs,
      error: error?.message,
      count: subs?.length
    });

    if (error) {
      console.error('⚠️ Erreur checkSalonSubscription:', error.message);
      return { isActive: false, status: null, reason: 'Erreur lecture' };
    }

    if (!subs || subs.length === 0) {
      return { isActive: false, status: null, reason: 'Aucun abonnement' };
    }

    const activeSub = subs.find((s) => {
      const st = (s.status || '').toLowerCase().trim();
      return st === 'active' || st === 'actif';
    });

    if (activeSub) {
      return { isActive: true, status: 'active' };
    }

    return {
      isActive: false,
      status: subs[0].status,
      reason: 'Statut inactif'
    };
  } catch (err) {
    console.error('❌ Exception checkSalonSubscription:', err);
    return { isActive: false, status: null, reason: 'Erreur' };
  }
}