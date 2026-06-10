import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { Trash2, AlertCircle, Clock } from 'lucide-react';

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

export default function ExpensesPage({ userId, onExpenseAdded }: ExpensesPageProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number>(0);

  const loadExpenses = useCallback(async () => {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('user_id', userId)
      .order('expense_date', { ascending: false });
    if (error) { console.error(error); return; }
    const exp = data || [];
    setExpenses(exp);
    setTotal(exp.reduce((acc, e) => acc + Number(e.amount), 0));
  }, [userId]); // userId correctly in deps

  // loadExpenses in deps — stable because userId is stable
  useEffect(() => { loadExpenses(); }, [loadExpenses]);

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
      setTotal(updated.reduce((acc, e) => acc + Number(e.amount), 0));
      setName(''); setAmount('');
      onExpenseAdded();
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
    setTotal(updated.reduce((acc, e) => acc + Number(e.amount), 0));
    onExpenseAdded();
  }

  const formatCFA = (value: number) =>
    value.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' });
  const formatDate = (d: string) =>
    new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });

  return (
    <div className="space-y-6">
      <h2 className="text-white text-3xl font-bold">Dépenses du Salon</h2>

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

      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-white text-xl font-semibold">Historique des Dépenses</h3>
          <div className="text-right">
            <div className="text-zinc-400 text-sm">Total</div>
            <div className="text-red-400 text-2xl font-bold">{formatCFA(total)}</div>
          </div>
        </div>
        {expenses.length === 0 ? (
          <div className="text-center text-zinc-500 py-12">Aucune dépense enregistrée</div>
        ) : (
          <div className="space-y-3">
            {expenses.map((expense) => (
              <div
                key={expense.id}
                className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex items-center justify-between"
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