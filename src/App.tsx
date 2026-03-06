// src/App.tsx
import { useState } from 'react';
import { supabase } from './lib/supabase';
import { Scissors, TrendingUp, DollarSign } from 'lucide-react';
import { ServiceSelector } from './components/ServiceSelector';
import TransactionHistory from './components/TransactionHistory';
import RevenuePage from './components/RevenuePage';
import ExpensesPage from './components/ExpensesPage';

type Page = 'home' | 'revenue' | 'expenses';

export interface ServiceOption {
  withTeinture?: boolean;
  withSoin?: boolean;
}

interface LastTransaction {
  receiptNumber: string;
  serviceName: string;
  amount: number;
  date: string;
}

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [showTicket, setShowTicket] = useState(false);
  const [lastTransaction, setLastTransaction] = useState<LastTransaction | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleServiceConfirm = async (
    serviceName: string,
    amount: number,
    options: ServiceOption
  ) => {
    if (isProcessing) return;

    setIsProcessing(true);
    try {
      const now = new Date();
      const oneSecondAgo = new Date(now.getTime() - 1000);

      const { data: existing, error: checkError } = await supabase
        .from('transactions')
        .select('*')
        .eq('service_name', serviceName)
        .gte('transaction_date', oneSecondAgo.toISOString());

      if (checkError) throw checkError;

      if (existing && existing.length > 0) {
        alert('Ce service a déjà été validé à l’instant.');
        return;
      }

      const { data, error } = await supabase
        .from('transactions')
        .insert([
          {
            id: crypto.randomUUID(),
            service_name: serviceName,
            amount,
            with_teinture: options.withTeinture || false,
            with_soin: options.withSoin || false,
            transaction_date: now.toISOString(),
          },
        ])
        .select()
        .single();

      if (error) throw error;

      const receiptNumber = `BL${Date.now()}`;
      setLastTransaction({
        receiptNumber,
        serviceName,
        amount,
        date: data.transaction_date,
      });

      setShowTicket(true);
      setRefreshTrigger(prev => prev + 1);
    } catch (error: any) {
      console.error('Erreur transaction :', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExpenseAdded = () => {
    setRefreshTrigger(prev => prev + 1);
  };

  return (
    <div className="min-h-screen bg-black">
      {/* HEADER */}
      <header className="bg-zinc-900 border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center flex flex-col items-center justify-center gap-2 mb-6">
            <div className="flex items-center gap-4">
              <div className="bg-white p-3 rounded-xl">
                <Scissors className="w-12 h-12 text-black" />
              </div>
              <h1 className="text-white text-5xl font-bold tracking-tight">BARBER LOUNGE</h1>
            </div>
            <p className="text-zinc-400 text-lg">Système de Gestion Professionnel</p>
          </div>

          {/* NAVIGATION */}
          <nav className="flex flex-wrap justify-center gap-2">
            {['home', 'revenue', 'expenses'].map(page => {
              const label = page === 'home' ? 'Services' : page === 'revenue' ? 'Revenue Totale' : 'Dépenses';
              const Icon = page === 'home' ? Scissors : page === 'revenue' ? TrendingUp : DollarSign;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page as Page)}
                  disabled={isProcessing}
                  className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                    currentPage === page
                      ? 'bg-white text-black'
                      : 'bg-zinc-800 text-white hover:bg-zinc-700'
                  } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Icon className="w-5 h-5" /> {label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* MAIN */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentPage === 'home' && (
          <div className="flex flex-col gap-8">
            <h2 className="text-white text-2xl font-bold mb-6 text-center">
              Sélectionnez un Service
            </h2>

            <div key="service-selector">
              <ServiceSelector onConfirm={handleServiceConfirm} />
            </div>

            <div className="mt-8">
              <h3 className="text-white text-xl font-semibold mb-4 text-center">
                Historique des Transactions
              </h3>
              <TransactionHistory refreshTrigger={refreshTrigger} />
            </div>
          </div>
        )}

        {currentPage === 'revenue' && <RevenuePage refreshTrigger={refreshTrigger} />}
        {currentPage === 'expenses' && <ExpensesPage onExpenseAdded={handleExpenseAdded} />}
      </main>
    </div>
  );
}

export default App;