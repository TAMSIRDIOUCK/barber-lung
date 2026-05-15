import { useState, useEffect, useMemo, useCallback } from 'react';
import { Trash2, ChevronLeft, ChevronRight, CheckCircle, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';

export interface Transaction {
  id: string;
  service_id?: string;
  service_name: string;
  amount: number;
  with_teinture?: boolean;
  with_soin?: boolean;
  transaction_date?: string;
  transaction_date_sec?: string;
  barber_name?: string;
  barber_photo?: string;
  user_id?: string;
}

interface TransactionHistoryProps {
  userId: string;
  refreshTrigger: number;
}

// Cache pour les photos des coiffeurs
let barberPhotoCache: Record<string, string> = {};
let barberNameMapping: Record<string, string> = {}; // Pour gérer les changements de nom

function getDayStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDayEnd(dayStart: Date): Date {
  const end = new Date(dayStart);
  end.setHours(23, 59, 59, 999);
  return end;
}

function isCurrentDay(dayStart: Date): boolean {
  return dayStart.toDateString() === getDayStart(new Date()).toDateString();
}

function dayLabel(_: Date, offset: number): string {
  if (offset === 0) return "📅 Aujourd'hui";
  if (offset === -1) return '⬅️ Hier';
  if (offset === 1) return 'Demain ➡️';
  if (offset < 0) return `⬅️ Il y a ${Math.abs(offset)} jours`;
  return `Dans ${offset} jours ➡️`;
}

function dayDateRange(dayStart: Date): string {
  return dayStart.toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function toTransactionRow(t: Transaction) {
  return {
    id: t.id,
    service_id: t.service_id ?? null,
    service_name: t.service_name ?? null,
    amount: t.amount ?? 0,
    with_teinture: t.with_teinture ?? null,
    with_soin: t.with_soin ?? null,
    transaction_date: t.transaction_date ?? null,
    transaction_date_sec: t.transaction_date_sec ?? null,
    barber_name: t.barber_name ?? null,
    barber_photo: t.barber_photo ?? null,
    user_id: t.user_id ?? null,
  };
}

export default function TransactionHistory({ userId, refreshTrigger }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [deletedTransactions, setDeletedTransactions] = useState<Transaction[]>([]);
  const [dayOffset, setDayOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [barberInfos, setBarberInfos] = useState<Record<string, { name: string; photo: string }>>({});

  const formatCFA = (v: number) =>
    v.toLocaleString('fr-FR', { style: 'currency', currency: 'XOF' });

  const getDate = (t: Transaction) =>
    t.transaction_date_sec || t.transaction_date || '';

  const targetDayStart = useCallback((): Date => {
    const base = getDayStart(new Date());
    base.setDate(base.getDate() + dayOffset);
    return base;
  }, [dayOffset]);

  // Fonction pour récupérer toutes les informations des coiffeurs (nom actuel + photo)
  const fetchBarberInfos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('barbers')
        .select('id, name, photo')
        .eq('user_id', userId);
      
      if (!error && data) {
        const newInfos: Record<string, { name: string; photo: string }> = {};
        const newCache: Record<string, string> = {};
        
        data.forEach((barber: { id: string; name: string; photo: string }) => {
          newInfos[barber.name] = { name: barber.name, photo: barber.photo };
          newCache[barber.name] = barber.photo;
          
          // Stocker aussi par ID pour les recherches
          barberNameMapping[barber.id] = barber.name;
        });
        
        setBarberInfos(newInfos);
        barberPhotoCache = newCache;
      }
    } catch (err) {
      console.error('Erreur chargement infos coiffeurs:', err);
    }
  }, [userId]);

  // Fonction pour obtenir le nom actuel d'un coiffeur (après modification)
  const getCurrentBarberName = (oldName: string): string => {
    // Chercher si le nom existe toujours dans les infos
    if (barberInfos[oldName]) {
      return barberInfos[oldName].name;
    }
    
    // Chercher par correspondance (si le coiffeur a été renommé)
    for (const [currentName, info] of Object.entries(barberInfos)) {
      if (info.name === oldName) {
        return currentName;
      }
    }
    
    return oldName;
  };

  // Fonction pour obtenir la photo d'un coiffeur
  const getBarberPhoto = (barberName: string): string | null => {
    const currentName = getCurrentBarberName(barberName);
    const info = barberInfos[currentName];
    return info?.photo || barberPhotoCache[currentName] || null;
  };

  // Fonction pour obtenir le nom d'affichage du coiffeur
  const getDisplayBarberName = (barberName: string): string => {
    return getCurrentBarberName(barberName);
  };

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const dayStart = targetDayStart();
      const dayEnd = getDayEnd(dayStart);

      const { data: active, error: e1 } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', userId)
        .gte('transaction_date_sec', dayStart.toISOString())
        .lte('transaction_date_sec', dayEnd.toISOString())
        .order('transaction_date_sec', { ascending: false });

      if (e1) throw e1;

      const { data: deleted, error: e2 } = await supabase
        .from('deleted_transactions')
        .select('*')
        .eq('user_id', userId)
        .gte('transaction_date_sec', dayStart.toISOString())
        .lte('transaction_date_sec', dayEnd.toISOString())
        .order('transaction_date_sec', { ascending: false });

      if (e2) throw e2;

      setTransactions(active || []);
      setDeletedTransactions(deleted || []);
      
    } catch (err) {
      console.error('Erreur chargement:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, targetDayStart]);

  useEffect(() => {
    fetchBarberInfos();
  }, [fetchBarberInfos]);

  useEffect(() => { 
    loadTransactions(); 
  }, [loadTransactions, refreshTrigger]);

  // Recharger les infos des coiffeurs périodiquement pour les mises à jour
  useEffect(() => {
    const interval = setInterval(() => {
      fetchBarberInfos();
    }, 30000); // Toutes les 30 secondes
    
    return () => clearInterval(interval);
  }, [fetchBarberInfos]);

  const handleDelete = async (id: string, serviceName?: string) => {
    if (!confirm(`Voulez-vous vraiment supprimer "${serviceName || 'cette transaction'}" ?`)) return;

    setDeletingId(id);
    const t = transactions.find(tx => tx.id === id);
    setTransactions(prev => prev.filter(tx => tx.id !== id));

    try {
      if (t) {
        const { error: e1 } = await supabase
          .from('deleted_transactions')
          .insert([toTransactionRow(t)]);
        if (e1) throw e1;
      }
      const { error: e2 } = await supabase.from('transactions').delete().eq('id', id);
      if (e2) throw e2;

      if (t) setDeletedTransactions(prev => [t, ...prev]);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    } catch (err) {
      console.error('Erreur suppression:', err);
      await loadTransactions();
    } finally {
      setDeletingId(null);
    }
  };

  const handleRestore = async (id: string) => {
    const t = deletedTransactions.find(tx => tx.id === id);
    if (!t) return;

    setRestoringId(id);
    setDeletedTransactions(prev => prev.filter(tx => tx.id !== id));

    try {
      const { error: e1 } = await supabase.from('transactions').insert([toTransactionRow(t)]);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from('deleted_transactions').delete().eq('id', id);
      if (e2) throw e2;

      setTransactions(prev =>
        [...prev, t].sort((a, b) =>
          new Date(b.transaction_date_sec || b.transaction_date || 0).getTime() -
          new Date(a.transaction_date_sec || a.transaction_date || 0).getTime()
        )
      );
    } catch (err) {
      console.error('Erreur restauration:', err);
      await loadTransactions();
    } finally {
      setRestoringId(null);
    }
  };

  const allSorted = useMemo(() => {
    const combined: Array<{ t: Transaction; deleted: boolean }> = [
      ...transactions.map(t => ({ t, deleted: false })),
      ...deletedTransactions.map(t => ({ t, deleted: true })),
    ];
    return combined.sort((a, b) =>
      new Date(b.t.transaction_date_sec || b.t.transaction_date || 0).getTime() -
      new Date(a.t.transaction_date_sec || a.t.transaction_date || 0).getTime()
    );
  }, [transactions, deletedTransactions]);

  const totals = useMemo(() => ({
    totalAmount: transactions.reduce((s, t) => s + Number(t.amount || 0), 0),
    totalCount: transactions.length,
  }), [transactions]);

  const barberStats = useMemo(() => {
    const map: Record<string, { count: number; total: number; photo: string }> = {};
    
    transactions.forEach(t => {
      if (t.barber_name && t.barber_name.trim() !== '') {
        const originalName = t.barber_name;
        const currentName = getDisplayBarberName(originalName);
        const photo = getBarberPhoto(originalName);
        
        if (!map[currentName]) {
          map[currentName] = { count: 0, total: 0, photo: photo || '' };
        }
        map[currentName].count++;
        map[currentName].total += Number(t.amount || 0);
      } else {
        if (!map['🛍️ Produits']) {
          map['🛍️ Produits'] = { count: 0, total: 0, photo: '' };
        }
        map['🛍️ Produits'].count++;
        map['🛍️ Produits'].total += Number(t.amount || 0);
      }
    });
    
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [transactions, barberInfos]);

  const ds = targetDayStart();
  const isCurrent = isCurrentDay(ds);

  const canGoForward = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return ds < getDayStart(tomorrow);
  };

  const getItemName = (transaction: Transaction) => {
    return transaction.service_name || (transaction.barber_name ? 'Service' : 'Produit');
  };

  const getItemCategory = (transaction: Transaction) => {
    if (transaction.barber_name && transaction.barber_name.trim() !== '') {
      const originalName = transaction.barber_name;
      const currentName = getDisplayBarberName(originalName);
      const photo = getBarberPhoto(originalName);
      return { name: currentName, photo, originalName };
    }
    return { name: 'Produit', photo: null, originalName: null };
  };

  return (
    <div className="space-y-5 relative">

      {showToast && (
        <div className="fixed top-4 right-4 left-4 sm:left-auto sm:right-4 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-green-600 text-white px-4 py-4 rounded-xl shadow-2xl flex items-center gap-3 border-2 border-green-400">
            <CheckCircle className="w-6 h-6 flex-shrink-0" />
            <div>
              <p className="font-bold text-base">✓ Transaction supprimée</p>
              <p className="text-green-100 text-sm mt-0.5">Cliquez "Remettre" pour annuler</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-white text-xl sm:text-2xl font-bold">Historique des transactions</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setDayOffset(d => d - 1)} className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 text-white px-3 py-2.5 rounded-xl text-sm font-medium transition shrink-0">
            <ChevronLeft className="w-4 h-4" /> Avant
          </button>
          <div className={`flex-1 text-center px-3 py-2.5 rounded-xl border ${isCurrent ? 'bg-white text-black border-white' : 'bg-zinc-900 text-white border-zinc-700'}`}>
            <div className="text-sm font-bold">{dayLabel(ds, dayOffset)}</div>
            <div className={`text-xs mt-0.5 ${isCurrent ? 'text-zinc-500' : 'text-zinc-400'}`}>{dayDateRange(ds)}</div>
          </div>
          <button onClick={() => setDayOffset(d => d + 1)} disabled={!canGoForward()} className="flex items-center gap-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-white px-3 py-2.5 rounded-xl text-sm font-medium transition shrink-0">
            Après <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <p className="text-zinc-400 text-xs mb-1">💰 Total encaissé</p>
          <p className="text-white font-bold text-lg">{formatCFA(totals.totalAmount)}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <p className="text-zinc-400 text-xs mb-1">✂️ Nombre de transactions</p>
          <p className="text-white font-bold text-lg">{totals.totalCount}</p>
        </div>
      </div>

      {barberStats.length > 0 && (
        <div>
          <h3 className="text-white text-base font-bold mb-3">👨‍💈 Par coiffeur</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {barberStats.map(([name, s]) => (
              <div key={name} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 space-y-2">
                <div className="flex items-center gap-3">
                  {s.photo && (
                    <img 
                      src={s.photo} 
                      alt={name}
                      className="w-10 h-10 rounded-full object-cover border border-zinc-600"
                    />
                  )}
                  <p className="text-white font-bold capitalize">{name}</p>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">Nombre</span>
                  <span className="text-white font-semibold">{s.count}</span>
                </div>
                <div className="flex justify-between text-sm"> 
                  <span className="text-zinc-400">Total</span>
                  <span className="text-white font-semibold">{formatCFA(s.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 text-sm py-8 text-center animate-pulse">Chargement...</div>
      ) : allSorted.length === 0 ? (
        <div className="text-center py-12 bg-zinc-900 border border-zinc-800 rounded-2xl">
          <p className="text-zinc-400 text-base font-medium">Aucune transaction</p>
          <p className="text-zinc-600 text-sm mt-1">{dayDateRange(ds)}</p>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="min-w-full text-left text-white bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
              <thead>
                <tr className="border-b border-zinc-700 text-xs text-zinc-400 uppercase tracking-wide">
                  <th className="px-4 py-3">Article</th>
                  <th className="px-4 py-3">Catégorie</th>
                  <th className="px-4 py-3">Montant</th>
                  <th className="px-4 py-3">Heure</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {allSorted.map(({ t, deleted }) => {
                  const category = getItemCategory(t);
                  const isProduct = !t.barber_name || t.barber_name.trim() === '';
                  const currentBarberName = isProduct ? null : getDisplayBarberName(t.barber_name!);
                  const barberPhoto = isProduct ? null : getBarberPhoto(t.barber_name!);
                  
                  return (
                    <tr key={t.id} className={`border-b border-zinc-800 text-sm transition ${deleted ? 'opacity-50 bg-red-950/20' : 'hover:bg-zinc-800'}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {!isProduct && barberPhoto && !deleted && (
                            <img 
                              src={barberPhoto} 
                              alt={currentBarberName || ''}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          )}
                          <span className={deleted ? 'line-through text-zinc-500' : ''}>{getItemName(t)}</span>
                          {t.with_teinture && !deleted && !isProduct && (
                            <span className="ml-1 text-yellow-400 text-xs">+ Teinture</span>
                          )}
                          {deleted && <span className="ml-2 inline-flex items-center gap-1 text-red-400 text-xs font-medium bg-red-900/40 px-2 py-0.5 rounded-full border border-red-800">🗑 Supprimé</span>}
                        </div>
                      </td>
                      <td className={`px-4 py-3 ${deleted ? 'line-through text-zinc-600' : ''}`}>
                        <div className="flex items-center gap-2">
                          {!isProduct && barberPhoto && !deleted && (
                            <img 
                              src={barberPhoto} 
                              alt={currentBarberName || ''}
                              className="w-5 h-5 rounded-full object-cover"
                            />
                          )}
                          <span>{isProduct ? '🛍️ Produit' : `✂️ ${currentBarberName}`}</span>
                        </div>
                       </td>
                      <td className={`px-4 py-3 font-bold ${deleted ? 'line-through text-zinc-600' : 'text-green-400'}`}>
                        {formatCFA(Number(t.amount))}
                       </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {getDate(t) ? new Date(getDate(t)).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                       </td>
                      <td className="px-4 py-3">
                        {deleted ? (
                          <button onClick={() => handleRestore(t.id)} disabled={restoringId === t.id} className="flex items-center gap-1 text-xs text-zinc-300 hover:text-green-400 border border-zinc-600 hover:border-green-500 px-2 py-1 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed">
                            {restoringId === t.id ? <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                            Remettre
                          </button>
                        ) : (
                          <button onClick={() => handleDelete(t.id, getItemName(t))} disabled={deletingId === t.id} className={`transition ${deletingId === t.id ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-600 hover:text-red-400'}`}>
                            {deletingId === t.id ? <div className="w-4 h-4 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                          </button>
                        )}
                       </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="sm:hidden space-y-3">
            {allSorted.map(({ t, deleted }) => {
              const category = getItemCategory(t);
              const isProduct = !t.barber_name || t.barber_name.trim() === '';
              const currentBarberName = isProduct ? null : getDisplayBarberName(t.barber_name!);
              const barberPhoto = isProduct ? null : getBarberPhoto(t.barber_name!);
              
              return (
                <div key={t.id} className={`rounded-xl p-4 transition-all border ${deleted ? 'bg-red-950/20 border-red-900 opacity-60' : 'bg-zinc-900 border-zinc-700'}`}>
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {!isProduct && barberPhoto && !deleted && (
                          <img 
                            src={barberPhoto} 
                            alt={currentBarberName || ''}
                            className="w-8 h-8 rounded-full object-cover"
                          />
                        )}
                        <p className={`font-bold text-sm truncate ${deleted ? 'line-through text-zinc-500' : 'text-white'}`}>
                          {getItemName(t)}
                          {t.with_teinture && !deleted && !isProduct && (
                            <span className="ml-1 text-yellow-400 text-xs">+ Teinture</span>
                          )}
                        </p>
                      </div>
                      <p className={`text-xs capitalize mt-0.5 flex items-center gap-1 ${deleted ? 'line-through text-zinc-600' : 'text-zinc-400'}`}>
                        {!isProduct && barberPhoto && !deleted && (
                          <img 
                            src={barberPhoto} 
                            alt={currentBarberName || ''}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                        )}
                        <span>{isProduct ? '🛍️ Produit' : `✂️ ${currentBarberName}`}</span>
                      </p>
                      {deleted && <p className="text-red-400 text-xs mt-2 flex items-center gap-1 font-medium bg-red-900/40 px-2 py-1 rounded-full w-fit border border-red-800">🗑 Supprimé</p>}
                    </div>
                    {deleted ? (
                      <button onClick={() => handleRestore(t.id)} disabled={restoringId === t.id} className="flex items-center gap-1 text-xs text-zinc-300 hover:text-green-400 border border-zinc-600 hover:border-green-500 px-2 py-1.5 rounded-lg transition ml-3 shrink-0 disabled:opacity-40 disabled:cursor-not-allowed">
                        {restoringId === t.id ? <div className="w-3 h-3 border-2 border-zinc-500 border-t-transparent rounded-full animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        Remettre
                      </button>
                    ) : (
                      <button onClick={() => handleDelete(t.id, getItemName(t))} disabled={deletingId === t.id} className={`transition ml-3 shrink-0 ${deletingId === t.id ? 'text-zinc-700 cursor-not-allowed' : 'text-zinc-600 hover:text-red-400'}`}>
                        {deletingId === t.id ? <div className="w-4 h-4 border-2 border-zinc-600 border-t-transparent rounded-full animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    )}
                  </div>
                  <div className="flex justify-between items-center pt-2 border-t border-zinc-800">
                    <span className={`font-bold text-base ${deleted ? 'line-through text-zinc-600' : 'text-green-400'}`}>{formatCFA(Number(t.amount))}</span>
                    <span className="text-zinc-500 text-xs">
                      {getDate(t) ? new Date(getDate(t)).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '-'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}