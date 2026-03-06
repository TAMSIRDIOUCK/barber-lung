// src/components/RevenuePage.tsx
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { TrendingUp, TrendingDown } from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

interface RevenuePageProps {
  refreshTrigger: number;
}

interface RevenueStats {
  totalRevenue: number;
  totalExpenses: number;
  netRevenue: number;
  transactionCount: number;
  expenseCount: number;
  dailyData: Array<{ date: string; revenue: number; expenses: number }>;
}

export default function RevenuePage({ refreshTrigger }: RevenuePageProps) {
  const [stats, setStats] = useState<RevenueStats>({
    totalRevenue: 0,
    totalExpenses: 0,
    netRevenue: 0,
    transactionCount: 0,
    expenseCount: 0,
    dailyData: [],
  });

  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>('today');

  useEffect(() => {
    loadRevenueData();
  }, [refreshTrigger, period]);

  async function loadRevenueData() {
    try {
      const now = new Date();
      let startDate: Date;

      // Définit la période pour la courbe (toujours historique complet)
      if (period === 'week') {
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 6);
      } else if (period === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      } else if (period === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1);
      } else {
        // today → on prend l'année entière pour la courbe
        startDate = new Date(now.getFullYear(), 0, 1);
      }

      // Récupération transactions et dépenses pour la courbe
      const { data: transactions, error: transError } = await supabase
        .from('transactions')
        .select('amount, transaction_date')
        .gte('transaction_date', startDate.toISOString())
        .order('transaction_date', { ascending: true });

      const { data: expenses, error: expError } = await supabase
        .from('expenses')
        .select('amount, expense_date')
        .gte('expense_date', startDate.toISOString())
        .order('expense_date', { ascending: true });

      if (transError) throw transError;
      if (expError) throw expError;

      // --- Calcul des stats principales ---
      let filteredTransactions = transactions || [];
      let filteredExpenses = expenses || [];

      if (period === 'today') {
        const todayStr = now.toLocaleDateString('fr-FR');
        filteredTransactions = filteredTransactions.filter(
          (t) => new Date(t.transaction_date).toLocaleDateString('fr-FR') === todayStr
        );
        filteredExpenses = filteredExpenses.filter(
          (e) => new Date(e.expense_date).toLocaleDateString('fr-FR') === todayStr
        );
      }

      const totalRevenue = filteredTransactions.reduce((sum, t) => sum + Number(t.amount), 0);
      const totalExpenses = filteredExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

      // --- Préparer les données pour la courbe ---
      const dailyMap = new Map<string, { revenue: number; expenses: number }>();

      (transactions || []).forEach((t) => {
        const date = new Date(t.transaction_date).toLocaleDateString('fr-FR');
        const existing = dailyMap.get(date) || { revenue: 0, expenses: 0 };
        dailyMap.set(date, { ...existing, revenue: existing.revenue + Number(t.amount) });
      });

      (expenses || []).forEach((e) => {
        const date = new Date(e.expense_date).toLocaleDateString('fr-FR');
        const existing = dailyMap.get(date) || { revenue: 0, expenses: 0 };
        dailyMap.set(date, { ...existing, expenses: existing.expenses + Number(e.amount) });
      });

      const dateArray: string[] = [];
      let currentDate = new Date(startDate);
      const today = new Date();
      while (currentDate <= today) {
        dateArray.push(currentDate.toLocaleDateString('fr-FR'));
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const dailyData = dateArray.map((date) => {
        const data = dailyMap.get(date);
        return {
          date,
          revenue: data?.revenue || 0,
          expenses: data?.expenses || 0,
        };
      });

      setStats({
        totalRevenue,
        totalExpenses,
        netRevenue: totalRevenue - totalExpenses,
        transactionCount: filteredTransactions.length,
        expenseCount: filteredExpenses.length,
        dailyData,
      });
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error);
    }
  }

  const formatCFA = (value: number) =>
    value.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' });

  return (
    <div className="space-y-8">
      {/* Header & Période */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-white text-3xl font-bold">Revenue Totale</h2>
        <div className="flex gap-2 flex-wrap">
          {(['today', 'week', 'month', 'year'] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-5 py-3 rounded-xl font-medium transition-colors ${
                period === p
                  ? 'bg-white text-black shadow-md'
                  : 'bg-zinc-800 text-white hover:bg-zinc-700'
              }`}
            >
              {p === 'today' && 'Aujourd’hui'}
              {p === 'week' && 'Cette Semaine'}
              {p === 'month' && 'Mois'}
              {p === 'year' && 'Année'}
            </button>
          ))}
        </div>
      </div>

      {/* Statistiques principales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        {/* Revenus */}
        <div className="bg-gradient-to-br from-green-900 to-green-950 border border-green-800 rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-green-300 text-sm font-medium uppercase tracking-wide">Revenus</h3>
            <TrendingUp className="w-6 h-6 text-green-400" />
          </div>
          <p className="text-white text-3xl sm:text-4xl font-bold">{formatCFA(stats.totalRevenue)}</p>
          <p className="text-green-300 text-sm">
            {stats.transactionCount} {stats.transactionCount === 1 ? 'transaction' : 'transactions'}
          </p>
        </div>

        {/* Dépenses */}
        <div className="bg-gradient-to-br from-red-900 to-red-950 border border-red-800 rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-red-300 text-sm font-medium uppercase tracking-wide">Dépenses</h3>
            <TrendingDown className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-white text-3xl sm:text-4xl font-bold">{formatCFA(stats.totalExpenses)}</p>
          <p className="text-red-300 text-sm">
            {stats.expenseCount} {stats.expenseCount === 1 ? 'dépense' : 'dépenses'}
          </p>
        </div>

        {/* Revenue Net */}
        <div className="bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-600 rounded-2xl p-6 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-zinc-300 text-sm font-medium uppercase tracking-wide">Revenue Net</h3>
          </div>
          <p className={`text-3xl sm:text-4xl font-bold ${stats.netRevenue >= 0 ? 'text-white' : 'text-red-400'}`}>
            {formatCFA(stats.netRevenue)}
          </p>
          <p className="text-zinc-400 text-sm">Après déduction des dépenses</p>
        </div>
      </div>

      {/* Courbe d'évolution */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 overflow-x-auto">
        <h3 className="text-white text-xl font-bold mb-6">Évolution en Temps Réel</h3>

        {stats.dailyData.length === 0 ? (
          <div className="text-center text-zinc-500 py-12">Aucune donnée disponible pour cette période</div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.dailyData}>
              <CartesianGrid stroke="#444" strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fill: '#ccc', fontSize: 12 }} />
              <YAxis tick={{ fill: '#ccc', fontSize: 12 }} />
              <Tooltip
                formatter={(value: any) => formatCFA(Number(value))}
                contentStyle={{ backgroundColor: '#1f2937', borderRadius: 6, border: 'none' }}
              />
              <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={3} dot={false} />
              <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={3} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}

        <div className="mt-6 pt-6 border-t border-zinc-800 flex flex-wrap items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-500 rounded"></div>
            <span className="text-zinc-400">Revenus</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-zinc-400">Dépenses</span>
          </div>
        </div>
      </div>
    </div>
  );
}