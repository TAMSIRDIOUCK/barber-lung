// src/components/AdminPanel.tsx
import { useState, useEffect, useRef } from 'react';
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
  Rocket,
  AlertTriangle,
  CreditCard,
  Plus,
  Edit2,
  Trash2,
  Image,
  Video,
  Save,
  Globe,
  EyeOff,
  Upload,
  FileImage,
  FileVideo
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
  price?: number;
}

interface Banner {
  id: number;
  type: 'image' | 'video';
  url: string;
  is_active: boolean;
  expiry_date: string;
  created_at: string;
}

interface AdminPanelProps {
  currentUserId: string;
  isAdmin: boolean;
}

export default function AdminPanel({ currentUserId, isAdmin }: AdminPanelProps) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [userStats, setUserStats] = useState<Record<string, UserStats>>({});
  const [userSubscriptions, setUserSubscriptions] = useState<Record<string, UserSubscription>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive' | 'expiring'>('all');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [messageText, setMessageText] = useState('');
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [openWhatsAppMenu, setOpenWhatsAppMenu] = useState<string | null>(null);
  
  // Banner states
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [showBannerModal, setShowBannerModal] = useState(false);
  
  // Upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [bannerForm, setBannerForm] = useState({
    type: 'image' as 'image' | 'video',
    expiry_days: 1
  });
  
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
  const PLAN_PRICES: Record<string, number> = {
    'Mensuel': 5000,
    'Annuel': 50000,
    'Gratuit': 0
  };

  const showToastMsg = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    loadGlobalStats();
    loadBanners();
  }, [isAdmin]);

  useEffect(() => {
    const handleClickOutside = () => setOpenWhatsAppMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showBannerModal) {
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(filePreviewUrl);
      }
      setFilePreviewUrl('');
      setSelectedFile(null);
      setUploadProgress(0);
    }
  }, [showBannerModal]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      showToastMsg('Format non supporté. Utilisez une image ou une vidéo.', 'error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToastMsg('Fichier trop lourd (max 50 Mo)', 'error');
      return;
    }

    const detectedType: 'image' | 'video' = isImage ? 'image' : 'video';
    setBannerForm(prev => ({ ...prev, type: detectedType }));
    setSelectedFile(file);

    if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(filePreviewUrl);
    }
    setFilePreviewUrl(URL.createObjectURL(file));
  };

  const uploadFileToStorage = async (file: File): Promise<string> => {
    const ext = file.name.split('.').pop();
    const fileName = `banners/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const filePath = fileName;

    setIsUploading(true);
    setUploadProgress(10);

    const { error: uploadError } = await supabase.storage
      .from('public-media')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      throw uploadError;
    }

    setUploadProgress(80);

    const { data } = supabase.storage
      .from('public-media')
      .getPublicUrl(filePath);

    setUploadProgress(100);
    setIsUploading(false);

    return data.publicUrl;
  };

  const loadBanners = async () => {
    setBannerLoading(true);
    try {
      const { data, error } = await supabase
        .from('public_banners')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setBanners(data || []);
    } catch (error) {
      console.error('Erreur chargement bannières:', error);
      showToastMsg('Erreur lors du chargement des bannières', 'error');
    } finally {
      setBannerLoading(false);
    }
  };

  const saveBanner = async () => {
    const hasNewFile = !!selectedFile;
    const hasExistingUrl = editingBanner?.url;

    if (!hasNewFile && !hasExistingUrl) {
      showToastMsg('Veuillez sélectionner un fichier', 'error');
      return;
    }

    setBannerLoading(true);
    try {
      let finalUrl = editingBanner?.url || '';

      if (hasNewFile && selectedFile) {
        finalUrl = await uploadFileToStorage(selectedFile);
      }

      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + bannerForm.expiry_days);

      if (editingBanner) {
        const { error } = await supabase
          .from('public_banners')
          .update({
            type: bannerForm.type,
            url: finalUrl,
            expiry_date: expiryDate.toISOString()
          })
          .eq('id', editingBanner.id);
        if (error) throw error;
        showToastMsg('Bannière mise à jour', 'success');
      } else {
        const { error } = await supabase
          .from('public_banners')
          .insert({
            type: bannerForm.type,
            url: finalUrl,
            expiry_date: expiryDate.toISOString(),
            is_active: true,
            created_by: currentUserId
          });
        if (error) throw error;
        showToastMsg('Bannière publiée', 'success');
      }

      await loadBanners();
      setShowBannerModal(false);
      setEditingBanner(null);
      setSelectedFile(null);
      setFilePreviewUrl('');
      setBannerForm({ type: 'image', expiry_days: 1 });
    } catch (error: any) {
      console.error('Erreur sauvegarde bannière:', error);
      showToastMsg(error?.message || 'Erreur lors de la sauvegarde', 'error');
    } finally {
      setBannerLoading(false);
      setIsUploading(false);
    }
  };

  const toggleBannerStatus = async (bannerId: number, currentStatus: boolean) => {
    setBannerLoading(true);
    try {
      if (!currentStatus) {
        await supabase.from('public_banners').update({ is_active: false }).neq('id', bannerId);
      }
      const { error } = await supabase
        .from('public_banners')
        .update({ is_active: !currentStatus })
        .eq('id', bannerId);
      if (error) throw error;
      showToastMsg(`Bannière ${!currentStatus ? 'activée' : 'désactivée'}`, 'success');
      await loadBanners();
    } catch (error) {
      console.error('Erreur changement statut:', error);
      showToastMsg('Erreur lors du changement de statut', 'error');
    } finally {
      setBannerLoading(false);
    }
  };

  const deleteBanner = async (bannerId: number) => {
    if (!confirm('Supprimer cette bannière ?')) return;
    setBannerLoading(true);
    try {
      const { error } = await supabase.from('public_banners').delete().eq('id', bannerId);
      if (error) throw error;
      showToastMsg('Bannière supprimée', 'success');
      await loadBanners();
    } catch (error) {
      console.error('Erreur suppression:', error);
      showToastMsg('Erreur lors de la suppression', 'error');
    } finally {
      setBannerLoading(false);
    }
  };

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
      showToastMsg('Erreur lors du chargement des utilisateurs', 'error');
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
          let price = 0;
          if (subscription.plan_id) {
            const { data: plan } = await supabase
              .from('subscription_plans')
              .select('name, price')
              .eq('id', subscription.plan_id)
              .single();
            if (plan) {
              planName = plan.name;
              price = plan.price;
            }
          }
          subsMap[userId] = {
            plan_name: planName,
            status: subscription.status,
            end_date: subscription.end_date,
            start_date: subscription.start_date,
            is_free_trial: subscription.is_free_trial || false,
            price
          };
        } else {
          subsMap[userId] = {
            plan_name: 'Aucun',
            status: 'none',
            end_date: '',
            start_date: '',
            is_free_trial: false,
            price: 0
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
            ? transactions.sort((a, b) => new Date(b.transaction_date_sec).getTime() - new Date(a.transaction_date_sec).getTime())[0].transaction_date_sec
            : null;
          const { data: expenses } = await supabase
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
          if (endDate < today) expiredSubscriptions++;
          else if (endDate <= thirtyDaysFromNow) expiringSoon++;
        }
      }
      let totalExpenses = 0;
      for (const user of (allUsers || [])) {
        const { data: expenses } = await supabase
          .from('expenses')
          .select('amount')
          .eq('user_id', user.id);
        if (expenses) totalExpenses += expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      }
      setGlobalStats({ totalUsers, totalTransactions, totalRevenue, totalExpenses, activeUsers, inactiveUsers, expiredSubscriptions, expiringSoon });
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
      setUsers(prev => prev.map(user => user.id === userId ? { ...user, is_active: !currentStatus } : user));
      showToastMsg(`Compte ${!currentStatus ? 'activé' : 'désactivé'} avec succès`, 'success');
      loadGlobalStats();
    } catch (error) {
      console.error('Erreur changement statut:', error);
      showToastMsg('Erreur lors du changement de statut', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const formatPhoneForWhatsApp = (phone: string): string => {
    let cleaned = phone.replace(/\s/g, '').replace(/^\+?221/, '');
    if (!cleaned.startsWith('77') && !cleaned.startsWith('78') && !cleaned.startsWith('76') && !cleaned.startsWith('70') && !cleaned.startsWith('75')) {
      cleaned = '77' + cleaned;
    }
    return `221${cleaned}`;
  };

  const getPaymentReminderMessage = (userName: string, subscription: UserSubscription): string => {
    const endDate = subscription?.end_date ? new Date(subscription.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'bientôt';
    const price = subscription?.price || PLAN_PRICES[subscription?.plan_name || 'Mensuel'] || 5000;
    const planName = subscription?.plan_name || 'Mensuel';
    return `*${APP_NAME} - Rappel de paiement* 💈💰\n\nBonjour ${userName || 'Cher client'} 👋,\n\nVotre abonnement *${planName}* arrive à expiration le *${endDate}*.\n\n• 📅 Expiration : ${endDate}\n• 💳 Montant : ${price.toLocaleString()} CFA\n\n👉 ${APP_URL}/subscribe\n\n💳 Wave & Orange Money\n\n*${APP_NAME}* ✨`;
  };

  const getEarlyReminderMessage = (userName: string, subscription: UserSubscription): string => {
    const endDate = subscription?.end_date ? new Date(subscription.end_date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'bientôt';
    const price = subscription?.price || PLAN_PRICES[subscription?.plan_name || 'Mensuel'] || 5000;
    const planName = subscription?.plan_name || 'Mensuel';
    return `*${APP_NAME} - Abonnement expire bientôt* ⏰\n\nBonjour ${userName || 'Cher client'} 👋,\n\nVotre abonnement *${planName}* expire dans *7 jours*, le *${endDate}*.\n\n💳 Montant : ${price.toLocaleString()} CFA\n✅ Renouveler : ${APP_URL}/subscribe\n\n*${APP_NAME}* ⭐`;
  };

  const getMarketingMessage = (userName: string, subscription: UserSubscription): string => {
    return `*${APP_NAME} - Gestion de salon professionnel* 💈\n\nBonjour ${userName || 'Cher client'} 👋,\n\n✨ Suivez vos revenus, gérez vos services et coiffeurs facilement.\n\n📅 Abonnement : ${subscription?.plan_name || 'Gratuit'}\n🚀 App : ${APP_URL}\n\nMerci ! 🙏\n\n*${APP_NAME}* ✨`;
  };

  const getReminderMessage = (userName: string, stats: UserStats | undefined): string => {
    const transactionCount = stats?.transaction_count || 0;
    const revenue = stats?.total_revenue || 0;
    return `*${APP_NAME} - Votre activité* 📊\n\nBonjour ${userName || 'Cher client'} 👋,\n\n✂️ Transactions : ${transactionCount}\n💰 Chiffre d'affaires : ${revenue.toLocaleString()} CFA\n\n📱 App : ${APP_URL}\n\n*${APP_NAME}* ⭐`;
  };

  const sendWhatsAppMessage = async (phoneNumber: string, userName: string, subscription: UserSubscription, stats?: UserStats, type: 'marketing' | 'reminder' | 'payment_reminder' | 'early_reminder' = 'marketing') => {
    if (!phoneNumber) {
      showToastMsg('Ce client n\'a pas de numéro de téléphone enregistré', 'error');
      return;
    }
    const whatsappNumber = formatPhoneForWhatsApp(phoneNumber);
    let message = '';
    if (type === 'marketing') message = getMarketingMessage(userName, subscription);
    else if (type === 'reminder') message = getReminderMessage(userName, stats);
    else if (type === 'payment_reminder') message = getPaymentReminderMessage(userName, subscription);
    else message = getEarlyReminderMessage(userName, subscription);
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank');
    showToastMsg(`Ouverture WhatsApp pour ${userName}`, 'success');
    setOpenWhatsAppMenu(null);
  };

  const sendCustomMessage = async (phoneNumber: string, message: string) => {
    if (!phoneNumber) {
      showToastMsg('Ce client n\'a pas de numéro de téléphone enregistré', 'error');
      return;
    }
    const whatsappNumber = formatPhoneForWhatsApp(phoneNumber);
    window.open(`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`, '_blank');
    showToastMsg('Ouverture WhatsApp', 'success');
    setShowMessageModal(false);
    setOpenWhatsAppMenu(null);
  };

  const refreshData = async () => {
    await loadUsers();
    await loadGlobalStats();
    await loadBanners();
    showToastMsg('Données actualisées', 'success');
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id.toLowerCase().includes(searchTerm.toLowerCase());
    const subscription = userSubscriptions[user.id];
    const isExpiring = subscription?.end_date &&
      new Date(subscription.end_date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) &&
      new Date(subscription.end_date) > new Date();
    const matchesStatus = filterStatus === 'all' ||
      (filterStatus === 'active' && user.is_active) ||
      (filterStatus === 'inactive' && !user.is_active) ||
      (filterStatus === 'expiring' && isExpiring);
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
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'} text-white text-sm`}>
          {toast.message}
        </div>
      )}

      {/* EN-TÊTE */}
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

      {/* SECTION BANNIÈRE PUBLICITAIRE */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Globe className="w-5 h-5 text-green-400" />
              Bannière publicitaire
            </h3>
            <p className="text-zinc-500 text-xs mt-1">La bannière active s'affiche sur la page d'accueil de tous les utilisateurs</p>
          </div>
          <button
            onClick={() => {
              setEditingBanner(null);
              setSelectedFile(null);
              setFilePreviewUrl('');
              setBannerForm({ type: 'image', expiry_days: 1 });
              setShowBannerModal(true);
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nouvelle bannière
          </button>
        </div>

        {bannerLoading ? (
          <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto"></div></div>
        ) : banners.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-zinc-700 rounded-xl">
            <Image className="w-12 h-12 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500 text-sm">Aucune bannière</p>
            <p className="text-zinc-600 text-xs">Créez votre première bannière publicitaire</p>
          </div>
        ) : (
          <div className="space-y-3">
            {banners.map((banner) => {
              const isExpired = new Date(banner.expiry_date) < new Date();
              return (
                <div key={banner.id} className={`border rounded-xl p-4 transition ${banner.is_active && !isExpired ? 'border-green-500 bg-green-950/20' : isExpired ? 'border-red-500 bg-red-950/20' : 'border-zinc-700'}`}>
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {banner.type === 'image' ? <Image className="w-4 h-4 text-blue-400" /> : <Video className="w-4 h-4 text-red-400" />}
                        <span className="text-white text-sm font-medium">{banner.type === 'image' ? 'Image' : 'Vidéo'}</span>
                        {banner.is_active && !isExpired && <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs rounded-full">Active</span>}
                        {isExpired && <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">Expirée</span>}
                      </div>
                      <div className="mt-2 mb-2 max-w-[200px] rounded-lg overflow-hidden bg-zinc-800">
                        {banner.type === 'image' ? (
                          <img src={banner.url} alt="Aperçu" className="w-full h-20 object-cover" />
                        ) : (
                          <video src={banner.url} className="w-full h-20 object-cover" muted />
                        )}
                      </div>
                      <p className="text-zinc-600 text-xs">Expire le : {new Date(banner.expiry_date).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleBannerStatus(banner.id, banner.is_active)} disabled={isExpired} className={`p-2 rounded-lg transition ${banner.is_active ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'} ${isExpired ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {banner.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => {
                        setEditingBanner(banner);
                        setSelectedFile(null);
                        setFilePreviewUrl('');
                        const daysDiff = Math.ceil((new Date(banner.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                        setBannerForm({ 
                          type: banner.type, 
                          expiry_days: daysDiff > 0 ? daysDiff : 1 
                        });
                        setShowBannerModal(true);
                      }} className="p-2 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => deleteBanner(banner.id)} className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL BANNIÈRE AVEC UPLOAD */}
      {showBannerModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6 border border-zinc-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">{editingBanner ? 'Modifier la bannière' : 'Nouvelle bannière'}</h3>
              <button onClick={() => setShowBannerModal(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-4">
              {/* Upload de fichier */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Fichier (image ou vidéo) <span className="text-red-400">*</span>
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-zinc-600 hover:border-zinc-400 rounded-xl p-6 flex flex-col items-center gap-3 transition text-center"
                >
                  {selectedFile ? (
                    <>
                      {bannerForm.type === 'image'
                        ? <FileImage className="w-8 h-8 text-blue-400" />
                        : <FileVideo className="w-8 h-8 text-red-400" />
                      }
                      <div>
                        <p className="text-white text-sm font-medium truncate max-w-[260px]">{selectedFile.name}</p>
                        <p className="text-zinc-500 text-xs">{(selectedFile.size / (1024 * 1024)).toFixed(1)} Mo</p>
                      </div>
                      <span className="text-zinc-400 text-xs underline">Changer de fichier</span>
                    </>
                  ) : editingBanner ? (
                    <>
                      <Upload className="w-8 h-8 text-zinc-500" />
                      <p className="text-zinc-400 text-sm">Cliquez pour remplacer le fichier actuel</p>
                      <p className="text-zinc-600 text-xs">ou conservez l'existant</p>
                    </>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-zinc-500" />
                      <p className="text-white text-sm font-medium">Cliquez pour sélectionner</p>
                      <p className="text-zinc-500 text-xs">Image (JPG, PNG, GIF) ou Vidéo (MP4, MOV, WebM) max 50 Mo</p>
                    </>
                  )}
                </button>

                {isUploading && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-zinc-400 mb-1">
                      <span>Upload en cours...</span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Aperçu */}
              {(filePreviewUrl || editingBanner?.url) && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-2">Aperçu :</p>
                  <div className="rounded-lg overflow-hidden bg-zinc-700 max-h-[150px] flex items-center justify-center">
                    {(filePreviewUrl || editingBanner?.type === 'image') ? (
                      <img src={filePreviewUrl || editingBanner?.url} alt="Aperçu" className="max-w-full max-h-[150px] object-contain" />
                    ) : (
                      <video src={editingBanner?.url} className="max-w-full max-h-[150px] object-contain" controls muted />
                    )}
                  </div>
                </div>
              )}

              {/* Durée de la campagne */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Durée de la campagne (jours)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="1" max="365"
                    value={bannerForm.expiry_days}
                    onChange={(e) => setBannerForm({ ...bannerForm, expiry_days: parseInt(e.target.value) || 1 })}
                    className="flex-1 p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition"
                  />
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setBannerForm({ ...bannerForm, expiry_days: 1 })}
                      className="px-3 py-2 rounded-lg bg-zinc-800 text-white text-sm hover:bg-zinc-700 transition"
                    >
                      1j
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerForm({ ...bannerForm, expiry_days: 7 })}
                      className="px-3 py-2 rounded-lg bg-zinc-800 text-white text-sm hover:bg-zinc-700 transition"
                    >
                      7j
                    </button>
                    <button
                      type="button"
                      onClick={() => setBannerForm({ ...bannerForm, expiry_days: 30 })}
                      className="px-3 py-2 rounded-lg bg-zinc-800 text-white text-sm hover:bg-zinc-700 transition"
                    >
                      30j
                    </button>
                  </div>
                </div>
                <p className="text-zinc-500 text-xs mt-1">La bannière sera active pendant X jours</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={saveBanner}
                  disabled={bannerLoading || isUploading || (!selectedFile && !editingBanner)}
                  className="flex-1 bg-white text-black py-3 rounded-xl font-semibold hover:bg-zinc-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isUploading ? (
                    <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black" /> Upload...</>
                  ) : (
                    <><Save className="w-4 h-4" /> {editingBanner ? 'Mettre à jour' : 'Publier'}</>
                  )}
                </button>
                <button onClick={() => setShowBannerModal(false)} className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-semibold hover:bg-zinc-700 transition">Annuler</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STATISTIQUES GLOBALES */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4"><div className="flex items-center gap-2 text-zinc-400 mb-1"><Users className="w-4 h-4" /><span className="text-xs">Total</span></div><p className="text-white text-2xl font-bold">{globalStats.totalUsers}</p></div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4"><div className="flex items-center gap-2 text-green-400 mb-1"><UserCheck className="w-4 h-4" /><span className="text-xs">Actifs</span></div><p className="text-white text-2xl font-bold">{globalStats.activeUsers}</p></div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4"><div className="flex items-center gap-2 text-red-400 mb-1"><UserX className="w-4 h-4" /><span className="text-xs">Inactifs</span></div><p className="text-white text-2xl font-bold">{globalStats.inactiveUsers}</p></div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4"><div className="flex items-center gap-2 text-orange-400 mb-1"><AlertTriangle className="w-4 h-4" /><span className="text-xs">Expire bientôt</span></div><p className="text-white text-2xl font-bold">{globalStats.expiringSoon}</p></div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4"><div className="flex items-center gap-2 text-blue-400 mb-1"><Activity className="w-4 h-4" /><span className="text-xs">Transactions</span></div><p className="text-white text-xl font-bold">{globalStats.totalTransactions.toLocaleString()}</p></div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4"><div className="flex items-center gap-2 text-green-400 mb-1"><DollarSign className="w-4 h-4" /><span className="text-xs">Revenus</span></div><p className="text-white text-lg font-bold">{globalStats.totalRevenue.toLocaleString()} CFA</p></div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4"><div className="flex items-center gap-2 text-red-400 mb-1"><TrendingUp className="w-4 h-4" /><span className="text-xs">Dépenses</span></div><p className="text-white text-lg font-bold">{globalStats.totalExpenses.toLocaleString()} CFA</p></div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4"><div className="flex items-center gap-2 text-purple-400 mb-1"><CreditCard className="w-4 h-4" /><span className="text-xs">Expirés</span></div><p className="text-white text-2xl font-bold">{globalStats.expiredSubscriptions}</p></div>
      </div>

      {/* FILTRES */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input type="text" placeholder="Rechercher..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-9 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-white transition" />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as any)} className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-white transition">
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
          <option value="expiring">Expire bientôt</option>
        </select>
      </div>

      {/* TABLEAU UTILISATEURS */}
      {loading ? (
        <div className="text-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto"></div><p className="text-zinc-500 mt-3">Chargement...</p></div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12"><Users className="w-12 h-12 text-zinc-600 mx-auto mb-3" /><p className="text-zinc-500">Aucun utilisateur trouvé</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-zinc-800">
              <tr className="text-zinc-500 text-sm">
                <th className="pb-3">Utilisateur</th><th className="pb-3">Contact</th><th className="pb-3">Abonnement</th><th className="pb-3">Expiration</th><th className="pb-3">Statut</th><th className="pb-3">Transactions</th><th className="pb-3">Revenus</th><th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredUsers.map((user) => {
                const stats = userStats[user.id];
                const subscription = userSubscriptions[user.id];
                const isCurrentUser = user.id === currentUserId;
                const endDate = subscription?.end_date ? new Date(subscription.end_date).toLocaleDateString('fr-FR') : 'N/A';
                const isExpiringSoon = subscription?.end_date && new Date(subscription.end_date) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
                return (
                  <tr key={user.id} className="hover:bg-zinc-900/50 transition">
                    <td className="py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center"><span className="text-white text-sm font-bold uppercase">{(user.full_name || user.email || 'U')[0]}</span></div><div><p className="text-white font-medium">{user.full_name || 'Sans nom'}</p><p className="text-zinc-500 text-xs">{user.id.slice(0, 8)}...</p></div></div></td>
                    <td className="py-3">{user.phone ? <div className="flex items-center gap-2"><Phone className="w-3 h-3 text-green-400" /><span className="text-zinc-300 text-sm">{user.phone}</span></div> : <span className="text-zinc-600 text-sm">Non renseigné</span>}</td>
                    <td className="py-3"><span className={`px-2 py-1 rounded-lg text-xs font-medium ${subscription?.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{subscription?.plan_name || 'Aucun'}</span></td>
                    <td className="py-3"><div className="flex items-center gap-1"><Calendar className="w-3 h-3 text-zinc-500" /><span className={`text-sm ${isExpiringSoon && subscription?.status === 'active' ? 'text-orange-400 font-semibold' : 'text-zinc-300'}`}>{endDate}{isExpiringSoon && <span className="ml-1">⚠️</span>}</span></div></td>
                    <td className="py-3"><button onClick={() => toggleUserStatus(user.id, user.is_active)} disabled={processingId === user.id || isCurrentUser} className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium ${user.is_active ? 'bg-green-500/20 text-green-400 border border-green-500' : 'bg-red-500/20 text-red-400 border border-red-500'} ${isCurrentUser ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>{user.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}{user.is_active ? 'Actif' : 'Inactif'}</button></td>
                    <td className="py-3">{statsLoading ? <span className="text-zinc-500">...</span> : <span className="text-white">{stats?.transaction_count || 0}</span>}</td>
                    <td className="py-3">{statsLoading ? <span className="text-zinc-500">...</span> : <span className="text-green-400">{(stats?.total_revenue || 0).toLocaleString()} CFA</span>}</td>
                    <td className="py-3">
                      <div className="relative">
                        <button onClick={(e) => { e.stopPropagation(); setOpenWhatsAppMenu(openWhatsAppMenu === user.id ? null : user.id); }} className="p-1.5 rounded-lg bg-green-600 hover:bg-green-700 transition" title="Envoyer message WhatsApp"><Send className="w-4 h-4 text-white" /></button>
                        {openWhatsAppMenu === user.id && (
                          <div className="absolute top-full right-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-2 z-50 min-w-[180px]">
                            <button onClick={() => sendWhatsAppMessage(user.phone, user.full_name || user.email, subscription, stats, 'payment_reminder')} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"><CreditCard className="w-3 h-3 text-red-400" /> Rappel paiement</button>
                            <button onClick={() => sendWhatsAppMessage(user.phone, user.full_name || user.email, subscription, stats, 'early_reminder')} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-orange-400" /> Expiration dans 7j</button>
                            <button onClick={() => sendWhatsAppMessage(user.phone, user.full_name || user.email, subscription, stats, 'marketing')} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"><Sparkles className="w-3 h-3 text-yellow-400" /> Marketing</button>
                            <button onClick={() => sendWhatsAppMessage(user.phone, user.full_name || user.email, subscription, stats, 'reminder')} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"><Rocket className="w-3 h-3 text-blue-400" /> Relance</button>
                            <button onClick={() => { setSelectedUser(user); setMessageText(''); setShowMessageModal(true); setOpenWhatsAppMenu(null); }} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"><Star className="w-3 h-3 text-purple-400" /> Personnalisé</button>
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

      {/* MODAL DÉTAILS UTILISATEUR */}
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
                    <button onClick={() => setOpenWhatsAppMenu(openWhatsAppMenu === selectedUser.id ? null : selectedUser.id)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white"><Send className="w-4 h-4" /> Envoyer message</button>
                    {openWhatsAppMenu === selectedUser.id && (
                      <div className="absolute top-full left-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-2 z-50 min-w-[180px]">
                        <button onClick={() => sendWhatsAppMessage(selectedUser.phone, selectedUser.full_name || selectedUser.email, userSubscriptions[selectedUser.id], userStats[selectedUser.id], 'payment_reminder')} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"><CreditCard className="w-3 h-3 text-red-400" /> Rappel paiement</button>
                        <button onClick={() => sendWhatsAppMessage(selectedUser.phone, selectedUser.full_name || selectedUser.email, userSubscriptions[selectedUser.id], userStats[selectedUser.id], 'early_reminder')} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-orange-400" /> Expiration dans 7j</button>
                        <button onClick={() => sendWhatsAppMessage(selectedUser.phone, selectedUser.full_name || selectedUser.email, userSubscriptions[selectedUser.id], userStats[selectedUser.id], 'marketing')} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"><Sparkles className="w-3 h-3 text-yellow-400" /> Marketing</button>
                        <button onClick={() => sendWhatsAppMessage(selectedUser.phone, selectedUser.full_name || selectedUser.email, userSubscriptions[selectedUser.id], userStats[selectedUser.id], 'reminder')} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"><Rocket className="w-3 h-3 text-blue-400" /> Relance</button>
                        <button onClick={() => { setMessageText(''); setShowMessageModal(true); }} className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"><Star className="w-3 h-3 text-purple-400" /> Personnalisé</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL MESSAGE PERSONNALISÉ */}
      {showMessageModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Message à {selectedUser.full_name || selectedUser.email}</h3>
              <button onClick={() => setShowMessageModal(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <textarea value={messageText} onChange={(e) => setMessageText(e.target.value)} placeholder="Votre message personnalisé..." rows={5} className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white mb-4" />
            <div className="flex gap-3">
              <button onClick={() => sendCustomMessage(selectedUser.phone, messageText)} disabled={!messageText.trim()} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl font-semibold transition disabled:opacity-50">Envoyer via WhatsApp</button>
              <button onClick={() => setShowMessageModal(false)} className="flex-1 bg-zinc-800 text-white py-2 rounded-xl font-semibold hover:bg-zinc-700 transition">Annuler</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}