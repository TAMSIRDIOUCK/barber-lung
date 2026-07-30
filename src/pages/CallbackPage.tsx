// src/pages/CallbackPage.tsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader, CheckCircle2, XCircle } from 'lucide-react';

export function CallbackPage() {
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Traitement en cours...');

  useEffect(() => {
    const processCallback = async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(hash.split('?')[1]);
      const subscriptionId = params.get('subscription_id');
      const token = params.get('token');

      console.log('📞 Callback reçu:', { subscriptionId, hasToken: !!token });

      // Si on a un token dans l'URL, essayer de restaurer la session
      if (token) {
        try {
          // Restaurer la session avec le token
          const { data, error } = await supabase.auth.setSession({
            access_token: token,
            refresh_token: ''
          });

          if (error) {
            console.warn('Impossible de restaurer la session:', error);
          } else {
            console.log('✅ Session restaurée avec succès');
          }
        } catch (err) {
          console.warn('Erreur restauration session:', err);
        }
      }

      // Vérifier le statut de l'abonnement
      if (subscriptionId) {
        let attempts = 0;
        const maxAttempts = 10;

        const checkSubscription = setInterval(async () => {
          attempts++;
          
          try {
            const { data: subscription } = await supabase
              .from('subscriptions')
              .select('status')
              .eq('id', parseInt(subscriptionId))
              .maybeSingle();

            if (subscription?.status === 'active') {
              clearInterval(checkSubscription);
              setStatus('success');
              setMessage('✅ Paiement réussi ! Redirection...');
              
              setTimeout(() => {
                window.location.href = '/';
              }, 2000);
            } else if (attempts >= maxAttempts) {
              clearInterval(checkSubscription);
              setStatus('success');
              setMessage('Paiement confirmé ! Redirection...');
              
              setTimeout(() => {
                window.location.href = '/';
              }, 2000);
            }
          } catch (err) {
            console.error('Erreur vérification:', err);
          }
        }, 2000);

        return () => clearInterval(checkSubscription);
      } else {
        // Pas d'ID d'abonnement, rediriger vers l'accueil
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    };

    processCallback();
  }, []);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {status === 'processing' && (
          <>
            <Loader className="w-16 h-16 text-white mx-auto mb-4 animate-spin" />
            <h2 className="text-white text-xl font-bold">{message}</h2>
            <p className="text-zinc-400 mt-2">Veuillez patienter...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-10 h-10 text-green-400" />
            </div>
            <h2 className="text-white text-2xl font-bold mb-2">✅ {message}</h2>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-10 h-10 text-red-400" />
            </div>
            <h2 className="text-white text-2xl font-bold mb-2">❌ {message}</h2>
          </>
        )}
      </div>
    </div>
  );
}