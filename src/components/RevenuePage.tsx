import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

interface RevenuePageProps {
  userId: string;
  refreshTrigger: number;
}

interface BarberStat {
  name: string;
  count: number;
  total: number;
  photo: string;
}

interface PeriodStats {
  totalRevenue: number;
  totalExpenses: number;
  netRevenue: number;
  transactionCount: number;
  expenseCount: number;
  chartData: Array<{ label: string; Revenus: number; Dépenses: number }>;
  barberStats: BarberStat[];
}

type PeriodType = 'week' | 'month' | 'year';

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// Cache pour les photos des coiffeurs
const barberPhotoCache: Record<string, string> = {};

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setDate(weekStart.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}
function formatWeekLabel(weekStart: Date): string {
  const end = getWeekEnd(weekStart);
  const fmtDay = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  return `${fmtDay(weekStart)} → ${fmtDay(end)}`;
}
function isCurrentWeek(weekStart: Date): boolean {
  return weekStart.toDateString() === getWeekStart(new Date()).toDateString();
}
function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}
function getMonthEnd(monthStart: Date): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
}
function formatMonthLabel(monthStart: Date): string {
  return monthStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}
function isCurrentMonth(monthStart: Date): boolean {
  const now = new Date();
  return monthStart.getMonth() === now.getMonth() && monthStart.getFullYear() === now.getFullYear();
}
function getYearStart(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function getYearEnd(yearStart: Date): Date {
  return new Date(yearStart.getFullYear(), 11, 31, 23, 59, 59, 999);
}
function formatYearLabel(yearStart: Date): string {
  return yearStart.getFullYear().toString();
}
function isCurrentYear(yearStart: Date): boolean {
  return yearStart.getFullYear() === new Date().getFullYear();
}

export default function RevenuePage({ userId, refreshTrigger }: RevenuePageProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState<PeriodStats>({
    totalRevenue: 0, totalExpenses: 0, netRevenue: 0,
    transactionCount: 0, expenseCount: 0, chartData: [], barberStats: [],
  });
  const [loading, setLoading] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const getTargetPeriodStart = useCallback((): Date => {
    const base = new Date();
    switch (periodType) {
      case 'week': {
        const s = getWeekStart(base);
        s.setDate(s.getDate() + offset * 7);
        return s;
      }
      case 'month': {
        const s = getMonthStart(base);
        s.setMonth(s.getMonth() + offset);
        return s;
      }
      case 'year': {
        const s = getYearStart(base);
        s.setFullYear(s.getFullYear() + offset);
        return s;
      }
    }
  }, [periodType, offset]);

  const getPeriodEnd = useCallback((start: Date): Date => {
    switch (periodType) {
      case 'week': return getWeekEnd(start);
      case 'month': return getMonthEnd(start);
      case 'year': return getYearEnd(start);
    }
  }, [periodType]);

  const isCurrentPeriod = useCallback((start: Date): boolean => {
    switch (periodType) {
      case 'week': return isCurrentWeek(start);
      case 'month': return isCurrentMonth(start);
      case 'year': return isCurrentYear(start);
    }
  }, [periodType]);

  const formatPeriodLabel = useCallback((start: Date): string => {
    switch (periodType) {
      case 'week': return formatWeekLabel(start);
      case 'month': return formatMonthLabel(start);
      case 'year': return formatYearLabel(start);
    }
  }, [periodType]);

  const getPeriodOffsetText = useCallback((): string => {
    if (offset === 0) {
      switch (periodType) {
        case 'week': return 'Cette semaine';
        case 'month': return 'Ce mois';
        case 'year': return 'Cette année';
      }
    }
    const abs = Math.abs(offset);
    const suffix = abs > 1 ? 's' : '';
    if (offset < 0) {
      switch (periodType) {
        case 'week': return `Il y a ${abs} semaine${suffix}`;
        case 'month': return `Il y a ${abs} mois`;
        case 'year': return `Il y a ${abs} an${suffix}`;
      }
    } else {
      switch (periodType) {
        case 'week': return `Dans ${abs} semaine${suffix}`;
        case 'month': return `Dans ${abs} mois`;
        case 'year': return `Dans ${abs} an${suffix}`;
      }
    }
  }, [periodType, offset]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const periodStart = getTargetPeriodStart();
      const periodEnd = getPeriodEnd(periodStart);

      const [{ data: transactions }, { data: expenses }] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount, transaction_date_sec, transaction_date, barber_name')
          .eq('user_id', userId)
          .gte('transaction_date_sec', periodStart.toISOString())
          .lte('transaction_date_sec', periodEnd.toISOString()),
        supabase
          .from('expenses')
          .select('amount, expense_date')
          .eq('user_id', userId)
          .gte('expense_date', periodStart.toISOString())
          .lte('expense_date', periodEnd.toISOString()),
      ]);

      const tList = transactions || [];
      const eList = expenses || [];

      // Récupérer les noms des coiffeurs pour charger leurs photos
      const barberNames = tList.map(t => t.barber_name).filter(name => name && name !== 'Non défini');
      const uniqueNames = [...new Set(barberNames.filter(name => !barberPhotoCache[name]))];
      
      if (uniqueNames.length > 0) {
        try {
          const { data: barberData, error: barberError } = await supabase
            .from('barbers')
            .select('name, photo')
            .in('name', uniqueNames)
            .eq('user_id', userId);
          
          if (!barberError && barberData) {
            barberData.forEach((barber: { name: string; photo: string }) => {
              barberPhotoCache[barber.name] = barber.photo;
            });
          }
        } catch (err) {
          console.error('Erreur chargement photos:', err);
        }
      }

      // ── Stats par coiffeur ──
      const barberMap: Record<string, BarberStat> = {};
      tList.forEach(t => {
        const name = t.barber_name || 'Non défini';
        if (!barberMap[name]) {
          barberMap[name] = { 
            name, 
            count: 0, 
            total: 0, 
            photo: barberPhotoCache[name] || '' 
          };
        }
        barberMap[name].count += 1;
        barberMap[name].total += Number(t.amount);
      });
      const barberStats = Object.values(barberMap)
        .sort((a, b) => {
          if (a.name === 'Non défini') return 1;
          if (b.name === 'Non défini') return -1;
          return b.total - a.total;
        });

      // ── Graphique ──
      let chartData: Array<{ label: string; Revenus: number; Dépenses: number }> = [];

      if (periodType === 'week') {
        const dailyMap: Record<string, { rev: number; exp: number }> = {};
        for (let i = 0; i < 7; i++) {
          const d = new Date(periodStart);
          d.setDate(periodStart.getDate() + i);
          dailyMap[d.toLocaleDateString('fr-FR')] = { rev: 0, exp: 0 };
        }
        tList.forEach(t => {
          const raw = t.transaction_date_sec || t.transaction_date || '';
          if (!raw) return;
          const key = new Date(raw).toLocaleDateString('fr-FR');
          if (dailyMap[key]) dailyMap[key].rev += Number(t.amount);
        });
        eList.forEach(e => {
          const key = new Date(e.expense_date).toLocaleDateString('fr-FR');
          if (dailyMap[key]) dailyMap[key].exp += Number(e.amount);
        });
        chartData = Object.entries(dailyMap).map(([, val], i) => {
          const d = new Date(periodStart);
          d.setDate(periodStart.getDate() + i);
          return { label: `${JOURS[d.getDay()]} ${d.getDate()}`, Revenus: val.rev, Dépenses: val.exp };
        });
      } else if (periodType === 'month') {
        const year = periodStart.getFullYear();
        const month = periodStart.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const dailyMap: Record<string, { rev: number; exp: number }> = {};
        for (let i = 1; i <= daysInMonth; i++) {
          const d = new Date(year, month, i);
          dailyMap[d.toLocaleDateString('fr-FR')] = { rev: 0, exp: 0 };
        }
        tList.forEach(t => {
          const raw = t.transaction_date_sec || t.transaction_date || '';
          if (!raw) return;
          const key = new Date(raw).toLocaleDateString('fr-FR');
          if (dailyMap[key]) dailyMap[key].rev += Number(t.amount);
        });
        eList.forEach(e => {
          const key = new Date(e.expense_date).toLocaleDateString('fr-FR');
          if (dailyMap[key]) dailyMap[key].exp += Number(e.amount);
        });
        chartData = Object.entries(dailyMap).map(([dateStr, val]) => {
          const d = new Date(dateStr);
          return { label: `${d.getDate()} ${MOIS[d.getMonth()]}`, Revenus: val.rev, Dépenses: val.exp };
        });
      } else if (periodType === 'year') {
        const year = periodStart.getFullYear();
        const monthlyMap: Record<number, { rev: number; exp: number }> = {};
        for (let i = 0; i < 12; i++) monthlyMap[i] = { rev: 0, exp: 0 };
        tList.forEach(t => {
          const raw = t.transaction_date_sec || t.transaction_date || '';
          if (!raw) return;
          const d = new Date(raw);
          if (d.getFullYear() === year) monthlyMap[d.getMonth()].rev += Number(t.amount);
        });
        eList.forEach(e => {
          const d = new Date(e.expense_date);
          if (d.getFullYear() === year) monthlyMap[d.getMonth()].exp += Number(e.amount);
        });
        chartData = Object.entries(monthlyMap).map(([m, val]) => ({
          label: MOIS[parseInt(m)], Revenus: val.rev, Dépenses: val.exp,
        }));
      }

      const totalRevenue = tList.reduce((s, t) => s + Number(t.amount), 0);
      const totalExpenses = eList.reduce((s, e) => s + Number(e.amount), 0);

      setStats({
        totalRevenue, totalExpenses,
        netRevenue: totalRevenue - totalExpenses,
        transactionCount: tList.length,
        expenseCount: eList.length,
        chartData,
        barberStats,
      });
    } catch (err) {
      console.error('RevenuePage error:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, periodType, getTargetPeriodStart, getPeriodEnd]);

  useEffect(() => { loadData(); }, [loadData, refreshTrigger]);

  const formatCFA = (v: number) =>
    v.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' });

  const periodStart = getTargetPeriodStart();
  const isCurrent = isCurrentPeriod(periodStart);

  const canGoForward = () => {
    if (periodType === 'week') return !isCurrentWeek(periodStart);
    if (periodType === 'month') return !isCurrentMonth(periodStart);
    return !isCurrentYear(periodStart);
  };

  const getChartTitle = () => {
    switch (periodType) {
      case 'week': return 'Jour par jour';
      case 'month': return 'Jour par jour';
      case 'year': return 'Mois par mois';
    }
  };

  const periodLabel = (() => {
    switch (periodType) {
      case 'week': return 'de la semaine';
      case 'month': return 'du mois';
      case 'year': return "de l'année";
    }
  })();

  const handleImageError = (barberName: string) => {
    setImageErrors(prev => ({ ...prev, [barberName]: true }));
  };

  return (
    <div className="space-y-5 sm:space-y-8">

      {/* ── Navigation période ── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-white text-2xl sm:text-3xl font-bold">Revenus</h2>

        <div className="flex gap-2">
          {(['week', 'month', 'year'] as PeriodType[]).map(pt => (
            <button key={pt}
              onClick={() => { setPeriodType(pt); setOffset(0); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                periodType === pt ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'
              }`}>
              {pt === 'week' ? 'Semaine' : pt === 'month' ? 'Mois' : 'Année'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <button onClick={() => setOffset(o => o - 1)}
            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-xl text-sm font-medium transition">
            <ChevronLeft className="w-4 h-4" /> Précédent
          </button>
          <div className="flex-1 text-center">
            <div className={`inline-flex flex-col items-center px-4 py-2 rounded-xl border ${
              isCurrent ? 'bg-white text-black border-white' : 'bg-zinc-900 text-white border-zinc-700'
            }`}>
              <span className="text-xs font-bold uppercase tracking-wider opacity-60">{getPeriodOffsetText()}</span>
              <span className="text-sm font-bold mt-0.5">{formatPeriodLabel(periodStart)}</span>
            </div>
          </div>
          <button onClick={() => setOffset(o => o + 1)} disabled={!canGoForward()}
            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-2 rounded-xl text-sm font-medium transition">
            Suivant <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center animate-pulse">Chargement...</div>
      ) : (
        <>
          {/* ── Cartes stats ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-6">
            <div className="bg-gradient-to-br from-green-800 to-green-950 border border-green-500 rounded-2xl p-4 sm:p-6 space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-green-100 text-xs font-medium uppercase tracking-wide">Revenus</h3>
                <TrendingUp className="w-5 h-5 text-green-400" />
              </div>
              <p className="text-white text-xl sm:text-2xl font-bold">{formatCFA(stats.totalRevenue)}</p>
              <p className="text-green-300 text-xs">{stats.transactionCount} transactions</p>
            </div>

            <div className="bg-gradient-to-br from-red-900 to-red-950 border border-red-800 rounded-2xl p-4 sm:p-6 space-y-1">
              <div className="flex items-center justify-between">
                <h3 className="text-red-300 text-xs font-medium uppercase tracking-wide">Dépenses</h3>
                <TrendingDown className="w-5 h-5 text-red-400" />
              </div>
              <p className="text-white text-xl sm:text-2xl font-bold">{formatCFA(stats.totalExpenses)}</p>
              <p className="text-red-300 text-xs">{stats.expenseCount} dépenses</p>
            </div>

            <div className="bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-600 rounded-2xl p-4 sm:p-6 space-y-1">
              <h3 className="text-zinc-300 text-xs font-medium uppercase tracking-wide">Net</h3>
              <p className={`text-xl sm:text-2xl font-bold ${stats.netRevenue >= 0 ? 'text-white' : 'text-red-400'}`}>
                {formatCFA(stats.netRevenue)}
              </p>
              <p className="text-zinc-400 text-xs">Après dépenses</p>
            </div>
          </div>

          {/* ── Stats par coiffeur AVEC PHOTOS ── */}
          {stats.barberStats.length > 0 && (
            <div>
              <h3 className="text-white text-lg sm:text-xl font-bold mb-3">
                Coiffeurs — {periodLabel}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {stats.barberStats.map(b => {
                  const hasImageError = imageErrors[b.name];
                  const showPhoto = b.photo && !hasImageError;
                  
                  return (
                    <div key={b.name} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-3">
                      {/* Nom avec photo */}
                      <div className="flex items-center gap-3">
                        {showPhoto ? (
                          <img 
                            src={b.photo} 
                            alt={b.name}
                            className="w-10 h-10 rounded-full object-cover border border-zinc-600"
                            onError={() => handleImageError(b.name)}
                          />
                        ) : (
                          <div className="w-10 h-10 bg-zinc-800 rounded-full flex items-center justify-center shrink-0">
                            <span className="text-white text-sm font-bold uppercase">
                              {b.name.charAt(0)}
                            </span>
                          </div>
                        )}
                        <p className="text-white font-bold capitalize truncate">{b.name}</p>
                      </div>
                      {/* Stats */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-zinc-800 rounded-lg p-2.5">
                          <p className="text-zinc-400 text-xs mb-0.5">Coupes</p>
                          <p className="text-white font-bold text-lg">{b.count}</p>
                        </div>
                        <div className="bg-zinc-800 rounded-lg p-2.5">
                          <p className="text-zinc-400 text-xs mb-0.5">Total</p>
                          <p className="text-white font-bold text-sm">{formatCFA(b.total)}</p>
                        </div>
                      </div>
                      {/* Barre de progression relative */}
                      {stats.totalRevenue > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-zinc-500 mb-1">
                            <span>Part du revenu</span>
                            <span>{Math.round((b.total / stats.totalRevenue) * 100)}%</span>
                          </div>
                          <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-white rounded-full transition-all"
                              style={{ width: `${Math.round((b.total / stats.totalRevenue) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Graphique ── */}
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 sm:p-6">
            <h3 className="text-white text-lg font-bold mb-1">{getChartTitle()} — {formatPeriodLabel(periodStart)}</h3>
            <p className="text-zinc-500 text-xs mb-5">{stats.transactionCount + stats.expenseCount} opérations</p>

            {stats.chartData.every(d => d.Revenus === 0 && d.Dépenses === 0) ? (
              <div className="text-center text-zinc-500 py-10">Aucune donnée pour cette période</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stats.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#a1a1aa', fontSize: 11 }}
                    axisLine={false} tickLine={false}
                    interval={periodType === 'month' ? Math.floor(stats.chartData.length / 10) : 0} />
                  <YAxis tick={{ fill: '#a1a1aa', fontSize: 10 }} width={56}
                    axisLine={false} tickLine={false}
                    tickFormatter={v => v >= 1000 ? Math.round(v / 1000) + 'k' : v} />
                  <Tooltip
                    formatter={(value: number | undefined) => formatCFA(Number(value ?? 0))}
                    contentStyle={{ backgroundColor: '#18181b', borderRadius: 10, border: '1px solid #3f3f46', fontSize: 12 }}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa', paddingTop: 12 }} />
                  <Bar dataKey="Revenus" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  <Bar dataKey="Dépenses" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={40} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}