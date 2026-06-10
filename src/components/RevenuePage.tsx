// src/components/RevenuePage.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown, ChevronLeft, ChevronRight, CalendarRange, X } from 'lucide-react';
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

type PeriodType = 'week' | 'month' | 'year' | 'custom';

const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

// Cache pour les photos des coiffeurs
const barberPhotoCache: Record<string, string> = {};

// ── Helpers période standard ──
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

// ── Helpers plage personnalisée ──
function toInputDate(d: Date): string {
  // Renvoie "YYYY-MM-DD" pour <input type="date">
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function fromInputDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
function formatCustomLabel(start: Date, end: Date): string {
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(start)} → ${fmt(end)}`;
}

// ── Composant DateRangePicker inline ──
interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onChange: (start: string, end: string) => void;
  onClose: () => void;
}

function DateRangePicker({ startDate, endDate, onChange, onClose }: DateRangePickerProps) {
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const today = toInputDate(new Date());

  const handleApply = () => {
    if (!localStart || !localEnd) return;
    const s = fromInputDate(localStart);
    const e = fromInputDate(localEnd);
    if (s > e) {
      // Inverser automatiquement si l'ordre est mauvais
      onChange(localEnd, localStart);
    } else {
      onChange(localStart, localEnd);
    }
    onClose();
  };

  // Raccourcis rapides
  const shortcuts = [
    {
      label: '7 derniers jours',
      action: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 6);
        setLocalStart(toInputDate(start));
        setLocalEnd(toInputDate(end));
      },
    },
    {
      label: '30 derniers jours',
      action: () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 29);
        setLocalStart(toInputDate(start));
        setLocalEnd(toInputDate(end));
      },
    },
    {
      label: '3 derniers mois',
      action: () => {
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 3);
        setLocalStart(toInputDate(start));
        setLocalEnd(toInputDate(end));
      },
    },
    {
      label: 'Depuis le début de l\'année',
      action: () => {
        const end = new Date();
        const start = new Date(end.getFullYear(), 0, 1);
        setLocalStart(toInputDate(start));
        setLocalEnd(toInputDate(end));
      },
    },
  ];

  const selectedDays = localStart && localEnd
    ? diffDays(fromInputDate(localStart), fromInputDate(localEnd)) + 1
    : 0;

  const isValid = localStart && localEnd && fromInputDate(localStart) <= fromInputDate(localEnd);

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 space-y-4 shadow-2xl">
      {/* En-tête */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarRange className="w-4 h-4 text-zinc-400" />
          <span className="text-white text-sm font-bold">Période personnalisée</span>
        </div>
        <button
          onClick={onClose}
          className="text-zinc-500 hover:text-white transition p-1 rounded-lg hover:bg-zinc-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Raccourcis rapides */}
      <div className="flex flex-wrap gap-2">
        {shortcuts.map(s => (
          <button
            key={s.label}
            onClick={s.action}
            className="text-xs px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition border border-zinc-700 hover:border-zinc-500"
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Sélecteurs de dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Début</label>
          <input
            type="date"
            value={localStart}
            max={localEnd || today}
            onChange={e => setLocalStart(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 focus:border-white text-white text-sm rounded-xl px-3 py-2.5 outline-none transition [color-scheme:dark]"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-zinc-400 text-xs font-medium uppercase tracking-wide">Fin</label>
          <input
            type="date"
            value={localEnd}
            min={localStart}
            max={today}
            onChange={e => setLocalEnd(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 focus:border-white text-white text-sm rounded-xl px-3 py-2.5 outline-none transition [color-scheme:dark]"
          />
        </div>
      </div>

      {/* Résumé + bouton appliquer */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-zinc-500 text-xs">
          {selectedDays > 0 ? (
            <span className="text-zinc-300">
              <span className="font-bold text-white">{selectedDays}</span> jour{selectedDays > 1 ? 's' : ''} sélectionné{selectedDays > 1 ? 's' : ''}
            </span>
          ) : '—'}
        </span>
        <button
          onClick={handleApply}
          disabled={!isValid}
          className="flex-shrink-0 bg-white text-black text-sm font-bold px-5 py-2 rounded-xl hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Appliquer
        </button>
      </div>
    </div>
  );
}

// ── Composant principal ──
export default function RevenuePage({ userId, refreshTrigger }: RevenuePageProps) {
  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [offset, setOffset] = useState(0);

  // État plage personnalisée
  const today = new Date();
  const [customStart, setCustomStart] = useState<string>(toInputDate(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [customEnd, setCustomEnd] = useState<string>(toInputDate(today));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [stats, setStats] = useState<PeriodStats>({
    totalRevenue: 0, totalExpenses: 0, netRevenue: 0,
    transactionCount: 0, expenseCount: 0, chartData: [], barberStats: [],
  });
  const [loading, setLoading] = useState(false);
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  // ── Calcul des bornes de la période ──
  const getTargetPeriodStart = useCallback((): Date => {
    if (periodType === 'custom') return fromInputDate(customStart);
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
  }, [periodType, offset, customStart]);

  const getPeriodEnd = useCallback((start: Date): Date => {
    if (periodType === 'custom') {
      const e = fromInputDate(customEnd);
      e.setHours(23, 59, 59, 999);
      return e;
    }
    switch (periodType) {
      case 'week': return getWeekEnd(start);
      case 'month': return getMonthEnd(start);
      case 'year': return getYearEnd(start);
    }
  }, [periodType, customEnd]);

  const isCurrentPeriod = useCallback((start: Date): boolean => {
    if (periodType === 'custom') return false;
    switch (periodType) {
      case 'week': return isCurrentWeek(start);
      case 'month': return isCurrentMonth(start);
      case 'year': return isCurrentYear(start);
    }
  }, [periodType]);

  const formatPeriodLabel = useCallback((start: Date): string => {
    if (periodType === 'custom') return formatCustomLabel(fromInputDate(customStart), fromInputDate(customEnd));
    switch (periodType) {
      case 'week': return formatWeekLabel(start);
      case 'month': return formatMonthLabel(start);
      case 'year': return formatYearLabel(start);
    }
  }, [periodType, customStart, customEnd]);

  const getPeriodOffsetText = useCallback((): string => {
    if (periodType === 'custom') return 'Période personnalisée';
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

  // ── Déduction du type de graphique selon la plage ──
  const getCustomChartMode = useCallback((): 'day' | 'week' | 'month' => {
    const days = diffDays(fromInputDate(customStart), fromInputDate(customEnd)) + 1;
    if (days <= 62) return 'day';       // ≤ 2 mois → jour par jour
    if (days <= 366) return 'week';     // ≤ 1 an → semaine par semaine
    return 'month';                     // > 1 an → mois par mois
  }, [customStart, customEnd]);

  // ── Chargement des données ──
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

      // Chargement photos coiffeurs
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

      // Stats par coiffeur
      const barberMap: Record<string, BarberStat> = {};
      tList.forEach(t => {
        const name = t.barber_name || 'Non défini';
        if (!barberMap[name]) {
          barberMap[name] = { name, count: 0, total: 0, photo: barberPhotoCache[name] || '' };
        }
        barberMap[name].count += 1;
        barberMap[name].total += Number(t.amount);
      });
      const barberStats = Object.values(barberMap).sort((a, b) => {
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
          const d = new Date(dateStr.split('/').reverse().join('-'));
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

      } else if (periodType === 'custom') {
        // ── Mode personnalisé : granularité automatique ──
        const chartMode = getCustomChartMode();
        const start = fromInputDate(customStart);
        const end = fromInputDate(customEnd);

        if (chartMode === 'day') {
          // Jour par jour
          const dailyMap: Record<string, { rev: number; exp: number }> = {};
          const cur = new Date(start);
          while (cur <= end) {
            dailyMap[cur.toLocaleDateString('fr-FR')] = { rev: 0, exp: 0 };
            cur.setDate(cur.getDate() + 1);
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
            const parts = dateStr.split('/');
            const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
            return {
              label: `${d.getDate()} ${MOIS[d.getMonth()]}`,
              Revenus: val.rev,
              Dépenses: val.exp,
            };
          });

        } else if (chartMode === 'week') {
          // Semaine par semaine
          const weekMap: Record<string, { rev: number; exp: number; label: string }> = {};
          const cur = new Date(start);
          while (cur <= end) {
            const ws = getWeekStart(new Date(cur));
            const key = toInputDate(ws);
            if (!weekMap[key]) {
              weekMap[key] = {
                rev: 0, exp: 0,
                label: `${ws.getDate()} ${MOIS[ws.getMonth()]}`,
              };
            }
            cur.setDate(cur.getDate() + 7);
          }
          tList.forEach(t => {
            const raw = t.transaction_date_sec || t.transaction_date || '';
            if (!raw) return;
            const ws = getWeekStart(new Date(raw));
            const key = toInputDate(ws);
            if (weekMap[key]) weekMap[key].rev += Number(t.amount);
          });
          eList.forEach(e => {
            const ws = getWeekStart(new Date(e.expense_date));
            const key = toInputDate(ws);
            if (weekMap[key]) weekMap[key].exp += Number(e.amount);
          });
          chartData = Object.values(weekMap).map(({ label, rev, exp }) => ({
            label, Revenus: rev, Dépenses: exp,
          }));

        } else {
          // Mois par mois
          const monthMap: Record<string, { rev: number; exp: number; label: string }> = {};
          const cur = new Date(start.getFullYear(), start.getMonth(), 1);
          while (cur <= end) {
            const key = `${cur.getFullYear()}-${cur.getMonth()}`;
            if (!monthMap[key]) {
              monthMap[key] = {
                rev: 0, exp: 0,
                label: `${MOIS[cur.getMonth()]} ${cur.getFullYear()}`,
              };
            }
            cur.setMonth(cur.getMonth() + 1);
          }
          tList.forEach(t => {
            const raw = t.transaction_date_sec || t.transaction_date || '';
            if (!raw) return;
            const d = new Date(raw);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (monthMap[key]) monthMap[key].rev += Number(t.amount);
          });
          eList.forEach(e => {
            const d = new Date(e.expense_date);
            const key = `${d.getFullYear()}-${d.getMonth()}`;
            if (monthMap[key]) monthMap[key].exp += Number(e.amount);
          });
          chartData = Object.values(monthMap).map(({ label, rev, exp }) => ({
            label, Revenus: rev, Dépenses: exp,
          }));
        }
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
  }, [userId, periodType, getTargetPeriodStart, getPeriodEnd, getCustomChartMode, customStart, customEnd]);

  useEffect(() => { loadData(); }, [loadData, refreshTrigger]);

  const formatCFA = (v: number) =>
    v.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' });

  const periodStart = getTargetPeriodStart();
  const isCurrent = isCurrentPeriod(periodStart);

  const canGoForward = () => {
    if (periodType === 'custom') return false;
    if (periodType === 'week') return !isCurrentWeek(periodStart);
    if (periodType === 'month') return !isCurrentMonth(periodStart);
    return !isCurrentYear(periodStart);
  };

  const getChartTitle = () => {
    if (periodType === 'custom') {
      const mode = getCustomChartMode();
      if (mode === 'day') return 'Jour par jour';
      if (mode === 'week') return 'Semaine par semaine';
      return 'Mois par mois';
    }
    switch (periodType) {
      case 'week': return 'Jour par jour';
      case 'month': return 'Jour par jour';
      case 'year': return 'Mois par mois';
    }
  };

  const periodLabel = (() => {
    if (periodType === 'custom') return 'de la période';
    switch (periodType) {
      case 'week': return 'de la semaine';
      case 'month': return 'du mois';
      case 'year': return "de l'année";
    }
  })();

  const handleImageError = (barberName: string) => {
    setImageErrors(prev => ({ ...prev, [barberName]: true }));
  };

  const handleCustomApply = (start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    // loadData se déclenchera automatiquement via useEffect sur customStart/customEnd
  };

  return (
    <div className="space-y-5 sm:space-y-8">

      {/* ── Navigation période ── */}
      <div className="flex flex-col gap-3">
        <h2 className="text-white text-2xl sm:text-3xl font-bold">Revenus</h2>

        {/* Onglets de type de période */}
        <div className="flex gap-2 flex-wrap">
          {(['week', 'month', 'year'] as PeriodType[]).map(pt => (
            <button key={pt}
              onClick={() => { setPeriodType(pt); setOffset(0); setShowDatePicker(false); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                periodType === pt ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'
              }`}>
              {pt === 'week' ? 'Semaine' : pt === 'month' ? 'Mois' : 'Année'}
            </button>
          ))}

          {/* Bouton plage personnalisée */}
          <button
            onClick={() => {
              if (periodType !== 'custom') {
                setPeriodType('custom');
                setShowDatePicker(true);
              } else {
                setShowDatePicker(prev => !prev);
              }
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition ${
              periodType === 'custom'
                ? 'bg-white text-black'
                : 'bg-zinc-800 text-white hover:bg-zinc-700'
            }`}
          >
            <CalendarRange className="w-4 h-4" />
            Période libre
          </button>
        </div>

        {/* DateRangePicker (affiché si mode custom et ouvert) */}
        {periodType === 'custom' && showDatePicker && (
          <DateRangePicker
            startDate={customStart}
            endDate={customEnd}
            onChange={handleCustomApply}
            onClose={() => setShowDatePicker(false)}
          />
        )}

        {/* Barre navigation précédent/suivant (cachée en mode custom) */}
        {periodType !== 'custom' ? (
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
        ) : (
          /* Affichage de la plage sélectionnée en mode custom */
          <div
            className="flex items-center justify-between bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 cursor-pointer hover:border-zinc-500 transition"
            onClick={() => setShowDatePicker(true)}
          >
            <div className="flex items-center gap-2.5">
              <CalendarRange className="w-4 h-4 text-zinc-400" />
              <div>
                <p className="text-zinc-400 text-xs uppercase tracking-wide font-medium">Période personnalisée</p>
                <p className="text-white text-sm font-bold mt-0.5">
                  {formatCustomLabel(fromInputDate(customStart), fromInputDate(customEnd))}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-zinc-700 text-zinc-300 text-xs px-2.5 py-1 rounded-lg font-medium">
                {diffDays(fromInputDate(customStart), fromInputDate(customEnd)) + 1}j
              </span>
              <span className="text-zinc-500 text-xs">Modifier</span>
            </div>
          </div>
        )}
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

          {/* ── Stats par coiffeur ── */}
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
            <h3 className="text-white text-lg font-bold mb-1">
              {getChartTitle()} — {formatPeriodLabel(periodStart)}
            </h3>
            <p className="text-zinc-500 text-xs mb-5">{stats.transactionCount + stats.expenseCount} opérations</p>

            {stats.chartData.every(d => d.Revenus === 0 && d.Dépenses === 0) ? (
              <div className="text-center text-zinc-500 py-10">Aucune donnée pour cette période</div>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stats.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: '#a1a1aa', fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    interval={
                      periodType === 'month' || (periodType === 'custom' && getCustomChartMode() === 'day')
                        ? Math.floor(stats.chartData.length / 10)
                        : 0
                    }
                  />
                  <YAxis
                    tick={{ fill: '#a1a1aa', fontSize: 10 }}
                    width={56}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => v >= 1000 ? Math.round(v / 1000) + 'k' : v}
                  />
                  <Tooltip
                    formatter={(value: number | undefined) => formatCFA(Number(value ?? 0))}
                    contentStyle={{ backgroundColor: '#18181b', borderRadius: 10, border: '1px solid #3f3f46', fontSize: 12 }}
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                  />
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