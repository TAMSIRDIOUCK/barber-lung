// src/components/BookingSettingsPage.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Link2, Check, Copy, User, Phone, Calendar,
  Settings, ToggleLeft, ToggleRight, RefreshCw, Scissors,
  ExternalLink, X, ChevronLeft,
  Plus, Trash2, AlertTriangle, CheckCircle2, Eye, EyeOff
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Html5Qrcode } from "html5-qrcode";
import QRCode from 'qrcode';

interface EventService { id: string; name: string; price: number; }
interface OpeningHour { open: string; close: string; closed: boolean; }

interface BookingSettings {
  id: string;
  user_id: string;
  slug: string;
  salon_name: string;
  welcome_message: string;
  is_active: boolean;
  event_services: EventService[];
  opening_hours: Record<string, OpeningHour>;
  booking_interval_minutes: number;
  advance_booking_days: number;
  logo_url: string | null;
  primary_color: string;
}

interface Booking {
  id: string;
  ticket_number: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  service_price: number;
  net_amount: number | null;
  barber_name: string | null;
  booking_date: string;
  booking_time: string;
  note: string | null;
  status: 'confirmed' | 'done';
  qr_code: string;
  qr_code_scanned: boolean;
  scanned_at: string | null;
  created_at: string;
  payment_status: 'paid';
}

interface BookingSettingsPageProps {
  userId: string;
}

const STATUS_LABELS: Record<Booking['status'], string> = {
  confirmed: 'Confirmé',
  done: 'Terminé',
};

const STATUS_COLORS: Record<Booking['status'], string> = {
  confirmed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  done: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
};

const DAYS = [
  { key: 'lundi', label: 'Lun' },
  { key: 'mardi', label: 'Mar' },
  { key: 'mercredi', label: 'Mer' },
  { key: 'jeudi', label: 'Jeu' },
  { key: 'vendredi', label: 'Ven' },
  { key: 'samedi', label: 'Sam' },
  { key: 'dimanche', label: 'Dim' },
];

const SCANNER_ID = 'qr-scanner-container';
const NET_FEE_RATE = 0.015;

export function BookingSettingsPage({ userId }: BookingSettingsPageProps) {
  const [view, setView] = useState<'home' | 'settings'>('home');

  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [filter, setFilter] = useState<'all' | Booking['status']>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const [salonQRCode, setSalonQRCode] = useState<string>('');
  const [showShareSection, setShowShareSection] = useState(false);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [processing, setProcessing] = useState(false);

  const [eventServices, setEventServices] = useState<EventService[]>([]);
  const [newEventService, setNewEventService] = useState({ name: '', price: '' });
  const [openingHours, setOpeningHours] = useState<Record<string, OpeningHour>>({
    lundi: { open: '09:00', close: '18:00', closed: false },
    mardi: { open: '09:00', close: '18:00', closed: false },
    mercredi: { open: '09:00', close: '18:00', closed: false },
    jeudi: { open: '09:00', close: '18:00', closed: false },
    vendredi: { open: '09:00', close: '18:00', closed: false },
    samedi: { open: '09:00', close: '17:00', closed: false },
    dimanche: { open: '09:00', close: '12:00', closed: true },
  });
  const [slug, setSlug] = useState('');
  const [salonName, setSalonName] = useState('');
  const [welcomeMsg, setWelcomeMsg] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [slugError, setSlugError] = useState('');
  const [bookingInterval, setBookingInterval] = useState(90);
  const [advanceDays, setAdvanceDays] = useState(30);

  const bookingUrl = `${window.location.origin}/booking/${settings?.slug || ''}`;

  const totalNetRevenue = useMemo(() => {
    return bookings.reduce((sum, b) => sum + (b.net_amount ?? Math.round(b.service_price * (1 - NET_FEE_RATE))), 0);
  }, [bookings]);

  const recentBookings = useMemo(() => {
    return [...bookings]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8);
  }, [bookings]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: s } = await supabase
        .from('booking_settings').select('*')
        .eq('user_id', userId).single();

      if (s) {
        setSettings(s);
        setSlug(s.slug);
        setSalonName(s.salon_name);
        setWelcomeMsg(s.welcome_message || '');
        setIsActive(s.is_active);
        setBookingInterval(s.booking_interval_minutes || 90);
        setAdvanceDays(s.advance_booking_days || 30);
        setEventServices(s.event_services || []);
        if (s.opening_hours) setOpeningHours(s.opening_hours);
      }

      const { data: b } = await supabase
        .from('bookings').select('*')
        .eq('salon_user_id', userId)
        .order('booking_date', { ascending: false })
        .order('booking_time', { ascending: false });

      setBookings(b || []);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, [userId]);

  useEffect(() => {
    if (settings?.slug) {
      const url = `${window.location.origin}/booking/${settings.slug}`;
      QRCode.toDataURL(url, { width: 300, margin: 2 }, (err: any, dataUrl: string) => {
        if (!err) setSalonQRCode(dataUrl);
      });
    }
  }, [settings?.slug]);

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        try {
          scannerRef.current.stop();
          scannerRef.current.clear();
        } catch {}
        scannerRef.current = null;
      }
    };
  }, []);

  const validateAndCompleteBooking = async (qrCodeValue: string) => {
    if (!qrCodeValue || processing) return;

    setProcessing(true);
    setScanError(null);

    try {
      const cleanQR = qrCodeValue.trim();

      let bookingId = null;
      let ticketNumber = null;

      if (cleanQR.startsWith('{')) {
        try {
          const parsed = JSON.parse(cleanQR);
          bookingId = parsed.booking_id || parsed.id;
          ticketNumber = parsed.ticket_number;
        } catch {}
      }
      if (!bookingId && cleanQR.length === 36 && cleanQR.includes('-')) bookingId = cleanQR;
      if (!bookingId && cleanQR.startsWith('TKT-')) ticketNumber = cleanQR;

      let booking: Booking | null = null;

      if (bookingId && bookingId.length === 36) {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', bookingId)
          .eq('salon_user_id', userId)
          .maybeSingle();
        if (!error && data) booking = data as Booking;
      }

      if (!booking && ticketNumber) {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('ticket_number', ticketNumber)
          .eq('salon_user_id', userId)
          .maybeSingle();
        if (!error && data) booking = data as Booking;
      }

      if (!booking) {
        setScanError('❌ Réservation non trouvée');
        setProcessing(false);
        return;
      }

      if (booking.qr_code_scanned) {
        setScanError(`❌ Ticket déjà scanné`);
        setProcessing(false);
        return;
      }

      if (booking.status === 'done') {
        setScanError(`❌ Ticket déjà terminé`);
        setProcessing(false);
        return;
      }

      const { error: updateError } = await supabase
        .from('bookings')
        .update({ qr_code_scanned: true, scanned_at: new Date().toISOString(), status: 'done' })
        .eq('id', booking.id);

      if (updateError) {
        setScanError('❌ Erreur validation');
        setProcessing(false);
        return;
      }

      setBookings(prev => prev.map(b =>
        b.id === booking!.id ? { ...b, qr_code_scanned: true, scanned_at: new Date().toISOString(), status: 'done' } : b
      ));

      setScanSuccess(`✅ Ticket ${booking.ticket_number} validé ! (${booking.client_name})`);

      setTimeout(() => {
        stopScanner();
        loadAll();
      }, 1500);

    } catch (err) {
      console.error(err);
      setScanError('❌ Erreur');
    } finally {
      setProcessing(false);
    }
  };

  const startScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch {}
      scannerRef.current = null;
    }

    setScanning(true);
    setScanError(null);
    setScanSuccess(null);
    setProcessing(false);

    setTimeout(async () => {
      try {
        const scannerContainer = document.getElementById(SCANNER_ID);
        if (!scannerContainer) {
          setScanError("❌ Erreur technique");
          setScanning(false);
          return;
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(track => track.stop());
        } catch {
          setScanError("❌ Permission caméra refusée");
          setScanning(false);
          return;
        }

        const scanner = new Html5Qrcode(SCANNER_ID);
        scannerRef.current = scanner;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          setScanError("❌ Aucune caméra trouvée");
          setScanning(false);
          return;
        }

        const backCamera = cameras.find(c =>
          c.label.toLowerCase().includes("back") ||
          c.label.toLowerCase().includes("rear") ||
          c.label.toLowerCase().includes("arrière")
        ) || cameras[0];

        await scanner.start(
          backCamera.id,
          { fps: 30, qrbox: { width: 280, height: 280 }, aspectRatio: 1.0 },
          (decodedText) => { if (!processing && decodedText) validateAndCompleteBooking(decodedText); },
          () => {}
        );
      } catch (err) {
        console.error("Erreur scanner:", err);
        setScanError("❌ Impossible d'accéder à la caméra");
        setScanning(false);
      }
    }, 100);
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (err) { console.error('Erreur arrêt scanner:', err); }
    setScanning(false);
    setScanError(null);
    setScanSuccess(null);
    setProcessing(false);
  };

  const updateOpeningHour = (day: string, field: keyof OpeningHour, value: string | boolean) => {
    setOpeningHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const handleSave = async () => {
    setSlugError('');
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!cleanSlug) { setSlugError('Le slug ne peut pas être vide'); return; }
    if (!salonName.trim()) return;

    setSaving(true);
    try {
      const updateData = {
        slug: cleanSlug,
        salon_name: salonName.trim(),
        welcome_message: welcomeMsg.trim(),
        is_active: isActive,
        booking_interval_minutes: bookingInterval,
        advance_booking_days: advanceDays,
        event_services: eventServices,
        opening_hours: openingHours,
        booking_type: 'event',
        updated_at: new Date().toISOString(),
      };

      if (settings) {
        const { error } = await supabase
          .from('booking_settings').update(updateData).eq('id', settings.id);
        if (error) {
          if (error.code === '23505') setSlugError('Ce slug est déjà utilisé');
          else throw error;
        }
      } else {
        const { error } = await supabase
          .from('booking_settings').insert({ user_id: userId, ...updateData });
        if (error) {
          if (error.code === '23505') setSlugError('Ce slug est déjà utilisé');
          else throw error;
        }
      }
      await loadAll();
      alert('Paramètres enregistrés ✅');
      setView('home');
    } catch (err) {
      console.error(err);
      alert('Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  const addEventService = () => {
    const price = parseFloat(newEventService.price);
    if (!newEventService.name.trim()) { alert('Entrez un nom de service'); return; }
    if (!price || price <= 0) { alert('Entrez un prix valide'); return; }
    setEventServices(prev => [...prev, {
      id: Date.now().toString(),
      name: newEventService.name.trim(),
      price,
    }]);
    setNewEventService({ name: '', price: '' });
  };

  const handleMarkDone = async (bookingId: string) => {
    setUpdatingId(bookingId);
    try {
      await supabase.from('bookings').update({ status: 'done' }).eq('id', bookingId);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: 'done' } : b));
    } catch (err) { console.error(err); }
    finally { setUpdatingId(null); }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredBookings = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);
  const counts = {
    all: bookings.length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    done: bookings.filter(b => b.status === 'done').length,
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-700 border-t-white" />
        <p className="text-zinc-500 text-sm">Chargement...</p>
      </div>
    );
  }

  // ── Vue Paramètres — plein écran ──
  if (view === 'settings') {
    return (
      <div className="min-h-screen bg-zinc-950 pb-24">
        <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-4 py-4 flex items-center gap-3 z-10">
          <button onClick={() => setView('home')} className="text-zinc-400 hover:text-white transition">
            <ChevronLeft className="w-6 h-6" />
          </button>
          <h2 className="text-white text-lg font-bold">Paramètres</h2>
        </div>

        <div className="max-w-lg mx-auto px-4 pt-4 space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold">Page active</h3>
                <p className="text-zinc-500 text-xs">Les clients peuvent réserver</p>
              </div>
              <button onClick={() => setIsActive(!isActive)} className="text-3xl">
                {isActive ? <ToggleRight className="w-8 h-8 text-green-500" /> : <ToggleLeft className="w-8 h-8 text-zinc-600" />}
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-white font-bold">Informations du salon</h3>

            <div>
              <label className="text-zinc-400 text-xs block mb-1">Nom du salon</label>
              <input
                type="text"
                value={salonName}
                onChange={(e) => setSalonName(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white"
                placeholder="Mon Salon"
              />
            </div>

            <div>
              <label className="text-zinc-400 text-xs block mb-1">Adresse unique (slug)</label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white"
                placeholder="mon-salon"
              />
              {slugError && <p className="text-red-400 text-xs mt-1">{slugError}</p>}
              <p className="text-zinc-500 text-xs mt-1 break-all">{window.location.origin}/booking/{slug || 'mon-salon'}</p>
            </div>

            <div>
              <label className="text-zinc-400 text-xs block mb-1">Message d'accueil</label>
              <textarea
                value={welcomeMsg}
                onChange={(e) => setWelcomeMsg(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white"
                rows={3}
                placeholder="Bienvenue dans notre salon..."
              />
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-white font-bold">Services</h3>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              {eventServices.length === 0 ? (
                <div className="text-center py-6 text-zinc-500 text-sm">Aucun service ajouté</div>
              ) : (
                eventServices.map((service, idx) => (
                  <div key={service.id} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 bg-zinc-800 rounded-xl p-3">
                    <div className="flex-1 w-full sm:w-auto">
                      <p className="text-white text-sm font-medium break-words">{service.name}</p>
                      <p className="text-emerald-400 text-xs font-semibold">{service.price.toLocaleString()} CFA</p>
                    </div>
                    <button
                      onClick={() => setEventServices(eventServices.filter((_, i) => i !== idx))}
                      className="w-full sm:w-auto flex items-center justify-center gap-1 px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition active:scale-95"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span className="text-xs sm:hidden">Supprimer</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-zinc-800 pt-3 mt-2">
              <p className="text-zinc-400 text-xs mb-2">➕ Ajouter un service</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newEventService.name}
                  onChange={(e) => setNewEventService({ ...newEventService, name: e.target.value })}
                  placeholder="Nom du service"
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white"
                  onKeyPress={(e) => { if (e.key === 'Enter') addEventService(); }}
                />
                <input
                  type="number"
                  value={newEventService.price}
                  onChange={(e) => setNewEventService({ ...newEventService, price: e.target.value })}
                  placeholder="Prix (CFA)"
                  className="w-full sm:w-32 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white"
                  onKeyPress={(e) => { if (e.key === 'Enter') addEventService(); }}
                />
                <button
                  onClick={addEventService}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 bg-white text-black font-semibold py-2.5 px-4 rounded-xl active:scale-95 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Ajouter</span>
                </button>
              </div>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-white font-bold">Horaires d'ouverture</h3>
            <div className="space-y-2">
              {DAYS.map(({ key, label }) => (
                <div key={key} className="flex flex-wrap items-center gap-2">
                  <div className="w-12 text-white font-medium">{label}</div>
                  <button
                    onClick={() => updateOpeningHour(key, 'closed', !openingHours[key]?.closed)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                      openingHours[key]?.closed ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'
                    }`}
                  >
                    {openingHours[key]?.closed ? 'Fermé' : 'Ouvert'}
                  </button>
                  {!openingHours[key]?.closed && (
                    <div className="flex items-center gap-2 flex-1 flex-wrap">
                      <input
                        type="time"
                        value={openingHours[key]?.open || '09:00'}
                        onChange={(e) => updateOpeningHour(key, 'open', e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs"
                      />
                      <span className="text-zinc-500">-</span>
                      <input
                        type="time"
                        value={openingHours[key]?.close || '18:00'}
                        onChange={(e) => updateOpeningHour(key, 'close', e.target.value)}
                        className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-white text-xs"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
            <h3 className="text-white font-bold">Configuration</h3>

            <div>
              <label className="text-zinc-400 text-xs block mb-1">Intervalle de réservation (minutes)</label>
              <select
                value={bookingInterval}
                onChange={(e) => setBookingInterval(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white"
              >
                <option value={30}>30 minutes</option>
                <option value={60}>1 heure</option>
                <option value={90}>1h30</option>
                <option value={120}>2 heures</option>
              </select>
            </div>

            <div>
              <label className="text-zinc-400 text-xs block mb-1">Réservation jusqu'à (jours)</label>
              <select
                value={advanceDays}
                onChange={(e) => setAdvanceDays(Number(e.target.value))}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-white"
              >
                <option value={7}>7 jours</option>
                <option value={14}>14 jours</option>
                <option value={30}>30 jours</option>
                <option value={60}>60 jours</option>
                <option value={90}>90 jours</option>
              </select>
            </div>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="text-blue-400 text-xs">
                💳 Le client paie directement via PayDunya pour confirmer sa réservation — aucun RDV n'est enregistré sans paiement validé.
              </p>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-white text-black font-bold py-3.5 rounded-xl active:scale-[0.98] transition disabled:opacity-50"
          >
            {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
          </button>
        </div>
      </div>
    );
  }

  // ── Vue Accueil (façon Wave) ──
  return (
    <div className="pb-24 space-y-4 max-w-lg mx-auto">
      <style>{`
        #qr-scanner-container video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
        #qr-scanner-container { width: 100%; height: 100%; background: black; }
        @keyframes scanLine { 0% { transform: translateY(-200px); } 100% { transform: translateY(200px); } }
        .animate-scan-line { animation: scanLine 2s linear infinite; }
      `}</style>

      <div className="bg-gradient-to-br from-indigo-600 to-blue-700 px-4 pt-4 pb-8 rounded-b-3xl">
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => setView('settings')} className="text-white/90 hover:text-white transition">
            <Settings className="w-6 h-6" />
          </button>
          <button onClick={loadAll} className="text-white/90 hover:text-white transition">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2">
            <span className="text-white text-5xl font-black tracking-tight">
              {balanceVisible ? totalNetRevenue.toLocaleString('fr-FR') : '••••••'}
            </span>
            <span className="text-white/70 text-2xl font-bold">F</span>
            <button onClick={() => setBalanceVisible(v => !v)} className="text-white/60 hover:text-white transition ml-1">
              {balanceVisible ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
            </button>
          </div>
          <p className="text-white/60 text-xs mt-1">Revenu net encaissé (après frais)</p>
        </div>

        {settings && salonQRCode && (
          <div className="bg-sky-400/90 rounded-2xl p-4 flex flex-col items-center gap-2">
            <button onClick={startScanner} className="bg-white p-3 rounded-xl shadow-lg active:scale-95 transition">
              <img src={salonQRCode} alt="QR Code salon — cliquez pour scanner" className="w-32 h-32" />
            </button>
            <p className="text-white/90 text-xs font-medium">Touchez le QR code pour scanner un ticket client</p>
          </div>
        )}
      </div>

      <div className="px-4 space-y-4">
        {/* Grille d'icônes (façon Wave) */}
        <div className="grid grid-cols-3 gap-y-4 py-2">
          {[
            { icon: <Link2 className="w-5 h-5" />, label: 'Lien', bg: 'bg-indigo-100 text-indigo-600', onClick: () => setShowShareSection(v => !v) },
            { icon: <Settings className="w-5 h-5" />, label: 'Paramètres', bg: 'bg-sky-100 text-sky-600', onClick: () => setView('settings') },
            { icon: <RefreshCw className="w-5 h-5" />, label: 'Actualiser', bg: 'bg-pink-100 text-pink-600', onClick: () => loadAll() },
          ].map(({ icon, label, bg, onClick }) => (
            <button key={label} onClick={onClick} className="flex flex-col items-center gap-2">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center ${bg}`}>{icon}</div>
              <span className="text-zinc-300 text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>

        {settings && showShareSection && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-2">
            <div className="bg-zinc-800 rounded-xl px-3 py-2.5 text-zinc-300 text-xs font-mono break-all">
              {bookingUrl}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 bg-white text-black font-semibold text-sm py-2.5 rounded-xl active:scale-[0.98] transition"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
              <a
                href={bookingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="w-11 h-11 flex items-center justify-center border border-zinc-700 rounded-xl text-zinc-400 hover:text-white transition"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </div>
        )}

        {recentBookings.length > 0 && (
          <div>
            <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2 px-1">Activité récente</h3>
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl divide-y divide-zinc-800 overflow-hidden">
              {recentBookings.map((b) => (
                <div key={b.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{b.service_name} — {b.client_name}</p>
                    <p className="text-zinc-500 text-xs">
                      {new Date(b.created_at).toLocaleDateString('fr-FR')} à {new Date(b.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="text-emerald-400 font-bold text-sm shrink-0 ml-3">
                    +{(b.net_amount ?? Math.round(b.service_price * (1 - NET_FEE_RATE))).toLocaleString()}F
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Liste des réservations, toujours visible */}
        <div>
          <h3 className="text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2 px-1">Réservations ({counts.all})</h3>

          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none mb-3">
            {(['all', 'confirmed', 'done'] as const).map(val => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                  filter === val ? 'bg-white text-black border-white' : 'border-zinc-700 text-zinc-400'
                }`}
              >
                {val === 'all' ? 'Toutes' : STATUS_LABELS[val]}
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${filter === val ? 'bg-black/10' : 'bg-zinc-800'}`}>
                  {counts[val]}
                </span>
              </button>
            ))}
          </div>

          {filteredBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 border border-dashed border-zinc-800 rounded-2xl">
              <Scissors className="w-8 h-8 text-zinc-700 mb-2" />
              <p className="text-zinc-500 text-sm">Aucune réservation</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredBookings.map(booking => (
                <div key={booking.id} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                  <div className="flex items-center justify-between px-4 pt-4 pb-2 gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black font-mono text-white text-base bg-zinc-800 px-2.5 py-1 rounded-lg leading-none">
                        {booking.ticket_number}
                      </span>
                      <span className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${STATUS_COLORS[booking.status]}`}>
                        {STATUS_LABELS[booking.status]}
                      </span>
                      <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                        💳 Payé
                      </span>
                    </div>
                  </div>

                  <div className="px-4 pb-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm text-zinc-300">
                      <User className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      <span className="truncate font-medium">{booking.client_name}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Phone className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      <a href={`tel:${booking.client_phone}`} className="truncate underline-offset-2 active:text-white">
                        {booking.client_phone}
                      </a>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Scissors className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      <span className="truncate">{booking.service_name}</span>
                      <span className="ml-auto shrink-0 text-white font-bold text-xs">
                        {booking.service_price.toLocaleString()} CFA
                      </span>
                    </div>
                    {booking.net_amount != null && (
                      <div className="flex items-center gap-2 text-sm text-zinc-500 pl-5">
                        <span className="text-xs">Net reçu (après 1,5%)</span>
                        <span className="ml-auto shrink-0 text-emerald-400 font-semibold text-xs">
                          {booking.net_amount.toLocaleString()} CFA
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm text-zinc-400">
                      <Calendar className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                      <span>{new Date(booking.booking_date).toLocaleDateString('fr-FR')}</span>
                      <span className="text-white font-bold">{booking.booking_time.slice(0, 5)}</span>
                    </div>

                    {booking.barber_name && (
                      <div className="flex items-center gap-2 text-sm text-zinc-400">
                        <User className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
                        <span>Coiffeur: {booking.barber_name}</span>
                      </div>
                    )}

                    {booking.note && (
                      <div className="flex items-start gap-2 text-sm text-zinc-400 mt-1">
                        <span className="text-zinc-600">📝</span>
                        <span className="italic">{booking.note}</span>
                      </div>
                    )}
                  </div>

                  <div className="px-4 pb-4 flex flex-wrap gap-2 border-t border-zinc-800/50 pt-3">
                    {booking.status === 'confirmed' && !booking.qr_code_scanned && (
                      <button
                        onClick={() => handleMarkDone(booking.id)}
                        disabled={updatingId === booking.id}
                        className="w-full bg-sky-500 hover:bg-sky-400 text-black font-semibold py-2 rounded-xl text-sm transition active:scale-95"
                      >
                        Marquer comme terminé
                      </button>
                    )}
                    {booking.status === 'confirmed' && booking.qr_code_scanned && (
                      <div className="w-full text-center text-emerald-400 text-sm py-2">
                        ✓ Ticket scanné et validé
                      </div>
                    )}
                    {booking.status === 'done' && (
                      <div className="w-full text-center text-zinc-500 text-sm py-2">Terminé</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* MODAL SCANNER */}
      {scanning && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
            <h2 className="text-white font-bold text-lg">Scanner un ticket</h2>
            <button onClick={stopScanner} className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center active:scale-95">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="flex-1 relative bg-black overflow-hidden min-h-[300px]">
            <div id={SCANNER_ID} className="w-full h-full" />
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative">
                <div className="w-64 h-64 border-2 border-green-500 rounded-2xl" />
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-xl" />
              </div>
            </div>
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-green-500/50 animate-scan-line pointer-events-none" />
          </div>

          <div className="shrink-0 p-4 border-t border-zinc-800 space-y-2 bg-black">
            <p className="text-zinc-400 text-sm text-center">📱 Placez le QR code dans le cadre</p>

            {processing && (
              <div className="bg-blue-500/20 border border-blue-500/40 text-blue-300 rounded-xl p-3 flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent" />
                Validation en cours...
              </div>
            )}

            {scanError && (
              <div className="bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl p-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {scanError}
              </div>
            )}

            {scanSuccess && (
              <div className="bg-green-500/20 border border-green-500/40 text-green-300 rounded-xl p-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                {scanSuccess}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}