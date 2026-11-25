// src/lib/plans.ts
// Offres Barber : 2 000 F / mois ou 20 000 F / an (2 mois offerts)

export interface PlanConfig {
  id: 'barber_monthly' | 'barber_annual';
  name: string;
  price: number;          // en F CFA
  durationMonths: number; // sert a calculer expires_at cote serveur
  label: string;
  badge?: string;
}

export const BARBER_PLANS: PlanConfig[] = [
  {
    id: 'barber_monthly',
    name: 'Barber Mensuel',
    price: 2000,
    durationMonths: 1,
    label: '2 000 F / mois',
  },
  {
    id: 'barber_annual',
    name: 'Barber Annuel',
    price: 20000,
    durationMonths: 12,
    label: '20 000 F / an',
    badge: '2 mois offerts',
  },
];

export const BARBER_PRICE_TEXT = '2 000 F/mois ou 20 000 F/an';