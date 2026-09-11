// src/components/BookingPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Scissors, Clock, Phone, User, Calendar, Check, AlertCircle,
  QrCode, RefreshCw, XCircle, Download, Loader, Sparkles, ArrowLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import QRCode from 'qrcode';

interface OpeningHour { open: string; close: string; closed: boolean; }
interface EventService { id: string; name: string; price: number; description?: string; }
interface Barber { id: string; name: string; photo: string; user_id: string; }
interface SalonSettings {
  id: string; slug: string; salon_name: string; welcome_message: string;
  logo_url: string | null; primary_color: string;
  opening_hours: Record<string, OpeningHour>; user_id: string;
  booking_interval_minutes: number; advance_booking_days: number;
  event_services?: EventService[];
}
interface BookingForm {
  client_name: string; client_phone: string; eventService: EventService | null;
  barberId: string | null; barberName: string; date: string; time: string; note: string;
  paymentMethod: 'wave' | 'orange_money' | null;
}
interface BookingPageProps { slug: string; }

function normalizeTime(time: string): string { return time.slice(0, 5); }

function generateTimeSlots(open: string, close: string, intervalMinutes: number, serviceDuration = 60): string[] {
  const slots: string[] = [];
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const openMin = toMin(open);
  const closeMin = toMin(close);
  const lastStart = closeMin - serviceDuration;
  let cur = openMin;
  while (cur <= lastStart) {
    const h = Math.floor(cur / 60), m = cur % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    cur += intervalMinutes;
  }
  return slots;
}

// ✅ device_id pour identifier l'utilisateur même sans compte
function getDeviceId(): string {
  let deviceId = localStorage.getItem('device_id');
  if (!deviceId) {
    deviceId = 'device_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('device_id', deviceId);
  }
  return deviceId;
}

const POLL_MS = 15000;
const PAYMENT_POLL_MS = 3000;
const MAX_PAYMENT_ATTEMPTS = 30; // 30 × 3s = 90s max
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const paydunyaMasterKey = import.meta.env.VITE_PAYDUNYA_MASTER_KEY as string | undefined;
const paydunyaPrivateKey = import.meta.env.VITE_PAYDUNYA_PRIVATE_KEY as string | undefined;
const paydunyaToken = import.meta.env.VITE_PAYDUNYA_TOKEN as string | undefined;
const baseUrl = import.meta.env.VITE_APP_URL || window.location.origin;

const FUNCTION_URL = `${supabaseUrl}/functions/v1/initiate-booking-payment`;

export function BookingPage({ slug }: BookingPageProps) {
  const [settings, setSettings] = useState<SalonSettings | null>(null);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof BookingForm, string>>>({});
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [submitError, setSubmitError] = useState('');

  const [step, setStep] = useState<'form' | 'pay' | 'waiting' | 'success'>('form');
  const [bookingData, setBookingData] = useState<any>(null);
  const [requestId, setRequestId] = useState<string | null>(null);
  const [paymentAttempts, setPaymentAttempts] = useState(0);
  const isSubmittingRef = useRef(false);
  const paymentWindowRef = useRef<Window | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const [form, setForm] = useState<BookingForm>({
    client_name: '', client_phone: '', eventService: null,
    barberId: null, barberName: '', date: '', time: '', note: '', paymentMethod: null,
  });

  useEffect(() => {
    const load = async () => {
      setLoadingSettings(true);
      try {
        const { data, error } = await supabase
          .from('booking_settings').select('*')
          .eq('slug', slug).eq('is_active', true).maybeSingle();

        if (error || !data) { setNotFound(true); return; }
        setSettings(data);

        if (data.user_id) {
          const { data: bb } = await supabase
            .from('barbers').select('id, name, photo, user_id').eq('user_id', data.user_id);
          if (bb?.length) setBarbers(bb);
        }
      } catch (err) {
        console.error(err);
        setNotFound(true);
      } finally {
        setLoadingSettings(false);
      }
    };
    load();
  }, [slug]);

  // ✅ Reprise après paiement
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeReq = params.get('request_id');
    if (!resumeReq) return;
    console.log('🔄 Reprise après paiement, request_id:', resumeReq);
    setRequestId(resumeReq);
    setStep('waiting');
  }, []);

  const refreshSlots = useCallback(async (silent = false) => {
    if (!form.date || !settings) return;
    if (!silent) setLoadingSlots(true);
    try {
      const day = new Date(form.date + 'T00:00:00').getDay();
      const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      const hours = settings.opening_hours[dayNames[day]];
      if (!hours || hours.closed) {
        setAvailableSlots([]); setBookedSlots([]); return;
      }
      const allSlots = generateTimeSlots(hours.open, hours.close, settings.booking_interval_minutes || 90, 60);

      const { data: bkgs } = await supabase
        .from('bookings').select('booking_time')
        .eq('salon_user_id', settings.user_id)
        .eq('booking_date', form.date)
        .not('status', 'eq', 'cancelled');

      const taken = (bkgs || []).map(b => normalizeTime(b.booking_time));
      setBookedSlots(taken);
      setAvailableSlots(allSlots.filter(s => !taken.includes(s)));
      if (form.time && taken.includes(form.time)) {
        setForm(prev => ({ ...prev, time: '' }));
      }
    } catch (err) { console.error(err); }
    finally { if (!silent) setLoadingSlots(false); }
  }, [form.date, settings, form.time]);

  useEffect(() => { refreshSlots(); }, [refreshSlots]);

  useEffect(() => {
    const id = setInterval(() => {
      if (form.date && settings && !loadingSlots) refreshSlots(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [form.date, settings, loadingSlots, refreshSlots]);

  // ✅ FONCTION CENTRALE : vérifier le statut du paiement (bookings OU booking_requests)
  const checkBookingStatus = useCallback(async (reqId: string): Promise<{ found: boolean; data?: any }> => {
    try {
      const { data: finalBooking, error: bookingsError } = await supabase
        .from('bookings')
        .select('*')
        .eq('request_id', reqId)
        .maybeSingle();

      if (bookingsError) {
        console.warn('⚠️ Erreur check bookings:', bookingsError.message);
      }

      if (finalBooking) {
        console.log('✅ Booking final trouvé:', finalBooking.id);
        return { found: true, data: finalBooking };
      }

      const { data: request, error: requestError } = await supabase
        .from('booking_requests')
        .select('*')
        .eq('id', reqId)
        .maybeSingle();

      if (requestError) {
        console.warn('⚠️ Erreur check booking_requests:', requestError.message);
      }

      if (request) {
        console.log('📋 Statut demande:', request.request_status, '| paiement:', request.payment_status);

        if (
          request.payment_status === 'paid' ||
          request.request_status === 'confirmed' ||
          request.request_status === 'paid'
        ) {
          console.log('💳 Demande payée, tentative de récupération du booking final...');
          await new Promise(resolve => setTimeout(resolve, 2000));

          const { data: finalRetry } = await supabase
            .from('bookings')
            .select('*')
            .eq('request_id', reqId)
            .maybeSingle();

          if (finalRetry) {
            return { found: true, data: finalRetry };
          }

          console.log('⚠️ Booking final non créé, utilisation de la demande comme fallback');
          return {
            found: true,
            data: {
              id: request.id,
              request_id: request.id,
              ticket_number: `REQ-${request.id.slice(0, 8).toUpperCase()}`,
              service_name: request.service_name,
              service_price: request.service_price,
              booking_date: request.booking_date,
              booking_time: request.booking_time,
              client_name: request.client_name,
              client_phone: request.client_phone,
              barber_name: request.barber_name,
              status: 'confirmed',
              is_fallback: true,
            },
          };
        }
      }

      return { found: false };
    } catch (err) {
      console.error('❌ Erreur checkBookingStatus:', err);
      return { found: false };
    }
  }, []);

  // ✅ ENREGISTRER dans l'historique (accessible par device_id)
  const saveToHistory = useCallback(async (booking: any, qrData: string) => {
    try {
      const deviceId = getDeviceId();
      const { data: { session } } = await supabase.auth.getSession();

      const ticketNumber = booking.ticket_number || `LC-${Date.now().toString().slice(-8)}`;

      const { error } = await supabase
        .from('booking_history')
        .upsert({
          request_id: requestId || booking.request_id || booking.id,
          booking_id: booking.is_fallback ? null : booking.id,
          device_id: deviceId,
          user_id: session?.user?.id || null,
          client_name: booking.client_name || form.client_name,
          client_phone: booking.client_phone || form.client_phone,
          salon_user_id: settings?.user_id || '',
          salon_name: settings?.salon_name || '',
          salon_slug: settings?.slug || '',
          service_name: booking.service_name,
          service_price: booking.service_price,
          barber_name: booking.barber_name || null,
          booking_date: booking.booking_date,
          booking_time: booking.booking_time,
          ticket_number: ticketNumber,
          qr_code_data: qrData,
          payment_status: 'paid',
        }, {
          onConflict: 'request_id',
          ignoreDuplicates: false,
        });

      if (error) {
        console.error('⚠️ Erreur sauvegarde historique:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
      } else {
        console.log('✅ Réservation sauvegardée dans l\'historique');
      }
    } catch (err) {
      console.error('❌ Erreur saveToHistory:', err);
    }
  }, [requestId, settings, form]);

  const showSuccessFor = useCallback(async (booking: any) => {
    const ticketNumber = booking.ticket_number || `LC-${Date.now().toString().slice(-8)}`;

    const qrData = JSON.stringify({
      booking_id: booking.id,
      ticket_number: ticketNumber,
      service: booking.service_name,
      date: booking.booking_date,
      time: booking.booking_time,
      client: booking.client_name,
      price: booking.service_price,
    });

    const qr = await QRCode.toDataURL(qrData.slice(0, 200), {
      width: 280, margin: 2, errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#FFFFFF' }
    }).catch(() => '');

    setQrCodeUrl(qr);

    const enrichedBooking = {
      ...booking,
      ticket_number: ticketNumber,
      salon_name: settings?.salon_name,
      salon_slug: settings?.slug,
    };

    setBookingData(enrichedBooking);

    await saveToHistory(enrichedBooking, qrData);

    setStep('success');
    window.history.replaceState({}, '', window.location.pathname);
  }, [settings, saveToHistory]);

  // ✅ Polling pour détecter la fin du paiement
  useEffect(() => {
    if (step !== 'waiting' || !requestId) return;

    console.log('⏳ Démarrage du polling pour:', requestId);
    let attempts = 0;
    let isCancelled = false;

    const poll = async () => {
      if (isCancelled) return;
      attempts++;
      setPaymentAttempts(attempts);
      console.log(`🔄 Tentative ${attempts}/${MAX_PAYMENT_ATTEMPTS}`);

      const result = await checkBookingStatus(requestId);

      if (result.found && result.data) {
        console.log('✅ Réservation confirmée !');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        await showSuccessFor(result.data);
        return;
      }

      if (attempts >= MAX_PAYMENT_ATTEMPTS) {
        console.log('⏰ Timeout du polling');
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        const fallbackBooking = {
          id: requestId,
          request_id: requestId,
          ticket_number: `LC-${Date.now().toString().slice(-8)}`,
          service_name: form.eventService?.name || 'Service réservé',
          service_price: form.eventService?.price || 0,
          booking_date: form.date,
          booking_time: form.time,
          client_name: form.client_name,
          client_phone: form.client_phone,
          barber_name: form.barberName,
          is_fallback: true,
        };
        await showSuccessFor(fallbackBooking);
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, PAYMENT_POLL_MS);

    return () => {
      isCancelled = true;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [step, requestId, checkBookingStatus, showSuccessFor, form]);

  const todayISO = new Date().toISOString().split('T')[0];
  const maxDateISO = (() => {
    if (!settings?.advance_booking_days) return todayISO;
    const d = new Date(); d.setDate(d.getDate() + settings.advance_booking_days);
    return d.toISOString().split('T')[0];
  })();

  const validate = (): boolean => {
    const e: Partial<Record<keyof BookingForm, string>> = {};
    if (!form.client_name?.trim()) e.client_name = 'Requis';
    if (!form.client_phone?.trim()) e.client_phone = 'Requis';
    if (!form.eventService) e.eventService = 'Choisissez un service';
    if (!form.barberId && barbers.length > 0) e.barberId = 'Choisissez un coiffeur';
    if (!form.date) e.date = 'Requis';
    if (!form.time) e.time = 'Requis';
    setErrors(e); setSubmitError('');
    return Object.keys(e).length === 0;
  };

  const goToPayment = () => {
    if (!validate() || !settings) return;
    setStep('pay');
  };

  const handlePay = async () => {
    if (isSubmittingRef.current) return;
    if (!form.paymentMethod) { setSubmitError('Choisissez un moyen de paiement'); return; }
    if (!settings || !form.eventService) return;

    const price = form.eventService.price;
    const name = form.eventService.name;

    if (!supabaseUrl || !paydunyaMasterKey || !paydunyaPrivateKey || !paydunyaToken) {
      setSubmitError('Configuration de paiement manquante côté application.');
      return;
    }

    const paymentWindow = window.open('', '_blank');
    paymentWindowRef.current = paymentWindow;

    isSubmittingRef.current = true;
    setSubmitError('');
    setSubmitting(true);

    try {
      const { data: conflict } = await supabase
        .from('bookings').select('id')
        .eq('salon_user_id', settings.user_id)
        .eq('booking_date', form.date)
        .eq('booking_time', form.time)
        .not('status', 'eq', 'cancelled')
        .maybeSingle();

      if (conflict) {
        if (paymentWindow) paymentWindow.close();
        await refreshSlots(false);
        setSubmitError(`⚠️ Le créneau ${form.time} vient d'être pris.`);
        setForm(prev => ({ ...prev, time: '' }));
        setStep('form');
        return;
      }

      const { data: reqRow, error } = await supabase
        .from('booking_requests')
        .insert({
          salon_user_id: settings.user_id,
          client_name: form.client_name.trim(),
          client_phone: form.client_phone.trim(),
          service_name: name,
          service_price: price,
          barber_name: form.barberName || null,
          booking_date: form.date,
          booking_time: form.time,
          note: form.note.trim() || null,
          request_status: 'pending',
          payment_status: 'pending',
        })
        .select()
        .single();

      if (error || !reqRow) {
        console.error('Erreur création demande:', error);
        throw new Error(error?.message || 'Erreur création de la demande');
      }

      console.log('✅ Demande de réservation créée:', reqRow.id);
      setRequestId(reqRow.id);

      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          request_id: reqRow.id,
          phone: form.client_phone.replace(/\s/g, '').replace(/^\+221/, ''),
          method: form.paymentMethod,
          customer_name: form.client_name,
          customer_email: '',
          description: `Réservation ${name}`,
          return_url: `${baseUrl}/booking/${slug}?request_id=${reqRow.id}`,
          cancel_url: `${baseUrl}/booking/${slug}`,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error('❌ Erreur fonction Edge:', errorText);
        throw new Error(`Erreur serveur: ${res.status} - ${errorText}`);
      }

      const data = await res.json();

      if (data.success && data.invoice_url) {
        if (paymentWindow) {
          paymentWindow.location.href = data.invoice_url;
        } else {
          window.location.href = data.invoice_url;
          return;
        }
        setStep('waiting');
        return;
      }

      throw new Error(data.error || "Erreur lors de l'initiation du paiement");
    } catch (e: any) {
      console.error('❌ Erreur handlePay:', e);
      setSubmitError(e.message ?? 'Erreur lors du paiement');
      if (paymentWindow) paymentWindow.close();
      setStep('form');
    } finally {
      setSubmitting(false);
      isSubmittingRef.current = false;
    }
  };

  const downloadQR = () => {
    if (!qrCodeUrl || !bookingData) return;
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `reservation-${bookingData.ticket_number}.png`;
    link.click();
  };

  const resetForm = () => {
    setForm({ client_name: '', client_phone: '', eventService: null, barberId: null, barberName: '', date: '', time: '', note: '', paymentMethod: null });
    setBookingData(null); setStep('form'); setQrCodeUrl(''); setRequestId(null);
    setSubmitError(''); setErrors({}); setPaymentAttempts(0);
  };

  const forceCheckNow = async () => {
    if (!requestId) return;
    console.log('🔄 Vérification manuelle demandée');
    setSubmitError('');
    const result = await checkBookingStatus(requestId);
    if (result.found && result.data) {
      await showSuccessFor(result.data);
    } else {
      setSubmitError('Paiement pas encore confirmé. Patientez quelques secondes et réessayez.');
      setTimeout(() => setSubmitError(''), 3000);
    }
  };

  const allSlots = [...new Set([...availableSlots, ...bookedSlots])].sort();
  const noSlots = !!(form.date && availableSlots.length === 0 && !loadingSlots);
  const isDisabled = submitting || (form.date && noSlots) || (!form.barberId && barbers.length > 0) || !form.time;

  const formatCFA = (v: number) => v.toLocaleString('fr-FR') + ' CFA';

  if (loadingSettings) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-4" />
          <p className="text-zinc-500 text-sm">Chargement...</p>
        </div>
      </div>
    );
  }

  if (notFound || !settings) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <Scissors className="w-16 h-16 text-zinc-700 mx-auto mb-4" />
          <h2 className="text-white text-2xl font-bold mb-2">salon inactif</h2>
          <p className="text-zinc-500 text-sm">désolé, ce salon n'a pas encore activé son système de réservation.</p>
        </div>
      </div>
    );
  }

  // ✅ ÉTAPE ATTENTE
  if (step === 'waiting') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <Loader className="w-12 h-12 text-white mx-auto mb-6 animate-spin" />
          <h2 className="text-white text-2xl font-bold mb-3">Paiement en attente</h2>
          <p className="text-zinc-400 text-sm leading-relaxed mb-4">
            Confirmez le paiement dans l'onglet ouvert.<br />
            Cette page se met à jour automatiquement.
          </p>
          <p className="text-zinc-600 text-xs mb-6">
            Vérification {paymentAttempts}/{MAX_PAYMENT_ATTEMPTS}
          </p>

          {submitError && (
            <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-4 text-red-300 text-sm">
              {submitError}
            </div>
          )}

          <button
            onClick={forceCheckNow}
            className="w-full bg-white text-black font-bold py-3 rounded-xl text-sm hover:bg-zinc-200 transition mb-3"
          >
            J'ai payé, vérifier maintenant
          </button>

          <button
            onClick={() => {
              resetForm();
              window.history.replaceState({}, '', window.location.pathname);
            }}
            className="text-zinc-500 hover:text-white text-xs transition"
          >
            Annuler et recommencer
          </button>
        </div>
      </div>
    );
  }

  if (step === 'success' && bookingData) {
    const dateFmt = new Date(bookingData.booking_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // ✅ Taux passé à 15 %
    const netAmount = bookingData.net_amount ?? Math.round(bookingData.service_price * 0.85);

    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="max-w-sm w-full">
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
            <div className="bg-black text-white text-center py-6 px-4">
              <div className="text-2xl font-black tracking-widest">LE COUPE</div>
              <div className="text-xs text-zinc-400 tracking-widest mt-1">{bookingData.salon_name}</div>
              <div className="inline-block mt-3 border-2 border-white px-4 py-2 text-lg font-black tracking-widest">
                {bookingData.ticket_number}
              </div>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-green-700 text-lg font-semibold mb-1">✅ Paiement confirmé</p>
                <p className="text-green-600 text-sm">Votre réservation est validée automatiquement</p>
              </div>

              {qrCodeUrl && (
                <div className="bg-white rounded-xl p-4 text-center border-2 border-blue-300 shadow-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <QrCode className="w-5 h-5 text-blue-600" />
                    <p className="text-xs font-semibold text-blue-600">QR Code à présenter au salon</p>
                  </div>
                  <img src={qrCodeUrl} alt="QR Code" className="w-48 h-48 mx-auto border-2 border-blue-300 rounded-lg" />

                  <div className="mt-3 bg-zinc-50 border border-zinc-200 rounded-lg py-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Montant reçu par le salon</p>
                    <p className="text-black font-black text-xl">{formatCFA(netAmount)}</p>
                    <p className="text-zinc-400 text-[10px]">(après 15% de frais de service)</p>
                  </div>

                  <button
                    onClick={downloadQR}
                    className="w-full mt-3 flex items-center justify-center gap-2 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-sm hover:bg-blue-700 transition"
                  >
                    <Download className="w-4 h-4" /> Télécharger le QR code
                  </button>
                </div>
              )}

              <hr className="border-dashed border-zinc-300" />

              <div>
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Service</p>
                <p className="font-black text-base mt-0.5">{bookingData.service_name}</p>
                <p className="text-zinc-500 text-sm">{bookingData.service_price?.toLocaleString()} CFA</p>
              </div>

              {bookingData.barber_name && (
                <div>
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Coiffeur</p>
                  <p className="font-bold text-sm mt-0.5">{bookingData.barber_name}</p>
                </div>
              )}

              <hr className="border-dashed border-zinc-300" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Date</p>
                  <p className="font-bold text-sm mt-0.5">{dateFmt}</p>
                </div>
                <div>
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Heure</p>
                  <p className="font-black text-xl mt-0.5">{bookingData.booking_time?.slice(0, 5)}</p>
                </div>
              </div>
            </div>

            <div className="bg-zinc-100 p-4 border-t-2 border-dashed border-zinc-300">
              <button
                onClick={resetForm}
                className="w-full bg-black text-white font-bold py-3 rounded-xl text-sm hover:bg-zinc-800 transition"
              >
                Nouvelle réservation
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'pay' && settings && form.eventService) {
    const price = form.eventService.price;

    return (
      <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-4">
        <div className="max-w-sm w-full">
          <button onClick={() => setStep('form')} className="text-zinc-400 mb-6 text-sm">← Retour</button>
          <h2 className="text-2xl font-bold mb-2">Paiement</h2>
          <p className="text-zinc-400 text-sm mb-6">Réservation {form.eventService.name} — {formatCFA(price)}</p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {[
              { id: 'wave', label: 'Wave' },
              { id: 'orange_money', label: 'Orange Money' },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setForm(prev => ({ ...prev, paymentMethod: m.id as any }))}
                className={`border-2 rounded-xl p-4 font-bold transition ${
                  form.paymentMethod === m.id ? 'border-white text-white' : 'border-zinc-700 text-zinc-400'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {submitError && (
            <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 mb-4 text-red-300 text-sm">{submitError}</div>
          )}

          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mb-6 flex justify-between items-center">
            <span className="text-zinc-400 text-sm">Total à payer</span>
            <span className="text-white text-xl font-bold">{formatCFA(price)}</span>
          </div>

          <button
            onClick={handlePay}
            disabled={submitting || !form.paymentMethod}
            className="w-full bg-white text-black py-4 rounded-xl font-bold hover:bg-zinc-200 transition disabled:opacity-50"
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2"><Loader className="w-4 h-4 animate-spin" /> Traitement...</span>
            ) : `Payer ${formatCFA(price)}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Formulaire
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="bg-black border-b border-zinc-800 px-4 py-4 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          {settings.logo_url ? (
            <img src={settings.logo_url} alt="Logo" className="w-12 h-12 rounded-2xl object-cover border border-zinc-700" />
          ) : (
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shrink-0">
              <Scissors className="w-6 h-6 text-black" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-black text-lg tracking-tight truncate">{settings.salon_name}</h1>
            <p className="text-zinc-400 text-xs truncate">{settings.welcome_message || 'Réservez votre coupe'}</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-5 max-w-lg mx-auto">
        {submitError && (
          <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm font-medium">{submitError}</p>
          </div>
        )}

        {!settings.event_services?.length ? (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
            <p className="text-yellow-400 font-semibold text-sm">Aucun service disponible pour le moment</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-3">Service <span className="text-red-400">*</span></label>
              <div className="flex flex-wrap gap-3 justify-center">
                {settings.event_services.map((s) => {
                  const isSelected = form.eventService?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setForm(prev => ({ ...prev, eventService: prev.eventService?.id === s.id ? null : s, time: '' }));
                        setErrors(prev => ({ ...prev, eventService: undefined }));
                      }}
                      className={`flex flex-col items-center gap-1 p-3 rounded-full w-24 h-24 border-2 transition relative ${
                        isSelected ? 'border-green-500 bg-green-500/20' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isSelected ? 'bg-green-500/30' : 'bg-zinc-800'}`}>
                        <Sparkles className={`w-5 h-5 ${isSelected ? 'text-green-400' : 'text-zinc-400'}`} />
                      </div>
                      <p className={`text-[10px] font-semibold text-center leading-tight ${isSelected ? 'text-green-400' : 'text-white'}`}>{s.name}</p>
                      <p className={`text-[9px] font-bold ${isSelected ? 'text-green-400' : 'text-zinc-400'}`}>{s.price.toLocaleString()} CFA</p>
                      {isSelected && <Check className="w-3 h-3 text-green-400 absolute -top-1 -right-1" />}
                    </button>
                  );
                })}
              </div>
              {errors.eventService && <p className="text-red-400 text-xs mt-2 text-center">{errors.eventService}</p>}
            </div>

            {barbers.length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-3">Coiffeur <span className="text-red-400">*</span></label>
                <div className="flex flex-wrap gap-3 justify-center">
                  {barbers.map((b) => {
                    const isSelected = form.barberId === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) setForm(prev => ({ ...prev, barberId: null, barberName: '' }));
                          else setForm(prev => ({ ...prev, barberId: b.id, barberName: b.name }));
                          setErrors(prev => ({ ...prev, barberId: undefined }));
                        }}
                        className={`flex flex-col items-center gap-1 p-2 rounded-full w-20 h-20 border-2 transition relative ${
                          isSelected ? 'border-green-500 bg-green-500/20' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                        }`}
                      >
                        <div className="w-14 h-14 rounded-full overflow-hidden bg-zinc-700 border-2 border-zinc-600">
                          {b.photo?.trim() ? (
                            <img src={b.photo} alt={b.name} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-2xl">💈</div>
                          )}
                        </div>
                        <p className={`text-[10px] font-semibold text-center ${isSelected ? 'text-green-400' : 'text-white'}`}>{b.name}</p>
                        {isSelected && <Check className="w-3 h-3 text-green-400 absolute -top-1 -right-1" />}
                      </button>
                    );
                  })}
                </div>
                {errors.barberId && <p className="text-red-400 text-xs mt-2 text-center">{errors.barberId}</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Nom complet <span className="text-red-400">*</span></label>
              <input
                type="text" placeholder="Votre nom" value={form.client_name}
                onChange={e => { setForm(prev => ({ ...prev, client_name: e.target.value })); setErrors(prev => ({ ...prev, client_name: undefined })); }}
                className={`w-full px-4 py-3 bg-zinc-900 border rounded-xl text-white focus:outline-none transition text-base ${errors.client_name ? 'border-red-500' : 'border-zinc-700 focus:border-white'}`}
              />
              {errors.client_name && <p className="text-red-400 text-xs mt-1">{errors.client_name}</p>}
            </div>

            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Téléphone <span className="text-red-400">*</span></label>
              <input
                type="tel" placeholder="77 000 00 00" value={form.client_phone}
                onChange={e => { setForm(prev => ({ ...prev, client_phone: e.target.value })); setErrors(prev => ({ ...prev, client_phone: undefined })); }}
                className={`w-full px-4 py-3 bg-zinc-900 border rounded-xl text-white focus:outline-none transition text-base ${errors.client_phone ? 'border-red-500' : 'border-zinc-700 focus:border-white'}`}
              />
              {errors.client_phone && <p className="text-red-400 text-xs mt-1">{errors.client_phone}</p>}
            </div>

            <div className="w-full">
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Date <span className="text-red-400">*</span></label>
              <input
                type="date" min={todayISO} max={maxDateISO} value={form.date}
                onChange={e => { setForm(prev => ({ ...prev, date: e.target.value, time: '' })); setErrors(prev => ({ ...prev, date: undefined })); }}
                className="w-full px-4 py-3 bg-zinc-900 border rounded-xl text-white focus:outline-none transition text-base [color-scheme:dark] border-zinc-700 focus:border-white"
              />
              {errors.date && <p className="text-red-400 text-xs mt-1">{errors.date}</p>}
            </div>

            {form.date && (
              <div className="w-full">
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <label className="text-sm font-semibold text-zinc-300">Heure <span className="text-red-400">*</span></label>
                  <button type="button" onClick={() => refreshSlots(false)} disabled={loadingSlots} className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition px-2 py-1 rounded-lg bg-zinc-800/50">
                    <RefreshCw className={`w-3 h-3 ${loadingSlots ? 'animate-spin' : ''}`} /> Actualiser
                  </button>
                </div>

                {loadingSlots ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto" />
                  </div>
                ) : allSlots.length === 0 ? (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 text-center">
                    <p className="text-yellow-400 text-sm">Aucun créneau disponible ce jour</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {allSlots.map((slot) => {
                      const isBooked = bookedSlots.includes(slot);
                      const isSelected = form.time === slot;
                      return (
                        <button
                          key={slot} type="button"
                          onClick={() => { if (!isBooked) { setForm(prev => ({ ...prev, time: slot })); setErrors(prev => ({ ...prev, time: undefined })); } }}
                          disabled={isBooked}
                          className={`w-full py-3 px-2 rounded-xl text-sm font-medium transition-all duration-150 ${
                            isSelected ? 'bg-green-500 text-black font-bold shadow-lg shadow-green-500/20 scale-[0.98]'
                            : isBooked ? 'bg-red-500/10 border border-red-500/30 text-red-400/50 cursor-not-allowed line-through'
                            : 'bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 active:scale-95'
                          }`}
                        >
                          <span className="block">{slot}</span>
                          {isBooked && <span className="block text-[10px] mt-0.5">indisponible</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.time && <p className="text-red-400 text-xs mt-2">{errors.time}</p>}
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Note (optionnelle)</label>
              <textarea rows={3} placeholder="Précisions..." value={form.note}
                onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 focus:border-white rounded-xl text-white focus:outline-none transition resize-none text-base" />
            </div>

            {form.eventService && form.date && form.time && (barbers.length === 0 || form.barberName) && (
              <div className="bg-gradient-to-br from-zinc-900 to-zinc-800 border border-zinc-700 rounded-2xl p-4 mt-2">
                <p className="text-zinc-400 text-[10px] uppercase tracking-wider mb-3">Résumé</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-zinc-400">Service</span><span className="text-white font-semibold">{form.eventService.name}</span></div>
                  {form.barberName && <div className="flex justify-between"><span className="text-zinc-400">Coiffeur</span><span className="text-white">{form.barberName}</span></div>}
                  <div className="flex justify-between"><span className="text-zinc-400">Date</span><span className="text-white">{new Date(form.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span></div>
                  <div className="flex justify-between"><span className="text-zinc-400">Heure</span><span className="text-green-400 font-bold">{form.time}</span></div>
                  <div className="border-t border-zinc-700 my-2"></div>
                  <div className="flex justify-between text-base"><span className="text-zinc-300 font-semibold">Total à payer</span><span className="text-white font-black text-lg">{form.eventService.price.toLocaleString()} CFA</span></div>
                </div>
              </div>
            )}

            <button
              type="button" onClick={goToPayment} disabled={!!isDisabled}
              className="w-full bg-white text-black font-bold py-4 rounded-2xl text-base hover:bg-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-4"
            >
              Continuer vers le paiement <Check className="w-5 h-5" />
            </button>

            <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3">
              <p className="text-blue-400 text-xs text-center">
                ⚠️ Votre réservation sera confirmée automatiquement dès le paiement validé.
              </p>
            </div>
          </div>
        )}

        <p className="text-center text-zinc-600 text-[10px] pb-4 pt-2">
          Propulsé par <span className="text-white font-semibold">LE COUPE</span>
        </p>
      </div>
    </div>
  );
}