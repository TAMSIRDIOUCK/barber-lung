// src/components/ExpensesPage.tsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Trash2, AlertCircle, Clock, Calendar, ChevronLeft, ChevronRight, CalendarRange, Filter } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';

interface Expense {
  id: string;
  name: string;
  amount: number;
  expense_date: string;
  user_id?: string;
}

interface ExpensesPageProps {
  userId: string;
  onExpenseAdded: () => void;
}

// ── Helpers période ──
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

function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function getMonthEnd(monthStart: Date): Date {
  return new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0, 23, 59, 59, 999);
}

function getYearStart(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function getYearEnd(yearStart: Date): Date {
  return new Date(yearStart.getFullYear(), 11, 31, 23, 59, 59, 999);
}

function formatWeekLabel(weekStart: Date): string {
  const end = getWeekEnd(weekStart);
  const fmtDay = (d: Date) => d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  return `${fmtDay(weekStart)} → ${fmtDay(end)}`;
}

function formatMonthLabel(monthStart: Date): string {
  return monthStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function formatYearLabel(yearStart: Date): string {
  return yearStart.getFullYear().toString();
}

function isCurrentWeek(weekStart: Date): boolean {
  return weekStart.toDateString() === getWeekStart(new Date()).toDateString();
}

function isCurrentMonth(monthStart: Date): boolean {
  const now = new Date();
  return monthStart.getMonth() === now.getMonth() && monthStart.getFullYear() === now.getFullYear();
}

function isCurrentYear(yearStart: Date): boolean {
  return yearStart.getFullYear() === new Date().getFullYear();
}

const MOIS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
const JOURS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

type PeriodType = 'day' | 'week' | 'month' | 'year';

export default function ExpensesPage({ userId, onExpenseAdded }: ExpensesPageProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number>(0);

  // ── Filtres de période ──
  const [periodType, setPeriodType] = useState<PeriodType>('month');
  const [offset, setOffset] = useState(0);

  // ── Données pour le graphique ──
  const [chartData, setChartData] = useState<Array<{ label: string; Dépenses: number }>>([]);

  // ── Calcul des bornes de la période ──
  const getTargetPeriodStart = useCallback((): Date => {
    const base = new Date();
    switch (periodType) {
      case 'day': {
        const d = new Date(base);
        d.setDate(d.getDate() + offset);
        d.setHours(0, 0, 0, 0);
        return d;
      }
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
      case 'day': {
        const d = new Date(start);
        d.setHours(23, 59, 59, 999);
        return d;
      }
      case 'week': return getWeekEnd(start);
      case 'month': return getMonthEnd(start);
      case 'year': return getYearEnd(start);
    }
  }, [periodType]);

  const isCurrentPeriod = useCallback((start: Date): boolean => {
    switch (periodType) {
      case 'day': {
        const today = new Date();
        return start.toDateString() === today.toDateString();
      }
      case 'week': return isCurrentWeek(start);
      case 'month': return isCurrentMonth(start);
      case 'year': return isCurrentYear(start);
    }
  }, [periodType]);

  const formatPeriodLabel = useCallback((start: Date): string => {
    switch (periodType) {
      case 'day': return start.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      case 'week': return formatWeekLabel(start);
      case 'month': return formatMonthLabel(start);
      case 'year': return formatYearLabel(start);
    }
  }, [periodType]);

  const getPeriodOffsetText = useCallback((): string => {
    if (offset === 0) {
      switch (periodType) {
        case 'day': return "Aujourd'hui";
        case 'week': return 'Cette semaine';
        case 'month': return 'Ce mois';
        case 'year': return 'Cette année';
      }
    }
    const abs = Math.abs(offset);
    const suffix = abs > 1 ? 's' : '';
    if (offset < 0) {
      switch (periodType) {
        case 'day': return `Il y a ${abs} jour${suffix}`;
        case 'week': return `Il y a ${abs} semaine${suffix}`;
        case 'month': return `Il y a ${abs} mois`;
        case 'year': return `Il y a ${abs} an${suffix}`;
      }
    } else {
      switch (periodType) {
        case 'day': return `Dans ${abs} jour${suffix}`;
        case 'week': return `Dans ${abs} semaine${suffix}`;
        case 'month': return `Dans ${abs} mois`;
        case 'year': return `Dans ${abs} an${suffix}`;
      }
    }
  }, [periodType, offset]);

  const canGoForward = () => {
    const start = getTargetPeriodStart();
    return !isCurrentPeriod(start);
  };

  const loadExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('expense_date', { ascending: false });
    if (error) { console.error(error); return; }
    const exp = data || [];
    setExpenses(exp);
  }, [userId]);

  // ── Filtrage des dépenses par période ──
  const filterExpensesByPeriod = useCallback(() => {
    const periodStart = getTargetPeriodStart();
    const periodEnd = getPeriodEnd(periodStart);
    
    const filtered = expenses.filter(exp => {
      const expDate = new Date(exp.expense_date);
      return expDate >= periodStart && expDate <= periodEnd;
    });
    
    setFilteredExpenses(filtered);
    setTotal(filtered.reduce((acc, e) => acc + Number(e.amount), 0));

    // ── Construire les données du graphique ──
    let chartData: Array<{ label: string; Dépenses: number }> = [];

    if (periodType === 'day') {
      // Par heure pour la journée
      const hourlyMap: Record<number, number> = {};
      for (let i = 0; i < 24; i++) hourlyMap[i] = 0;
      filtered.forEach(exp => {
        const d = new Date(exp.expense_date);
        const h = d.getHours();
        hourlyMap[h] = (hourlyMap[h] || 0) + Number(exp.amount);
      });
      chartData = Object.entries(hourlyMap).map(([h, val]) => ({
        label: `${h}h`,
        Dépenses: val,
      }));

    } else if (periodType === 'week') {
      // Par jour de la semaine
      const dailyMap: Record<string, number> = {};
      for (let i = 0; i < 7; i++) {
        const d = new Date(periodStart);
        d.setDate(periodStart.getDate() + i);
        dailyMap[d.toLocaleDateString('fr-FR')] = 0;
      }
      filtered.forEach(exp => {
        const key = new Date(exp.expense_date).toLocaleDateString('fr-FR');
        if (dailyMap[key] !== undefined) dailyMap[key] += Number(exp.amount);
      });
      chartData = Object.entries(dailyMap).map(([, val], i) => {
        const d = new Date(periodStart);
        d.setDate(periodStart.getDate() + i);
        return { label: `${JOURS[d.getDay()]} ${d.getDate()}`, Dépenses: val };
      });

    } else if (periodType === 'month') {
      // Par jour du mois
      const year = periodStart.getFullYear();
      const month = periodStart.getMonth();
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const dailyMap: Record<string, number> = {};
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        dailyMap[d.toLocaleDateString('fr-FR')] = 0;
      }
      filtered.forEach(exp => {
        const key = new Date(exp.expense_date).toLocaleDateString('fr-FR');
        if (dailyMap[key] !== undefined) dailyMap[key] += Number(exp.amount);
      });
      chartData = Object.entries(dailyMap).map(([dateStr, val]) => {
        const parts = dateStr.split('/');
        const d = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        return { label: `${d.getDate()} ${MOIS[d.getMonth()]}`, Dépenses: val };
      });

    } else if (periodType === 'year') {
      // Par mois de l'année
      const year = periodStart.getFullYear();
      const monthlyMap: Record<number, number> = {};
      for (let i = 0; i < 12; i++) monthlyMap[i] = 0;
      filtered.forEach(exp => {
        const d = new Date(exp.expense_date);
        if (d.getFullYear() === year) {
          monthlyMap[d.getMonth()] = (monthlyMap[d.getMonth()] || 0) + Number(exp.amount);
        }
      });
      chartData = Object.entries(monthlyMap).map(([m, val]) => ({
        label: MOIS[parseInt(m)],
        Dépenses: val,
      }));
    }

    setChartData(chartData);
  }, [expenses, periodType, getTargetPeriodStart, getPeriodEnd]);

  // ── Chargement initial ──
  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  // ── Filtrage à chaque changement ──
  useEffect(() => { filterExpensesByPeriod(); }, [filterExpensesByPeriod]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !amount || Number(amount) <= 0) return alert('Remplissez tous les champs');
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('expenses')
        .insert({
          name: name.trim(),
          amount: Number(amount),
          expense_date: new Date().toISOString(),
          user_id: userId,
        })
        .select()
        .single();
      if (error) throw error;
      const updated = [data, ...expenses];
      setExpenses(updated);
      setName(''); setAmount('');
      onExpenseAdded();
      // Recharger pour mettre à jour les filtres
      await loadExpenses();
    } catch (error) {
      console.error(error); alert("Erreur lors de l'ajout");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) return;
    const { error } = await supabase.from('expenses').delete().eq('id', id);
    if (error) { console.error(error); return; }
    const updated = expenses.filter(e => e.id !== id);
    setExpenses(updated);
    onExpenseAdded();
  }

  const formatCFA = (value: number) =>
    value.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' });
    
  const formatDate = (d: string) =>
    new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  const periodStart = getTargetPeriodStart();
  const isCurrent = isCurrentPeriod(periodStart);

  return (
    <div className="space-y-6">
      <h2 className="text-white text-3xl font-bold">Dépenses du Salon</h2>

      {/* ── Navigation période ── */}
      <div className="flex flex-col gap-3">
        {/* Onglets de type de période */}
        <div className="flex gap-2 flex-wrap">
          {(['day', 'week', 'month', 'year'] as PeriodType[]).map(pt => (
            <button
              key={pt}
              onClick={() => { setPeriodType(pt); setOffset(0); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
                periodType === pt ? 'bg-white text-black' : 'bg-zinc-800 text-white hover:bg-zinc-700'
              }`}
            >
              {pt === 'day' ? 'Jour' : pt === 'week' ? 'Semaine' : pt === 'month' ? 'Mois' : 'Année'}
            </button>
          ))}
        </div>

        {/* Barre navigation précédent/suivant */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOffset(o => o - 1)}
            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2 rounded-xl text-sm font-medium transition"
          >
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
          <button
            onClick={() => setOffset(o => o + 1)}
            disabled={!canGoForward()}
            className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-2 rounded-xl text-sm font-medium transition"
          >
            Suivant <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Formulaire d'ajout ── */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6">
        <h3 className="text-white text-xl font-semibold mb-4">Nouvelle Dépense</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-2">Nom de la Dépense</label>
            <input
              type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Fournitures, Électricité..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
              required
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-2">Montant (XOF)</label>
            <input
              type="number" step="1" min="1" value={amount}
              onChange={(e) => setAmount(e.target.value)} placeholder="0"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
              required
            />
          </div>
          <button
            type="submit" disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-bold py-4 rounded-lg transition-colors"
          >
            {loading ? 'Enregistrement...' : 'VALIDER'}
          </button>
        </form>
        <div className="mt-4 p-4 bg-zinc-800 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
          <p className="text-zinc-300 text-sm">
            Cette dépense sera automatiquement déduite du revenu total du salon.
          </p>
        </div>
      </div>

      {/* ── Graphique ── */}
      {filteredExpenses.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6">
          <h3 className="text-white text-lg font-bold mb-1">
            Répartition des dépenses — {formatPeriodLabel(periodStart)}
          </h3>
          <p className="text-zinc-500 text-xs mb-5">{filteredExpenses.length} dépenses</p>

          {chartData.every(d => d.Dépenses === 0) ? (
            <div className="text-center text-zinc-500 py-10">Aucune dépense pour cette période</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: '#a1a1aa', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  interval={chartData.length > 15 ? Math.floor(chartData.length / 10) : 0}
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
                <Bar dataKey="Dépenses" fill="#ef4444" radius={[6, 6, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}

      {/* ── Liste des dépenses ── */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-white text-xl font-semibold">Historique des Dépenses</h3>
            <p className="text-zinc-500 text-xs mt-1">
              {filteredExpenses.length} dépense{filteredExpenses.length > 1 ? 's' : ''} pour la période
            </p>
          </div>
          <div className="text-right">
            <div className="text-zinc-400 text-sm">Total</div>
            <div className="text-red-400 text-2xl font-bold">{formatCFA(total)}</div>
          </div>
        </div>
        {filteredExpenses.length === 0 ? (
          <div className="text-center text-zinc-500 py-12">
            <Calendar className="w-12 h-12 mx-auto mb-3 text-zinc-600" />
            Aucune dépense pour cette période
          </div>
        ) : (
          <div className="space-y-3">
            {filteredExpenses.map((expense) => (
              <div
                key={expense.id}
                className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex items-center justify-between hover:bg-zinc-750 transition"
              >
                <div className="flex-1">
                  <h4 className="text-white font-semibold text-lg mb-2">{expense.name}</h4>
                  <div className="flex items-center gap-2 text-zinc-400 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>{formatDate(expense.expense_date)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-red-400 text-2xl font-bold">
                    {formatCFA(Number(expense.amount))}
                  </div>
                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}