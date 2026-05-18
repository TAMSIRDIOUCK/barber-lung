// src/components/AdminPanel.tsx
import { useState, useEffect } from 'react';
import { 
  Users, 
  Search, 
  X, 
  CheckCircle, 
  XCircle, 
  Eye, 
  Shield,
  UserCheck,
  UserX,
  TrendingUp,
  DollarSign,
  Activity,
  RefreshCw
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: 'user' | 'admin';
  is_active: boolean;
  created_at: string;
  phone?: string;
  salon_name?: string;
}

interface UserStats {
  user_id: string;
  transaction_count: number;
  total_revenue: number;
  expense_count: number;
  total_expenses: number;
  last_transaction_date: string | null;
}

interface AdminPanelProps {
  currentUserId: string;
  isAdmin: boolean;
}

export function AdminPanel({ currentUserId, isAdmin }: AdminPanelProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [globalStats, setGlobalStats] = useState({
    totalUsers: 0,
    totalTransactions: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    activeUsers: 0,
    inactiveUsers: 0
  });

  // Afficher un toast
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Vérifier si l'utilisateur est admin
  useEffect(() => {
    if (!isAdmin) {
      return;
    }
    loadUsers();
    loadGlobalStats();
  }, [isAdmin]);

  // Charger tous les utilisateurs (uniquement les users, pas les admins)
  const loadUsers = async () => {
    setLoading(true);
    try {
      // Récupérer uniquement les utilisateurs avec role = 'user'
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles_v3')
        .select('*')
        .eq('role', 'user')  // ← Filtrer uniquement les utilisateurs
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const usersWithEmail = (profiles || []).map(profile => ({
        ...profile,
        email: profile.email || `${profile.id.slice(0, 8)}@user.com`,
      }));

      setUsers(usersWithEmail);
      
      // Charger les stats pour chaque utilisateur
      await loadAllUserStats(usersWithEmail.map(u => u.id));
      
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
      showToast('Erreur lors du chargement des utilisateurs', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Charger les stats de tous les utilisateurs
  const loadAllUserStats = async (userIds: string[]) => {
    setStatsLoading(true);
    const statsMap: Record<string, UserStats> = {};
    
    for (const userId of userIds) {
      try {
        // Récupérer les transactions
        const { data: transactions, error: transError } = await supabase
          .from('transactions')
          .select('amount, transaction_date_sec')
          .eq('user_id', userId);

        if (!transError && transactions) {
          const transactionCount = transactions.length;
          const totalRevenue = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
          
          // Dernière transaction
          const lastTransaction = transactions.length > 0 
            ? transactions.sort((a, b) => 
                new Date(b.transaction_date_sec).getTime() - new Date(a.transaction_date_sec).getTime()
              )[0].transaction_date_sec
            : null;

          // Récupérer les dépenses
          const { data: expenses, error: expError } = await supabase
            .from('expenses')
            .select('amount')
            .eq('user_id', userId);

          const expenseCount = expenses?.length || 0;
          const totalExpenses = expenses?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0;

          statsMap[userId] = {
            user_id: userId,
            transaction_count: transactionCount,
            total_revenue: totalRevenue,
            expense_count: expenseCount,
            total_expenses: totalExpenses,
            last_transaction_date: lastTransaction
          };
        }
      } catch (err) {
        console.error(`Erreur chargement stats pour ${userId}:`, err);
      }
    }
    
    setUserStats(statsMap);
    setStatsLoading(false);
  };

  // Charger les statistiques globales (uniquement des users)
  const loadGlobalStats = async () => {
    try {
      // Récupérer tous les users
      const { data: allUsers } = await supabase
        .from('profiles_v3')
        .select('id, is_active')
        .eq('role', 'user');
      
      const activeUsers = allUsers?.filter(u => u.is_active).length || 0;
      const inactiveUsers = allUsers?.filter(u => !u.is_active).length || 0;
      const totalUsers = allUsers?.length || 0;

      // Total des transactions de tous les users
      let totalTransactions = 0;
      let totalRevenue = 0;
      
      for (const user of (allUsers || [])) {
        const { data: transactions } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id);
        
        if (transactions) {
          totalTransactions += transactions.length;
          totalRevenue += transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        }
      }

      // Total des dépenses de tous les users
      let totalExpenses = 0;
      for (const user of (allUsers || [])) {
        const { data: expenses } = await supabase
          .from('expenses')
          .select('amount')
          .eq('user_id', user.id);
        
        if (expenses) {
          totalExpenses += expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        }
      }

      setGlobalStats({
        totalUsers,
        totalTransactions,
        totalRevenue,
        totalExpenses,
        activeUsers,
        inactiveUsers
      });
    } catch (error) {
      console.error('Erreur chargement stats globales:', error);
    }
  };

  // Activer/Désactiver un utilisateur
  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    if (!confirm(`Voulez-vous vraiment ${currentStatus ? 'désactiver' : 'activer'} ce compte ?`)) return;
    
    setProcessingId(userId);
    try {
      const { error } = await supabase
        .from('profiles_v3')
        .update({ is_active: !currentStatus })
        .eq('id', userId)
        .eq('role', 'user');  // ← Sécurité : ne modifier que les users

      if (error) throw error;

      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, is_active: !currentStatus } : user
      ));
      
      showToast(`Compte ${!currentStatus ? 'activé' : 'désactivé'} avec succès`, 'success');
      
      // Recharger les stats globales
      loadGlobalStats();
      
    } catch (error) {
      console.error('Erreur changement statut:', error);
      showToast('Erreur lors du changement de statut', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Rafraîchir les données
  const refreshData = async () => {
    await loadUsers();
    await loadGlobalStats();
    showToast('Données actualisées', 'success');
  };

  // Filtrer les utilisateurs
  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' || 
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && user.is_active) ||
      (filterStatus === 'inactive' && !user.is_active);
    
    return matchesSearch && matchesStatus;
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-white text-xl font-bold mb-2">Accès refusé</h2>
          <p className="text-zinc-400">Vous n'avez pas les droits d'administrateur</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-0">
      {/* Toast notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white text-sm animate-in fade-in slide-in-from-top-2`}>
          {toast.message}
        </div>
      )}

      {/* En-tête */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-white text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-green-500" />
            Administration
          </h2>
          <p className="text-zinc-500 text-sm mt-1">Gestion des comptes utilisateurs</p>
        </div>
        <button
          onClick={refreshData}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition"
        >
          <RefreshCw className="w-4 h-4" /> Rafraîchir
        </button>
      </div>

      {/* Statistiques globales */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 mb-1">
            <Users className="w-4 h-4" />
            <span className="text-xs">Total utilisateurs</span>
          </div>
          <p className="text-white text-2xl font-bold">{globalStats.totalUsers}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <UserCheck className="w-4 h-4" />
            <span className="text-xs">Actifs</span>
          </div>
          <p className="text-white text-2xl font-bold">{globalStats.activeUsers}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-400 mb-1">
            <UserX className="w-4 h-4" />
            <span className="text-xs">Inactifs</span>
          </div>
          <p className="text-white text-2xl font-bold">{globalStats.inactiveUsers}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-400 mb-1">
            <Activity className="w-4 h-4" />
            <span className="text-xs">Transactions</span>
          </div>
          <p className="text-white text-xl font-bold">{globalStats.totalTransactions.toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-400 mb-1">
            <DollarSign className="w-4 h-4" />
            <span className="text-xs">Revenus</span>
          </div>
          <p className="text-white text-lg font-bold">{globalStats.totalRevenue.toLocaleString()} CFA</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-400 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span className="text-xs">Dépenses</span>
          </div>
          <p className="text-white text-lg font-bold">{globalStats.totalExpenses.toLocaleString()} CFA</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Rechercher par nom, email ou ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white placeholder:text-zinc-500 focus:outline-none focus:border-white transition"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as any)}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-white transition"
        >
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </select>
      </div>

      {/* Liste des utilisateurs */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div>
          <p className="text-zinc-500 mt-3">Chargement des utilisateurs...</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-zinc-800">
              <tr className="text-zinc-500 text-sm">
                <th className="pb-3 font-medium">Utilisateur</th>
                <th className="pb-3 font-medium">Email</th>
                <th className="pb-3 font-medium">Statut</th>
                <th className="pb-3 font-medium">Transactions</th>
                <th className="pb-3 font-medium">Revenus</th>
                <th className="pb-3 font-medium">Inscrit le</th>
                <th className="pb-3 font-medium">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredUsers.map((user) => {
                const stats = userStats[user.id];
                const isCurrentUser = user.id === currentUserId;
                
                return (
                  <tr key={user.id} className="hover:bg-zinc-900/50 transition">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-bold uppercase">
                            {(user.full_name || user.email || 'U')[0]}
                          </span>
                        </div>
                        <span className="text-white font-medium">{user.full_name || 'Sans nom'}</span>
                      </div>
                    </td>
                    <td className="py-3">
                      <p className="text-zinc-300 text-sm">{user.email}</p>
                      <p className="text-zinc-600 text-xs font-mono">{user.id.slice(0, 8)}...</p>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => toggleUserStatus(user.id, user.is_active)}
                        disabled={processingId === user.id || isCurrentUser}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium transition ${
                          user.is_active 
                            ? 'bg-green-500/20 text-green-400 border border-green-500' 
                            : 'bg-red-500/20 text-red-400 border border-red-500'
                        } ${isCurrentUser ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'}`}
                      >
                        {user.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {user.is_active ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="py-3">
                      {statsLoading ? (
                        <div className="animate-pulse text-zinc-500 text-sm">...</div>
                      ) : (
                        <span className="text-white text-sm">{stats?.transaction_count || 0}</span>
                      )}
                    </td>
                    <td className="py-3">
                      {statsLoading ? (
                        <div className="animate-pulse text-zinc-500 text-sm">...</div>
                      ) : (
                        <span className="text-green-400 text-sm">{(stats?.total_revenue || 0).toLocaleString()} CFA</span>
                      )}
                    </td>
                    <td className="py-3">
                      <span className="text-zinc-500 text-sm">
                        {new Date(user.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </td>
                    <td className="py-3">
                      <button
                        onClick={() => {
                          setSelectedUser(user);
                          setShowDetailsModal(true);
                        }}
                        className="p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition"
                        title="Voir détails"
                      >
                        <Eye className="w-4 h-4 text-zinc-400" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {filteredUsers.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500">Aucun utilisateur trouvé</p>
            </div>
          )}
        </div>
      )}

      {/* Modal détails utilisateur */}
      {showDetailsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-6 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Détails de l'utilisateur</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-zinc-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-zinc-500 text-xs uppercase tracking-wide">Nom complet</label>
                  <p className="text-white font-medium mt-1">{selectedUser.full_name || 'Non renseigné'}</p>
                </div>
                <div>
                  <label className="text-zinc-500 text-xs uppercase tracking-wide">Email</label>
                  <p className="text-white font-medium mt-1">{selectedUser.email}</p>
                </div>
                <div>
                  <label className="text-zinc-500 text-xs uppercase tracking-wide">ID Utilisateur</label>
                  <p className="text-zinc-400 text-sm font-mono mt-1">{selectedUser.id}</p>
                </div>
                <div>
                  <label className="text-zinc-500 text-xs uppercase tracking-wide">Statut</label>
                  <p className={`mt-1 font-medium ${selectedUser.is_active ? 'text-green-400' : 'text-red-400'}`}>
                    {selectedUser.is_active ? 'Actif' : 'Inactif'}
                  </p>
                </div>
                <div>
                  <label className="text-zinc-500 text-xs uppercase tracking-wide">Date d'inscription</label>
                  <p className="text-white mt-1">{new Date(selectedUser.created_at).toLocaleString('fr-FR')}</p>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Statistiques
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-zinc-800 rounded-xl p-3">
                    <p className="text-zinc-500 text-xs">Transactions</p>
                    <p className="text-white text-xl font-bold">{userStats[selectedUser.id]?.transaction_count || 0}</p>
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-3">
                    <p className="text-zinc-500 text-xs">Revenus</p>
                    <p className="text-green-400 text-lg font-bold">{(userStats[selectedUser.id]?.total_revenue || 0).toLocaleString()} CFA</p>
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-3">
                    <p className="text-zinc-500 text-xs">Dépenses</p>
                    <p className="text-red-400 text-lg font-bold">{(userStats[selectedUser.id]?.total_expenses || 0).toLocaleString()} CFA</p>
                  </div>
                  <div className="bg-zinc-800 rounded-xl p-3">
                    <p className="text-zinc-500 text-xs">Net</p>
                    <p className="text-white text-lg font-bold">
                      {((userStats[selectedUser.id]?.total_revenue || 0) - (userStats[selectedUser.id]?.total_expenses || 0)).toLocaleString()} CFA
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <button
                  onClick={() => {
                    toggleUserStatus(selectedUser.id, selectedUser.is_active);
                    setShowDetailsModal(false);
                  }}
                  disabled={selectedUser.id === currentUserId}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-white font-medium transition ${
                    selectedUser.is_active 
                      ? 'bg-red-600 hover:bg-red-700' 
                      : 'bg-green-600 hover:bg-green-700'
                  } ${selectedUser.id === currentUserId ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {selectedUser.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  {selectedUser.is_active ? 'Désactiver le compte' : 'Activer le compte'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}