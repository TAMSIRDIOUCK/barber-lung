// src/components/BookingHistoryPage.tsx
import { useState, useEffect } from 'react';
import {
  Calendar, Clock, QrCode, Download, Loader,
  ArrowLeft, Store, Lock, CheckCircle2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import QRCode from 'qrcode';

// Même génération de device_id que dans PublicHomePage.tsx — c'est ce qui
// permet à un client SANS COMPTE de retrouver ses réservations : le même
// device_id est utilisé au moment de la réservation (à ajouter côté
// formulaire de booking) et ici pour les retrouver.
function getDeviceId(): string {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

type BookingStatus = 'confirmed' | 'done';

interface HistoryItem {
  id: string;
  ticket_number: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  service_price: number;
  barber_name: string | null;
  booking_date: string;
  booking_time: string;
  qr_code: string;
  status: BookingStatus;
  created_at: string;
  salon_user_id: string;
  salon_name: string;
  salon_slug: string | null;
}

interface BookingHistoryPageProps {
  onBack?: () => void;
}

const STATUS_LABEL: Record<BookingStatus, string> = {
  confirmed: 'En attente du service',
  done: 'Service terminé',
};

export function BookingHistoryPage({ onBack }: BookingHistoryPageProps) {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<HistoryItem | null>(null);
  const [qrUrls, setQrUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const deviceId = getDeviceId();
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        // ── 1. Récupérer les réservations du client (invité via device_id,
        //      ou connecté via client_user_id) directement depuis "bookings" ──
        let query = supabase
          .from('bookings')
          .select('id, ticket_number, client_name, client_phone, service_name, service_price, barber_name, booking_date, booking_time, qr_code, status, created_at, salon_user_id')
          .order('created_at', { ascending: false });

        if (userId) {
          query = query.or(`device_id.eq.${deviceId},client_user_id.eq.${userId}`);
        } else {
          query = query.eq('device_id', deviceId);
        }

        const { data: bookingsData, error: bookingsErr } = await query;

        if (bookingsErr) {
          console.error('Erreur chargement réservations:', bookingsErr);
          setItems([]);
          return;
        }

        const rows = bookingsData || [];

        // ── 2. Récupérer le nom/slug des salons concernés en une seule requête ──
        const salonUserIds = Array.from(new Set(rows.map((r) => r.salon_user_id).filter(Boolean)));
        let salonInfoMap: Record<string, { salon_name: string; slug: string | null }> = {};

        if (salonUserIds.length > 0) {
          const { data: salonRows, error: salonErr } = await supabase
            .from('booking_settings')
            .select('user_id, salon_name, slug')
            .in('user_id', salonUserIds);

          if (salonErr) {
            console.error('Erreur chargement infos salon:', salonErr);
          } else {
            (salonRows || []).forEach((s: any) => {
              salonInfoMap[s.user_id] = { salon_name: s.salon_name || 'Salon', slug: s.slug || null };
            });
          }
        }

        const merged: HistoryItem[] = rows.map((r: any) => ({
          ...r,
          salon_name: salonInfoMap[r.salon_user_id]?.salon_name || 'Salon',
          salon_slug: salonInfoMap[r.salon_user_id]?.slug || null,
        }));

        setItems(merged);

        // ── 3. Générer les QR codes à partir du champ qr_code déjà stocké ──
        const qrs: Record<string, string> = {};
        for (const item of merged) {
          try {
            const payload = item.qr_code || JSON.stringify({
              ticket_number: item.ticket_number,
              booking_id: item.id,
            });
            const qr = await QRCode.toDataURL(payload.slice(0, 300), {
              width: 280,
              margin: 2,
              errorCorrectionLevel: 'M',
              color: { dark: '#000000', light: '#FFFFFF' },
            });
            qrs[item.id] = qr;
          } catch {}
        }
        setQrUrls(qrs);
      } catch (err) {
        console.error('Erreur:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

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

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader className="w-8 h-8 text-white animate-spin" />
      </div>
    );
  }

  // ── Vue détail ──
  if (selectedItem) {
    const qr = qrUrls[selectedItem.id];
    const isDone = selectedItem.status === 'done';
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
              <div className="text-xs text-zinc-400 tracking-widest mt-1">
                {selectedItem.salon_name}
              </div>
              <div className="inline-block mt-3 border-2 border-white px-4 py-2 text-lg font-black tracking-widest">
                {selectedItem.ticket_number}
              </div>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className={`rounded-xl p-4 text-center border ${
                isDone ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'
              }`}>
                {isDone ? (
                  <p className="text-green-700 text-lg font-semibold mb-1 flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Service terminé
                  </p>
                ) : (
                  <p className="text-amber-700 text-lg font-semibold mb-1 flex items-center justify-center gap-2">
                    <Lock className="w-5 h-5" /> En attente du service
                  </p>
                )}
                <p className={`text-sm ${isDone ? 'text-green-600' : 'text-amber-600'}`}>
                  Payée le {new Date(selectedItem.created_at).toLocaleDateString('fr-FR')}
                </p>
              </div>

              {qr && !isDone && (
                <div className="bg-white rounded-xl p-4 text-center border-2 border-blue-300 shadow-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <QrCode className="w-5 h-5 text-blue-600" />
                    <p className="text-xs font-semibold text-blue-600">
                      QR Code à présenter au salon
                    </p>
                  </div>
                  <img
                    src={qr}
                    alt="QR Code"
                    className="w-48 h-48 mx-auto border-2 border-blue-300 rounded-lg"
                  />
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
                <p className="text-zinc-500 text-sm">
                  {formatCFA(selectedItem.service_price)}
                </p>
              </div>

              {selectedItem.barber_name && (
                <div>
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Coiffeur</p>
                  <p className="font-bold text-sm mt-0.5">{selectedItem.barber_name}</p>
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
                  <p className="font-black text-xl mt-0.5">
                    {selectedItem.booking_time.slice(0, 5)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Liste vide ──
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

  // ── Liste des réservations ──
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
          const isDone = item.status === 'done';
          return (
            <button
              key={item.id}
              onClick={() => setSelectedItem(item)}
              className="w-full text-left bg-zinc-900 border border-zinc-800 rounded-2xl p-4 hover:border-zinc-600 transition"
            >
              <div className="flex items-start gap-3">
                {qrUrls[item.id] ? (
                  <img
                    src={qrUrls[item.id]}
                    alt=""
                    className="w-16 h-16 rounded-xl border border-zinc-700 bg-white p-1 flex-shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-xl bg-zinc-800 flex items-center justify-center flex-shrink-0">
                    <QrCode className="w-6 h-6 text-zinc-500" />
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Store className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                    <p className="text-white font-semibold text-sm truncate">
                      {item.salon_name}
                    </p>
                  </div>

                  <p className="text-zinc-300 text-sm truncate">
                    {item.service_name}
                  </p>

                  <div className="flex items-center gap-3 mt-1 text-xs text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.booking_date).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: 'short'
                      })}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {item.booking_time.slice(0, 5)}
                    </span>
                    <span className="text-emerald-400 font-bold">
                      {formatCFA(item.service_price)}
                    </span>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
                      isDone
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {isDone ? <CheckCircle2 className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {STATUS_LABEL[item.status]}
                    </span>
                    <span className="text-[10px] text-zinc-500 font-mono">
                      {item.ticket_number}
                    </span>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}