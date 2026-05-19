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
  RefreshCw,
  Phone,
  Calendar,
  Send,
  Sparkles,
  Star,
  Rocket
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface UserProfile {
  id: string;
  email: string;
  phone: string;
  full_name: string;
  role: 'user' | 'admin';
  is_active: boolean;
  created_at: string;
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

interface UserSubscription {
  plan_name: string;
  status: string;
  end_date: string;
  start_date: string;
  is_free_trial: boolean;
}

interface AdminPanelProps {
  currentUserId: string;
  isAdmin: boolean;
}

export function AdminPanel({ currentUserId, isAdmin }: AdminPanelProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});
  const [userSubscriptions, setUserSubscriptions] = useState<Record<string, UserSubscription>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [openWhatsAppMenu, setOpenWhatsAppMenu] = useState<string | null>(null);
  const [globalStats, setGlobalStats] = useState({
    totalUsers: 0,
    totalTransactions: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    expiredSubscriptions: 0,
    expiringSoon: 0
  });

  const APP_URL = 'https://barber-lunge.vercel.app';
  const APP_NAME = 'LE COUPE';

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    loadGlobalStats();
  }, [isAdmin]);

  // Fermer le menu WhatsApp quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = () => setOpenWhatsAppMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles_v3')
        .select('*')
        .eq('role', 'user')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const usersWithData = (profiles || []).map(profile => ({
        ...profile,
        email: profile.email || `${profile.id.slice(0, 8)}...`,
        phone: profile.phone || '',
      }));

      setUsers(usersWithData);
      
      await loadAllUserStats(usersWithData.map(u => u.id));
      await loadAllUserSubscriptions(usersWithData.map(u => u.id));
      
    } catch (error) {
      console.error('Erreur chargement utilisateurs:', error);
      showToast('Erreur lors du chargement des utilisateurs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadAllUserSubscriptions = async (userIds: string[]) => {
    const subsMap: Record<string, UserSubscription> = {};
    
    for (const userId of userIds) {
      try {
        const { data: subscription, error: subError } = await supabase
          .from('subscriptions')
          .select('plan_id, status, end_date, start_date, is_free_trial')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!subError && subscription) {
          let planName = 'Gratuit';
          if (subscription.plan_id) {
            const { data: plan } = await supabase
              .from('subscription_plans')
              .select('name')
              .eq('id', subscription.plan_id)
              .single();
            if (plan) planName = plan.name;
          }

          subsMap[userId] = {
            plan_name: planName,
            status: subscription.status,
            end_date: subscription.end_date,
            start_date: subscription.start_date,
            is_free_trial: subscription.is_free_trial || false
          };
        } else {
          subsMap[userId] = {
            plan_name: 'Aucun',
            status: 'none',
            end_date: '',
            start_date: '',
            is_free_trial: false
          };
        }
      } catch (err) {
        console.error(`Erreur chargement abonnement pour ${userId}:`, err);
      }
    }
    
    setUserSubscriptions(subsMap);
  };

  const loadAllUserStats = async (userIds: string[]) => {
    setStatsLoading(true);
    const statsMap: Record<string, UserStats> = {};
    
    for (const userId of userIds) {
      try {
        const { data: transactions, error: transError } = await supabase
          .from('transactions')
          .select('amount, transaction_date_sec')
          .eq('user_id', userId);

        if (!transError && transactions) {
          const transactionCount = transactions.length;
          const totalRevenue = transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
          
          const lastTransaction = transactions.length > 0 
            ? transactions.sort((a, b) => 
                new Date(b.transaction_date_sec).getTime() - new Date(a.transaction_date_sec).getTime()
              )[0].transaction_date_sec
            : null;

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

  const loadGlobalStats = async () => {
    try {
      const { data: allUsers } = await supabase
        .from('profiles_v3')
        .select('id, is_active')
        .eq('role', 'user');
      
      const activeUsers = allUsers?.filter(u => u.is_active).length || 0;
      const inactiveUsers = allUsers?.filter(u => !u.is_active).length || 0;
      const totalUsers = allUsers?.length || 0;

      let totalTransactions = 0;
      let totalRevenue = 0;
      let expiredSubscriptions = 0;
      let expiringSoon = 0;
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      
      for (const user of (allUsers || [])) {
        const { data: transactions } = await supabase
          .from('transactions')
          .select('amount')
          .eq('user_id', user.id);
        
        if (transactions) {
          totalTransactions += transactions.length;
          totalRevenue += transactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        }

        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('end_date, status')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (subscription && subscription.end_date) {
          const endDate = new Date(subscription.end_date);
          if (endDate < today) {
            expiredSubscriptions++;
          } else if (endDate <= thirtyDaysFromNow) {
            expiringSoon++;
          }
        }
      }

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
        inactiveUsers,
        expiredSubscriptions,
        expiringSoon
      });
    } catch (error) {
      console.error('Erreur chargement stats globales:', error);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    if (!confirm(`Voulez-vous vraiment ${currentStatus ? 'désactiver' : 'activer'} ce compte ?`)) return;
    
    setProcessingId(userId);
    try {
      const { error } = await supabase
        .from('profiles_v3')
        .update({ is_active: !currentStatus })
        .eq('id', userId)
        .eq('role', 'user');

      if (error) throw error;

      setUsers(prev => prev.map(user => 
        user.id === userId ? { ...user, is_active: !currentStatus } : user
      ));
      
      showToast(`Compte ${!currentStatus ? 'activé' : 'désactivé'} avec succès`, 'success');
      loadGlobalStats();
      
    } catch (error) {
      console.error('Erreur changement statut:', error);
      showToast('Erreur lors du changement de statut', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  // Nettoyer et formater le numéro de téléphone pour WhatsApp
  const formatPhoneForWhatsApp = (phone: string): string => {
    let cleaned = phone.replace(/\s/g, '').replace(/^\+?221/, '');
    if (!cleaned.startsWith('77') && !cleaned.startsWith('78') && !cleaned.startsWith('76') && !cleaned.startsWith('70') && !cleaned.startsWith('75')) {
      cleaned = '77' + cleaned;
    }
    return `221${cleaned}`;
  };

  const getMarketingMessage = (userName: string, subscription: UserSubscription): string => {
    const endDate = subscription?.end_date ? new Date(subscription.end_date).toLocaleDateString('fr-FR') : 'bientôt';
    
    return `*${APP_NAME} - Gestion de salon professionnel* 💈

Bonjour ${userName || 'Cher client'} 👋,

✨ *Pourquoi utiliser notre application ?*
• 📊 Suivez vos revenus en temps réel
• ✂️ Gérez vos services et coiffeurs facilement
• 📱 Accès depuis n'importe où
• 💰 Transactions sécurisées
• 🎫 Tickets d'impression professionnels

📅 *Votre abonnement* : ${subscription?.plan_name || 'Gratuit'}
⏰ *Expiration* : ${endDate}

🚀 *Installez l'application* :
👉 ${APP_URL}

📱 *Installation* :
- Android : Menu Chrome → "Installer"
- iOS : Partager → "Sur l'écran d'accueil"

Merci de votre confiance ! 🙏

*${APP_NAME}* ✨`;
  };

  const getReminderMessage = (userName: string, stats: UserStats | undefined): string => {
    const transactionCount = stats?.transaction_count || 0;
    const revenue = stats?.total_revenue || 0;
    
    return `*${APP_NAME} - Votre activité* 📊

Bonjour ${userName || 'Cher client'} 👋,

✂️ *Transactions* : ${transactionCount}
💰 *Chiffre d'affaires* : ${revenue.toLocaleString()} CFA

🎯 *Pour aller plus loin* :
• Ajoutez vos services
• Importez vos coiffeurs
• Suivez vos dépenses

📱 *Application* : ${APP_URL}

Continuez à faire briller votre salon ! 💈

*${APP_NAME}* ⭐`;
  };

  // Fonction pour envoyer un message WhatsApp
  const sendWhatsAppMessage = async (
    phoneNumber: string, 
    userName: string, 
    subscription: UserSubscription, 
    stats?: UserStats, 
    type: 'marketing' | 'reminder' = 'marketing'
  ) => {
    if (!phoneNumber) {
      showToast('Ce client n\'a pas de numéro de téléphone enregistré', 'error');
      return;
    }

    const whatsappNumber = formatPhoneForWhatsApp(phoneNumber);
    
    let message = '';
    if (type === 'marketing') {
      message = getMarketingMessage(userName, subscription);
    } else {
      message = getReminderMessage(userName, stats);
    }

    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    
    // Ouvrir WhatsApp dans un nouvel onglet (fonctionne sur mobile et desktop)
    window.open(whatsappUrl, '_blank');
    
    showToast(`Ouverture WhatsApp pour ${userName}`, 'success');
    setOpenWhatsAppMenu(null);
  };

  // Fonction pour envoyer un message personnalisé
  const sendCustomMessage = async (phoneNumber: string, message: string) => {
    if (!phoneNumber) {
      showToast('Ce client n\'a pas de numéro de téléphone enregistré', 'error');
      return;
    }

    const whatsappNumber = formatPhoneForWhatsApp(phoneNumber);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    showToast(`Ouverture WhatsApp pour envoyer le message`, 'success');
    setShowMessageModal(false);
    setOpenWhatsAppMenu(null);
  };

  const refreshData = async () => {
    await loadUsers();
    await loadGlobalStats();
    showToast('Données actualisées', 'success');
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' || 
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg ${
          toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'
        } text-white text-sm`}>
          {toast.message}
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-white text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-green-500" />
            Administration
          </h2>
          <p className="text-zinc-500 text-sm mt-1">Gestion des comptes utilisateurs</p>
        </div>
        <button onClick={refreshData} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition">
          <RefreshCw className="w-4 h-4" /> Rafraîchir
        </button>
      </div>

      {/* Statistiques globales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 mb-1"><Users className="w-4 h-4" /><span className="text-xs">Total</span></div>
          <p className="text-white text-2xl font-bold">{globalStats.totalUsers}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-400 mb-1"><UserCheck className="w-4 h-4" /><span className="text-xs">Actifs</span></div>
          <p className="text-white text-2xl font-bold">{globalStats.activeUsers}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-400 mb-1"><UserX className="w-4 h-4" /><span className="text-xs">Inactifs</span></div>
          <p className="text-white text-2xl font-bold">{globalStats.inactiveUsers}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-orange-400 mb-1"><Calendar className="w-4 h-4" /><span className="text-xs">Expire bientôt</span></div>
          <p className="text-white text-2xl font-bold">{globalStats.expiringSoon}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-400 mb-1"><Activity className="w-4 h-4" /><span className="text-xs">Transactions</span></div>
          <p className="text-white text-xl font-bold">{globalStats.totalTransactions.toLocaleString()}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-400 mb-1"><DollarSign className="w-4 h-4" /><span className="text-xs">Revenus</span></div>
          <p className="text-white text-lg font-bold">{globalStats.totalRevenue.toLocaleString()} CFA</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-400 mb-1"><TrendingUp className="w-4 h-4" /><span className="text-xs">Dépenses</span></div>
          <p className="text-white text-lg font-bold">{globalStats.totalExpenses.toLocaleString()} CFA</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-purple-400 mb-1"><Calendar className="w-4 h-4" /><span className="text-xs">Expirés</span></div>
          <p className="text-white text-2xl font-bold">{globalStats.expiredSubscriptions}</p>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input type="text" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-white transition" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-white transition">
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
        </select>
      </div>

      {/* Liste des utilisateurs */}
      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div><p className="text-zinc-500 mt-3">Chargement...</p></div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12"><Users className="w-12 h-12 text-zinc-600 mx-auto mb-3" /><p className="text-zinc-500">Aucun utilisateur trouvé</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-zinc-800">
              <tr className="text-zinc-500 text-sm">
                <th className="pb-3">Utilisateur</th>
                <th className="pb-3">Contact</th>
                <th className="pb-3">Abonnement</th>
                <th className="pb-3">Expiration</th>
                <th className="pb-3">Statut</th>
                <th className="pb-3">Transactions</th>
                <th className="pb-3">Revenus</th>
                <th className="pb-3">Actions</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredUsers.map((user) => {
                const stats = userStats[user.id];
                const subscription = userSubscriptions[user.id];
                const isCurrentUser = user.id === currentUserId;
                const endDate = subscription?.end_date ? new Date(subscription.end_date).toLocaleDateString('fr-FR') : 'N/A';
                const isExpiringSoon = subscription?.end_date && new Date(subscription.end_date) <= new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
                
                return (
                  <tr key={user.id} className="hover:bg-zinc-900/50 transition">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-bold uppercase">{(user.full_name || user.email || 'U')[0]}</span>
                        </div>
                        <div><p className="text-white font-medium">{user.full_name || 'Sans nom'}</p><p className="text-zinc-500 text-xs">{user.id.slice(0, 8)}...</p></div>
                      </div>
                    </td>
                    <td className="py-3">
                      {user.phone ? (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3 h-3 text-green-400" />
                          <span className="text-zinc-300 text-sm">{user.phone}</span>
                        </div>
                      ) : (
                        <span className="text-zinc-600 text-sm">Non renseigné</span>
                      )}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${subscription?.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {subscription?.plan_name || 'Aucun'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-zinc-500" />
                        <span className={`text-sm ${isExpiringSoon && subscription?.status === 'active' ? 'text-orange-400' : 'text-zinc-300'}`}>
                          {endDate}
                        </span>
                      </div>
                    </td>
                    <td className="py-3">
                      <button onClick={() => toggleUserStatus(user.id, user.is_active)} disabled={processingId === user.id || isCurrentUser} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${user.is_active ? 'bg-green-500/20 text-green-400 border border-green-500' : 'bg-red-500/20 text-red-400 border border-red-500'} ${isCurrentUser ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        {user.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{user.is_active ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="py-3">{statsLoading ? <span className="text-zinc-500">...</span> : <span className="text-white">{stats?.transaction_count || 0}</span>}</td>
                    <td className="py-3">{statsLoading ? <span className="text-zinc-500">...</span> : <span className="text-green-400">{(stats?.total_revenue || 0).toLocaleString()} CFA</span>}</td>
                    <td className="py-3">
                      <div className="relative">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenWhatsAppMenu(openWhatsAppMenu === user.id ? null : user.id);
                          }}
                          className="p-1.5 rounded-lg bg-green-600 hover:bg-green-700 transition"
                          title="Envoyer message WhatsApp"
                        >
                          <Send className="w-4 h-4 text-white" />
                        </button>
                        
                        {openWhatsAppMenu === user.id && (
                          <div className="absolute top-full right-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-2 z-50 min-w-[160px]">
                            <button
                              onClick={() => sendWhatsAppMessage(user.phone, user.full_name || user.email, subscription, stats, 'marketing')}
                              className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
                            >
                              <Sparkles className="w-3 h-3 text-yellow-400" /> Message marketing
                            </button>
                            <button
                              onClick={() => sendWhatsAppMessage(user.phone, user.full_name || user.email, subscription, stats, 'reminder')}
                              className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
                            >
                              <Rocket className="w-3 h-3 text-blue-400" /> Relance activité
                            </button>
                            <button
                              onClick={() => { setSelectedUser(user); setMessageText(''); setShowMessageModal(true); setOpenWhatsAppMenu(null); }}
                              className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
                            >
                              <Star className="w-3 h-3 text-purple-400" /> Message personnalisé
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal détails utilisateur */}
      {showDetailsModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-zinc-900 border-b border-zinc-800 p-6 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Détails</h3>
              <button onClick={() => setShowDetailsModal(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="text-zinc-500 text-xs">Nom</label><p className="text-white">{selectedUser.full_name || 'Non renseigné'}</p></div>
                <div><label className="text-zinc-500 text-xs">Email</label><p className="text-white">{selectedUser.email}</p></div>
                <div><label className="text-zinc-500 text-xs">Téléphone</label><p className="text-white">{selectedUser.phone || 'Non renseigné'}</p></div>
                <div><label className="text-zinc-500 text-xs">ID</label><p className="text-zinc-400 text-sm">{selectedUser.id}</p></div>
                <div><label className="text-zinc-500 text-xs">Statut</label><p className={selectedUser.is_active ? 'text-green-400' : 'text-red-400'}>{selectedUser.is_active ? 'Actif' : 'Inactif'}</p></div>
                <div><label className="text-zinc-500 text-xs">Inscrit</label><p className="text-white">{new Date(selectedUser.created_at).toLocaleDateString('fr-FR')}</p></div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <h4 className="text-white font-bold mb-3">Abonnement</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Plan</p><p className="text-white font-bold">{userSubscriptions[selectedUser.id]?.plan_name || 'Aucun'}</p></div>
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Statut</p><p className={`font-bold ${userSubscriptions[selectedUser.id]?.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>{userSubscriptions[selectedUser.id]?.status || 'Inactif'}</p></div>
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Début</p><p className="text-white text-sm">{userSubscriptions[selectedUser.id]?.start_date ? new Date(userSubscriptions[selectedUser.id].start_date).toLocaleDateString('fr-FR') : 'N/A'}</p></div>
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Fin</p><p className="text-white text-sm">{userSubscriptions[selectedUser.id]?.end_date ? new Date(userSubscriptions[selectedUser.id].end_date).toLocaleDateString('fr-FR') : 'N/A'}</p></div>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <h4 className="text-white font-bold mb-3">Statistiques</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Transactions</p><p className="text-white text-xl font-bold">{userStats[selectedUser.id]?.transaction_count || 0}</p></div>
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Revenus</p><p className="text-green-400">{(userStats[selectedUser.id]?.total_revenue || 0).toLocaleString()} CFA</p></div>
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Dépenses</p><p className="text-red-400">{(userStats[selectedUser.id]?.total_expenses || 0).toLocaleString()} CFA</p></div>
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Net</p><p className="text-white">{((userStats[selectedUser.id]?.total_revenue || 0) - (userStats[selectedUser.id]?.total_expenses || 0)).toLocaleString()} CFA</p></div>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4 flex flex-wrap gap-3">
                <button onClick={() => { toggleUserStatus(selectedUser.id, selectedUser.is_active); setShowDetailsModal(false); }} disabled={selectedUser.id === currentUserId} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-white ${selectedUser.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} ${selectedUser.id === currentUserId ? 'opacity-50' : ''}`}>
                  {selectedUser.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}{selectedUser.is_active ? 'Désactiver' : 'Activer'}
                </button>
                {selectedUser.phone && (
                  <div className="relative inline-block">
                    <button
                      onClick={() => setOpenWhatsAppMenu(openWhatsAppMenu === selectedUser.id ? null : selectedUser.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Send className="w-4 h-4" /> Envoyer message
                    </button>
                    {openWhatsAppMenu === selectedUser.id && (
                      <div className="absolute top-full left-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-2 z-50 min-w-[180px]">
                        <button onClick={() => sendWhatsAppMessage(selectedUser.phone, selectedUser.full_name || selectedUser.email, userSubscriptions[selectedUser.id], userStats[selectedUser.id], 'marketing')} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2">
                          <Sparkles className="w-3 h-3 text-yellow-400" /> Message marketing
                        </button>
                        <button onClick={() => sendWhatsAppMessage(selectedUser.phone, selectedUser.full_name || selectedUser.email, userSubscriptions[selectedUser.id], userStats[selectedUser.id], 'reminder')} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2">
                          <Rocket className="w-3 h-3 text-blue-400" /> Relance activité
                        </button>
                        <button onClick={() => { setMessageText(''); setShowMessageModal(true); }} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2">
                          <Star className="w-3 h-3 text-purple-400" /> Message personnalisé
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal message personnalisé */}
      {showMessageModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Message à {selectedUser.full_name || selectedUser.email}</h3>
              <button onClick={() => setShowMessageModal(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <textarea 
              value={messageText} 
              onChange={(e) => setMessageText(e.target.value)} 
              placeholder="Votre message personnalisé..." 
              rows={5} 
              className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white mb-4"
            />
            <div className="flex gap-3">
              <button 
                onClick={() => sendCustomMessage(selectedUser.phone, messageText)} 
                disabled={!messageText.trim()} 
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl font-semibold transition disabled:opacity-50"
              >
                Envoyer via WhatsApp
              </button>
              <button onClick={() => setShowMessageModal(false)} className="flex-1 bg-zinc-800 text-white py-2 rounded-xl font-semibold hover:bg-zinc-700 transition">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}