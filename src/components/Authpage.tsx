// src/components/AuthPage.tsx
import { useState, useEffect } from 'react';
import { Scissors, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

const PROFILE_TABLE = import.meta.env.VITE_APP_PROFILE_TABLE ?? 'profiles_v3';
const APP_NAME      = import.meta.env.VITE_APP_NAME ?? 'LA COUPE';

type Mode = 'login' | 'register' | 'reset';

interface PasswordInputProps {
  value: string;
  onChange: (v: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  show: boolean;
  onToggle: () => void;
  placeholder?: string;
  autoComplete?: string;
}

function PasswordInput({
  value, onChange, onKeyDown, show, onToggle,
  placeholder = '••••••••',
  autoComplete = 'current-password',
}: PasswordInputProps) {
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 pr-12 border border-zinc-600 focus:outline-none focus:border-white transition"
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition"
        tabIndex={-1}
      >
        {show ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );
}

interface AuthPageProps {
  onBack?: () => void;
  onAuthSuccess?: () => void;
}

// ── FIX : utilise import.meta.env (Vite) au lieu de process.env (Node) ──
const getBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location.origin !== 'null') {
    return window.location.origin;
  }
  // Fallback Vite-native (variable à préfixer VITE_ dans .env)
  const vercelUrl = import.meta.env.VITE_VERCEL_URL;
  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }
  return 'http://localhost:5173';
};

export function AuthPage({ onBack, onAuthSuccess }: AuthPageProps) {
  const [mode, setMode]                               = useState<Mode>('login');
  const [fullName, setFullName]                       = useState('');
  const [phone, setPhone]                             = useState('');
  const [email, setEmail]                             = useState('');
  const [password, setPassword]                       = useState('');
  const [confirmPassword, setConfirmPassword]         = useState('');
  const [showPassword, setShowPassword]               = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError]                             = useState('');
  const [loading, setLoading]                         = useState(false);
  const [success, setSuccess]                         = useState('');
  const [showVerification, setShowVerification]       = useState(false);
  const [verifEmail, setVerifEmail]                   = useState('');
  const [isProcessingCallback, setIsProcessingCallback] = useState(false);

  // Gérer le callback OAuth et la réinitialisation
  useEffect(() => {
    const handleCallback = async () => {
      const hash = window.location.hash;
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const type = params.get('type');

      if (hash || code || type === 'recovery') {
        setIsProcessingCallback(true);
        console.log('🔐 Traitement du callback...');

        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Erreur callback:', error);
          setError(translateError(error.message));
          setIsProcessingCallback(false);
        } else if (session) {
          console.log('✅ Session récupérée avec succès');
          window.history.replaceState({}, document.title, window.location.pathname);
          setIsProcessingCallback(false);
          if (onAuthSuccess) onAuthSuccess();
        } else {
          setIsProcessingCallback(false);
        }
      }
    };

    handleCallback();
  }, [onAuthSuccess]);

  // Source de vérité UNIQUE pour la redirection : onAuthStateChange
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session && onAuthSuccess) {
        onAuthSuccess();
      }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('🔐 Auth state change:', event);

      if (event === 'SIGNED_IN' && session) {
        console.log('✅ Utilisateur connecté, redirection automatique...');
        if (onAuthSuccess) onAuthSuccess();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [onAuthSuccess]);

  const translateError = (msg: string): string => {
    if (!msg) return 'Une erreur est survenue';
    if (msg.includes('already registered') || msg.includes('User already registered'))
      return 'Cet email est déjà utilisé. Connectez-vous ou réinitialisez votre mot de passe.';
    if (msg.includes('Password should be at least'))
      return 'Mot de passe trop court (6 caractères minimum).';
    if (msg.includes('Invalid login') || msg.includes('invalid_credentials'))
      return 'Email ou mot de passe incorrect.';
    if (msg.includes('Email not confirmed'))
      return 'Email non confirmé. Vérifiez votre boîte mail.';
    if (msg.includes('signup is disabled') || msg.includes('Signups not allowed'))
      return 'Les inscriptions sont désactivées.';
    if (msg.includes('rate limit'))
      return 'Trop de tentatives. Attendez quelques minutes.';
    if (msg.includes('Refresh Token Not Found') || msg.includes('Invalid Refresh Token'))
      return 'Session expirée. Veuillez vous reconnecter.';
    return msg;
  };

  const ensureProfile = async (userId: string, name: string, phoneNum: string, emailAddr: string) => {
    try {
      const { data: existing } = await supabase
        .from(PROFILE_TABLE)
        .select('id')
        .eq('id', userId)
        .maybeSingle();

      if (!existing) {
        const { error: insertErr } = await supabase.from(PROFILE_TABLE).insert({
          id:         userId,
          full_name:  name,
          phone:      phoneNum,
          email:      emailAddr,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (insertErr) console.error('ensureProfile insert error:', insertErr);
        else console.log('✅ Profil créé avec succès');
      }
    } catch (err) {
      console.error('ensureProfile error:', err);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      if (window.location.hash || window.location.search.includes('code')) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      const redirectUrl = `${getBaseUrl()}/auth/callback`;
      console.log('🔗 Redirection Google vers:', redirectUrl);

      const { error: e } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: { access_type: 'offline', prompt: 'consent' },
        },
      });
      if (e) setError(translateError(e.message));
    } catch (e: any) {
      setError(translateError(e?.message ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError(''); setSuccess('');
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail)               return setError('Email requis');
    if (!cleanEmail.includes('@')) return setError('Email invalide');

    setLoading(true);
    try {
      const redirectUrl = `${getBaseUrl()}/auth/callback`;
      console.log('🔗 Lien de réinitialisation vers:', redirectUrl);

      const { error: e } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectUrl,
      });
      if (e) return setError(translateError(e.message));

      setSuccess(
        `📧 Un lien de réinitialisation a été envoyé à ${cleanEmail}.\n\n` +
        `Cliquez sur le lien dans l'email pour définir votre nouveau mot de passe.\n\n` +
        `💡 Si vous ne recevez rien, vérifiez vos spams.`
      );

      setTimeout(() => {
        switchMode('login');
      }, 5000);
    } catch (e: any) {
      setError(translateError(e?.message ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName  = fullName.trim();

    if (!cleanName)                   return setError('Nom du salon requis');
    if (!cleanEmail)                  return setError('Email requis');
    if (!cleanEmail.includes('@'))    return setError('Email invalide');
    if (!password)                    return setError('Mot de passe requis');
    if (password.length < 6)          return setError('Mot de passe trop court (6 caractères minimum)');
    if (password !== confirmPassword) return setError('Les mots de passe ne correspondent pas');

    setLoading(true);
    try {
      const redirectUrl = `${getBaseUrl()}/auth/callback`;
      console.log('🔗 URL de redirection pour inscription:', redirectUrl);

      const { data, error: e } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { full_name: cleanName, phone: phone.trim() },
          emailRedirectTo: redirectUrl,
        },
      });

      if (e) {
        console.error('Erreur inscription:', e);
        if (e.message.includes('User already registered') || e.message.includes('already registered')) {
          setError('Cet email existe déjà. Veuillez vous connecter.');
          setMode('login');
        } else {
          setError(translateError(e.message));
        }
        setLoading(false);
        return;
      }

      console.log('Réponse inscription:', data);

      // Session immédiate (email auto-confirmé) → onAuthStateChange gère la redirection
      if (data.user && data.session) {
        console.log('✅ Inscription avec session immédiate');
        await ensureProfile(data.user.id, cleanName, phone.trim(), cleanEmail);
        // Redirection automatique via onAuthStateChange (SIGNED_IN)
      }
      // Confirmation email requise
      else if (data.user) {
        console.log('📧 Email de confirmation envoyé');
        await ensureProfile(data.user.id, cleanName, phone.trim(), cleanEmail);
        setVerifEmail(cleanEmail);
        setShowVerification(true);
        setSuccess(`Un email de confirmation a été envoyé à ${cleanEmail}. Vérifiez votre boîte mail.`);
      } else {
        setError("Erreur lors de l'inscription. Veuillez réessayer.");
      }
    } catch (e: any) {
      console.error('Exception inscription:', e);
      setError(translateError(e?.message ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail)               return setError('Email requis');
    if (!cleanEmail.includes('@')) return setError('Email invalide');
    if (!password)                 return setError('Mot de passe requis');

    setLoading(true);
    setError('');
    try {
      const { data, error: e } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (e) {
        if (e.message.includes('Email not confirmed')) {
          setVerifEmail(cleanEmail);
          setShowVerification(true);
        } else if (e.message.includes('Invalid login credentials')) {
          setError('Email ou mot de passe incorrect.');
        } else {
          setError(translateError(e.message));
        }
        setLoading(false);
        return;
      }

      if (data.user) {
        console.log('✅ Connexion réussie');
        await ensureProfile(
          data.user.id,
          data.user.user_metadata?.full_name ?? cleanEmail.split('@')[0],
          data.user.user_metadata?.phone ?? '',
          cleanEmail
        );
        // Redirection automatique via onAuthStateChange (SIGNED_IN)
      }
    } catch (e: any) {
      setError(translateError(e?.message ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = () => {
    setError(''); setSuccess('');
    if (mode === 'reset')    return handleReset();
    if (mode === 'register') return handleRegister();
    return handleLogin();
  };

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
  };

  const resendConfirmation = async () => {
    if (!verifEmail) return;
    setLoading(true);
    try {
      const redirectUrl = `${getBaseUrl()}/auth/callback`;
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: verifEmail,
        options: { emailRedirectTo: redirectUrl },
      });
      if (error) setError(translateError(error.message));
      else setSuccess(`Email renvoyé à ${verifEmail}`);
    } catch (e: any) {
      setError(translateError(e?.message ?? ''));
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m); setError(''); setSuccess('');
    setShowVerification(false);
    setPassword(''); setConfirmPassword('');
    setShowPassword(false); setShowConfirmPassword(false);
  };

  if (isProcessingCallback) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p>Traitement en cours...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-md">

        {onBack && (
          <button onClick={onBack}
            className="flex items-center gap-2 text-zinc-500 hover:text-white transition text-sm mb-8">
            <ArrowLeft className="w-4 h-4" /> Retour à l'accueil
          </button>
        )}

        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white rounded-2xl mb-4">
            <Scissors className="w-8 h-8 text-black" />
          </div>
          <h1 className="text-white text-3xl font-bold tracking-tight uppercase">{APP_NAME}</h1>
          <p className="text-zinc-500 text-sm mt-1">Salon de Coiffure — Dakar, Sénégal</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8">

          {!showVerification && mode !== 'reset' && (
            <div className="flex mb-6 bg-zinc-800 rounded-xl p-1">
              {(['login', 'register'] as Mode[]).map((m) => (
                <button key={m} onClick={() => switchMode(m)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${
                    mode === m ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'
                  }`}>
                  {m === 'login' ? 'Connexion' : 'Créer un compte'}
                </button>
              ))}
            </div>
          )}

          {mode === 'reset' && !showVerification && (
            <div className="mb-6">
              <h2 className="text-white text-xl font-bold mb-1">Mot de passe oublié</h2>
              <p className="text-zinc-400 text-sm">
                Entrez votre email — vous recevrez un lien pour définir un nouveau mot de passe.
              </p>
              <p className="text-zinc-500 text-xs mt-2">
                📱 Le lien fonctionne sur tous les appareils (mobile, tablette, ordinateur)
              </p>
              <p className="text-zinc-500 text-xs mt-1">
                💡 Après avoir cliqué sur le lien, vous pourrez définir votre nouveau mot de passe.
              </p>
            </div>
          )}

          {showVerification && (
            <div className="p-4 bg-blue-950 border border-blue-700 rounded-xl">
              <h2 className="text-white text-lg font-bold mb-2">✉️ Confirmez votre email</h2>
              <p className="text-blue-200 text-sm mb-1">
                Un email de confirmation a été envoyé à <strong>{verifEmail}</strong>.
              </p>
              <p className="text-blue-300 text-xs mb-4">
                Cliquez sur le lien pour activer votre compte. Vérifiez vos spams si besoin.
              </p>
              <button onClick={resendConfirmation} disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg text-sm font-medium transition disabled:opacity-50 mb-2">
                {loading ? 'Envoi...' : "Renvoyer l'email"}
              </button>
              <button onClick={() => { setShowVerification(false); switchMode('login'); }}
                className="w-full text-zinc-400 hover:text-white text-sm transition py-2">
                ← Retour à la connexion
              </button>
              {success && (
                <div className="mt-3 bg-green-950 border border-green-700 text-green-300 text-xs rounded-lg px-3 py-2">
                  {success}
                </div>
              )}
            </div>
          )}

          {!showVerification && (
            <>
              {mode !== 'reset' && (
                <>
                  <button onClick={handleGoogleLogin} disabled={loading}
                    className="w-full flex items-center justify-center gap-3 bg-zinc-800 hover:bg-zinc-700 text-white py-3 rounded-xl font-medium text-sm transition disabled:opacity-50 mb-4">
                    <svg width="18" height="18" viewBox="0 0 18 18">
                      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
                      <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.548 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
                      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/>
                    </svg>
                    Continuer avec Google
                  </button>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex-1 h-px bg-zinc-700" />
                    <span className="text-zinc-500 text-xs">ou</span>
                    <div className="flex-1 h-px bg-zinc-700" />
                  </div>
                </>
              )}

              <div className="space-y-4">

                {mode === 'register' && (
                  <>
                    <div>
                      <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">
                        Nom du salon
                      </label>
                      <input
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ex: Salon RELAX COUPE"
                        className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 border border-zinc-600 focus:outline-none focus:border-white transition"
                      />
                    </div>
                    <div>
                      <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">
                        Téléphone <span className="text-zinc-600 normal-case font-normal">(optionnel)</span>
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="+221 77 000 00 00"
                        className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 border border-zinc-600 focus:outline-none focus:border-white transition"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={handleEnter}
                    placeholder="vous@email.com"
                    autoComplete="email"
                    className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 border border-zinc-600 focus:outline-none focus:border-white transition"
                  />
                </div>

                {mode !== 'reset' && (
                  <>
                    <div>
                      <div className="flex justify-between items-center mb-1.5">
                        <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider">
                          Mot de passe
                          {mode === 'register' && (
                            <span className="text-zinc-600 normal-case font-normal ml-1">(6 min.)</span>
                          )}
                        </label>
                        {mode === 'login' && (
                          <button
                            type="button"
                            onClick={() => switchMode('reset')}
                            className="text-zinc-500 hover:text-white text-xs transition"
                          >
                            Mot de passe oublié ?
                          </button>
                        )}
                      </div>
                      <PasswordInput
                        value={password}
                        onChange={setPassword}
                        onKeyDown={handleEnter}
                        show={showPassword}
                        onToggle={() => setShowPassword(prev => !prev)}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      />
                    </div>

                    {mode === 'register' && (
                      <div>
                        <label className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-1.5 block">
                          Confirmer le mot de passe
                        </label>
                        <PasswordInput
                          value={confirmPassword}
                          onChange={setConfirmPassword}
                          onKeyDown={handleEnter}
                          show={showConfirmPassword}
                          onToggle={() => setShowConfirmPassword(prev => !prev)}
                          autoComplete="new-password"
                        />
                      </div>
                    )}
                  </>
                )}

                {error && (
                  <div className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3">
                    {error}
                    {mode === 'login' && error.includes('incorrect') && (
                      <button onClick={handleGoogleLogin} disabled={loading}
                        className="block mt-2 text-red-400 hover:text-white underline text-xs transition">
                        Continuer avec Google →
                      </button>
                    )}
                  </div>
                )}

                {success && (
                  <div className="bg-green-950 border border-green-700 text-green-300 text-sm rounded-xl px-4 py-3 whitespace-pre-line">
                    {success}
                  </div>
                )}

                <button onClick={handleSubmit} disabled={loading}
                  className="w-full bg-white text-black py-4 rounded-xl font-bold text-base hover:bg-zinc-200 transition disabled:opacity-50 mt-2">
                  {loading
                    ? 'Chargement...'
                    : mode === 'login'
                    ? 'Se connecter'
                    : mode === 'register'
                    ? "S'inscrire"
                    : 'Envoyer le lien de réinitialisation'}
                </button>

                {mode === 'reset' && (
                  <button onClick={() => switchMode('login')}
                    className="w-full text-zinc-500 hover:text-white text-sm transition py-2">
                    ← Retour à la connexion
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}