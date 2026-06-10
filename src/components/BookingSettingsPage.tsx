// src/components/BookingSettingsPage.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Link2, Check, Copy, Clock, User, Phone, Calendar,
  Settings, ToggleLeft, ToggleRight, RefreshCw, Scissors,
  ExternalLink, QrCode, X, Camera, ChevronDown, ChevronUp,
  Plus, Trash2, Sparkles, Wallet, ScanLine, AlertTriangle,
  CheckCircle2, ChevronRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Html5Qrcode } from "html5-qrcode";
import QRCode from 'qrcode';

/* ─────────────── Types ─────────────── */

interface ServiceFromCatalog {
  id: number;
  name: string;
  base_price: number;
  category: string;
}

interface EventService {
  id: string;
  name: string;
  price: number;
}

interface OpeningHour {
  open: string;
  close: string;
  closed: boolean;
}

interface BookingSettings {
  id: string;
  user_id: string;
  slug: string;
  salon_name: string;
  welcome_message: string;
  is_active: boolean;
  event_services: EventService[];
  barbers: string[];
  opening_hours: Record<string, OpeningHour>;
  booking_interval_minutes: number;
  advance_booking_days: number;
  require_payment: boolean;
  logo_url: string | null;
  primary_color: string;
  booking_type: 'normal' | 'event' | null;
  wave_payment_link: string;
}

interface Booking {
  id: string;
  ticket_number: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  service_price: number;
  barber_name: string | null;
  booking_date: string;
  booking_time: string;
  note: string | null;
  status: 'pending' | 'confirmed' | 'cancelled' | 'done';
  qr_code: string;
  qr_code_scanned: boolean;
  scanned_at: string | null;
  created_at: string;
  payment_status: 'pending' | 'paid' | 'failed';
}

type TabType = 'bookings' | 'settings';

interface BookingSettingsPageProps {
  userId: string;
  salonServices?: any[];
}

/* ─────────────── Constants ─────────────── */

const STATUS_LABELS: Record<Booking['status'], string> = {
  pending: 'En attente',
  confirmed: 'Confirmé',
  cancelled: 'Annulé',
  done: 'Terminé',
};

const STATUS_COLORS: Record<Booking['status'], string> = {
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  confirmed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  cancelled: 'bg-red-500/15 text-red-400 border-red-500/30',
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

/* ─────────────── Component ─────────────── */

export function BookingSettingsPage({ userId }: BookingSettingsPageProps) {
  /* State */
  const [settings, setSettings] = useState<BookingSettings | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('bookings');
  const [filter, setFilter] = useState<'all' | Booking['status']>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSuccess, setScanSuccess] = useState<string | null>(null);
  const [salonQRCode, setSalonQRCode] = useState<string>('');
  const [showShareSection, setShowShareSection] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [processing, setProcessing] = useState(false);

  /* Settings fields */
  const [catalogServices, setCatalogServices] = useState<ServiceFromCatalog[]>([]);
  const [eventServices, setEventServices] = useState<EventService[]>([]);
  const [newEventService, setNewEventService] = useState({ name: '', price: '' });
  const [bookingType, setBookingType] = useState<'normal' | 'event' | null>(null);
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
  const [requirePayment, setRequirePayment] = useState(false);
  const [wavePaymentLink, setWavePaymentLink] = useState('');

  const bookingUrl = `${window.location.origin}/booking/${settings?.slug || ''}`;

  /* ── Data helpers ── */

  const saveTransaction = async (booking: Booking) => {
    try {
      const { data: existing } = await supabase
        .from('transactions').select('id')
        .eq('booking_id', booking.id).maybeSingle();
      if (existing) return;
      
      await supabase.from('transactions').insert({
        user_id: userId,
        service_name: booking.service_name,
        amount: booking.service_price,
        barber_name: booking.barber_name || null,
        transaction_date_sec: new Date().toISOString(),
        booking_id: booking.id,
        client_name: booking.client_name,
        client_phone: booking.client_phone,
        with_teinture: false,
        with_soin: false,
      });
    } catch (err) { console.error('Transaction error:', err); }
  };

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
        setRequirePayment(s.require_payment || false);
        setEventServices(s.event_services || []);
        setBookingType(s.booking_type || null);
        setWavePaymentLink(s.wave_payment_link || '');
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

  const loadCatalogServices = async () => {
    try {
      const { data, error } = await supabase
        .from('catalogue_services').select('*')
        .eq('user_id', userId).order('id');
      if (!error && data) setCatalogServices(data);
    } catch (err) { console.error(err); }
  };

  /* ── Effects ── */

  useEffect(() => { loadAll(); loadCatalogServices(); }, [userId]);

  useEffect(() => {
    if (settings?.slug) {
      const url = `${window.location.origin}/booking/${settings.slug}`;
      QRCode.toDataURL(url, { width: 300, margin: 2 }, (err: any, dataUrl: string) => {
        if (!err) setSalonQRCode(dataUrl);
      });
    }
  }, [settings?.slug]);

  // Cleanup scanner on unmount
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

  /* ── Scanner ULTRA RAPIDE ── */

  const validateAndCompleteBooking = async (qrCodeValue: string) => {
    if (!qrCodeValue || processing) return;
    
    setProcessing(true);
    setScanError(null);
    
    try {
      const cleanQR = qrCodeValue.trim();
      
      let bookingId = null;
      let ticketNumber = null;
      
      // Extraction rapide
      if (cleanQR.startsWith('{')) {
        try {
          const parsed = JSON.parse(cleanQR);
          bookingId = parsed.booking_id || parsed.id;
          ticketNumber = parsed.ticket_number;
        } catch {}
      }
      
      if (!bookingId && cleanQR.includes('|')) {
        const parts = cleanQR.split('|');
        bookingId = parts[0];
        ticketNumber = parts[1];
      }
      
      if (!bookingId && cleanQR.length === 36 && cleanQR.includes('-')) {
        bookingId = cleanQR;
      }
      
      if (!bookingId && cleanQR.startsWith('TKT-')) {
        ticketNumber = cleanQR;
      }
      
      let booking = null;
      
      // Recherche par ID
      if (bookingId && bookingId.length === 36) {
        const { data, error } = await supabase
          .from('bookings')
          .select('id, ticket_number, client_name, status, qr_code_scanned, scanned_at, salon_user_id, service_name, service_price, barber_name, client_phone')
          .eq('id', bookingId)
          .eq('salon_user_id', userId)
          .maybeSingle();
          
        if (!error && data) booking = data;
      }
      
      // Recherche par ticket number
      if (!booking && ticketNumber) {
        const { data, error } = await supabase
          .from('bookings')
          .select('id, ticket_number, client_name, status, qr_code_scanned, scanned_at, salon_user_id, service_name, service_price, barber_name, client_phone')
          .eq('ticket_number', ticketNumber)
          .eq('salon_user_id', userId)
          .maybeSingle();
          
        if (!error && data) booking = data;
      }
      
      // Recherche par QR code
      if (!booking) {
        const { data, error } = await supabase
          .from('bookings')
          .select('id, ticket_number, client_name, status, qr_code_scanned, scanned_at, salon_user_id, service_name, service_price, barber_name, client_phone')
          .eq('qr_code', cleanQR)
          .eq('salon_user_id', userId)
          .maybeSingle();
          
        if (!error && data) booking = data;
      }

      if (!booking) {
        setScanError('❌ Réservation non trouvée');
        setProcessing(false);
        return;
      }
      
      // Vérifications
      if (booking.qr_code_scanned) {
        setScanError(`❌ Ticket déjà scanné`);
        setProcessing(false);
        return;
      }
      
      if (booking.status === 'cancelled') {
        setScanError(`❌ Ticket annulé`);
        setProcessing(false);
        return;
      }
      
      if (booking.status === 'done') {
        setScanError(`❌ Ticket déjà terminé`);
        setProcessing(false);
        return;
      }
      
      // ← CRITIQUE: Seulement les réservations CONFIRMÉES
      if (booking.status !== 'confirmed') {
        setScanError(`❌ Réservation non confirmée. Veuillez d'abord confirmer.`);
        setProcessing(false);
        return;
      }
      
      // Mise à jour
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          qr_code_scanned: true,
          scanned_at: new Date().toISOString(),
          status: 'done',
        })
        .eq('id', booking.id);

      if (updateError) {
        setScanError('❌ Erreur validation');
        setProcessing(false);
        return;
      }

      // Transaction
      try {
        await supabase.from('transactions').insert({
          user_id: userId,
          service_name: booking.service_name,
          amount: booking.service_price,
          barber_name: booking.barber_name || null,
          transaction_date_sec: new Date().toISOString(),
          booking_id: booking.id,
          client_name: booking.client_name,
          client_phone: booking.client_phone,
          with_teinture: false,
          with_soin: false,
        });
      } catch (err) {
        console.error('Transaction error:', err);
      }

      // Mise à jour UI
      setBookings(prev => prev.map(b =>
        b.id === booking.id
          ? { ...b, qr_code_scanned: true, scanned_at: new Date().toISOString(), status: 'done' }
          : b
      ));

      setScanSuccess(`✅ Ticket ${booking.ticket_number} validé ! (${booking.client_name})`);
      
      // Fermeture après succès
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
    console.log("Démarrage du scanner...");
    
    // Nettoyer l'ancien scanner
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch (err) {
        console.log('Erreur nettoyage:', err);
      }
      scannerRef.current = null;
    }

    setScanning(true);
    setScanError(null);
    setScanSuccess(null);
    setProcessing(false);
    
    // Attendre que le modal soit monté
    setTimeout(async () => {
      try {
        const scannerContainer = document.getElementById(SCANNER_ID);
        if (!scannerContainer) {
          console.error("Conteneur non trouvé");
          setScanError("❌ Erreur technique");
          setScanning(false);
          return;
        }

        // Vérifier permission caméra
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          stream.getTracks().forEach(track => track.stop());
        } catch (err) {
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

        // Sélectionner caméra arrière
        const backCamera = cameras.find(c =>
          c.label.toLowerCase().includes("back") ||
          c.label.toLowerCase().includes("rear") ||
          c.label.toLowerCase().includes("arrière")
        ) || cameras[0];

        const config = {
          fps: 30,
          qrbox: { width: 280, height: 280 },
          aspectRatio: 1.0,
        };

        await scanner.start(
          backCamera.id,
          config,
          (decodedText) => {
            if (!processing && decodedText) {
              validateAndCompleteBooking(decodedText);
            }
          },
          (errorMessage) => {
            // Ignorer les erreurs normales
            if (errorMessage && errorMessage.includes("No MultiFormat")) {
              return;
            }
          }
        );
        
        console.log("Scanner démarré avec succès");
        
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
    } catch (err) {
      console.error('Erreur arrêt scanner:', err);
    }
    setScanning(false);
    setScanError(null);
    setScanSuccess(null);
    setProcessing(false);
  };

  /* ── Settings save ── */

  const updateOpeningHour = (day: string, field: keyof OpeningHour, value: string | boolean) => {
    setOpeningHours(prev => ({ ...prev, [day]: { ...prev[day], [field]: value } }));
  };

  const handleSave = async () => {
    setSlugError('');
    const cleanSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
    if (!cleanSlug) { setSlugError('Le slug ne peut pas être vide'); return; }
    if (!salonName.trim()) return;
    if (!bookingType) { alert('Veuillez sélectionner un type de réservation'); return; }

    setSaving(true);
    try {
      const updateData = {
        slug: cleanSlug,
        salon_name: salonName.trim(),
        welcome_message: welcomeMsg.trim(),
        is_active: isActive,
        booking_interval_minutes: bookingInterval,
        advance_booking_days: advanceDays,
        require_payment: requirePayment,
        event_services: eventServices,
        opening_hours: openingHours,
        booking_type: bookingType,
        wave_payment_link: wavePaymentLink,
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

  const handleStatusChange = async (bookingId: string, newStatus: Booking['status']) => {
    setUpdatingId(bookingId);
    const booking = bookings.find(b => b.id === bookingId);
    try {
      await supabase.from('bookings').update({ status: newStatus }).eq('id', bookingId);
      if (newStatus === 'done' && booking) await saveTransaction(booking);
      setBookings(prev => prev.map(b => b.id === bookingId ? { ...b, status: newStatus } : b));
    } catch (err) { console.error(err); }
    finally { setUpdatingId(null); }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(bookingUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ── Derived ── */

  const filteredBookings = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);
  const counts = {
    all: bookings.length,
    pending: bookings.filter(b => b.status === 'pending').length,
    confirmed: bookings.filter(b => b.status === 'confirmed').length,
    done: bookings.filter(b => b.status === 'done').length,
    cancelled: bookings.filter(b => b.status === 'cancelled').length,
  };

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-700 border-t-white" />
        <p className="text-zinc-500 text-sm">Chargement...</p>
      </div>
    );
  }

  return (
    <>
      {/* Contenu principal */}
      <div className="pb-24 space-y-4 max-w-lg mx-auto px-4 pt-2">
        <style>{`
          @keyframes scanLine {
            0% { transform: translateY(-200px); }
            100% { transform: translateY(200px); }
          }
          .animate-scan-line {
            animation: scanLine 2s linear infinite;
          }
          @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-5px); }
          }
          .animate-bounce {
            animation: bounce 0.5s ease-in-out infinite;
          }
          #qr-scanner-container video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
          }
          #qr-scanner-container {
            width: 100%;
            height: 100%;
            background: black;
          }
        `}</style>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-white text-xl font-black leading-tight">Réservations</h2>
            <p className="text-zinc-500 text-xs mt-0.5">Gérez votre page en ligne</p>
          </div>
          <button
            onClick={loadAll}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-zinc-800 text-zinc-400 hover:text-white active:scale-95 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code + Scan button */}
        {settings && salonQRCode && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col items-center gap-4">
            <div className="bg-white p-3 rounded-xl shadow-lg">
              <img src={salonQRCode} alt="QR Code salon" className="w-36 h-36" />
            </div>
            <button
              onClick={startScanner}
              className="w-full flex items-center justify-center gap-2 bg-green-500 hover:bg-green-400 active:scale-[0.98] text-black font-bold py-3.5 rounded-xl transition"
            >
              <Camera className="w-5 h-5" />
              Scanner un ticket client
            </button>
          </div>
        )}

        {/* Lien de réservation */}
        {settings && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
            <button
              onClick={() => setShowShareSection(!showShareSection)}
              className="w-full flex items-center justify-between px-4 py-3.5 active:bg-zinc-800 transition"
            >
              <div className="flex items-center gap-2">
                <Link2 className="w-4 h-4 text-zinc-500" />
                <span className="text-zinc-300 text-sm font-medium">Lien de réservation</span>
              </div>
              {showShareSection
                ? <ChevronUp className="w-4 h-4 text-zinc-600" />
                : <ChevronDown className="w-4 h-4 text-zinc-600" />}
            </button>

            {showShareSection && (
              <div className="px-4 pb-4 border-t border-zinc-800 pt-3 space-y-2">
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
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-zinc-900 border border-zinc-800 rounded-xl p-1">
          {(['bookings', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                activeTab === tab
                  ? 'bg-white text-black'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab === 'bookings' ? `Réservations (${counts.all})` : 'Paramètres'}
            </button>
          ))}
        </div>

        {/* TAB : RÉSERVATIONS */}
        {activeTab === 'bookings' && (
          <div className="space-y-3">
            {!settings && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4">
                <p className="text-amber-300 font-semibold text-sm">Page non configurée</p>
                <p className="text-amber-400/70 text-xs mt-1">
                  Allez dans "Paramètres" pour créer votre page de réservation.
                </p>
              </div>
            )}

            {/* Filter chips */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
              {(['all', 'pending', 'confirmed', 'done', 'cancelled'] as const).map(val => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    filter === val
                      ? 'bg-white text-black border-white'
                      : 'border-zinc-700 text-zinc-400'
                  }`}
                >
                  {val === 'all' ? 'Toutes' : STATUS_LABELS[val]}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] ${
                    filter === val ? 'bg-black/10' : 'bg-zinc-800'
                  }`}>
                    {counts[val]}
                  </span>
                </button>
              ))}
            </div>

            {/* Booking list */}
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
                        {booking.qr_code_scanned && (
                          <span className="text-[10px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                            ✓ Scanné
                          </span>
                        )}
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
                      {booking.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(booking.id, 'confirmed')}
                            disabled={updatingId === booking.id}
                            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold py-2 rounded-xl text-sm transition active:scale-95 disabled:opacity-50"
                          >
                            Confirmer
                          </button>
                          <button
                            onClick={() => handleStatusChange(booking.id, 'cancelled')}
                            disabled={updatingId === booking.id}
                            className="flex-1 bg-red-500/20 hover:bg-red-500/30 text-red-400 font-semibold py-2 rounded-xl text-sm transition active:scale-95"
                          >
                            Annuler
                          </button>
                        </>
                      )}
                      {booking.status === 'confirmed' && !booking.qr_code_scanned && (
                        <button
                          onClick={() => handleStatusChange(booking.id, 'done')}
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
                      {(booking.status === 'done' || booking.status === 'cancelled') && (
                        <button
                          onClick={() => handleStatusChange(booking.id, 'pending')}
                          disabled={updatingId === booking.id}
                          className="w-full bg-zinc-700 hover:bg-zinc-600 text-white font-semibold py-2 rounded-xl text-sm transition active:scale-95"
                        >
                          Réinitialiser
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB : PARAMÈTRES */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Activation */}
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

            {/* Type de réservation */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <h3 className="text-white font-bold mb-3">Type de réservation</h3>
              <div className="flex gap-3">
                <button
                  onClick={() => setBookingType('normal')}
                  className={`flex-1 py-3 rounded-xl font-semibold transition ${
                    bookingType === 'normal' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Standard
                </button>
                <button
                  onClick={() => setBookingType('event')}
                  className={`flex-1 py-3 rounded-xl font-semibold transition ${
                    bookingType === 'event' ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Événement
                </button>
              </div>
            </div>

            {/* Infos salon */}
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
                <p className="text-zinc-500 text-xs mt-1">{window.location.origin}/booking/{slug || 'mon-salon'}</p>
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

            {/* Services événementiels */}
            {bookingType === 'event' && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
                <h3 className="text-white font-bold">Services événementiels</h3>
                
                {eventServices.map((service, idx) => (
                  <div key={service.id} className="flex items-center gap-2 bg-zinc-800 rounded-xl p-2">
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{service.name}</p>
                      <p className="text-zinc-400 text-xs">{service.price.toLocaleString()} CFA</p>
                    </div>
                    <button
                      onClick={() => setEventServices(eventServices.filter((_, i) => i !== idx))}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newEventService.name}
                    onChange={(e) => setNewEventService({ ...newEventService, name: e.target.value })}
                    placeholder="Nom du service"
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm"
                  />
                  <input
                    type="number"
                    value={newEventService.price}
                    onChange={(e) => setNewEventService({ ...newEventService, price: e.target.value })}
                    placeholder="Prix"
                    className="w-24 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-white text-sm"
                  />
                  <button onClick={addEventService} className="p-2 bg-white text-black rounded-xl">
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Horaires */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-white font-bold">Horaires d'ouverture</h3>
              {DAYS.map(({ key, label }) => (
                <div key={key} className="flex items-center gap-2">
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
                    <>
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
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Configuration */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-3">
              <h3 className="text-white font-bold">Configuration</h3>
              
              <div>
                <label className="text-zinc-400 text-xs block mb-1">Intervalle de réservation (minutes)</label>
                <select
                  value={bookingInterval}
                  onChange={(e) => setBookingInterval(Number(e.target.value))}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm"
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
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm"
                >
                  <option value={7}>7 jours</option>
                  <option value={14}>14 jours</option>
                  <option value={30}>30 jours</option>
                  <option value={60}>60 jours</option>
                  <option value={90}>90 jours</option>
                </select>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">Paiement obligatoire</p>
                  <p className="text-zinc-500 text-xs">Les clients doivent payer en ligne</p>
                </div>
                <button onClick={() => setRequirePayment(!requirePayment)} className="text-3xl">
                  {requirePayment ? <ToggleRight className="w-8 h-8 text-green-500" /> : <ToggleLeft className="w-8 h-8 text-zinc-600" />}
                </button>
              </div>

              {requirePayment && (
                <div>
                  <label className="text-zinc-400 text-xs block mb-1">Lien de paiement Wave</label>
                  <input
                    type="url"
                    value={wavePaymentLink}
                    onChange={(e) => setWavePaymentLink(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-white text-sm"
                    placeholder="https://wave.com/pay/..."
                  />
                </div>
              )}
            </div>

            {/* Bouton sauvegarde */}
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full bg-white text-black font-bold py-3.5 rounded-xl active:scale-[0.98] transition disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : 'Enregistrer les paramètres'}
            </button>
          </div>
        )}
      </div>

      {/* MODAL SCANNER - En dehors du contenu principal */}
      {scanning && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
            <div className="flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-green-400 animate-pulse" />
              <h2 className="text-white font-bold text-lg">Scanner un ticket</h2>
            </div>
            <button
              onClick={stopScanner}
              className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center active:scale-95"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="flex-1 relative bg-black overflow-hidden min-h-[300px]">
            <div id={SCANNER_ID} className="w-full h-full" />
            
            {/* Cadre de scan */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative">
                <div className="w-64 h-64 border-2 border-green-500 rounded-2xl" />
                <div className="absolute -top-1 -left-1 w-8 h-8 border-t-4 border-l-4 border-green-500 rounded-tl-xl" />
                <div className="absolute -top-1 -right-1 w-8 h-8 border-t-4 border-r-4 border-green-500 rounded-tr-xl" />
                <div className="absolute -bottom-1 -left-1 w-8 h-8 border-b-4 border-l-4 border-green-500 rounded-bl-xl" />
                <div className="absolute -bottom-1 -right-1 w-8 h-8 border-b-4 border-r-4 border-green-500 rounded-br-xl" />
              </div>
            </div>
            
            {/* Animation de scan */}
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-green-500/50 animate-scan-line pointer-events-none" />
          </div>

          <div className="shrink-0 p-4 border-t border-zinc-800 space-y-2 bg-black">
            <p className="text-zinc-400 text-sm text-center">
              📱 Placez le QR code dans le cadre
            </p>
            
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
                <CheckCircle2 className="w-4 h-4 shrink-0 animate-bounce" />
                {scanSuccess}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}