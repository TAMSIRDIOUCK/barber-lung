// src/components/BookingPage.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Scissors, Clock, Phone, User, Calendar, Check, AlertCircle,
  QrCode, RefreshCw, XCircle, Download, Loader, Sparkles, ArrowLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkSalonSubscription, type SubscriptionState } from '../lib/subscription';
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
const MAX_PAYMENT_ATTEMPTS = 30;
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

  // 🔥 État de l'abonnement du salon
  const [subscription, setSubscription] = useState<SubscriptionState | null>(null);

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
          // 🔥 Vérifier l'abonnement du salon AVANT tout
          const sub = await checkSalonSubscription(data.user_id);
          setSubscription(sub);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const resumeReq = params.get('request_id');
    if (!resumeReq) return;
    setRequestId(resumeReq);
    setStep('waiting');
  }, []);

  // 🔥 Rafraîchir les créneaux — FILTRÉS STRICTEMENT PAR COIFFEUR
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

      let taken: string[] = [];

      if (form.barberId) {
        const { data: bkgs, error } = await supabase
          .from('bookings')
          .select('booking_time, barber_id')
          .eq('salon_user_id', settings.user_id)
          .eq('booking_date', form.date)
          .eq('barber_id', form.barberId)
          .not('status', 'eq', 'cancelled');

        if (error) console.warn('Erreur chargement créneaux:', error.message);
        taken = (bkgs || []).map(b => normalizeTime(b.booking_time));
      }

      setBookedSlots(taken);
      setAvailableSlots(allSlots.filter(s => !taken.includes(s)));
      if (form.time && taken.includes(form.time)) {
        setForm(prev => ({ ...prev, time: '' }));
      }
    } catch (err) { console.error(err); }
    finally { if (!silent) setLoadingSlots(false); }
  }, [form.date, settings, form.time, form.barberId]);

  useEffect(() => { refreshSlots(); }, [refreshSlots]);

  useEffect(() => {
    const id = setInterval(() => {
      if (form.date && settings && !loadingSlots) refreshSlots(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [form.date, settings, loadingSlots, refreshSlots]);

  const checkBookingStatus = useCallback(async (reqId: string): Promise<{ found: boolean; data?: any }> => {
    try {
      const { data: finalBooking, error: bookingsError } = await supabase
        .from('bookings').select('*').eq('request_id', reqId).maybeSingle();

      if (bookingsError) console.warn('⚠️ Erreur check bookings:', bookingsError.message);

      if (finalBooking) return { found: true, data: finalBooking };

      const { data: request, error: requestError } = await supabase
        .from('booking_requests').select('*').eq('id', reqId).maybeSingle();

      if (requestError) console.warn('⚠️ Erreur check booking_requests:', requestError.message);

      if (request) {
        if (
          request.payment_status === 'paid' ||
          request.request_status === 'confirmed' ||
          request.request_status === 'paid'
        ) {
          await new Promise(resolve => setTimeout(resolve, 2000));

          const { data: finalRetry } = await supabase
            .from('bookings').select('*').eq('request_id', reqId).maybeSingle();

          if (finalRetry) return { found: true, data: finalRetry };

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
              barber_id: request.barber_id || form.barberId,
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
  }, [form.barberId]);

  const saveToHistory = useCallback(async (booking: any, qrData: string) => {
    try {
      const deviceId = getDeviceId();
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;
      const ticketNumber = booking.ticket_number || `LC-${Date.now().toString().slice(-8)}`;

      console.log('💾 Sauvegarde dans booking_history:', {
        device_id: deviceId,
        user_id: userId,
        ticket: ticketNumber,
        barber_id: booking.barber_id || form.barberId,
      });

      const { data, error } = await supabase
        .from('booking_history')
        .upsert({
          request_id: requestId || booking.request_id || booking.id,
          booking_id: booking.is_fallback ? null : booking.id,
          device_id: deviceId,
          user_id: userId,
          client_name: booking.client_name || form.client_name,
          client_phone: booking.client_phone || form.client_phone,
          salon_user_id: settings?.user_id || '',
          salon_name: settings?.salon_name || '',
          salon_slug: settings?.slug || '',
          service_name: booking.service_name,
          service_price: booking.service_price,
          barber_name: booking.barber_name || null,
          barber_id: booking.barber_id || form.barberId || null,
          booking_date: booking.booking_date,
          booking_time: booking.booking_time,
          ticket_number: ticketNumber,
          qr_code_data: qrData,
          payment_status: 'paid',
        }, { onConflict: 'request_id', ignoreDuplicates: false })
        .select();

      if (error) {
        console.error('⚠️ Erreur sauvegarde historique:', error);
      } else {
        console.log('✅ Historique sauvegardé:', data);
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
      barber_id: booking.barber_id || form.barberId,
      barber_name: booking.barber_name || form.barberName,
    };

    setBookingData(enrichedBooking);
    await saveToHistory(enrichedBooking, qrData);

    supabase.functions.invoke('send-booking-confirmation', {
      body: { record: enrichedBooking },
    }).catch((err) => console.error('Erreur envoi SMS confirmation:', err));

    setStep('success');
    window.history.replaceState({}, '', window.location.pathname);
  }, [settings, saveToHistory, form]);

  useEffect(() => {
    if (step !== 'waiting' || !requestId) return;

    let attempts = 0;
    let isCancelled = false;

    const poll = async () => {
      if (isCancelled) return;
      attempts++;
      setPaymentAttempts(attempts);

      const result = await checkBookingStatus(requestId);

      if (result.found && result.data) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        await showSuccessFor(result.data);
        return;
      }

      if (attempts >= MAX_PAYMENT_ATTEMPTS) {
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
          barber_id: form.barberId,
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
    if (subscription && !subscription.isActive) {
      setSubmitError('⛔ Les réservations sont désactivées pour ce salon (abonnement inactif).');
      return;
    }
    setStep('pay');
  };

  const handlePay = async () => {
    if (isSubmittingRef.current) return;
    if (!form.paymentMethod) { setSubmitError('Choisissez un moyen de paiement'); return; }
    if (!settings || !form.eventService) return;

    // 🔥 RE-VÉRIFIER L'ABONNEMENT AVANT PAIEMENT (anti-contournement)
    const sub = await checkSalonSubscription(settings.user_id);
    if (!sub.isActive) {
      setSubmitError(
        `⛔ Les réservations sont désactivées pour ce salon (${sub.reason || 'abonnement inactif'}).`
      );
      setStep('form');
      return;
    }

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
      // 🔥 Vérifier le conflit STRICTEMENT PAR COIFFEUR
      if (form.barberId) {
        const { data: conflict } = await supabase
          .from('bookings')
          .select('id')
          .eq('salon_user_id', settings.user_id)
          .eq('booking_date', form.date)
          .eq('booking_time', form.time)
          .eq('barber_id', form.barberId)
          .not('status', 'eq', 'cancelled')
          .maybeSingle();

        if (conflict) {
          if (paymentWindow) paymentWindow.close();
          await refreshSlots(false);
          setSubmitError(`⚠️ Le créneau ${form.time} vient d'être pris pour ce coiffeur.`);
          setForm(prev => ({ ...prev, time: '' }));
          setStep('form');
          return;
        }
      }

      // 🔥 Récupérer device_id + user_id AVANT l'insert
      const deviceId = getDeviceId();
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id || null;

      // 🔥 Sauvegarder le téléphone pour fallback dans BookingHistoryPage
      localStorage.setItem('last_client_phone', form.client_phone);
      localStorage.setItem('last_device_id', deviceId);

      console.log('💾 Insertion booking_requests:', {
        device_id: deviceId,
        user_id: userId,
        barber_id: form.barberId,
      });

      // 🔥 Créer la demande AVEC device_id + user_id + barber_id
      const { data: reqRow, error } = await supabase
        .from('booking_requests')
        .insert({
          salon_user_id: settings.user_id,
          client_name: form.client_name.trim(),
          client_phone: form.client_phone.trim(),
          service_name: name,
          service_price: price,
          barber_id: form.barberId || null,
          barber_name: form.barberName || null,
          booking_date: form.date,
          booking_time: form.time,
          note: form.note.trim() || null,
          request_status: 'pending',
          payment_status: 'pending',
          device_id: deviceId,
          user_id: userId,
        })
        .select()
        .single();

      if (error || !reqRow) {
        throw new Error(error?.message || 'Erreur création de la demande');
      }

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
  const noSlots = !!(form.date && form.barberId && availableSlots.length === 0 && !loadingSlots);
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

  // 🔥 BLOQUER SI ABONNEMENT INACTIF (avant tout autre écran)
  if (subscription && !subscription.isActive) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h2 className="text-white text-2xl font-bold mb-2">Réservations indisponibles</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Les réservations en ligne de{' '}
            <strong className="text-white">{settings.salon_name}</strong>{' '}
            sont temporairement désactivées.
          </p>
          <p className="text-zinc-600 text-xs mt-3">
            {subscription.reason || 'Abonnement du salon inactif.'}
          </p>
          <p className="text-zinc-600 text-xs mt-1">
            Contactez le salon directement pour réserver.
          </p>
        </div>
      </div>
    );
  }

  if (step === 'waiting') {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="text-center max-w-sm w-full">
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
    const dateFmt = new Date(bookingData.booking_date).toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });

    const netAmount = bookingData.net_amount ?? Math.round(bookingData.service_price * 0.85);

    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-3 sm:p-4">
        <div className="max-w-sm w-full">
          <div className="bg-white rounded-2xl overflow-hidden shadow-2xl">
            <div className="bg-black text-white text-center py-5 sm:py-6 px-4">
              <div className="text-xl sm:text-2xl font-black tracking-widest">LE COUPE</div>
              <div className="text-[10px] sm:text-xs text-zinc-400 tracking-widest mt-1 break-words">
                {bookingData.salon_name}
              </div>
              <div className="inline-block mt-3 border-2 border-white px-3 sm:px-4 py-1.5 sm:py-2 text-base sm:text-lg font-black tracking-widest">
                {bookingData.ticket_number}
              </div>
            </div>
            <div className="px-4 sm:px-6 py-4 sm:py-5 space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 sm:p-4 text-center">
                <p className="text-green-700 text-base sm:text-lg font-semibold mb-1">✅ Paiement confirmé</p>
                <p className="text-green-600 text-xs sm:text-sm">Votre réservation est validée automatiquement</p>
              </div>

              {qrCodeUrl && (
                <div className="bg-white rounded-xl p-3 sm:p-4 text-center border-2 border-blue-300 shadow-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <QrCode className="w-5 h-5 text-blue-600" />
                    <p className="text-[10px] sm:text-xs font-semibold text-blue-600">QR Code à présenter au salon (faites une capture)</p>
                  </div>
                  <img
                    src={qrCodeUrl}
                    alt="QR Code"
                    className="w-40 h-40 sm:w-48 sm:h-48 mx-auto border-2 border-blue-300 rounded-lg"
                  />

                  <div className="mt-3 bg-zinc-50 border border-zinc-200 rounded-lg py-2 px-2">
                    <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Montant reçu par le salon</p>
                    <p className="text-black font-black text-lg sm:text-xl break-words">{formatCFA(netAmount)}</p>
                    <p className="text-zinc-400 text-[10px]">(après 15% de frais de service)</p>
                  </div>
                </div>
              )}

              <hr className="border-dashed border-zinc-300" />

              <div>
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Service</p>
                <p className="font-black text-base mt-0.5 break-words">{bookingData.service_name}</p>
                <p className="text-zinc-500 text-sm">{bookingData.service_price?.toLocaleString()} CFA</p>
              </div>

              {bookingData.barber_name && (
                <div>
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Coiffeur</p>
                  <p className="font-bold text-sm mt-0.5 break-words">{bookingData.barber_name}</p>
                </div>
              )}

              <hr className="border-dashed border-zinc-300" />

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="min-w-0">
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Date</p>
                  <p className="font-bold text-sm break-words">{dateFmt}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Heure</p>
                  <p className="font-bold text-sm">{bookingData.booking_time}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Client</p>
                <p className="font-bold text-sm break-words">{bookingData.client_name}</p>
                <p className="text-zinc-500 text-xs">{bookingData.client_phone}</p>
              </div>

              <button
                onClick={downloadQR}
                disabled={!qrCodeUrl}
                className="w-full bg-black text-white py-3 rounded-xl font-semibold text-sm hover:bg-zinc-800 transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> Télécharger le QR Code
              </button>

              <button
                onClick={resetForm}
                className="w-full border-2 border-black text-black py-3 rounded-xl font-semibold text-sm hover:bg-black hover:text-white transition"
              >
                Faire une autre réservation
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP = 'form' OU 'pay'
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-zinc-950 pb-24">
      <div className="max-w-lg mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          {step === 'pay' ? (
            <button onClick={() => setStep('form')} className="p-2 -ml-2 text-white hover:bg-zinc-800 rounded-lg transition">
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : null}
          <div className="flex-1 min-w-0">
            <h1 className="text-white text-xl font-bold truncate">{settings.salon_name}</h1>
            <p className="text-zinc-500 text-xs truncate">{settings.welcome_message}</p>
          </div>
        </div>

        {/* STEP: FORM */}
        {step === 'form' && (
          <div className="space-y-5">
            {/* Service */}
            <div>
              <label className="text-white text-sm font-semibold mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Choisissez votre service
              </label>
              <div className="grid gap-2">
                {(settings.event_services || []).map((srv) => (
                  <button
                    key={srv.id}
                    onClick={() => setForm(prev => ({ ...prev, eventService: srv }))}
                    className={`text-left p-4 rounded-xl border-2 transition ${
                      form.eventService?.id === srv.id
                        ? 'border-white bg-zinc-800'
                        : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm break-words">{srv.name}</p>
                        {srv.description && (
                          <p className="text-zinc-400 text-xs mt-0.5 break-words">{srv.description}</p>
                        )}
                      </div>
                      <p className="text-white font-black text-base flex-shrink-0">{formatCFA(srv.price)}</p>
                    </div>
                  </button>
                ))}
              </div>
              {errors.eventService && <p className="text-red-400 text-xs mt-1">{errors.eventService}</p>}
            </div>

            {/* Barber */}
            {barbers.length > 0 && (
              <div>
                <label className="text-white text-sm font-semibold mb-2 flex items-center gap-2">
                  <User className="w-4 h-4" /> Choisissez votre coiffeur
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {barbers.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => setForm(prev => ({ ...prev, barberId: b.id, barberName: b.name }))}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 transition ${
                        form.barberId === b.id
                          ? 'border-white bg-zinc-800'
                          : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'
                      }`}
                    >
                      <div className="w-10 h-10 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                        {b.photo ? (
                          <img src={b.photo} alt={b.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="w-5 h-5 text-zinc-500" />
                          </div>
                        )}
                      </div>
                      <p className="text-white text-xs font-semibold text-left break-words">{b.name}</p>
                    </button>
                  ))}
                </div>
                {errors.barberId && <p className="text-red-400 text-xs mt-1">{errors.barberId}</p>}
              </div>
            )}

            {/* Date */}
            <div>
              <label className="text-white text-sm font-semibold mb-2 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> Date
              </label>
              <input
                type="date"
                min={todayISO}
                max={maxDateISO}
                value={form.date}
                onChange={(e) => setForm(prev => ({ ...prev, date: e.target.value, time: '' }))}
                className="w-full bg-zinc-900 border-2 border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-white transition"
              />
              {errors.date && <p className="text-red-400 text-xs mt-1">{errors.date}</p>}
            </div>

            {/* Time slots */}
            {form.date && form.barberId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white text-sm font-semibold flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Heure
                  </label>
                  <button
                    onClick={() => refreshSlots(false)}
                    disabled={loadingSlots}
                    className="text-zinc-400 hover:text-white text-xs flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingSlots ? 'animate-spin' : ''}`} /> Actualiser
                  </button>
                </div>

                {loadingSlots ? (
                  <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
                  </div>
                ) : noSlots ? (
                  <div className="bg-yellow-500/10 border border-yellow-500/40 rounded-xl p-4 text-center">
                    <XCircle className="w-6 h-6 text-yellow-400 mx-auto mb-2" />
                    <p className="text-yellow-300 text-sm">Aucun créneau disponible pour ce coiffeur à cette date.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2">
                    {allSlots.map((slot) => {
                      const isBooked = bookedSlots.includes(slot);
                      return (
                        <button
                          key={slot}
                          disabled={isBooked}
                          onClick={() => setForm(prev => ({ ...prev, time: slot }))}
                          className={`py-2.5 rounded-lg text-sm font-semibold transition ${
                            isBooked
                              ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed line-through'
                              : form.time === slot
                                ? 'bg-white text-black'
                                : 'bg-zinc-800 text-white hover:bg-zinc-700'
                          }`}
                        >
                          {slot}
                        </button>
                      );
                    })}
                  </div>
                )}
                {errors.time && <p className="text-red-400 text-xs mt-1">{errors.time}</p>}
              </div>
            )}

            {/* Client info */}
            <div>
              <label className="text-white text-sm font-semibold mb-2 flex items-center gap-2">
                <User className="w-4 h-4" /> Vos informations
              </label>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Nom complet"
                  value={form.client_name}
                  onChange={(e) => setForm(prev => ({ ...prev, client_name: e.target.value }))}
                  className="w-full bg-zinc-900 border-2 border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-white transition placeholder:text-zinc-600"
                />
                {errors.client_name && <p className="text-red-400 text-xs">{errors.client_name}</p>}
                <input
                  type="tel"
                  placeholder="Téléphone (ex: 77 000 00 00)"
                  value={form.client_phone}
                  onChange={(e) => setForm(prev => ({ ...prev, client_phone: e.target.value }))}
                  className="w-full bg-zinc-900 border-2 border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-white transition placeholder:text-zinc-600"
                />
                {errors.client_phone && <p className="text-red-400 text-xs">{errors.client_phone}</p>}
                <textarea
                  placeholder="Note (optionnel)"
                  value={form.note}
                  onChange={(e) => setForm(prev => ({ ...prev, note: e.target.value }))}
                  rows={2}
                  className="w-full bg-zinc-900 border-2 border-zinc-700 text-white rounded-xl px-4 py-3 focus:outline-none focus:border-white transition placeholder:text-zinc-600 resize-none"
                />
              </div>
            </div>

            {submitError && (
              <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 text-red-300 text-sm">
                {submitError}
              </div>
            )}

            <button
              onClick={goToPayment}
              disabled={isDisabled}
              className="w-full bg-white text-black font-bold py-4 rounded-xl text-base hover:bg-zinc-200 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continuer vers le paiement
            </button>
          </div>
        )}

        {/* STEP: PAY */}
        {step === 'pay' && form.eventService && (
          <div className="space-y-5">
            <div className="bg-zinc-900 border-2 border-zinc-700 rounded-xl p-4 space-y-3">
              <p className="text-zinc-400 text-xs uppercase tracking-wider">Récapitulatif</p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-white text-sm break-words">{form.eventService.name}</span>
                <span className="text-white font-bold text-base flex-shrink-0">{formatCFA(form.eventService.price)}</span>
              </div>
              {form.barberName && (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-zinc-400 text-sm">Coiffeur</span>
                  <span className="text-white text-sm">{form.barberName}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-zinc-400 text-sm">Date</span>
                <span className="text-white text-sm">{form.date} à {form.time}</span>
              </div>
            </div>

            <div>
              <label className="text-white text-sm font-semibold mb-2 flex items-center gap-2">
                <Phone className="w-4 h-4" /> Méthode de paiement
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'wave', label: 'Wave' },
                  { id: 'orange_money', label: 'Orange Money' },
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setForm(prev => ({ ...prev, paymentMethod: m.id as any }))}
                    className={`py-3 rounded-xl border-2 font-bold text-sm transition ${
                      form.paymentMethod === m.id
                        ? 'border-white bg-zinc-800 text-white'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {submitError && (
              <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 text-red-300 text-sm">
                {submitError}
              </div>
            )}

            <div className="bg-zinc-900 border-2 border-zinc-700 rounded-xl p-4 flex items-center justify-between gap-3">
              <span className="text-zinc-400 text-sm">Total à payer</span>
              <span className="text-white text-xl font-bold flex-shrink-0">{formatCFA(form.eventService.price)}</span>
            </div>

            <button
              onClick={handlePay}
              disabled={submitting || !form.paymentMethod}
              className="w-full bg-white text-black font-bold py-4 rounded-xl text-base hover:bg-zinc-200 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" /> Traitement...
                </>
              ) : (
                <>Payer {formatCFA(form.eventService.price)}</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}