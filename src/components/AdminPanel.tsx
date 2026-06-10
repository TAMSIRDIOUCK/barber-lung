// src/components/AdminPanel.tsx
import { useState, useEffect, useRef } from 'react';
import {
  Users, Search, X, CheckCircle, XCircle, Eye, Shield,
  UserCheck, UserX, TrendingUp, DollarSign, Activity, RefreshCw,
  Phone, Calendar, Send, Sparkles, Star, Rocket, AlertTriangle,
  CreditCard, Plus, Edit2, Trash2, Image, Video, Save, Globe,
  EyeOff, Upload, FileImage, FileVideo, CalendarCheck, Gift
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  completed_bookings_count: number;
}

interface UserSubscription {
  plan_name: string;
  status: string;
  expires_at: string;
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

interface Referral {
  id: string;
  referrer_user_id: string;
  referred_name: string;
  referred_phone: string;
  status: 'pending' | 'rewarded';
  created_at: string;
  profiles_v3?: { full_name: string; email: string };
}

interface AdminPanelProps {
  currentUserId: string;
  isAdmin: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminPanel({ currentUserId, isAdmin }: AdminPanelProps) {

  // ── State ──────────────────────────────────────────────────────────────────
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

  // Banner
  const [banners, setBanners] = useState<Banner[]>([]);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
  const [showBannerModal, setShowBannerModal] = useState(false);

  // Referrals
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralsLoading, setReferralsLoading] = useState(false);

  // Upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [bannerForm, setBannerForm] = useState<{ type: 'image' | 'video'; expiry_days: number }>({
    type: 'image',
    expiry_days: 1,
  });

  const [globalStats, setGlobalStats] = useState({
    totalUsers: 0, totalTransactions: 0, totalRevenue: 0, totalExpenses: 0,
    activeUsers: 0, inactiveUsers: 0, expiredSubscriptions: 0, expiringSoon: 0,
    totalCompletedBookings: 0, totalReferrals: 0, rewardedReferrals: 0,
  });

  const APP_URL = 'https://barber-lunge.vercel.app';
  const APP_NAME = 'LE COUPE';
  const PLAN_PRICES: Record<string, number> = { Mensuel: 5000, Annuel: 50000, Gratuit: 0 };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const showToastMsg = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Calcul des jours restants avant expiration
  const getDaysRemaining = (expiresAt: string): number => {
    if (!expiresAt) return 0;
    const end = new Date(expiresAt);
    const today = new Date();
    const diffTime = end.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
  };

  // Format de la date d'expiration
  const formatExpiryDate = (expiresAt: string): string => {
    if (!expiresAt) return 'N/A';
    return new Date(expiresAt).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    loadGlobalStats();
    loadBanners();
    loadReferrals();
  }, [isAdmin]);

  useEffect(() => {
    const handleClickOutside = () => setOpenWhatsAppMenu(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!showBannerModal) {
      if (filePreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(filePreviewUrl);
      setFilePreviewUrl('');
      setSelectedFile(null);
      setUploadProgress(0);
    }
  }, [showBannerModal]);

  // ── File select ────────────────────────────────────────────────────────────

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) { showToastMsg('Format non supporté.', 'error'); return; }
    if (file.size > 50 * 1024 * 1024) { showToastMsg('Fichier trop lourd (max 50 Mo)', 'error'); return; }
    const detectedType: 'image' | 'video' = isImage ? 'image' : 'video';
    setBannerForm(prev => ({ ...prev, type: detectedType }));
    if (filePreviewUrl?.startsWith('blob:')) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(file);
    setFilePreviewUrl(URL.createObjectURL(file));
  };

  // ── Data loaders ───────────────────────────────────────────────────────────

  const loadBanners = async () => {
    setBannerLoading(true);
    try {
      const { data, error } = await supabase
        .from('public_banners').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setBanners(data || []);
    } catch (err) { console.error('Erreur bannières:', err); }
    finally { setBannerLoading(false); }
  };

  const loadReferrals = async () => {
    setReferralsLoading(true);
    try {
      const { data, error } = await supabase
        .from('referrals')
        .select('*, profiles_v3!referrer_user_id(full_name, email)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      setReferrals((data as Referral[]) || []);
    } catch (err) { console.error('Erreur parrainages:', err); }
    finally { setReferralsLoading(false); }
  };

  const loadCompletedBookingsCount = async (userId: string): Promise<number> => {
    try {
      const { count, error } = await supabase
        .from('bookings').select('*', { count: 'exact', head: true })
        .eq('salon_user_id', userId).eq('status', 'done');
      if (error) throw error;
      return count || 0;
    } catch { return 0; }
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data: profiles, error } = await supabase
        .from('profiles_v3').select('*').eq('role', 'user').order('created_at', { ascending: false });
      if (error) throw error;
      const usersWithData = (profiles || []).map(p => ({
        ...p,
        email: p.email || `${p.id.slice(0, 8)}...`,
        phone: p.phone || '',
      }));
      setUsers(usersWithData);
      await loadAllUserStats(usersWithData.map(u => u.id));
      await loadAllUserSubscriptions(usersWithData.map(u => u.id));
    } catch (err) {
      console.error('Erreur chargement utilisateurs:', err);
      showToastMsg('Erreur lors du chargement des utilisateurs', 'error');
    } finally { setLoading(false); }
  };

  const loadAllUserSubscriptions = async (userIds: string[]) => {
    const subsMap: Record<string, UserSubscription> = {};
    for (const userId of userIds) {
      try {
        const { data: sub } = await supabase
          .from('subscriptions')
          .select('plan_id, status, expires_at, start_date, is_free_trial')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (sub) {
          let planName = 'Gratuit', price = 0;
          if (sub.plan_id) {
            const { data: plan } = await supabase
              .from('subscription_plans').select('name, price').eq('id', sub.plan_id).single();
            if (plan) { planName = plan.name; price = plan.price; }
          }
          subsMap[userId] = {
            plan_name: planName, status: sub.status,
            expires_at: sub.expires_at, start_date: sub.start_date,
            is_free_trial: sub.is_free_trial || false, price,
          };
        } else {
          subsMap[userId] = { plan_name: 'Aucun', status: 'none', expires_at: '', start_date: '', is_free_trial: false, price: 0 };
        }
      } catch (err) { console.error(`Abonnement ${userId}:`, err); }
    }
    setUserSubscriptions(subsMap);
  };

  const loadAllUserStats = async (userIds: string[]) => {
    setStatsLoading(true);
    const statsMap: Record<string, UserStats> = {};
    let totalCompletedBookings = 0;

    for (const userId of userIds) {
      try {
        const { data: transactions } = await supabase
          .from('transactions').select('amount, transaction_date_sec').eq('user_id', userId);
        const transactionCount = transactions?.length || 0;
        const totalRevenue = transactions?.reduce((s, t) => s + (Number(t.amount) || 0), 0) || 0;
        const lastTransaction = transactions?.length
          ? [...transactions].sort((a, b) =>
              new Date(b.transaction_date_sec).getTime() - new Date(a.transaction_date_sec).getTime()
            )[0].transaction_date_sec
          : null;

        const { data: expenses } = await supabase
          .from('expenses').select('amount').eq('user_id', userId);
        const expenseCount = expenses?.length || 0;
        const totalExpenses = expenses?.reduce((s, e) => s + (Number(e.amount) || 0), 0) || 0;

        const completedBookingsCount = await loadCompletedBookingsCount(userId);
        totalCompletedBookings += completedBookingsCount;

        statsMap[userId] = {
          user_id: userId, transaction_count: transactionCount, total_revenue: totalRevenue,
          expense_count: expenseCount, total_expenses: totalExpenses,
          last_transaction_date: lastTransaction, completed_bookings_count: completedBookingsCount,
        };
      } catch (err) { console.error(`Stats ${userId}:`, err); }
    }
    setUserStats(statsMap);
    setGlobalStats(prev => ({ ...prev, totalCompletedBookings }));
    setStatsLoading(false);
  };

  const loadGlobalStats = async () => {
    try {
      const { data: allUsers } = await supabase
        .from('profiles_v3').select('id, is_active').eq('role', 'user');
      const activeUsers = allUsers?.filter(u => u.is_active).length || 0;
      const inactiveUsers = allUsers?.filter(u => !u.is_active).length || 0;
      const totalUsers = allUsers?.length || 0;
      let totalTransactions = 0, totalRevenue = 0, totalExpenses = 0;
      let expiredSubscriptions = 0, expiringSoon = 0, totalCompletedBookings = 0;
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);

      for (const user of (allUsers || [])) {
        const { data: tx } = await supabase.from('transactions').select('amount').eq('user_id', user.id);
        if (tx) { totalTransactions += tx.length; totalRevenue += tx.reduce((s, t) => s + (Number(t.amount) || 0), 0); }

        const { data: sub } = await supabase
          .from('subscriptions').select('expires_at, status')
          .eq('user_id', user.id).eq('status', 'active')
          .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (sub?.expires_at) {
          const end = new Date(sub.expires_at);
          if (end < today) expiredSubscriptions++;
          else if (end <= thirtyDaysFromNow) expiringSoon++;
        }

        const { count: bCount } = await supabase
          .from('bookings').select('*', { count: 'exact', head: true })
          .eq('salon_user_id', user.id).eq('status', 'done');
        totalCompletedBookings += (bCount || 0);

        const { data: exp } = await supabase.from('expenses').select('amount').eq('user_id', user.id);
        if (exp) totalExpenses += exp.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      }

      const { count: referralCount } = await supabase
        .from('referrals').select('*', { count: 'exact', head: true });
      const { count: rewardedCount } = await supabase
        .from('referrals').select('*', { count: 'exact', head: true }).eq('status', 'rewarded');

      setGlobalStats({
        totalUsers, totalTransactions, totalRevenue, totalExpenses,
        activeUsers, inactiveUsers, expiredSubscriptions, expiringSoon,
        totalCompletedBookings, totalReferrals: referralCount || 0, rewardedReferrals: rewardedCount || 0,
      });
    } catch (err) { console.error('Stats globales:', err); }
  };

  // ── Actions ────────────────────────────────────────────────────────────────

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    if (!confirm(`Voulez-vous vraiment ${currentStatus ? 'désactiver' : 'activer'} ce compte ?`)) return;
    setProcessingId(userId);
    try {
      const { error } = await supabase
        .from('profiles_v3').update({ is_active: !currentStatus })
        .eq('id', userId).eq('role', 'user');
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentStatus } : u));
      showToastMsg(`Compte ${!currentStatus ? 'activé' : 'désactivé'}`, 'success');
      loadGlobalStats();
    } catch (err) {
      console.error(err);
      showToastMsg('Erreur lors du changement de statut', 'error');
    } finally { setProcessingId(null); }
  };

  const saveBanner = async () => {
    if (!selectedFile && !editingBanner) { showToastMsg('Veuillez sélectionner un fichier', 'error'); return; }
    setBannerLoading(true);
    setIsUploading(true);
    setUploadProgress(10);
    try {
      let finalUrl = editingBanner?.url || '';
      if (selectedFile) {
        setUploadProgress(30);
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `banners/${Date.now()}_${Math.random().toString(36).slice(2)}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('public-media').upload(fileName, selectedFile);
        if (uploadError) throw uploadError;
        setUploadProgress(80);
        const { data: urlData } = supabase.storage.from('public-media').getPublicUrl(fileName);
        finalUrl = urlData.publicUrl;
      }
      setUploadProgress(90);
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + bannerForm.expiry_days);

      if (editingBanner) {
        const { error } = await supabase.from('public_banners')
          .update({ type: bannerForm.type, url: finalUrl, expiry_date: expiryDate.toISOString() })
          .eq('id', editingBanner.id);
        if (error) throw error;
        showToastMsg('Bannière mise à jour', 'success');
      } else {
        const { error } = await supabase.from('public_banners').insert({
          type: bannerForm.type, url: finalUrl,
          expiry_date: expiryDate.toISOString(), is_active: true, created_by: currentUserId,
        });
        if (error) throw error;
        showToastMsg('Bannière publiée', 'success');
      }
      setUploadProgress(100);
      await loadBanners();
      setShowBannerModal(false);
      setEditingBanner(null);
      setSelectedFile(null);
      setFilePreviewUrl('');
      setBannerForm({ type: 'image', expiry_days: 1 });
    } catch (err: any) {
      console.error(err);
      showToastMsg(err?.message || 'Erreur lors de la sauvegarde', 'error');
    } finally { setBannerLoading(false); setIsUploading(false); setUploadProgress(0); }
  };

  const toggleBannerStatus = async (bannerId: number, currentStatus: boolean) => {
    setBannerLoading(true);
    try {
      if (!currentStatus) await supabase.from('public_banners').update({ is_active: false }).neq('id', bannerId);
      const { error } = await supabase.from('public_banners')
        .update({ is_active: !currentStatus }).eq('id', bannerId);
      if (error) throw error;
      showToastMsg(`Bannière ${!currentStatus ? 'activée' : 'désactivée'}`, 'success');
      await loadBanners();
    } catch (err) { console.error(err); showToastMsg('Erreur statut bannière', 'error'); }
    finally { setBannerLoading(false); }
  };

  const deleteBanner = async (bannerId: number) => {
    if (!confirm('Supprimer cette bannière ?')) return;
    setBannerLoading(true);
    try {
      const { error } = await supabase.from('public_banners').delete().eq('id', bannerId);
      if (error) throw error;
      showToastMsg('Bannière supprimée', 'success');
      await loadBanners();
    } catch (err) { console.error(err); showToastMsg('Erreur suppression', 'error'); }
    finally { setBannerLoading(false); }
  };

  const updateReferralStatus = async (referralId: string, newStatus: 'pending' | 'rewarded') => {
    try {
      const { error } = await supabase.from('referrals').update({
        status: newStatus,
        rewarded_at: newStatus === 'rewarded' ? new Date().toISOString() : null,
      }).eq('id', referralId);
      if (error) throw error;
      showToastMsg(`Parrainage ${newStatus === 'rewarded' ? 'récompensé' : 'en attente'}`, 'success');
      loadReferrals();
      loadGlobalStats();
    } catch (err) { console.error(err); showToastMsg('Erreur mise à jour parrainage', 'error'); }
  };

  const refreshData = async () => {
    await Promise.all([loadUsers(), loadGlobalStats(), loadBanners(), loadReferrals()]);
    showToastMsg('Données actualisées', 'success');
  };

  // ── WhatsApp messages ──────────────────────────────────────────────────────

  const formatPhoneForWhatsApp = (phone: string): string => {
    let cleaned = phone.replace(/\s/g, '').replace(/^\+?221/, '');
    if (!['77','78','76','70','75'].some(p => cleaned.startsWith(p))) cleaned = '77' + cleaned;
    return `221${cleaned}`;
  };

  const getPaymentReminderMessage = (userName: string, sub: UserSubscription) => {
    const end = sub?.expires_at ? new Date(sub.expires_at).toLocaleDateString('fr-FR') : 'bientôt';
    const daysLeft = sub?.expires_at ? getDaysRemaining(sub.expires_at) : 0;
    const price = sub?.price || PLAN_PRICES[sub?.plan_name || 'Mensuel'] || 5000;
    return `*${APP_NAME} - Rappel de paiement* 💈💰\n\nBonjour ${userName || 'Cher client'} 👋,\n\nVotre abonnement *${sub?.plan_name || 'Mensuel'}* expire le *${end}*.\n\n• 📅 Expiration : ${end}\n• ⏰ Jours restants : ${daysLeft} jours\n• 💳 Montant : ${price.toLocaleString()} CFA\n\n👉 ${APP_URL}/subscribe\n\n💳 Wave & Orange Money\n\n*${APP_NAME}* ✨`;
  };
  
  const getEarlyReminderMessage = (userName: string, sub: UserSubscription) => {
    const end = sub?.expires_at ? new Date(sub.expires_at).toLocaleDateString('fr-FR') : 'bientôt';
    const daysLeft = sub?.expires_at ? getDaysRemaining(sub.expires_at) : 0;
    const price = sub?.price || PLAN_PRICES[sub?.plan_name || 'Mensuel'] || 5000;
    return `*${APP_NAME} - Abonnement expire bientôt* ⏰\n\nBonjour ${userName || 'Cher client'} 👋,\n\nVotre abonnement *${sub?.plan_name || 'Mensuel'}* expire dans *${daysLeft} jours*, le *${end}*.\n\n💳 Montant : ${price.toLocaleString()} CFA\n✅ Renouveler : ${APP_URL}/subscribe\n\n*${APP_NAME}* ⭐`;
  };
  
  const getMarketingMessage = (userName: string, sub: UserSubscription) =>
    `*${APP_NAME} - Gestion de salon professionnel* 💈\n\nBonjour ${userName || 'Cher client'} 👋,\n\n✨ Suivez vos revenus, gérez vos services et coiffeurs facilement.\n\n📅 Abonnement : ${sub?.plan_name || 'Gratuit'}\n🚀 App : ${APP_URL}\n\nMerci ! 🙏\n\n*${APP_NAME}* ✨`;
  
  const getReminderMessage = (userName: string, stats?: UserStats) =>
    `*${APP_NAME} - Votre activité* 📊\n\nBonjour ${userName || 'Cher client'} 👋,\n\n✂️ Transactions : ${stats?.transaction_count || 0}\n💰 Chiffre d'affaires : ${(stats?.total_revenue || 0).toLocaleString()} CFA\n\n📱 App : ${APP_URL}\n\n*${APP_NAME}* ⭐`;

  const sendWhatsAppMessage = (
    phone: string, userName: string, sub: UserSubscription, stats?: UserStats,
    type: 'marketing' | 'reminder' | 'payment_reminder' | 'early_reminder' = 'marketing'
  ) => {
    if (!phone) { showToastMsg('Pas de numéro de téléphone', 'error'); return; }
    const num = formatPhoneForWhatsApp(phone);
    const msg =
      type === 'payment_reminder' ? getPaymentReminderMessage(userName, sub) :
      type === 'early_reminder'   ? getEarlyReminderMessage(userName, sub) :
      type === 'reminder'         ? getReminderMessage(userName, stats) :
                                    getMarketingMessage(userName, sub);
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank');
    showToastMsg(`Ouverture WhatsApp pour ${userName}`, 'success');
    setOpenWhatsAppMenu(null);
  };

  const sendCustomMessage = (phone: string, message: string) => {
    if (!phone) { showToastMsg('Pas de numéro de téléphone', 'error'); return; }
    window.open(`https://wa.me/${formatPhoneForWhatsApp(phone)}?text=${encodeURIComponent(message)}`, '_blank');
    showToastMsg('Ouverture WhatsApp', 'success');
    setShowMessageModal(false);
    setOpenWhatsAppMenu(null);
  };

  // ── Filtered users ─────────────────────────────────────────────────────────

  const filteredUsers = users.filter(user => {
    const matchesSearch = searchTerm === '' ||
      user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.phone?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.id.toLowerCase().includes(searchTerm.toLowerCase());
    const sub = userSubscriptions[user.id];
    const isExpiring = sub?.expires_at &&
      new Date(sub.expires_at) <= new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) &&
      new Date(sub.expires_at) > new Date();
    const matchesStatus =
      filterStatus === 'all' ||
      (filterStatus === 'active' && user.is_active) ||
      (filterStatus === 'inactive' && !user.is_active) ||
      (filterStatus === 'expiring' && isExpiring);
    return matchesSearch && matchesStatus;
  });

  // ── Access guard ───────────────────────────────────────────────────────────

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

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 px-4 sm:px-0">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-white text-sm ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.message}
        </div>
      )}

      {/* ── En-tête ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-white text-2xl sm:text-3xl font-bold flex items-center gap-3">
            <Shield className="w-8 h-8 text-green-500" /> Administration
          </h2>
          <p className="text-zinc-500 text-sm mt-1">Gestion des comptes utilisateurs</p>
        </div>
        <button onClick={refreshData} className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition">
          <RefreshCw className="w-4 h-4" /> Rafraîchir
        </button>
      </div>

      {/* ── Bannières ── */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-white font-bold text-lg flex items-center gap-2">
              <Globe className="w-5 h-5 text-green-400" /> Bannière publicitaire
            </h3>
            <p className="text-zinc-500 text-xs mt-1">La bannière active s'affiche sur la page d'accueil de tous les utilisateurs</p>
          </div>
          <button
            onClick={() => { setEditingBanner(null); setSelectedFile(null); setFilePreviewUrl(''); setBannerForm({ type: 'image', expiry_days: 1 }); setShowBannerModal(true); }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Nouvelle bannière
          </button>
        </div>

        {bannerLoading ? (
          <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto" /></div>
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
                        {banner.type === 'image'
                          ? <img src={banner.url} alt="Aperçu" className="w-full h-20 object-cover" />
                          : <video src={banner.url} className="w-full h-20 object-cover" muted />}
                      </div>
                      <p className="text-zinc-600 text-xs">Expire le : {new Date(banner.expiry_date).toLocaleDateString('fr-FR')}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => toggleBannerStatus(banner.id, banner.is_active)} disabled={isExpired}
                        className={`p-2 rounded-lg transition ${banner.is_active ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'} ${isExpired ? 'opacity-50 cursor-not-allowed' : ''}`}>
                        {banner.is_active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      <button onClick={() => {
                        setEditingBanner(banner); setSelectedFile(null); setFilePreviewUrl('');
                        const daysDiff = Math.ceil((new Date(banner.expiry_date).getTime() - Date.now()) / 86400000);
                        setBannerForm({ type: banner.type, expiry_days: daysDiff > 0 ? daysDiff : 1 });
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

      {/* ── Stats globales ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-3">
        {[
          { icon: <Users className="w-4 h-4" />, color: 'text-zinc-400', label: 'Total', value: globalStats.totalUsers },
          { icon: <UserCheck className="w-4 h-4" />, color: 'text-green-400', label: 'Actifs', value: globalStats.activeUsers },
          { icon: <UserX className="w-4 h-4" />, color: 'text-red-400', label: 'Inactifs', value: globalStats.inactiveUsers },
          { icon: <AlertTriangle className="w-4 h-4" />, color: 'text-orange-400', label: 'Expire bientôt', value: globalStats.expiringSoon },
          { icon: <CalendarCheck className="w-4 h-4" />, color: 'text-emerald-400', label: 'Réservations', value: globalStats.totalCompletedBookings.toLocaleString(), sub: 'terminées' },
          { icon: <Activity className="w-4 h-4" />, color: 'text-blue-400', label: 'Transactions', value: globalStats.totalTransactions.toLocaleString() },
          { icon: <DollarSign className="w-4 h-4" />, color: 'text-green-400', label: 'Revenus', value: `${globalStats.totalRevenue.toLocaleString()} CFA`, small: true },
          { icon: <TrendingUp className="w-4 h-4" />, color: 'text-red-400', label: 'Dépenses', value: `${globalStats.totalExpenses.toLocaleString()} CFA`, small: true },
          { icon: <CreditCard className="w-4 h-4" />, color: 'text-purple-400', label: 'Expirés', value: globalStats.expiredSubscriptions },
        ].map(({ icon, color, label, value, sub, small }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
            <div className={`flex items-center gap-2 ${color} mb-1`}>{icon}<span className="text-xs">{label}</span></div>
            <p className={`text-white font-bold ${small ? 'text-base' : 'text-2xl'}`}>{value}</p>
            {sub && <p className={`${color} text-[10px]`}>{sub}</p>}
          </div>
        ))}
      </div>

      {/* ── Parrainages stats ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-amber-400 mb-1"><Gift className="w-4 h-4" /><span className="text-xs">Parrainages</span></div>
          <p className="text-white text-2xl font-bold">{globalStats.totalReferrals}</p>
          <p className="text-amber-500 text-[10px]">{globalStats.rewardedReferrals} récompensés</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
          <div className="flex items-center gap-2 text-zinc-400 mb-1"><Users className="w-4 h-4" /><span className="text-xs">Résultats filtrés</span></div>
          <p className="text-white text-2xl font-bold">{filteredUsers.length}</p>
          <p className="text-zinc-500 text-[10px]">utilisateurs affichés</p>
        </div>
      </div>

      {/* ── Filtres ── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input type="text" placeholder="Rechercher..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-white transition" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
          className="px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-xl text-white focus:outline-none focus:border-white transition">
          <option value="all">Tous les statuts</option>
          <option value="active">Actifs</option>
          <option value="inactive">Inactifs</option>
          <option value="expiring">Expire bientôt</option>
        </select>
      </div>

      {/* ── Tableau utilisateurs AVEC DATE D'EXPIRATION ── */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto" />
          <p className="text-zinc-500 mt-3">Chargement...</p>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-500">Aucun utilisateur trouvé</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="border-b border-zinc-800">
              <tr className="text-zinc-500 text-sm">
                <th className="pb-3">Utilisateur</th>
                <th className="pb-3">Contact</th>
                <th className="pb-3">Abonnement</th>
                <th className="pb-3">Expiration</th>
                <th className="pb-3 text-center">Jours restants</th>
                <th className="pb-3 text-center">Réservations ✅</th>
                <th className="pb-3">Statut</th>
                <th className="pb-3">Transactions</th>
                <th className="pb-3">Revenus</th>
                <th className="pb-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filteredUsers.map((user) => {
                const stats = userStats[user.id];
                const sub = userSubscriptions[user.id];
                const isCurrentUser = user.id === currentUserId;
                const expiryDate = sub?.expires_at || '';
                const endDateFormatted = formatExpiryDate(expiryDate);
                const daysLeft = getDaysRemaining(expiryDate);
                const isExpiringSoon = daysLeft > 0 && daysLeft <= 7 && sub?.status === 'active';
                const isExpired = daysLeft === 0 && expiryDate !== '' && sub?.status === 'active';
                
                return (
                  <tr key={user.id} className="hover:bg-zinc-900/50 transition">
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-bold uppercase">{(user.full_name || user.email || 'U')[0]}</span>
                        </div>
                        <div>
                          <p className="text-white font-medium">{user.full_name || 'Sans nom'}</p>
                          <p className="text-zinc-500 text-xs">{user.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      {user.phone
                        ? <div className="flex items-center gap-2"><Phone className="w-3 h-3 text-green-400" /><span className="text-zinc-300 text-sm">{user.phone}</span></div>
                        : <span className="text-zinc-600 text-sm">Non renseigné</span>}
                    </td>
                    <td className="py-3">
                      <span className={`px-2 py-1 rounded-lg text-xs font-medium ${sub?.status === 'active' ? 'bg-green-500/20 text-green-400' : sub?.status === 'expired' ? 'bg-red-500/20 text-red-400' : 'bg-red-500/20 text-red-400'}`}>
                        {sub?.plan_name || 'Aucun'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-zinc-500" />
                          <span className={`text-sm ${isExpiringSoon ? 'text-orange-400 font-semibold' : isExpired ? 'text-red-400 font-semibold' : 'text-zinc-300'}`}>
                            {endDateFormatted}
                          </span>
                          {isExpiringSoon && <span className="ml-1 text-orange-400">⚠️</span>}
                          {isExpired && <span className="ml-1 text-red-400">❌</span>}
                        </div>
                        {sub?.start_date && (
                          <p className="text-zinc-600 text-[10px] mt-0.5">
                            Début: {new Date(sub.start_date).toLocaleDateString('fr-FR')}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="py-3 text-center">
                      {sub?.status === 'active' && daysLeft > 0 ? (
                        <div className="flex flex-col items-center">
                          <span className={`text-lg font-bold ${isExpiringSoon ? 'text-orange-400' : 'text-white'}`}>
                            {daysLeft}
                          </span>
                          <span className="text-zinc-500 text-[10px]">jours</span>
                        </div>
                      ) : sub?.status === 'active' && daysLeft === 0 ? (
                        <span className="text-red-400 text-xs font-medium">Expiré</span>
                      ) : (
                        <span className="text-zinc-500 text-xs">-</span>
                      )}
                    </td>
                    <td className="py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <CalendarCheck className="w-4 h-4 text-emerald-400" />
                        <span className="text-white font-bold text-lg">{stats?.completed_bookings_count || 0}</span>
                      </div>
                      <p className="text-zinc-500 text-[10px]">terminées</p>
                    </td>
                    <td className="py-3">
                      <button onClick={() => toggleUserStatus(user.id, user.is_active)}
                        disabled={processingId === user.id || isCurrentUser}
                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium border ${user.is_active ? 'bg-green-500/20 text-green-400 border-green-500' : 'bg-red-500/20 text-red-400 border-red-500'} ${isCurrentUser ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
                        {user.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {user.is_active ? 'Actif' : 'Inactif'}
                      </button>
                    </td>
                    <td className="py-3">
                      {statsLoading ? <span className="text-zinc-500">...</span> : <span className="text-white">{stats?.transaction_count || 0}</span>}
                    </td>
                    <td className="py-3">
                      {statsLoading ? <span className="text-zinc-500">...</span> : <span className="text-green-400">{(stats?.total_revenue || 0).toLocaleString()} CFA</span>}
                    </td>
                    <td className="py-3">
                      <div className="relative">
                        <button onClick={e => { e.stopPropagation(); setOpenWhatsAppMenu(openWhatsAppMenu === user.id ? null : user.id); }}
                          className="p-1.5 rounded-lg bg-green-600 hover:bg-green-700 transition">
                          <Send className="w-4 h-4 text-white" />
                        </button>
                        {openWhatsAppMenu === user.id && (
                          <div className="absolute top-full right-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-2 z-50 min-w-[180px]">
                            {[
                              { type: 'payment_reminder' as const, icon: <CreditCard className="w-3 h-3 text-red-400" />, label: 'Rappel paiement' },
                              { type: 'early_reminder' as const, icon: <AlertTriangle className="w-3 h-3 text-orange-400" />, label: 'Expiration dans 7j' },
                              { type: 'marketing' as const, icon: <Sparkles className="w-3 h-3 text-yellow-400" />, label: 'Marketing' },
                              { type: 'reminder' as const, icon: <Rocket className="w-3 h-3 text-blue-400" />, label: 'Relance' },
                            ].map(({ type, icon, label }) => (
                              <button key={type} onClick={() => sendWhatsAppMessage(user.phone, user.full_name || user.email, sub, stats, type)}
                                className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2">
                                {icon} {label}
                              </button>
                            ))}
                            <button onClick={() => { setSelectedUser(user); setMessageText(''); setShowMessageModal(true); setOpenWhatsAppMenu(null); }}
                              className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2">
                              <Star className="w-3 h-3 text-purple-400" /> Personnalisé
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

      {/* ── Parrainages ── */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <h3 className="text-white font-bold flex items-center gap-2">
            <Gift className="w-5 h-5 text-emerald-400" /> Parrainages ({referrals.length})
          </h3>
          <p className="text-zinc-500 text-xs mt-1">Gestion des filleuls et des récompenses (1000 CFA par filleul)</p>
        </div>
        {referralsLoading ? (
          <div className="text-center py-8"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto" /></div>
        ) : referrals.length === 0 ? (
          <div className="text-center py-8">
            <Gift className="w-12 h-12 text-zinc-600 mx-auto mb-2" />
            <p className="text-zinc-500 text-sm">Aucun parrainage</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-zinc-800/50">
                <tr className="text-zinc-400 text-xs">
                  <th className="px-4 py-3 text-left">Parrain</th>
                  <th className="px-4 py-3 text-left">Filleul</th>
                  <th className="px-4 py-3 text-left">Téléphone</th>
                  <th className="px-4 py-3 text-center">Statut</th>
                  <th className="px-4 py-3 text-center">Date</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {referrals.map(ref => (
                  <tr key={ref.id} className="hover:bg-zinc-800/30 transition">
                    <td className="px-4 py-3 text-white">{ref.profiles_v3?.full_name || 'N/A'}</td>
                    <td className="px-4 py-3 text-white">{ref.referred_name}</td>
                    <td className="px-4 py-3 text-zinc-300">{ref.referred_phone}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${ref.status === 'rewarded' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                        {ref.status === 'rewarded' ? '✅ Récompensé' : '⏳ En attente'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-zinc-400 text-xs">{new Date(ref.created_at).toLocaleDateString('fr-FR')}</td>
                    <td className="px-4 py-3 text-center">
                      {ref.status === 'pending' ? (
                        <button onClick={() => updateReferralStatus(ref.id, 'rewarded')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs rounded-lg transition flex items-center gap-1 mx-auto">
                          <Gift className="w-3 h-3" /> Récompenser (1000 CFA)
                        </button>
                      ) : (
                        <span className="text-zinc-600 text-xs">Déjà récompensé</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modal bannière ── */}
      {showBannerModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6 border border-zinc-700 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-white">{editingBanner ? 'Modifier la bannière' : 'Nouvelle bannière'}</h3>
              <button onClick={() => setShowBannerModal(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Fichier <span className="text-red-400">*</span></label>
                <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={handleFileSelect} className="hidden" />
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-zinc-600 hover:border-zinc-400 rounded-xl p-6 flex flex-col items-center gap-3 transition text-center">
                  {selectedFile ? (
                    <>
                      {bannerForm.type === 'image' ? <FileImage className="w-8 h-8 text-blue-400" /> : <FileVideo className="w-8 h-8 text-red-400" />}
                      <div>
                        <p className="text-white text-sm font-medium truncate max-w-[260px]">{selectedFile.name}</p>
                        <p className="text-zinc-500 text-xs">{(selectedFile.size / 1048576).toFixed(1)} Mo</p>
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
                      <p className="text-zinc-500 text-xs">Image ou Vidéo max 50 Mo</p>
                    </>
                  )}
                </button>
              </div>

              {(filePreviewUrl || editingBanner?.url) && (
                <div className="bg-zinc-800 rounded-lg p-3">
                  <p className="text-zinc-500 text-xs mb-2">Aperçu :</p>
                  <div className="rounded-lg overflow-hidden bg-zinc-700 max-h-[150px] flex items-center justify-center">
                    {bannerForm.type === 'image' || (filePreviewUrl && !selectedFile?.type.startsWith('video'))
                      ? <img src={filePreviewUrl || editingBanner?.url} alt="Aperçu" className="max-w-full max-h-[150px] object-contain" />
                      : <video src={filePreviewUrl || editingBanner?.url} className="max-w-full max-h-[150px] object-contain" controls muted />}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Durée de la campagne (jours)</label>
                <div className="flex items-center gap-2">
                  <input type="number" min="1" max="365" value={bannerForm.expiry_days}
                    onChange={e => setBannerForm({ ...bannerForm, expiry_days: parseInt(e.target.value) || 1 })}
                    className="flex-1 p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition" />
                  {[1, 7, 30].map(d => (
                    <button key={d} type="button" onClick={() => setBannerForm({ ...bannerForm, expiry_days: d })}
                      className="px-3 py-2 rounded-lg bg-zinc-800 text-white text-sm hover:bg-zinc-700 transition">
                      {d}j
                    </button>
                  ))}
                </div>
              </div>

              {isUploading && (
                <div className="bg-zinc-800 rounded-xl p-3">
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-zinc-400">Upload...</span>
                    <span className="text-white">{uploadProgress}%</span>
                  </div>
                  <div className="h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={saveBanner} disabled={bannerLoading || (!selectedFile && !editingBanner)}
                  className="flex-1 bg-white text-black py-3 rounded-xl font-semibold hover:bg-zinc-200 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {bannerLoading
                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black" /> Sauvegarde...</>
                    : <><Save className="w-4 h-4" /> {editingBanner ? 'Mettre à jour' : 'Publier'}</>}
                </button>
                <button onClick={() => setShowBannerModal(false)} className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-semibold hover:bg-zinc-700 transition">
                  Annuler
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal détails utilisateur avec date d'expiration ── */}
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

              {/* Carte d'expiration d'abonnement */}
              {userSubscriptions[selectedUser.id] && (
                <div className="border-t border-zinc-800 pt-4">
                  <h4 className="text-white font-bold mb-3 flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-orange-400" />
                    Abonnement - Expiration
                  </h4>
                  <div className="bg-zinc-800/50 rounded-xl p-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-zinc-500 text-xs">Plan</p>
                        <p className="text-white font-semibold">{userSubscriptions[selectedUser.id]?.plan_name || 'Aucun'}</p>
                      </div>
                      <div>
                        <p className="text-zinc-500 text-xs">Statut</p>
                        <p className={`font-semibold ${userSubscriptions[selectedUser.id]?.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>
                          {userSubscriptions[selectedUser.id]?.status || 'Inactif'}
                        </p>
                      </div>
                      <div>
                        <p className="text-zinc-500 text-xs">Date de début</p>
                        <p className="text-white">
                          {userSubscriptions[selectedUser.id]?.start_date 
                            ? new Date(userSubscriptions[selectedUser.id].start_date).toLocaleDateString('fr-FR')
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-zinc-500 text-xs">Date d'expiration</p>
                        <p className={`font-semibold ${getDaysRemaining(userSubscriptions[selectedUser.id]?.expires_at || '') <= 7 && getDaysRemaining(userSubscriptions[selectedUser.id]?.expires_at || '') > 0 ? 'text-orange-400' : getDaysRemaining(userSubscriptions[selectedUser.id]?.expires_at || '') === 0 ? 'text-red-400' : 'text-white'}`}>
                          {formatExpiryDate(userSubscriptions[selectedUser.id]?.expires_at || '')}
                        </p>
                      </div>
                    </div>
                    {userSubscriptions[selectedUser.id]?.status === 'active' && (
                      <div className="mt-3 pt-3 border-t border-zinc-700 text-center">
                        <p className="text-zinc-400 text-sm">
                          ⏰ Jours restants : <span className={`font-bold ${getDaysRemaining(userSubscriptions[selectedUser.id]?.expires_at || '') <= 7 ? 'text-orange-400' : 'text-white'}`}>
                            {getDaysRemaining(userSubscriptions[selectedUser.id]?.expires_at || '')}
                          </span> jours
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-zinc-800 pt-4">
                <h4 className="text-white font-bold mb-3 flex items-center gap-2"><CalendarCheck className="w-4 h-4 text-emerald-400" /> Réservations terminées</h4>
                <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-4 text-center">
                  <p className="text-emerald-400 text-4xl font-bold">{userStats[selectedUser.id]?.completed_bookings_count || 0}</p>
                  <p className="text-emerald-500/70 text-xs mt-1">réservations validées</p>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4">
                <h4 className="text-white font-bold mb-3">Statistiques financières</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Transactions</p><p className="text-white text-xl font-bold">{userStats[selectedUser.id]?.transaction_count || 0}</p></div>
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Revenus</p><p className="text-green-400">{(userStats[selectedUser.id]?.total_revenue || 0).toLocaleString()} CFA</p></div>
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Dépenses</p><p className="text-red-400">{(userStats[selectedUser.id]?.total_expenses || 0).toLocaleString()} CFA</p></div>
                  <div className="bg-zinc-800 rounded-xl p-3"><p className="text-zinc-500 text-xs">Net</p><p className="text-white">{((userStats[selectedUser.id]?.total_revenue || 0) - (userStats[selectedUser.id]?.total_expenses || 0)).toLocaleString()} CFA</p></div>
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-4 flex flex-wrap gap-3">
                <button onClick={() => { toggleUserStatus(selectedUser.id, selectedUser.is_active); setShowDetailsModal(false); }}
                  disabled={selectedUser.id === currentUserId}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-white ${selectedUser.is_active ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} ${selectedUser.id === currentUserId ? 'opacity-50' : ''}`}>
                  {selectedUser.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  {selectedUser.is_active ? 'Désactiver' : 'Activer'}
                </button>
                {selectedUser.phone && (
                  <div className="relative inline-block">
                    <button onClick={() => setOpenWhatsAppMenu(openWhatsAppMenu === selectedUser.id ? null : selectedUser.id)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white">
                      <Send className="w-4 h-4" /> Envoyer message
                    </button>
                    {openWhatsAppMenu === selectedUser.id && (
                      <div className="absolute top-full left-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-2 z-50 min-w-[180px]">
                        {[
                          { type: 'payment_reminder' as const, icon: <CreditCard className="w-3 h-3 text-red-400" />, label: 'Rappel paiement' },
                          { type: 'early_reminder' as const, icon: <AlertTriangle className="w-3 h-3 text-orange-400" />, label: 'Expiration dans 7j' },
                          { type: 'marketing' as const, icon: <Sparkles className="w-3 h-3 text-yellow-400" />, label: 'Marketing' },
                          { type: 'reminder' as const, icon: <Rocket className="w-3 h-3 text-blue-400" />, label: 'Relance' },
                        ].map(({ type, icon, label }) => (
                          <button key={type} onClick={() => sendWhatsAppMessage(selectedUser.phone, selectedUser.full_name || selectedUser.email, userSubscriptions[selectedUser.id], userStats[selectedUser.id], type)}
                            className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2">
                            {icon} {label}
                          </button>
                        ))}
                        <button onClick={() => { setMessageText(''); setShowMessageModal(true); }}
                          className="w-full text-left px-3 py-2 text-xs text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2">
                          <Star className="w-3 h-3 text-purple-400" /> Personnalisé
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

      {/* ── Modal message personnalisé ── */}
      {showMessageModal && selectedUser && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">Message à {selectedUser.full_name || selectedUser.email}</h3>
              <button onClick={() => setShowMessageModal(false)} className="text-zinc-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <textarea value={messageText} onChange={e => setMessageText(e.target.value)}
              placeholder="Votre message personnalisé..." rows={5}
              className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white mb-4" />
            <div className="flex gap-3">
              <button onClick={() => sendCustomMessage(selectedUser.phone, messageText)} disabled={!messageText.trim()}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded-xl font-semibold transition disabled:opacity-50">
                Envoyer via WhatsApp
              </button>
              <button onClick={() => setShowMessageModal(false)}
                className="flex-1 bg-zinc-800 text-white py-2 rounded-xl font-semibold hover:bg-zinc-700 transition">
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}