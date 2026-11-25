// src/components/AccountTypeSelect.tsx
// Écran affiché après la connexion, avant la page d'abonnement.
// Si aucun type n'est enregistré, l'utilisateur doit en choisir un.
import { useEffect, useState } from 'react';
import {
  Store,
  Scissors,
  Check,
  Loader,
  LogOut,
  CalendarCheck,
  TrendingUp,
  Users,
} from 'lucide-react';

export type AccountType = 'salon' | 'barber';

interface AccountTypeSelectProps {
  userFullName?: string;
  initialType?: AccountType | null;
  saving?: boolean;
  error?: string;
  onConfirm: (type: AccountType) => void;
  onCancel?: () => void;
  onLogout?: () => void;
}

const OPTIONS: {
  id: AccountType;
  title: string;
  subtitle: string;
  Icon: any;
  features: { Icon: any; label: string }[];
}[] = [
  {
    id: 'salon',
    title: 'Salon de coiffure',
    subtitle: 'Vous gérez un salon avec une équipe ou plusieurs postes.',
    Icon: Store,
    features: [
      { Icon: CalendarCheck, label: 'Réservations clients' },
      { Icon: TrendingUp, label: 'Revenus et dépenses' },
      { Icon: Users, label: 'Gestion du salon' },
    ],
  },
  {
    id: 'barber',
    title: 'Barber',
    subtitle: 'Vous travaillez seul et recevez vos clients sur rendez-vous.',
    Icon: Scissors,
    features: [
      { Icon: CalendarCheck, label: 'Réservations clients' },
      { Icon: Scissors, label: 'Vos services et tarifs' },
    ],
  },
];

export function AccountTypeSelect({
  userFullName,
  initialType = null,
  saving = false,
  error = '',
  onConfirm,
  onCancel,
  onLogout,
}: AccountTypeSelectProps) {
  const [selected, setSelected] = useState<AccountType | null>(initialType);

  // Synchronise le choix si le type du profil est chargé ou modifié après montage.
  useEffect(() => {
    setSelected(initialType ?? null);
  }, [initialType]);

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-lg mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
              <Scissors className="w-5 h-5 text-black" />
            </div>
            <div>
              <h1 className="text-white font-bold uppercase tracking-wider">LA COUPE</h1>
              {userFullName?.trim() && (
                <p className="text-zinc-500 text-xs">{userFullName.trim()}</p>
              )}
            </div>
          </div>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="text-zinc-500 hover:text-white transition flex items-center gap-1.5 text-sm"
            >
              <LogOut className="w-4 h-4" /> Déconnexion
            </button>
          )}
        </div>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-zinc-400 hover:text-white transition mb-6 text-sm disabled:opacity-50"
          >
            ← Retour aux offres
          </button>
        )}

        <h2 className="text-white text-2xl font-bold mb-2">
          {onCancel ? 'Changer de type de compte' : 'Choisissez votre type de compte'}
        </h2>
        <p className="text-zinc-400 text-sm mb-8">
          Sélectionnez votre espace. Seules les deux offres correspondant à ce choix seront affichées.
        </p>

        <div className="grid gap-4 mb-8">
          {OPTIONS.map(({ id, title, subtitle, Icon, features }) => {
            const isSelected = selected === id;
            return (
              <button
                type="button"
                key={id}
                onClick={() => setSelected(id)}
                disabled={saving}
                aria-pressed={isSelected}
                className={`w-full bg-zinc-900 border-2 rounded-2xl p-6 text-left transition ${
                  isSelected ? 'border-white' : 'border-zinc-700 hover:border-zinc-500'
                } disabled:opacity-60`}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition ${
                      isSelected ? 'bg-white' : 'bg-zinc-800'
                    }`}
                  >
                    <Icon className={`w-7 h-7 ${isSelected ? 'text-black' : 'text-zinc-300'}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-white text-xl font-bold">{title}</h3>
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition ${
                          isSelected ? 'border-white bg-white' : 'border-zinc-600'
                        }`}
                      >
                        {isSelected && <Check className="w-4 h-4 text-black" />}
                      </div>
                    </div>
                    <p className="text-zinc-400 text-sm mt-1">{subtitle}</p>
                    <ul className="mt-4 grid gap-1.5">
                      {features.map(({ Icon: FIcon, label }) => (
                        <li key={label} className="flex items-center gap-2 text-zinc-300 text-xs">
                          <FIcon className="w-3.5 h-3.5 text-zinc-500" />
                          {label}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {error && (
          <div role="alert" className="bg-red-950 border border-red-700 text-red-300 text-sm rounded-xl px-4 py-3 mb-4">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => selected && onConfirm(selected)}
          disabled={!selected || saving}
          className="w-full bg-white text-black py-4 rounded-xl font-bold text-base hover:bg-zinc-200 transition disabled:opacity-30"
        >
          {saving ? (
            <span className="flex items-center justify-center gap-2">
              <Loader className="w-4 h-4 animate-spin" /> Enregistrement...
            </span>
          ) : (
            'Continuer →'
          )}
        </button>
      </div>
    </div>
  );
}
