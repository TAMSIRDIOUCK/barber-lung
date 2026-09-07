// src/components/ChangePasswordModal.tsx
import { useState } from 'react';
import { X, Lock, Eye, EyeOff, CheckCircle2, Loader } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface ChangePasswordModalProps {
  onClose: () => void;
}

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      // 1. Récupérer l'utilisateur connecté pour vérifier l'ancien mot de passe
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setError("Impossible de récupérer votre email.");
        setLoading(false);
        return;
      }

      // 2. Vérifier l'ancien mot de passe en tentant une re-connexion
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (signInError) {
        setError('Mot de passe actuel incorrect.');
        setLoading(false);
        return;
      }

      // 3. Mettre à jour le mot de passe
      const { error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) {
        setError(updateError.message || 'Une erreur est survenue.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Erreur changement mot de passe:', err);
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-500 hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-6">
          <div className="bg-white w-9 h-9 rounded-lg flex items-center justify-center">
            <Lock className="w-4 h-4 text-black" />
          </div>
          <h2 className="text-white text-lg font-bold">Modifier le mot de passe</h2>
        </div>

        {success ? (
          <div className="text-center py-6">
            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-green-400" />
            </div>
            <p className="text-white font-semibold">Mot de passe modifié avec succès !</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl">
                {error}
              </div>
            )}

            <div>
              <label className="block text-zinc-400 text-xs font-medium mb-1.5">
                Mot de passe actuel
              </label>
              <div className="relative">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-white transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 text-xs font-medium mb-1.5">
                Nouveau mot de passe
              </label>
              <div className="relative">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:border-white transition"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-zinc-400 text-xs font-medium mb-1.5">
                Confirmer le nouveau mot de passe
              </label>
              <input
                type={showNew ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full bg-zinc-800 border border-zinc-700 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-white transition"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-white text-black font-bold py-2.5 rounded-xl hover:bg-zinc-200 transition flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" /> Mise à jour...
                </>
              ) : (
                'Mettre à jour le mot de passe'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}