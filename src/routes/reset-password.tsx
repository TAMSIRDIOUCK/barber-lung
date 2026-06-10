// src/routes/reset-password.tsx
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Scissors, Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Vérifier si l'utilisateur a un token valide
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Lien invalide ou expiré. Veuillez réessayer.');
      }
    };
    checkSession();
  }, []);

  const handleResetPassword = async () => {
    setError('');
    setSuccess('');
    
    if (!password) {
      setError('Veuillez entrer un nouveau mot de passe');
      return;
    }
    
    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }
    
    setLoading(true);
    
    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });
      
      if (error) {
        setError(error.message);
      } else {
        setSuccess('Mot de passe mis à jour avec succès !');
        setTimeout(() => {
          navigate('/');
        }, 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Une erreur est survenue');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4">
            <Scissors className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-white text-3xl font-bold tracking-tight">LA COUPE</h1>
          <p className="text-zinc-500 text-sm mt-1">Réinitialisation du mot de passe</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8">
          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">
                Nouveau mot de passe <span className="text-zinc-600 normal-case font-normal">(6 caractères minimum)</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
                  placeholder="••••••••"
                  className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 pr-12 border border-zinc-600 focus:outline-none focus:border-white transition"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()}
                  placeholder="••••••••"
                  className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 pr-12 border border-zinc-600 focus:outline-none focus:border-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition"
                >
                  {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="bg-green-950 border border-green-700 text-green-300 text-sm rounded-xl px-4 py-3 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <button
              onClick={handleResetPassword}
              disabled={loading}
              className="w-full bg-white text-black py-4 rounded-xl font-bold text-base hover:bg-zinc-200 transition disabled:opacity-50 mt-2"
            >
              {loading ? 'Mise à jour...' : 'Mettre à jour le mot de passe'}
            </button>

            <button
              onClick={() => navigate('/')}
              className="w-full text-zinc-500 hover:text-white text-sm transition py-2"
            >
              ← Retour à la connexion
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}