import { useState, useEffect } from 'react';
import { supabase, Expense } from '../lib/supabase';
import { Trash2, AlertCircle, Clock } from 'lucide-react';

interface ExpensesPageProps {
  onExpenseAdded: () => void;
}

export default function ExpensesPage({ onExpenseAdded }: ExpensesPageProps) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number>(0);

  useEffect(() => {
    loadExpenses();
  }, []);

  // Charger les dépenses depuis Supabase
  async function loadExpenses() {
    try {
      const { data, error } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false });

      if (error) throw error;

      const expensesData: Expense[] = data || [];
      setExpenses(expensesData);

      // Calcul du total
      const totalAmount = expensesData.reduce((acc, e) => acc + Number(e.amount), 0);
      setTotal(totalAmount);
    } catch (error) {
      console.error('Erreur lors du chargement des dépenses :', error);
    }
  }

  // Ajouter une dépense
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim() || !amount || Number(amount) <= 0) {
      alert('Veuillez remplir tous les champs correctement');
      return;
    }

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('expenses')
        .insert({
          name: name.trim(),
          amount: Number(amount),
          expense_date: new Date().toISOString(),
        })
        .select(); // récupère l'objet complet avec created_at et id

      if (error) throw error;

      if (data && data.length > 0) {
        const newExpense: Expense = data[0];

        // Mise à jour locale
        const updatedExpenses = [newExpense, ...expenses];
        setExpenses(updatedExpenses);

        const updatedTotal = updatedExpenses.reduce((acc, e) => acc + Number(e.amount), 0);
        setTotal(updatedTotal);
      }

      setName('');
      setAmount('');
      onExpenseAdded();
    } catch (error) {
      console.error('Erreur lors de l’ajout de la dépense :', error);
      alert('Erreur lors de l\'ajout de la dépense');
    } finally {
      setLoading(false);
    }
  }

  // Supprimer une dépense
  async function handleDelete(id: string) {
    if (!confirm('Êtes-vous sûr de vouloir supprimer cette dépense ?')) return;

    try {
      const { error } = await supabase.from('expenses').delete().eq('id', id);
      if (error) throw error;

      // Mise à jour locale
      const updatedExpenses = expenses.filter(e => e.id !== id);
      setExpenses(updatedExpenses);

      const updatedTotal = updatedExpenses.reduce((acc, e) => acc + Number(e.amount), 0);
      setTotal(updatedTotal);

      onExpenseAdded();
    } catch (error) {
      console.error('Erreur lors de la suppression :', error);
      alert('Erreur lors de la suppression');
    }
  }

  const formatCFA = (value: number) =>
    value.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-white text-3xl font-bold">Dépenses du Salon</h2>

      {/* Formulaire de nouvelle dépense */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6">
        <h3 className="text-white text-xl font-semibold mb-4">Nouvelle Dépense</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-2">Nom de la Dépense</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Fournitures, Électricité..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
              required
            />
          </div>

          <div>
            <label className="block text-zinc-400 text-sm font-medium mb-2">Montant (XOF)</label>
            <input
              type="number"
              step="1"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-white transition-colors"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
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

      {/* Historique des dépenses */}
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
                className="bg-zinc-800 border border-zinc-700 rounded-lg p-4 flex items-center justify-between hover:bg-zinc-750 transition-colors"
              >
                <div className="flex-1">
                  <h4 className="text-white font-semibold text-lg mb-2">{expense.name}</h4>
                  <div className="flex items-center gap-2 text-zinc-400 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>{formatDate(expense.expense_date)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-red-400 text-2xl font-bold">{formatCFA(Number(expense.amount))}</div>

                  <button
                    onClick={() => handleDelete(expense.id)}
                    className="p-2 text-zinc-500 hover:text-red-400 hover:bg-zinc-900 rounded-lg transition-colors"
                    title="Supprimer"
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
