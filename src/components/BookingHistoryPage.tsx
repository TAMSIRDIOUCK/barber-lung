// src/components/BookingHistoryPage.tsx
import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Clock, QrCode, Download, Loader,
  ArrowLeft, Store, X, AlertCircle,
  Ban, Wallet, CheckCircle2, RotateCcw, DollarSign
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import QRCode from 'qrcode';

function getDeviceId(): string {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

const LOCAL_HISTORY_KEY = 'booking_history_cache';

function saveLocalHistory(items: any[]) {
  try {
    const ids = items.map(i => i.id);
    localStorage.setItem(LOCAL_HISTORY_KEY, JSON.stringify(ids));
  } catch {}
}

function getLocalHistoryIds(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface HistoryItem {
  id: string;
  request_id: string;
  ticket_number: string;
  salon_name: string;
  salon_slug: string;
  service_name: string;
  service_price: number;
  barber_name: string | null;
  barber_id?: string | null;
  booking_date: string;
  booking_time: string;
  qr_code_data: string;
  payment_status: string;
  created_at: string;
  client_name?: string;
  client_phone: string;
  status?: 'confirmed' | 'cancelled' | 'refunded' | 'completed' | 'no_show' | string;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  refund_amount?: number;
  refund_status?: string | null;
  refund_at?: string | null;
  refund_transaction_id?: string | null;
  refund_mode?: string | null;
  refund_processed_at?: string | null;
  updated_at?: string | null;
  device_id?: string | null;
  user_id?: string | null;
  qr_code_scanned?: boolean;
  scanned_at?: string | null;
}

interface BookingHistoryPageProps {
  onBack?: () => void;
}

export function BookingHistoryPage({ onBack }: BookingHistoryPageProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});

  const [cancelConfirm, setCancelConfirm] = useState<HistoryItem | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSuccess, setCancelSuccess] = useState<{ refund: number } | null>(null);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const deviceId = getDeviceId();
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      let query = supabase
        .from('booking_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      const orConditions: string[] = [];
      if (deviceId) orConditions.push(`device_id.eq.${deviceId}`);
      if (userId) orConditions.push(`user_id.eq.${userId}`);

      if (orConditions.length > 0) {
        query = query.or(orConditions.join(','));
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erreur chargement historique:', error);
      }

      let items: HistoryItem[] = data || [];

      if (items.length === 0) {
        const localIds = getLocalHistoryIds();
        if (localIds.length > 0) {
          console.log('🔍 Fallback cache local — IDs:', localIds);
          const { data: cachedData, error: cachedError } = await supabase
            .from('booking_history')
            .select('*')
            .in('id', localIds)
            .order('created_at', { ascending: false });

          if (!cachedError && cachedData) {
            items = cachedData;
          }
        }
      }

      if (items.length === 0) {
        const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
        const { data: recentData, error: recentError } = await supabase
          .from('booking_history')
          .select('*')
          .gte('created_at', since48h)
          .order('created_at', { ascending: false })
          .limit(20);

        if (!recentError && recentData) {
          items = recentData.filter((r: any) => !r.device_id || r.device_id === deviceId);
        }
      }

      if (items.length > 0) {
        saveLocalHistory(items);
      }

      setItems(items);

      const qrs: Record<string, string> = {};
      for (const item of items) {
        try {
          const qr = await QRCode.toDataURL(
            (item.qr_code_data || JSON.stringify({
              ticket: item.ticket_number,
              service: item.service_name,
              date: item.booking_date,
              time: item.booking_time,
            })).slice(0, 200),
            {
              width: 280,
              margin: 2,
              errorCorrectionLevel: 'M',
              color: { dark: '#000000', light: '#FFFFFF' },
            }
          );
          qrs[item.id] = qr;
        } catch {}
      }
      setQrUrls(qrs);
    } catch (err) {
      console.error('Erreur:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadItems();
      }
    };

    const handleFocus = () => {
      loadItems();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadItems]);

  const downloadQR = (item: HistoryItem) => {
    const qr = qrUrls[item.id];
    if (!qr) return;
    const link = document.createElement('a');
    link.href = qr;
    link.download = `reservation-${item.ticket_number}.png`;
    link.click();
  };

  const formatCFA = (v: number) => v.toLocaleString('fr-FR') + ' CFA';

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString('fr-FR', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  };

  const canCancelBooking = (item: HistoryItem): boolean => {
    if (item.status && ['cancelled', 'refunded', 'completed', 'no_show', 'done'].includes(item.status)) {
      return false;
    }
    if (item.qr_code_scanned === true || item.scanned_at) {
      return false;
    }

    try {
      const bookingDateTime = new Date(`${item.booking_date}T${item.booking_time}`);
      if (isNaN(bookingDateTime.getTime())) return false;
      return bookingDateTime.getTime() > Date.now();
    } catch {
      return false;
    }
  };

  // 🔥 Annulation simple : libère le créneau + statut "à récupérer au salon"
  const handleCancelBooking = async (item: HistoryItem) => {
    setCancelError(null);
    setIsCancelling(true);

    try {
      const deviceId = getDeviceId();
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      console.log('🚀 Annulation + libération créneau:', {
        booking_id: item.id,
        amount: item.service_price,
      });

      const { data, error } = await supabase.rpc('cancel_booking', {
        p_booking_id: item.id,
        p_device_id: deviceId,
        p_user_id: userId,
      });

      if (error) {
        console.error('Erreur RPC cancel_booking:', error);

        // 🔥 Fallback : UPDATE direct
        const now = new Date().toISOString();

        const { error: updateError } = await supabase
          .from('booking_history')
          .update({
            status: 'cancelled',
            cancelled_at: now,
            cancelled_by: 'client',
            refund_amount: item.service_price,
            refund_status: 'pending_pickup',
            updated_at: now,
          })
          .eq('id', item.id);

        if (updateError) {
          console.error('Erreur update booking_history:', updateError);
          setCancelError('Impossible d\'annuler la réservation. Veuillez réessayer.');
          return;
        }

        // 🔥 Libérer le créneau dans bookings
        await supabase
          .from('bookings')
          .update({
            status: 'cancelled',
            cancelled_at: now,
            cancelled_by: 'client',
            refund_amount: item.service_price,
            refund_status: 'pending_pickup',
            updated_at: now,
          })
          .eq('id', item.id);

        setCancelSuccess({ refund: item.service_price });

        setItems(prev => prev.map(i =>
          i.id === item.id
            ? { ...i, status: 'cancelled', cancelled_at: now, refund_amount: item.service_price, refund_status: 'pending_pickup' }
            : i
        ));
        if (selectedItem?.id === item.id) {
          setSelectedItem(prev => prev ? { ...prev, status: 'cancelled', cancelled_at: now, refund_amount: item.service_price, refund_status: 'pending_pickup' } : null);
        }
        setTimeout(() => { setCancelConfirm(null); setCancelSuccess(null); }, 3500);
        return;
      }

      if (data && data.success === false) {
        setCancelError(data.error || 'Erreur lors de l\'annulation');
        return;
      }

      const refundAmount = data?.refund_amount || item.service_price;

      setCancelSuccess({ refund: refundAmount });

      const now = new Date().toISOString();
      setItems(prev => prev.map(i =>
        i.id === item.id
          ? { ...i, status: 'cancelled', cancelled_at: now, refund_amount: refundAmount, refund_status: 'pending_pickup' }
          : i
      ));

      if (selectedItem?.id === item.id) {
        setSelectedItem(prev => prev ? { ...prev, status: 'cancelled', cancelled_at: now, refund_amount: refundAmount, refund_status: 'pending_pickup' } : null);
      }

      setTimeout(() => { setCancelConfirm(null); setCancelSuccess(null); }, 3500);

    } catch (err: any) {
      console.error('Exception cancel:', err);
      setCancelError(err?.message || 'Erreur lors de l\'annulation');
    } finally {
      setIsCancelling(false);
    }
  };

  const getStatusBadge = (item: HistoryItem) => {
    const status = item.status || 'confirmed';
    const refundStatus = item.refund_status;

    // Si annulé et à récupérer au salon
    if (status === 'cancelled' && refundStatus === 'pending_pickup') {
      return <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold">💰 À récupérer au salon</span>;
    }
    if (status === 'cancelled' && refundStatus === 'success') {
      return <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">✓ Remboursé</span>;
    }

    switch (status) {
      case 'cancelled':
        return <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold">💰 À récupérer</span>;
      case 'refunded':
        return <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">✓ Remboursé</span>;
      case 'completed':
      case 'done':
        return <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-semibold">✓ Terminé</span>;
      case 'no_show':
        return <span className="text-[10px] bg-zinc-500/20 text-zinc-400 px-2 py-0.5 rounded-full font-semibold">⚠ Non venu</span>;
      case 'confirmed':
      default:
        return <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-semibold">✓ Payé</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  // ── Vue détail
  if (selectedItem) {
    const qr = qrUrls[selectedItem.id];
    const canCancel = canCancelBooking(selectedItem);
    const status = selectedItem.status || 'confirmed';
    const isCancelled = status === 'cancelled' || status === 'refunded';
    const refundStatus = selectedItem.refund_status;
    const isPendingPickup = refundStatus === 'pending_pickup';

    return (
      <div className="min-h-screen bg-zinc-950 text-white p-4">
        <button
          onClick={() => setSelectedItem(null)}
          className="flex items-center gap-2 text-zinc-400 hover:text-white mb-6 text-sm"
        >
          <ArrowLeft className="w-4 h-4" /> Retour à l'historique
        </button>

        <div className="max-w-sm mx-auto">
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
            <div className="bg-black text-white text-center py-6 px-4">
              <div className="text-2xl font-black tracking-widest">LE COUPE</div>
              <div className="text-xs text-zinc-400 tracking-widest mt-1">{selectedItem.salon_name}</div>
              <div className="inline-block mt-3 border-2 border-white px-4 py-2 text-lg font-black tracking-widest">
                {selectedItem.ticket_number}
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              {isCancelled ? (
                isPendingPickup ? (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <DollarSign className="w-5 h-5 text-amber-600" />
                      <p className="text-amber-700 text-lg font-semibold">Récupérez au salon</p>
                    </div>
                    <p className="text-amber-600 text-sm">
                      {selectedItem.refund_amount ? `${formatCFA(selectedItem.refund_amount)} à récupérer` : 'Montant à récupérer'}
                    </p>
                    <p className="text-amber-500 text-xs mt-2 leading-relaxed">
                      💰 Présentez-vous au salon <strong>{selectedItem.salon_name}</strong> avec ce ticket pour récupérer votre argent
                    </p>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      <p className="text-emerald-700 text-lg font-semibold">Remboursé</p>
                    </div>
                    <p className="text-emerald-600 text-sm">
                      {selectedItem.refund_amount ? `${formatCFA(selectedItem.refund_amount)} remboursés` : 'Montant remboursé'}
                    </p>
                  </div>
                )
              ) : (
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <p className="text-green-700 text-lg font-semibold mb-1">✅ Réservation confirmée</p>
                  <p className="text-green-600 text-sm">
                    Payée le {new Date(selectedItem.created_at).toLocaleDateString('fr-FR')}
                  </p>
                </div>
              )}

              {qr && !isCancelled && (
                <div className="bg-white rounded-xl p-4 text-center border-2 border-blue-300 shadow-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <QrCode className="w-5 h-5 text-blue-600" />
                    <p className="text-xs font-semibold text-blue-600">QR Code à présenter au salon</p>
                  </div>
                  <img src={qr} alt="QR Code" className="w-48 h-48 mx-auto border-2 border-blue-300 rounded-lg" />
                  <button
                    onClick={() => downloadQR(selectedItem)}
                    className="w-full mt-3 flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-blue-700 transition"
                  >
                    <Download className="w-4 h-4" /> Télécharger le QR code
                  </button>
                </div>
              )}

              <hr className="border-dashed border-zinc-300" />

              <div>
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Service</p>
                <p className="font-black text-base mt-0.5">{selectedItem.service_name}</p>
                <p className="text-zinc-500 text-sm">{formatCFA(selectedItem.service_price)}</p>
              </div>

              {selectedItem.barber_name && (
                <div>
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Coiffeur</p>
                  <p className="font-bold text-sm mt-0.5">💈 {selectedItem.barber_name}</p>
                </div>
              )}

              <hr className="border-dashed border-zinc-300" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Date</p>
                  <p className="font-bold text-sm mt-0.5">{formatDate(selectedItem.booking_date)}</p>
                </div>
                <div>
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Heure</p>
                  <p className="font-black text-xl mt-0.5">{selectedItem.booking_time.slice(0, 5)}</p>
                </div>
              </div>
            </div>
          </div>

          {canCancel && (
            <button
              onClick={() => setCancelConfirm(selectedItem)}
              className="w-full mt-4 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-xl text-sm transition"
            >
              <Ban className="w-4 h-4" />
              Annuler la réservation
            </button>
          )}

          {!canCancel && !isCancelled && status === 'confirmed' && (
            <div className="mt-4 flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
              <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-amber-400 text-xs">
                La date de cette réservation est passée. Annulation impossible.
              </p>
            </div>
          )}
        </div>

        {/* MODAL CONFIRMATION */}
        {cancelConfirm && (
          <div
            className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
            onClick={() => !isCancelling && setCancelConfirm(null)}
          >
            <div
              className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-700 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {cancelSuccess ? (
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-white font-bold text-lg mb-2">Réservation annulée</h3>
                  <p className="text-zinc-400 text-sm mb-2">
                    Votre créneau est maintenant libéré.
                  </p>
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 w-full">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-amber-400" />
                      <p className="text-amber-400 text-sm font-semibold">
                        Récupérez {formatCFA(cancelSuccess.refund)} au salon
                      </p>
                    </div>
                    <p className="text-amber-500/80 text-xs text-center">
                      💰 Présentez-vous au salon avec votre numéro de ticket
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    </div>
                    <h3 className="text-white font-bold text-lg">Annuler la réservation ?</h3>
                  </div>

                  <p className="text-zinc-400 text-sm mb-2">
                    Vous êtes sur le point d'annuler votre réservation chez <span className="text-white font-semibold">{cancelConfirm.salon_name}</span>.
                  </p>

                  <div className="bg-zinc-800/50 rounded-xl p-3 mb-4 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Service</span>
                      <span className="text-white font-medium">{cancelConfirm.service_name}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-zinc-500">Date</span>
                      <span className="text-white font-medium">
                        {new Date(cancelConfirm.booking_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} à {cancelConfirm.booking_time.slice(0, 5)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-700/50">
                      <span className="text-zinc-500">À récupérer</span>
                      <span className="text-amber-400 font-bold">{formatCFA(cancelConfirm.service_price)}</span>
                    </div>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 flex items-start gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-amber-400 text-xs">
                      💰 <strong>Récupérez votre argent au salon</strong> — Le créneau sera libéré immédiatement. Présentez-vous au salon avec votre numéro de ticket pour récupérer {formatCFA(cancelConfirm.service_price)}.
                    </p>
                  </div>

                  {cancelError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                      <p className="text-red-400 text-xs">{cancelError}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button
                      onClick={() => { if (!isCancelling) { setCancelConfirm(null); setCancelError(null); } }}
                      disabled={isCancelling}
                      className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
                    >
                      Garder
                    </button>
                    <button
                      onClick={() => handleCancelBooking(cancelConfirm)}
                      disabled={isCancelling}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isCancelling ? <><Loader className="w-4 h-4 animate-spin" /> Annulation...</> : <><Ban className="w-4 h-4" /> Annuler</>}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Liste vide
  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 bg-zinc-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-10 h-10 text-zinc-600" />
          </div>
          <h2 className="text-white text-xl font-bold mb-2">Aucune réservation</h2>
          <p className="text-zinc-500 text-sm mb-6">
            Vous n'avez pas encore effectué de réservation sur cet appareil.
          </p>
          <button
            onClick={() => onBack ? onBack() : window.location.href = '/'}
            className="bg-white text-black px-6 py-3 rounded-xl font-bold hover:bg-zinc-200 transition"
          >
            Découvrir les salons
          </button>
        </div>
      </div>
    );
  }

  // ── Liste
  return (
    <div className="min-h-screen bg-zinc-950 text-white pb-20">
      <header className="sticky top-0 z-40 bg-black border-b border-zinc-800 px-4 py-3">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button
            onClick={() => onBack ? onBack() : window.location.href = '/'}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white font-bold text-lg">Mes réservations</h1>
          <span className="text-zinc-500 text-xs ml-auto">
            {items.length} réservation{items.length > 1 ? 's' : ''}
          </span>
        </div>
      </header>

      <div className="max-w-lg mx-auto p-4 space-y-3">
        {items.map((item) => {
          const status = item.status || 'confirmed';
          const isCancelled = status === 'cancelled' || status === 'refunded';
          const isPendingPickup = item.refund_status === 'pending_pickup';
          const canCancel = canCancelBooking(item);

          return (
            <div
              key={item.id}
              className={`w-full text-left bg-zinc-900 border rounded-2xl overflow-hidden transition ${
                isCancelled ? 'border-zinc-800 opacity-70' : 'border-zinc-800 hover:border-zinc-600'
              }`}
            >
              <button onClick={() => setSelectedItem(item)} className="w-full text-left p-4">
                <div className="flex items-start gap-3">
                  {qrUrls[item.id] && !isCancelled ? (
                    <img src={qrUrls[item.id]} alt="" className="w-16 h-16 rounded-xl border border-zinc-700 bg-white p-1 flex-shrink-0" />
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
                      {isPendingPickup ? (
                        <DollarSign className="w-6 h-6 text-amber-500" />
                      ) : isCancelled ? (
                        <RotateCcw className="w-6 h-6 text-zinc-500" />
                      ) : (
                        <QrCode className="w-6 h-6 text-zinc-500" />
                      )}
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Store className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      <p className="text-white font-semibold text-sm truncate">{item.salon_name}</p>
                    </div>

                    <p className={`text-sm truncate ${isCancelled ? 'text-zinc-500 line-through' : 'text-zinc-300'}`}>
                      {item.service_name}
                    </p>

                    {item.barber_name && (
                      <p className={`text-xs truncate mt-0.5 ${isCancelled ? 'text-zinc-600 line-through' : 'text-zinc-500'}`}>
                        💈 {item.barber_name}
                      </p>
                    )}

                    <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(item.booking_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {item.booking_time.slice(0, 5)}
                      </span>
                      <span className={`font-bold ${isCancelled ? 'text-zinc-500 line-through' : 'text-emerald-400'}`}>
                        {formatCFA(item.service_price)}
                      </span>
                    </div>

                    <div className="mt-1.5 flex items-center gap-2">
                      {getStatusBadge(item)}
                      <span className="text-[10px] text-zinc-500 font-mono">{item.ticket_number}</span>
                    </div>
                  </div>
                </div>
              </button>

              {canCancel && (
                <button
                  onClick={(e) => { e.stopPropagation(); setCancelConfirm(item); }}
                  className="w-full py-2.5 text-center text-red-400 text-xs font-semibold hover:bg-red-500/10 transition border-t border-zinc-800 flex items-center justify-center gap-1.5"
                >
                  <Ban className="w-3.5 h-3.5" />
                  Annuler la réservation
                </button>
              )}

              {/* Indication "à récupérer" */}
              {isPendingPickup && (
                <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-amber-400 text-xs font-semibold">
                        💰 À récupérer au salon
                      </p>
                      <p className="text-amber-500/70 text-[10px] mt-0.5">
                        Présentez-vous avec le ticket {item.ticket_number}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* MODAL GLOBAL */}
      {cancelConfirm && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4"
          onClick={() => !isCancelling && setCancelConfirm(null)}
        >
          <div
            className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-700 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {cancelSuccess ? (
              <div className="flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                </div>
                <h3 className="text-white font-bold text-lg mb-2">Réservation annulée</h3>
                <p className="text-zinc-400 text-sm mb-2">Votre créneau est libéré.</p>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 w-full mt-2">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <DollarSign className="w-4 h-4 text-amber-400" />
                    <p className="text-amber-400 text-sm font-semibold">
                      Récupérez {formatCFA(cancelSuccess.refund)} au salon
                    </p>
                  </div>
                  <p className="text-amber-500/70 text-xs text-center">
                    💰 Présentez-vous avec votre numéro de ticket
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                  </div>
                  <h3 className="text-white font-bold text-lg">Annuler la réservation ?</h3>
                </div>

                <p className="text-zinc-400 text-sm mb-2">
                  Vous êtes sur le point d'annuler votre réservation chez <span className="text-white font-semibold">{cancelConfirm.salon_name}</span>.
                </p>

                <div className="bg-zinc-800/50 rounded-xl p-3 mb-4 space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Service</span>
                    <span className="text-white font-medium">{cancelConfirm.service_name}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-500">Date</span>
                    <span className="text-white font-medium">
                      {new Date(cancelConfirm.booking_date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })} à {cancelConfirm.booking_time.slice(0, 5)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-zinc-700/50">
                    <span className="text-zinc-500">À récupérer</span>
                    <span className="text-amber-400 font-bold">{formatCFA(cancelConfirm.service_price)}</span>
                  </div>
                </div>

                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 mb-4 flex items-start gap-2">
                  <DollarSign className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-400 text-xs">
                    💰 <strong>Récupérez votre argent au salon</strong> — Le créneau sera libéré immédiatement. Présentez-vous au salon <strong>{cancelConfirm.salon_name}</strong> avec le ticket <strong>{cancelConfirm.ticket_number}</strong>.
                  </p>
                </div>

                {cancelError && (
                  <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4">
                    <p className="text-red-400 text-xs">{cancelError}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { if (!isCancelling) { setCancelConfirm(null); setCancelError(null); } }}
                    disabled={isCancelling}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50"
                  >
                    Garder
                  </button>
                  <button
                    onClick={() => handleCancelBooking(cancelConfirm)}
                    disabled={isCancelling}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold py-2.5 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isCancelling ? <><Loader className="w-4 h-4 animate-spin" /> Annulation...</> : <><Ban className="w-4 h-4" /> Annuler</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}