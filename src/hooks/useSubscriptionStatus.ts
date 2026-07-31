// src/hooks/useSubscriptionStatus.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useSubscriptionStatus(userId: string) {
  const [subscription, setSubscription] = useState<any>(null);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [needsRenewal, setNeedsRenewal] = useState(false);

  useEffect(() => {
    const check = async () => {
      const { data } = await supabase
        .from('subscriptions')
        .select('*, subscription_plans(*)')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('expires_at', { ascending: false })
        .maybeSingle();

      if (!data) return;

      setSubscription(data);
      if (!data.expires_at) return;

      const end = new Date(data.expires_at).getTime();
      const diffDays = Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
      setDaysLeft(diffDays);
      setNeedsRenewal(diffDays <= 5 && diffDays >= 0);
    };

    check();
  }, [userId]);

  return { subscription, daysLeft, needsRenewal };
}