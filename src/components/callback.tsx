// src/routes/auth/callback.tsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './../lib/supabase';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Récupérer la session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Erreur callback:', error);
          navigate('/');
          return;
        }
        
        if (session) {
          console.log('✅ Authentification réussie');
          navigate('/dashboard');
        } else {
          navigate('/');
        }
      } catch (err) {
        console.error('Erreur:', err);
        navigate('/');
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-white text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
        <p>Connexion en cours...</p>
      </div>
    </div>
  );
}