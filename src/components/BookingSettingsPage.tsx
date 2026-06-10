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
  const [expandedBookingId, setExpandedBookingId] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [processing, setProcessing] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);

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

  /* ── Scanner CORRIGÉ ── */

  const validateAndCompleteBooking = async (qrCodeValue: string) => {
    if (!qrCodeValue || processing) return;
    
    setProcessing(true);
    setScanError(null);
    
    try {
      console.log('📱 QR Code scanné:', qrCodeValue);
      const cleanQR = qrCodeValue.trim();
      
      let bookingId = null;
      let ticketNumber = null;
      
      // Format 1: JSON
      if (cleanQR.startsWith('{')) {
        try {
          const parsed = JSON.parse(cleanQR);
          bookingId = parsed.booking_id || parsed.id;
          ticketNumber = parsed.ticket_number;
          console.log('✅ Format JSON détecté:', parsed);
        } catch {}
      }
      
      // Format 2: Format avec pipe "ID|TICKET|SERVICE|DATE|HEURE"
      if (!bookingId && cleanQR.includes('|')) {
        const parts = cleanQR.split('|');
        if (parts.length >= 2) {
          bookingId = parts[0];
          if (parts.length >= 2) ticketNumber = parts[1];
          console.log('✅ Format pipe détecté:', { bookingId, ticketNumber });
        }
      }
      
      // Format 3: UUID direct
      if (!bookingId && cleanQR.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        bookingId = cleanQR;
        console.log('✅ Format UUID détecté:', bookingId);
      }
      
      // Format 4: Numéro de ticket (TKT-...)
      if (!bookingId && cleanQR.startsWith('TKT-')) {
        ticketNumber = cleanQR;
        console.log('✅ Format ticket détecté:', ticketNumber);
      }
      
      console.log('🔍 Recherche avec:', { bookingId, ticketNumber });
      
      let booking = null;
      
      // Recherche par ID
      if (bookingId && bookingId.length === 36) {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('id', bookingId)
          .eq('salon_user_id', userId)
          .maybeSingle();
        if (!error && data) {
          booking = data;
          console.log('✅ Trouvé par ID');
        }
      }
      
      // Recherche par ticket number
      if (!booking && ticketNumber) {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('ticket_number', ticketNumber)
          .eq('salon_user_id', userId)
          .maybeSingle();
        if (!error && data) {
          booking = data;
          console.log('✅ Trouvé par ticket number');
        }
      }
      
      // Recherche par qr_code
      if (!booking) {
        const { data, error } = await supabase
          .from('bookings')
          .select('*')
          .eq('qr_code', cleanQR)
          .eq('salon_user_id', userId)
          .maybeSingle();
        if (!error && data) {
          booking = data;
          console.log('✅ Trouvé par QR code');
        }
      }

      if (!booking) {
        setScanError('❌ QR code invalide – Réservation non trouvée');
        return;
      }
      
      console.log('✅ Réservation trouvée:', booking.ticket_number, booking.client_name);
      
      if (booking.qr_code_scanned) {
        setScanError(`❌ Ticket ${booking.ticket_number} déjà scanné le ${booking.scanned_at ? new Date(booking.scanned_at).toLocaleString('fr-FR') : 'à une date inconnue'}`);
        return;
      }
      
      if (booking.status === 'cancelled') {
        setScanError(`❌ Ticket ${booking.ticket_number} annulé`);
        return;
      }
      
      if (booking.status === 'done') {
        setScanError(`❌ Ticket ${booking.ticket_number} déjà terminé`);
        return;
      }
      
      const { error: updateError } = await supabase
        .from('bookings')
        .update({
          qr_code_scanned: true,
          scanned_at: new Date().toISOString(),
          status: 'done',
        })
        .eq('id', booking.id);

      if (updateError) {
        console.error('❌ Erreur mise à jour:', updateError);
        setScanError('❌ Erreur lors de la validation');
        return;
      }

      await saveTransaction(booking);

      setBookings(prev => prev.map(b =>
        b.id === booking.id
          ? { ...b, qr_code_scanned: true, scanned_at: new Date().toISOString(), status: 'done' }
          : b
      ));

      setScanSuccess(`✅ Ticket ${booking.ticket_number} validé ! (${booking.client_name})`);
      
      setTimeout(() => {
        stopScanner();
        loadAll(); // Recharger la liste des réservations
      }, 3000);
      
    } catch (err) {
      console.error('❌ Erreur validation:', err);
      setScanError('❌ Erreur lors de la validation');
    } finally {
      setProcessing(false);
    }
  };

  const startScanner = async () => {
    try {
      setScanning(true);
      setScanError(null);
      setScanSuccess(null);
      setProcessing(false);
      setCameraPermission(null);

      // Vérifier la permission caméra d'abord
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(track => track.stop());
        setCameraPermission(true);
      } catch (err) {
        setCameraPermission(false);
        setScanError("❌ Permission caméra refusée. Veuillez autoriser l'accès à la caméra.");
        setScanning(false);
        return;
      }

      await new Promise(resolve => setTimeout(resolve, 500));

      const scanner = new Html5Qrcode(SCANNER_ID);
      scannerRef.current = scanner;

      const cameras = await Html5Qrcode.getCameras();

      if (!cameras || cameras.length === 0) {
        setScanError("❌ Aucune caméra trouvée");
        setScanning(false);
        return;
      }

      // Sélectionner la caméra arrière (priorité)
      const backCamera = cameras.find(c =>
        c.label.toLowerCase().includes("back") ||
        c.label.toLowerCase().includes("rear") ||
        c.label.toLowerCase().includes("arrière") ||
        c.label.toLowerCase().includes("environment") ||
        c.label.toLowerCase().includes("camera2")
      ) || cameras[0];

      // Configuration optimisée pour mobile
      const config = {
        fps: 15,
        qrbox: { width: 280, height: 280 },
        aspectRatio: 1.0,
        disableFlip: false,
        rememberLastUsedCamera: true,
        supportedScanTypes: 1,
      };

      await scanner.start(
        { deviceId: { exact: backCamera.id } },
        config,
        async (decodedText) => {
          if (!processing) {
            await validateAndCompleteBooking(decodedText);
          }
        },
        (errorMessage) => {
          if (errorMessage && !errorMessage.includes("No MultiFormat Readers")) {
            console.log("Scan en cours...");
          }
        }
      );
    } catch (err) {
      console.error("Erreur scanner:", err);
      setScanError("❌ Impossible d'accéder à la caméra. Vérifiez les permissions.");
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch (err) {
      console.error(err);
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

  /* ── Render: Loading ── */

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-700 border-t-white" />
        <p className="text-zinc-500 text-sm">Chargement...</p>
      </div>
    );
  }

  /* ── Render: Scanner fullscreen ── */

  if (scanning) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2">
            <ScanLine className="w-5 h-5 text-green-400" />
            <h2 className="text-white font-bold text-lg">Scanner un ticket</h2>
          </div>
          <button
            onClick={stopScanner}
            className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center hover:bg-zinc-700 transition active:scale-95"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        <div className="flex-1 relative bg-black overflow-hidden">
          <div id={SCANNER_ID} className="w-full h-full" />
          <div className="absolute top-4 left-0 right-0 text-center pointer-events-none">
            <p className="text-white/70 text-sm bg-black/50 inline-block px-4 py-2 rounded-full">
              📱 Placez le QR code dans le cadre
            </p>
          </div>
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="w-72 h-72 border-4 border-green-400 rounded-3xl shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] animate-pulse" />
          </div>
        </div>

        <div className="shrink-0 p-4 border-t border-zinc-800 space-y-2 bg-black">
          {processing && (
            <div className="bg-blue-500/20 border border-blue-500/40 text-blue-300 text-sm rounded-xl p-3 flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent" />
              Validation en cours...
            </div>
          )}
          
          {scanError && (
            <div className="bg-red-500/20 border border-red-500/40 text-red-300 text-sm rounded-xl p-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {scanError}
            </div>
          )}

          {scanSuccess && (
            <div className="bg-green-500/20 border border-green-500/40 text-green-300 text-sm rounded-xl p-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              {scanSuccess}
            </div>
          )}

          {!scanError && !scanSuccess && !processing && (
            <div className="text-center space-y-1">
              <p className="text-zinc-400 text-sm">🔍 Auto-focus sur le QR code</p>
              <p className="text-zinc-500 text-xs">Assurez-vous que le code est bien éclairé</p>
            </div>
          )}
          
          {scanError && !processing && (
            <button onClick={startScanner} className="w-full mt-2 bg-zinc-800 text-white font-semibold py-2 rounded-xl active:scale-95 transition">
              🔄 Réessayer
            </button>
          )}
        </div>
      </div>
    );
  }

  /* ── Render: Main ── */

  return (
    <div className="pb-24 space-y-4 max-w-lg mx-auto px-4 pt-2">

      {/* ─ Header ─ */}
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

      {/* ─ QR Code + Scan button ─ */}
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

      {/* ─ Lien de réservation (collapsible) ─ */}
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

      {/* ─ Tabs ─ */}
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

      {/* ════════════ TAB : RÉSERVATIONS ════════════ */}
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
              {filteredBookings.map(booking => {
                const isExpanded = expandedBookingId === booking.id;
                const hasExtra = !!(booking.barber_name || booking.note);
                return (
                  <div
                    key={booking.id}
                    className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden"
                  >
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
                    </div>

                    <div className="px-4 pb-3">
                      <select
                        value={booking.status}
                        onChange={e => handleStatusChange(booking.id, e.target.value as Booking['status'])}
                        disabled={updatingId === booking.id}
                        className="w-full bg-zinc-800 border border-zinc-700 text-white text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:border-zinc-500 appearance-none cursor-pointer"
                      >
                        <option value="pending">📋 En attente</option>
                        <option value="confirmed">✅ Confirmé</option>
                        <option value="done">🏁 Terminé</option>
                        <option value="cancelled">❌ Annulé</option>
                      </select>
                    </div>

                    {hasExtra && (
                      <>
                        <button
                          onClick={() => setExpandedBookingId(isExpanded ? null : booking.id)}
                          className="w-full flex items-center justify-center gap-1 py-2 border-t border-zinc-800 text-zinc-600 hover:text-zinc-400 text-xs transition"
                        >
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          {isExpanded ? 'Réduire' : 'Plus de détails'}
                        </button>
                        {isExpanded && (
                          <div className="px-4 pb-4 space-y-1.5 text-sm">
                            {booking.barber_name && (
                              <div className="flex gap-2">
                                <span className="text-zinc-500 shrink-0">Coiffeur :</span>
                                <span className="text-white">{booking.barber_name}</span>
                              </div>
                            )}
                            {booking.note && (
                              <div className="flex gap-2">
                                <span className="text-zinc-500 shrink-0">Note :</span>
                                <span className="text-zinc-300 italic">{booking.note}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════ TAB : PARAMÈTRES ════════════ */}
      {activeTab === 'settings' && (
        <div className="space-y-4">
          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 space-y-4">
            <h3 className="text-white font-bold flex items-center gap-2 text-sm">
              <Settings className="w-4 h-4 text-zinc-500" /> Informations générales
            </h3>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                Lien personnalisé <span className="text-red-400">*</span>
              </label>
              <div className="flex rounded-xl overflow-hidden border border-zinc-700 focus-within:border-white transition">
                <span className="px-3 py-3 bg-zinc-800 text-zinc-500 text-xs flex items-center shrink-0">
                  /booking/
                </span>
                <input
                  type="text"
                  value={slug}
                  onChange={e => { setSlug(e.target.value); setSlugError(''); }}
                  placeholder="mon-salon"
                  className="flex-1 min-w-0 px-3 py-3 bg-zinc-800 text-white text-sm focus:outline-none"
                />
              </div>
              {slugError && <p className="text-red-400 text-xs mt-1">{slugError}</p>}
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                Nom du salon <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={salonName}
                onChange={e => setSalonName(e.target.value)}
                placeholder="Aliou Coiffure"
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 focus:border-white rounded-xl text-white text-sm focus:outline-none transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Message d'accueil</label>
              <textarea
                rows={2}
                value={welcomeMsg}
                onChange={e => setWelcomeMsg(e.target.value)}
                placeholder="Réservez votre coupe en quelques secondes."
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 focus:border-white rounded-xl text-white text-sm focus:outline-none transition resize-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Intervalle (min)</label>
                <input
                  type="number"
                  min="30" max="180" step="30"
                  value={bookingInterval}
                  onChange={e => setBookingInterval(parseInt(e.target.value))}
                  className="w-full px-3 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Jours à l'avance</label>
                <input
                  type="number"
                  min="1" max="90"
                  value={advanceDays}
                  onChange={e => setAdvanceDays(parseInt(e.target.value))}
                  className="w-full px-3 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-2">
              {[
                { label: 'Page active', desc: 'Les clients peuvent réserver en ligne', value: isActive, toggle: () => setIsActive(!isActive) },
                { label: 'Paiement obligatoire', desc: 'Les clients paient avant de réserver', value: requirePayment, toggle: () => setRequirePayment(!requirePayment) },
              ].map(({ label, desc, value, toggle }) => (
                <div key={label} onClick={toggle} className="flex items-center justify-between bg-zinc-800 rounded-xl px-4 py-3 cursor-pointer active:scale-[0.99] transition">
                  <div>
                    <p className="text-white text-sm font-medium">{label}</p>
                    <p className="text-zinc-500 text-xs">{desc}</p>
                  </div>
                  {value ? <ToggleRight className="w-8 h-8 text-green-400" /> : <ToggleLeft className="w-8 h-8 text-zinc-600" />}
                </div>
              ))}
            </div>

            <div className="border-t border-zinc-800 pt-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-zinc-400 mb-1.5">
                <Wallet className="w-3.5 h-3.5 text-green-400" /> Lien Wave
              </label>
              <input
                type="url"
                placeholder="https://wave.com/pay/..."
                value={wavePaymentLink}
                onChange={e => setWavePaymentLink(e.target.value)}
                className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-white text-sm focus:outline-none focus:border-white transition"
              />
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-white font-bold flex items-center gap-2 text-sm mb-3">
              <Clock className="w-4 h-4 text-zinc-500" /> Horaires
            </h3>
            <div className="space-y-2">
              {DAYS.map(day => {
                const h = openingHours[day.key] ?? { open: '09:00', close: '18:00', closed: false };
                return (
                  <div key={day.key} className="bg-zinc-800 rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-white font-semibold text-sm w-8">{day.label}</span>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input type="checkbox" checked={!h.closed} onChange={e => updateOpeningHour(day.key, 'closed', !e.target.checked)} className="w-4 h-4 rounded accent-green-500" />
                        <span className="text-zinc-400 text-xs">Ouvert</span>
                      </label>
                      {!h.closed && (
                        <div className="flex items-center gap-1.5 ml-auto">
                          <input type="time" value={h.open} onChange={e => updateOpeningHour(day.key, 'open', e.target.value)} className="px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-xs w-[90px]" />
                          <span className="text-zinc-600 text-xs">–</span>
                          <input type="time" value={h.close} onChange={e => updateOpeningHour(day.key, 'close', e.target.value)} className="px-2 py-1.5 bg-zinc-700 border border-zinc-600 rounded-lg text-white text-xs w-[90px]" />
                        </div>
                      )}
                      {h.closed && <span className="ml-auto text-zinc-600 text-xs">Fermé</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <h3 className="text-white font-bold flex items-center gap-2 text-sm mb-1">
              <Calendar className="w-4 h-4 text-zinc-500" /> Type de réservation
            </h3>
            <p className="text-zinc-500 text-xs mb-3">Choisissez comment les clients réservent</p>

            <div className="space-y-2">
              <button onClick={() => setBookingType('normal')} className={`w-full flex items-center justify-between p-4 rounded-xl border-2 text-left transition ${bookingType === 'normal' ? 'border-emerald-500 bg-emerald-500/10' : 'border-zinc-700 bg-zinc-800'}`}>
                <div className="flex items-start gap-3">
                  <Scissors className="w-5 h-5 text-emerald-400 mt-0.5" />
                  <div>
                    <p className="text-white font-semibold text-sm">Réservation normale</p>
                    <p className="text-zinc-400 text-xs mt-0.5">Services depuis le catalogue ({catalogServices.length} dispo.)</p>
                  </div>
                </div>
                {bookingType === 'normal' && <Check className="w-4 h-4 text-emerald-400" />}
              </button>

              <button onClick={() => setBookingType('event')} className={`w-full flex items-center justify-between p-4 rounded-xl border-2 text-left transition ${bookingType === 'event' ? 'border-purple-500 bg-purple-500/10' : 'border-zinc-700 bg-zinc-800'}`}>
                <div className="flex items-start gap-3">
                  <Sparkles className="w-5 h-5 text-purple-400 mt-0.5" />
                  <div>
                    <p className="text-white font-semibold text-sm">Événementiel</p>
                    <p className="text-zinc-400 text-xs mt-0.5">Services personnalisés (mariages, anniversaires…)</p>
                  </div>
                </div>
                {bookingType === 'event' && <Check className="w-4 h-4 text-purple-400" />}
              </button>
            </div>

            {bookingType === 'event' && (
              <div className="mt-3 space-y-2">
                {eventServices.map(service => (
                  <div key={service.id} className="flex items-center gap-3 bg-zinc-800 rounded-xl p-3">
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium truncate">{service.name}</p>
                      <p className="text-zinc-400 text-xs">{service.price.toLocaleString()} CFA</p>
                    </div>
                    <button onClick={() => setEventServices(prev => prev.filter(s => s.id !== service.id))} className="w-8 h-8 flex items-center justify-center text-red-400 rounded-lg">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
                <div className="bg-zinc-800 rounded-xl p-3 space-y-2">
                  <input type="text" placeholder="Nom du service" value={newEventService.name} onChange={e => setNewEventService(p => ({ ...p, name: e.target.value }))} className="w-full px-3 py-2.5 bg-zinc-700 border border-zinc-600 rounded-xl text-white text-sm focus:outline-none focus:border-white" />
                  <div className="flex gap-2">
                    <input type="number" placeholder="Prix (CFA)" value={newEventService.price} onChange={e => setNewEventService(p => ({ ...p, price: e.target.value }))} className="flex-1 px-3 py-2.5 bg-zinc-700 border border-zinc-600 rounded-xl text-white text-sm focus:outline-none focus:border-white" />
                    <button onClick={addEventService} className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition shrink-0 active:scale-95">
                      <Plus className="w-4 h-4" /> Ajouter
                    </button>
                  </div>
                </div>
              </div>
            )}

            {bookingType === 'normal' && catalogServices.length > 0 && (
              <div className="mt-3 bg-zinc-800/50 rounded-xl p-3">
                <p className="text-zinc-500 text-xs mb-2">Services disponibles :</p>
                <div className="flex flex-wrap gap-1.5">
                  {catalogServices.map(s => <span key={s.id} className="text-xs px-2 py-1 bg-zinc-700 rounded-full text-zinc-300">{s.name} – {s.base_price.toLocaleString()} CFA</span>)}
                </div>
              </div>
            )}
          </section>

          <button onClick={handleSave} disabled={saving || !salonName.trim() || !slug.trim() || !bookingType} className="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-4 rounded-2xl hover:bg-zinc-100 active:scale-[0.98] transition disabled:opacity-40 text-base">
            {saving ? <><div className="animate-spin rounded-full h-4 w-4 border-2 border-black/30 border-t-black" /> Sauvegarde...</> : <><Check className="w-5 h-5" /> {settings ? 'Mettre à jour' : 'Créer ma page'}</>}
          </button>
        </div>
      )}
    </div>
  );
}