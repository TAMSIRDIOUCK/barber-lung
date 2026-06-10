// src/components/BookingPage.tsx
import { useState, useEffect, useCallback } from 'react';
import {
  Scissors, Clock, Phone, User, Calendar, MessageSquare,
  Check, AlertCircle, Star, Sparkles, QrCode, RefreshCw, XCircle, WifiOff, Wifi
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import QRCode from 'qrcode';

// Types
interface Service { id: number; name: string; base_price: number; category: string; duration: number; }
interface OpeningHour { open: string; close: string; closed: boolean; }
interface EventService { id: string; name: string; price: number; description: string; duration?: number; }
interface Barber { id: string; name: string; photo: string; user_id: string; }
interface SalonSettings {
  id: string; slug: string; salon_name: string; welcome_message: string;
  logo_url: string | null; primary_color: string;
  opening_hours: Record<string, OpeningHour>; user_id: string;
  booking_interval_minutes: number; advance_booking_days: number;
  require_payment: boolean; event_services?: EventService[];
  booking_type: 'normal' | 'event' | null; wave_payment_link: string;
}
interface BookingForm {
  client_name: string; client_phone: string; service: Service | null;
  eventService: EventService | null; barberId: string | null;
  barberName: string; date: string; time: string; note: string;
}
interface BookingPageProps { slug: string; }

// Helpers
function normalizeTime(time: string): string { return time.slice(0, 5); }

function generateTimeSlots(open: string, close: string, intervalMinutes: number, serviceDuration = 30): string[] {
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

function openWhatsApp(phone: string, message: string) {
  if (!phone) return;
  window.open(`https://wa.me/${phone.replace(/[\s\-\(\)]/g, '')}?text=${encodeURIComponent(message)}`, '_blank');
}

const POLL_MS = 15000;

export function BookingPage({ slug }: BookingPageProps) {
  const [settings, setSettings] = useState<SalonSettings | null>(null);
  const [normalServices, setNormalServices] = useState<Service[]>([]);
  const [barbers, setBarbers] = useState<Barber[]>([]);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [bookingData, setBookingData] = useState<any>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof BookingForm, string>>>({});
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [salonPhone, setSalonPhone] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [messageSent, setMessageSent] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [submitError, setSubmitError] = useState('');
  const [realtimeOk, setRealtimeOk] = useState(false);

  const [form, setForm] = useState<BookingForm>({
    client_name: '', client_phone: '', service: null, eventService: null,
    barberId: null, barberName: '', date: '', time: '', note: '',
  });

  useEffect(() => {
    const load = async () => {
      setLoadingSettings(true);
      try {
        const { data, error } = await supabase
          .from('booking_settings').select('*')
          .eq('slug', slug).eq('is_active', true).single();

        if (error || !data) { setNotFound(true); return; }
        setSettings(data);

        const { data: prof } = await supabase
          .from('profiles_v3').select('phone').eq('id', data.user_id).single();
        if (prof?.phone) setSalonPhone(prof.phone);

        if (data.user_id) {
          const { data: bb } = await supabase
            .from('barbers').select('id, name, photo, user_id').eq('user_id', data.user_id);
          if (bb?.length) setBarbers(bb);
        }
        if (data.booking_type === 'normal') {
          const { data: ss } = await supabase
            .from('catalogue_services').select('*').eq('user_id', data.user_id).order('id');
          if (ss?.length) setNormalServices(ss.map((s: any) => ({ ...s, duration: s.duration || 30 })));
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

  const refreshSlots = useCallback(async (silent = false) => {
    if (!form.date || !settings) return;
    if (!silent) setLoadingSlots(true);
    try {
      const day = new Date(form.date + 'T00:00:00').getDay();
      const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
      const hours = settings.opening_hours[dayNames[day]];
      if (!hours || hours.closed) {
        setAvailableSlots([]); setBookedSlots([]); setLastRefresh(new Date()); return;
      }
      let dur = 30;
      if (settings.booking_type === 'normal' && form.service) dur = form.service.duration || 30;
      else if (settings.booking_type === 'event' && form.eventService) dur = form.eventService.duration || 60;

      const allSlots = generateTimeSlots(hours.open, hours.close, settings.booking_interval_minutes || 90, dur);

      const { data: bkgs } = await supabase
        .from('bookings').select('booking_time')
        .eq('salon_user_id', settings.user_id)
        .eq('booking_date', form.date)
        .not('status', 'eq', 'cancelled');

      const taken = (bkgs || []).map(b => normalizeTime(b.booking_time));
      setBookedSlots(taken);
      setAvailableSlots(allSlots.filter(s => !taken.includes(s)));
      setLastRefresh(new Date());
      if (form.time && taken.includes(form.time)) {
        setForm(prev => ({ ...prev, time: '' }));
      }
    } catch (err) { console.error(err); }
    finally { if (!silent) setLoadingSlots(false); }
  }, [form.date, form.service, form.eventService, settings, form.time]);

  useEffect(() => { refreshSlots(); }, [refreshSlots]);

  useEffect(() => {
    const id = setInterval(() => {
      if (form.date && settings && !loadingSlots) refreshSlots(true);
    }, POLL_MS);
    return () => clearInterval(id);
  }, [form.date, settings, loadingSlots, refreshSlots]);

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
    if (settings?.booking_type === 'normal' && !form.service) e.service = 'Choisissez un service';
    if (settings?.booking_type === 'event' && !form.eventService) e.eventService = 'Choisissez un service';
    if (!form.barberId && barbers.length > 0) e.barberId = 'Choisissez un coiffeur';
    if (!form.date) e.date = 'Requis';
    if (!form.time) e.time = 'Requis';
    setErrors(e); setSubmitError('');
    return Object.keys(e).length === 0;
  };

  const makeQR = async (text: string): Promise<string> => {
    try {
      const cleanText = text.slice(0, 200);
      return await QRCode.toDataURL(cleanText, {
        width: 250,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#FFFFFF' }
      });
    } catch (err) {
      console.error('Erreur QR:', err);
      return '';
    }
  };

  const getSalonMsg = (b: any) => {
    const dt = new Date(b.booking_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    return `🆕 *NOUVELLE RESERVATION* 🆕\n\n📋 *Ticket:* ${b.ticket_number}\n👤 *Client:* ${b.client_name}\n📞 *Tel:* ${b.client_phone}\n✂️ *Service:* ${b.service_name} - ${b.service_price.toLocaleString()} CFA\n💈 *Coiffeur:* ${b.barber_name || 'Non spécifié'}\n📅 *Date:* ${dt}\n⏰ *Heure:* ${b.booking_time.slice(0, 5)}\n${b.note ? `📝 *Note:* ${b.note}` : ''}\n\n🔗 *Valider:* ${window.location.origin}/booking/validate/${b.id}/confirm-payment\n\n⏳ *Le client a 2h pour payer*`;
  };

  const handleSubmit = async () => {
    setSubmitError('');
    if (!validate() || !settings) return;

    let price = 0, name = '';
    if (settings.booking_type === 'normal' && form.service) { price = form.service.base_price; name = form.service.name; }
    else if (settings.booking_type === 'event' && form.eventService) { price = form.eventService.price; name = form.eventService.name; }
    else return;

    setSubmitting(true);
    
    try {
      // Vérification anti-doublon
      const { data: conflict } = await supabase
        .from('bookings').select('id')
        .eq('salon_user_id', settings.user_id)
        .eq('booking_date', form.date).eq('booking_time', form.time)
        .not('status', 'eq', 'cancelled').maybeSingle();

      if (conflict) {
        await refreshSlots(false);
        setSubmitError(`⚠️ Le créneau ${form.time} vient d'être pris.`);
        setForm(prev => ({ ...prev, time: '' }));
        setSubmitting(false);
        return;
      }

      const { data, error } = await supabase
        .from('bookings')
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
          status: 'pending',
          payment_status: 'pending',
          payment_expires_at: new Date(Date.now() + 7200000).toISOString(),
        })
        .select();

      if (error) {
        console.error('Erreur insertion:', error);
        setSubmitError(`❌ Erreur: ${error.message}`);
        setSubmitting(false);
        return;
      }

      if (!data || data.length === 0) {
        setSubmitError('❌ Réservation non créée.');
        setSubmitting(false);
        return;
      }

      const newBooking = data[0];
      await refreshSlots(false);

      const qrData = JSON.stringify({
        booking_id: newBooking.id,
        ticket_number: newBooking.ticket_number,
        service: newBooking.service_name,
        date: newBooking.booking_date,
        time: newBooking.booking_time,
        client: newBooking.client_name,
        price: newBooking.service_price
      });
      
      const qrCode = await makeQR(qrData);
      await supabase.from('bookings').update({ qr_code: qrData }).eq('id', newBooking.id);

      setQrCodeUrl(qrCode);
      setBookingData({ ...newBooking, salon_name: settings.salon_name });
      setShowSuccess(true);

    } catch (err: any) {
      console.error('Erreur:', err);
      setSubmitError(`❌ Erreur: ${err?.message || 'Veuillez réessayer'}`);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setForm({ client_name: '', client_phone: '', service: null, eventService: null, barberId: null, barberName: '', date: '', time: '', note: '' });
    setBookingData(null); setShowSuccess(false); setQrCodeUrl('');
    setMessageSent(false); setSubmitError(''); setErrors({});
  };

  const handleSendConfirmation = () => {
    if (bookingData && salonPhone) {
      openWhatsApp(salonPhone, getSalonMsg(bookingData));
      setMessageSent(true);
    }
  };

  const allSlots = [...new Set([...availableSlots, ...bookedSlots])].sort();
  const noSlots = !!(form.date && availableSlots.length === 0 && !loadingSlots);
  const isDisabled = submitting || (form.date && noSlots) || (!form.barberId && barbers.length > 0) || !form.time;

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
          <h2 className="text-white text-2xl font-bold mb-2">Salon introuvable</h2>
          <p className="text-zinc-500 text-sm">Ce lien n'existe pas ou est désactivé.</p>
        </div>
      </div>
    );
  }

  if (showSuccess && bookingData) {
    const dateFmt = new Date(bookingData.booking_date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
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
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="text-red-700 text-lg font-semibold mb-1">⚠️ ACTION OBLIGATOIRE</p>
                <p className="text-red-600 text-sm font-medium">📸 Capturer le QR code ci-dessous et envoyer le message</p>
                <p className="text-red-600 text-sm font-medium mt-1">💰 Payer avec le lien Wave</p>
              </div>
              
              {qrCodeUrl && (
                <div className="bg-white rounded-xl p-4 text-center border-2 border-blue-300 shadow-lg">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <QrCode className="w-5 h-5 text-blue-600" />
                    <p className="text-xs font-semibold text-blue-600">QR Code à présenter au salon</p>
                  </div>
                  <img 
                    src={qrCodeUrl} 
                    alt="QR Code" 
                    className="w-48 h-48 mx-auto border-2 border-blue-300 rounded-lg"
                  />
                  <p className="text-xs font-semibold text-blue-700 mt-3">📸 Capturez ce QR code</p>
                  <p className="text-[10px] text-zinc-500 mt-1">Présentez-le au salon le jour de votre rendez-vous</p>
                </div>
              )}
              
              <hr className="border-dashed border-zinc-300" />
              
              <div>
                <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Service</p>
                <p className="font-black text-base mt-0.5">{bookingData.service_name}</p>
                <p className="text-zinc-500 text-sm">{bookingData.service_price.toLocaleString()} CFA</p>
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
                  <p className="font-black text-xl mt-0.5">{bookingData.booking_time.slice(0, 5)}</p>
                </div>
              </div>
              
              {bookingData.note && (
                <>
                  <hr className="border-dashed border-zinc-300" />
                  <div>
                    <p className="text-[10px] tracking-widest text-zinc-500 uppercase">Note</p>
                    <p className="text-sm mt-0.5 italic">{bookingData.note}</p>
                  </div>
                </>
              )}

              {settings.wave_payment_link && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <p className="text-[10px] tracking-widest text-blue-600 uppercase text-center">Paiement Wave</p>
                  <a 
                    href={settings.wave_payment_link} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-blue-600 text-sm font-semibold text-center block break-all hover:underline"
                  >
                    {settings.wave_payment_link}
                  </a>
                </div>
              )}
            </div>
            
            <div className="bg-zinc-100 p-4 space-y-2 border-t-2 border-dashed border-zinc-300">
              <button 
                type="button" 
                onClick={handleSendConfirmation} 
                className="w-full bg-red-500 text-white font-bold py-3 rounded-xl text-sm hover:bg-red-600 transition flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                📤 ENVOYER LE MESSAGE DE CONFIRMATION
              </button>
              
              {messageSent && (
                <p className="text-green-600 text-xs text-center font-semibold">
                  ✅ Message envoyé ! Votre réservation est maintenant confirmée.
                </p>
              )}
              
              <button 
                type="button" 
                onClick={resetForm} 
                className="w-full bg-black text-white font-bold py-3 rounded-xl text-sm hover:bg-zinc-800 transition"
              >
                Nouvelle réservation
              </button>
            </div>
          </div>
          <p className="text-center text-zinc-500 text-[10px] mt-4">⚠️ Sans ces actions, votre réservation sera annulée</p>
        </div>
      </div>
    );
  }

  // Rendu principal - version simplifiée pour éviter l'erreur removeChild
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
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

      <div className="px-4 py-6 space-y-5">
        {!settings.booking_type && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-6 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
            <p className="text-yellow-400 font-semibold text-sm">Aucune réservation disponible</p>
          </div>
        )}

        {submitError && (
          <div className="bg-red-500/20 border border-red-500 rounded-xl p-4 flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-red-300 text-sm font-medium">{submitError}</p>
          </div>
        )}

        {/* Services - Normal */}
        {settings.booking_type === 'normal' && normalServices.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Scissors className="w-5 h-5 text-green-400" />
              <h2 className="text-white font-bold text-base">Réservation normale</h2>
            </div>
            <label className="block text-sm font-semibold text-zinc-300 mb-2">Service <span className="text-red-400">*</span></label>
            <div className="space-y-2">
              {normalServices.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setForm(prev => ({ ...prev, service: prev.service?.id === s.id ? null : s, time: '' }));
                    setErrors(prev => ({ ...prev, service: undefined }));
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                    form.service?.id === s.id 
                      ? 'border-green-500 bg-green-500/20' 
                      : errors.service 
                        ? 'border-red-500 bg-red-500/10' 
                        : 'border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  <p className={`font-semibold text-sm ${form.service?.id === s.id ? 'text-green-400' : 'text-white'}`}>{s.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`text-xs font-bold ${form.service?.id === s.id ? 'text-green-400' : 'text-white'}`}>
                      {s.base_price.toLocaleString()} CFA
                    </span>
                    <span className="text-zinc-400 text-xs flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {s.duration || 30} min
                    </span>
                  </div>
                </button>
              ))}
            </div>
            {errors.service && <p className="text-red-400 text-xs mt-1">{errors.service}</p>}
          </div>
        )}

        {/* Services - Event */}
        {settings.booking_type === 'event' && !!settings.event_services?.length && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <h2 className="text-white font-bold text-base">Réservation événementielle</h2>
            </div>
            <label className="block text-sm font-semibold text-zinc-300 mb-2">Service <span className="text-red-400">*</span></label>
            <div className="space-y-2">
              {settings.event_services.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    setForm(prev => ({ ...prev, eventService: prev.eventService?.id === s.id ? null : s, time: '' }));
                    setErrors(prev => ({ ...prev, eventService: undefined }));
                  }}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition ${
                    form.eventService?.id === s.id 
                      ? 'border-green-500 bg-green-500/20' 
                      : errors.eventService 
                        ? 'border-red-500 bg-red-500/10' 
                        : 'border-zinc-700 hover:border-zinc-500'
                  }`}
                >
                  <p className={`font-semibold text-sm ${form.eventService?.id === s.id ? 'text-green-400' : 'text-white'}`}>{s.name}</p>
                  <p className="text-zinc-400 text-xs">{s.description}</p>
                  <span className={`text-xs font-bold mt-1 block ${form.eventService?.id === s.id ? 'text-green-400' : 'text-white'}`}>
                    {s.price.toLocaleString()} CFA
                  </span>
                </button>
              ))}
            </div>
            {errors.eventService && <p className="text-red-400 text-xs mt-1">{errors.eventService}</p>}
          </div>
        )}

        {/* Formulaire */}
        {settings.booking_type && (
          <div className="space-y-4">
            {/* Coiffeurs */}
            {barbers.length > 0 && (
              <div>
                <label className="block text-sm font-semibold text-zinc-300 mb-3">Coiffeur <span className="text-red-400">*</span></label>
                <div className="space-y-2">
                  {barbers.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => {
                        if (form.barberId === b.id) {
                          setForm(prev => ({ ...prev, barberId: null, barberName: '' }));
                        } else {
                          setForm(prev => ({ ...prev, barberId: b.id, barberName: b.name }));
                        }
                        setErrors(prev => ({ ...prev, barberId: undefined }));
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border-2 transition ${
                        form.barberId === b.id 
                          ? 'border-green-500 bg-green-500/20' 
                          : errors.barberId 
                            ? 'border-red-500 bg-red-500/10' 
                            : 'border-zinc-700 bg-zinc-800 hover:border-zinc-500'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-zinc-700 shrink-0">
                        {b.photo?.trim() ? (
                          <img src={b.photo} alt={b.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">💈</div>
                        )}
                      </div>
                      <p className={`flex-1 text-left font-semibold ${form.barberId === b.id ? 'text-green-400' : 'text-white'}`}>
                        {b.name}
                      </p>
                      {form.barberId === b.id && <Check className="w-5 h-5 text-green-400 shrink-0" />}
                    </button>
                  ))}
                </div>
                {errors.barberId && <p className="text-red-400 text-xs mt-2">{errors.barberId}</p>}
              </div>
            )}

            {/* Nom */}
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Nom complet <span className="text-red-400">*</span></label>
              <input
                type="text"
                placeholder="Votre nom"
                value={form.client_name}
                onChange={e => {
                  setForm(prev => ({ ...prev, client_name: e.target.value }));
                  setErrors(prev => ({ ...prev, client_name: undefined }));
                }}
                className={`w-full px-4 py-3 bg-zinc-900 border rounded-xl text-white focus:outline-none transition text-base ${
                  errors.client_name ? 'border-red-500' : 'border-zinc-700 focus:border-white'
                }`}
              />
              {errors.client_name && <p className="text-red-400 text-xs mt-1">{errors.client_name}</p>}
            </div>

            {/* Téléphone */}
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Téléphone <span className="text-red-400">*</span></label>
              <input
                type="tel"
                placeholder="77 000 00 00"
                value={form.client_phone}
                onChange={e => {
                  setForm(prev => ({ ...prev, client_phone: e.target.value }));
                  setErrors(prev => ({ ...prev, client_phone: undefined }));
                }}
                className={`w-full px-4 py-3 bg-zinc-900 border rounded-xl text-white focus:outline-none transition text-base ${
                  errors.client_phone ? 'border-red-500' : 'border-zinc-700 focus:border-white'
                }`}
              />
              {errors.client_phone && <p className="text-red-400 text-xs mt-1">{errors.client_phone}</p>}
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Date <span className="text-red-400">*</span></label>
              <input
                type="date"
                min={todayISO}
                max={maxDateISO}
                value={form.date}
                onChange={e => {
                  setForm(prev => ({ ...prev, date: e.target.value, time: '' }));
                  setErrors(prev => ({ ...prev, date: undefined }));
                }}
                className={`w-full px-4 py-3 bg-zinc-900 border rounded-xl text-white focus:outline-none transition text-base [color-scheme:dark] ${
                  errors.date ? 'border-red-500' : 'border-zinc-700 focus:border-white'
                }`}
              />
              {errors.date && <p className="text-red-400 text-xs mt-1">{errors.date}</p>}
            </div>

            {/* Heure - Version stable sans problème de clés */}
            {form.date && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-zinc-300">Heure <span className="text-red-400">*</span></label>
                  <button
                    type="button"
                    onClick={() => refreshSlots(false)}
                    disabled={loadingSlots}
                    className="flex items-center gap-1 text-xs text-zinc-400 hover:text-white transition"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingSlots ? 'animate-spin' : ''}`} /> Actualiser
                  </button>
                </div>

                {/* Statut synchro */}
                <div className="flex items-center gap-2 mb-3 px-2 py-1.5 bg-zinc-900 rounded-lg border border-zinc-800">
                  <div className="flex items-center gap-1">
                    <WifiOff className="w-3 h-3 text-amber-400" />
                    <span className="text-amber-400 text-[10px]">Sync auto (15s)</span>
                  </div>
                  {lastRefresh && (
                    <span className="text-zinc-600 text-[10px] ml-auto">
                      màj {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* Liste des créneaux */}
                {loadingSlots ? (
                  <div className="text-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto" />
                  </div>
                ) : allSlots.length === 0 ? (
                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 text-center">
                    <p className="text-yellow-400 text-sm">Aucun créneau disponible ce jour</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {allSlots.map((slot) => {
                      const isBooked = bookedSlots.includes(slot);
                      const isSelected = form.time === slot;
                      return (
                        <div key={slot} className="w-full">
                          <button
                            type="button"
                            onClick={() => {
                              if (!isBooked) {
                                setForm(prev => ({ ...prev, time: slot }));
                                setErrors(prev => ({ ...prev, time: undefined }));
                              }
                            }}
                            disabled={isBooked}
                            className={`w-full py-3 rounded-xl text-sm font-medium border transition ${
                              isSelected
                                ? 'border-green-500 bg-green-500 text-black font-bold'
                                : isBooked
                                ? 'border-red-500/40 bg-red-500/10 text-red-400/60 cursor-not-allowed opacity-70'
                                : 'border-green-500/50 bg-green-500/10 text-green-400 hover:bg-green-500/20'
                            }`}
                          >
                            {slot}
                            {isBooked && <span className="block text-[9px] mt-0.5">Pris</span>}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {errors.time && <p className="text-red-400 text-xs mt-1">{errors.time}</p>}
              </div>
            )}

            {/* Note */}
            <div>
              <label className="block text-sm font-semibold text-zinc-300 mb-2">Note</label>
              <textarea
                rows={2}
                placeholder="Précisions..."
                value={form.note}
                onChange={e => setForm(prev => ({ ...prev, note: e.target.value }))}
                className="w-full px-4 py-3 bg-zinc-900 border border-zinc-700 focus:border-white rounded-xl text-white focus:outline-none transition resize-none text-base"
              />
            </div>

            {/* Résumé */}
            {(() => {
              const svc = settings.booking_type === 'normal' ? form.service : form.eventService;
              if (!svc || !form.date || !form.time || (barbers.length > 0 && !form.barberName)) return null;
              const price = settings.booking_type === 'normal' ? (svc as Service).base_price : (svc as EventService).price;
              return (
                <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4">
                  <p className="text-zinc-500 text-[10px] uppercase tracking-widest mb-3">Résumé</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-zinc-400">Service</span><span className="text-white font-semibold">{svc.name}</span></div>
                    {form.barberName && <div className="flex justify-between"><span className="text-zinc-400">Coiffeur</span><span className="text-white">{form.barberName}</span></div>}
                    <div className="flex justify-between"><span className="text-zinc-400">Date</span><span className="text-white">{new Date(form.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-400">Heure</span><span className="text-white font-bold">{form.time}</span></div>
                    <hr className="border-zinc-700 my-2" />
                    <div className="flex justify-between text-base"><span className="text-zinc-300 font-semibold">Total</span><span className="text-white font-black">{price.toLocaleString()} CFA</span></div>
                  </div>
                </div>
              );
            })()}

            {/* Bouton Réserver */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!!isDisabled}
              className="w-full bg-white text-black font-bold py-4 rounded-2xl text-base hover:bg-zinc-200 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black" /> En cours...</>
              ) : (
                <>Réserver <Check className="w-5 h-5" /></>
              )}
            </button>
            <p className="text-center text-zinc-500 text-[11px]">
              ⚠️ Après réservation, vous devrez capturer le QR code, envoyer le message et payer
            </p>
          </div>
        )}

        <p className="text-center text-zinc-600 text-[10px] pb-4">
          Propulsé par <span className="text-white font-semibold">LE COUPE</span>
        </p>
      </div>
    </div>
  );
}