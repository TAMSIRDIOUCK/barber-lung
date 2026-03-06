import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export interface Transaction {
  id: string;
  service_name: string;
  category?: string; // produit, teinture, coupe, etc.
  amount: number;
  options?: {
    withTeinture?: boolean;
    produits?: string[];
    soins?: string[];
  };
  transaction_date: string; // ISO string
}

interface TransactionHistoryProps {
  refreshTrigger: number;
}

export default function TransactionHistory({ refreshTrigger }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<'today' | 'week' | 'month' | 'all'>('today');
  const [loading, setLoading] = useState(true);

  const formatCFA = (value: number) =>
    value.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' });

  const loadTransactions = async () => {
    try {
      setLoading(true);

      const now = new Date();
      let startDate: string | null = null;
      let endDate: string | null = null;

      if (filter === 'today') {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
      } else if (filter === 'week') {
        const firstDay = new Date(now);
        firstDay.setDate(now.getDate() - now.getDay());
        firstDay.setHours(0, 0, 0, 0);
        const lastDay = new Date(firstDay);
        lastDay.setDate(firstDay.getDate() + 6);
        lastDay.setHours(23, 59, 59, 999);
        startDate = firstDay.toISOString();
        endDate = lastDay.toISOString();
      } else if (filter === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
      }

      let query = supabase
        .from('transactions')
        .select('*')
        .order('transaction_date', { ascending: false });

      if (startDate && endDate) {
        query = query.gte('transaction_date', startDate).lte('transaction_date', endDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      const unique = Array.from(new Map((data || []).map((t) => [t.id, t])).values());
      setTransactions(unique);
    } catch (err) {
      console.error('❌ Erreur lors du chargement des transactions :', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadAndSubscribe = async () => {
      await loadTransactions();

      const channel = supabase
        .channel('transactions_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'transactions' },
          (payload) => {
            const newTransaction = payload.new as Transaction;
            setTransactions((prev) => {
              if (payload.eventType === 'INSERT') {
                if (prev.find((t) => t.id === newTransaction.id)) return prev;
                return [newTransaction, ...prev];
              } else if (payload.eventType === 'UPDATE') {
                return prev.map((t) => (t.id === newTransaction.id ? newTransaction : t));
              } else if (payload.eventType === 'DELETE') {
                return prev.filter((t) => t.id !== payload.old.id);
              }
              return prev;
            });
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    loadAndSubscribe();
  }, [refreshTrigger, filter]);

  const totals = useMemo(() => {
    const totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalCount = transactions.length;
    return { totalAmount, totalCount };
  }, [transactions]);

  // Fonction pour afficher le service + options
  const displayService = (t: Transaction) => {
    const extras: string[] = [];
    if (t.options?.withTeinture) extras.push('Teinture');
    if (t.options?.produits && t.options.produits.length > 0) extras.push(...t.options.produits);
    if (t.options?.soins && t.options.soins.length > 0) extras.push(...t.options.soins);
    if (extras.length > 0) return `${t.service_name} (${extras.join(', ')})`;
    return t.service_name;
  };

  return (
    <div className="space-y-6">
      {/* Filtres */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-white text-2xl font-bold">Historique des Achats et Services</h2>
        <div className="flex flex-wrap gap-2">
          {(['today', 'week', 'month', 'all'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === f ? 'bg-white text-black shadow-md' : 'bg-zinc-800 text-white hover:bg-zinc-700'
              }`}
            >
              {f === 'today' && "Aujourd'hui"}
              {f === 'week' && 'Semaine'}
              {f === 'month' && 'Mois'}
              {f === 'all' && 'Tout'}
            </button>
          ))}
        </div>
      </div>

      {/* Totaux */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 flex justify-between items-center">
          <span className="text-white font-bold text-lg">Total des ventes :</span>
          <span className="text-white font-bold text-lg">{formatCFA(totals.totalAmount)}</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 flex justify-between items-center">
          <span className="text-white font-bold text-lg">Nombre total :</span>
          <span className="text-white font-bold text-lg">{totals.totalCount}</span>
        </div>
      </div>

      {/* Tableau */}
      <div className="overflow-x-auto">
        {loading ? (
          <div className="text-white py-4">Chargement...</div>
        ) : transactions.length === 0 ? (
          <div className="text-white py-4">Aucune transaction enregistrée</div>
        ) : (
          <table className="min-w-full text-left text-white bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden mt-4">
            <thead>
              <tr className="border-b border-zinc-700">
                <th className="px-4 py-2">Nom</th>
                <th className="px-4 py-2">Catégorie</th>
                <th className="px-4 py-2">Montant (CFA)</th>
                <th className="px-4 py-2">Date & Heure</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr key={t.id} className="border-b border-zinc-800 hover:bg-zinc-800 transition">
                  <td className="px-4 py-2">{displayService(t)}</td>
                  <td className="px-4 py-2 capitalize">{t.category || 'Service'}</td>
                  <td className="px-4 py-2 font-semibold">{formatCFA(Number(t.amount))}</td>
                  <td className="px-4 py-2">
                    {new Date(t.transaction_date).toLocaleString('fr-FR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}