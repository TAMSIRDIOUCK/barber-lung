// src/components/ServiceSelector.tsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { Scissors, Sparkles, Baby, X, Printer, Box, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { BarberManager } from './BarberManager';
import type { AuthUser } from './Clientapp';

interface Service { id?: number; name: string; basePrice: number; category: string; }
interface ProductOption { id?: number; name: string; price: number; }
interface SoinOption    { id?: number; name: string; price: number; }
interface TeintureSuppOption { id?: number; name: string; price: number; }

interface ServiceSelectorProps {
  userId: string;
  salonName: string;
  authUser: AuthUser;
  onConfirm: (serviceName: string, amount: number, options: any) => void;
}

function InlineAddForm({ onAdd }: { onAdd: (name: string, price: number) => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    const n = name.trim();
    const p = parseInt(price, 10);
    if (!n) return setError('Nom requis');
    if (isNaN(p) || p < 0) return setError('Prix invalide');
    setLoading(true);
    const err = await onAdd(n, p);
    setLoading(false);
    if (err) return setError(err);
    setName(''); setPrice(''); setError(''); setOpen(false);
  };

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mt-3 transition">
      <Plus className="w-4 h-4" /> Ajouter
    </button>
  );

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex gap-2">
        <input autoFocus type="text" placeholder="Nom" value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1 min-w-0 bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-600 focus:outline-none focus:border-white" />
        <input type="number" placeholder="Prix" value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="w-20 sm:w-28 bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-600 focus:outline-none focus:border-white" />
        <button onClick={handleAdd} disabled={loading}
          className="bg-white text-black rounded-lg px-3 py-2 hover:bg-zinc-200 transition disabled:opacity-50 shrink-0">
          <Plus className="w-4 h-4" />
        </button>
        <button onClick={() => { setOpen(false); setError(''); }}
          className="text-zinc-500 hover:text-white transition px-1 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

export function ServiceSelector({ userId, salonName, authUser, onConfirm }: ServiceSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedBarber, setSelectedBarber] = useState<string | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedSoins, setSelectedSoins] = useState<string[]>([]);
  const [withTeinture, setWithTeinture] = useState(false);
  const [ticketData, setTicketData] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const ticketRef = useRef<HTMLDivElement>(null);

  const [services, setServices] = useState<Record<string, Service[]>>({
    coupeAdulte: [], coupeEnfant: [], teinture: [], produitSeul: [],
  });
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [soinOptions, setSoinOptions] = useState<SoinOption[]>([]);
  const [teintureSuppOptions, setTeintureSuppOptions] = useState<TeintureSuppOption[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [{ data: svcs }, { data: prods }, { data: soins }, { data: teints }] = await Promise.all([
        supabase.from('catalogue_services').select('*').eq('user_id', userId).order('id'),
        supabase.from('catalogue_produits').select('*').eq('user_id', userId).order('id'),
        supabase.from('catalogue_soins').select('*').eq('user_id', userId).order('id'),
        supabase.from('catalogue_teintures_supp').select('*').eq('user_id', userId).order('id'),
      ]);
      if (svcs) {
        const grouped: Record<string, Service[]> = { coupeAdulte: [], coupeEnfant: [], teinture: [], produitSeul: [] };
        svcs.forEach((s: any) => {
          const cat = s.category as string;
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push({ id: s.id, name: s.name, basePrice: s.base_price, category: cat });
        });
        setServices(grouped);
      }
      if (prods) setProductOptions(prods.map((p: any) => ({ id: p.id, name: p.name, price: p.price })));
      if (soins) setSoinOptions(soins.map((s: any) => ({ id: s.id, name: s.name, price: s.price })));
      if (teints) setTeintureSuppOptions(teints.map((t: any) => ({ id: t.id, name: t.name, price: t.price })));
      setLoading(false);
    };
    load();
  }, [userId]);

  const teintureBasePrice = teintureSuppOptions[0]?.price ?? 1000;

  const totalAmount = useMemo(() => {
    if (!selectedService) return 0;
    let total = selectedService.basePrice;
    if (withTeinture && selectedCategory !== 'teinture') total += teintureBasePrice;
    selectedProducts.forEach((name) => { const p = productOptions.find((p) => p.name === name); if (p) total += p.price; });
    selectedSoins.forEach((name) => { const s = soinOptions.find((s) => s.name === name); if (s) total += s.price; });
    return total;
  }, [selectedService, withTeinture, selectedProducts, selectedSoins, selectedCategory, teintureBasePrice, productOptions, soinOptions]);

  const formatCFA = (value: number) => `${value.toLocaleString('fr-FR')} CFA`;

  const toggleItem = (name: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>) => {
    setList((prev) => prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name]);
  };

  const resetAll = () => {
    setSelectedCategory(null); setSelectedService(null); setSelectedBarber(null);
    setSelectedProducts([]); setSelectedSoins([]); setWithTeinture(false);
  };

  const addService = async (cat: string, name: string, price: number): Promise<string | null> => {
    if (services[cat].find((s) => s.name === name)) return 'Nom déjà utilisé';
    const { data, error } = await supabase.from('catalogue_services')
      .insert([{ name, base_price: price, category: cat, user_id: userId }]).select().single();
    if (error) return 'Erreur : ' + error.message;
    setServices((prev) => ({ ...prev, [cat]: [...prev[cat], { id: data.id, name: data.name, basePrice: data.base_price, category: cat }] }));
    return null;
  };
  const removeService = async (cat: string, id: number, name: string) => {
    await supabase.from('catalogue_services').delete().eq('id', id);
    setServices((prev) => ({ ...prev, [cat]: prev[cat].filter((s) => s.name !== name) }));
  };
  const addProduct = async (name: string, price: number): Promise<string | null> => {
    if (productOptions.find((p) => p.name === name)) return 'Nom déjà utilisé';
    const { data, error } = await supabase.from('catalogue_produits').insert([{ name, price, user_id: userId }]).select().single();
    if (error) return 'Erreur : ' + error.message;
    setProductOptions((prev) => [...prev, { id: data.id, name: data.name, price: data.price }]);
    return null;
  };
  const removeProduct = async (id: number, name: string) => {
    await supabase.from('catalogue_produits').delete().eq('id', id);
    setProductOptions((prev) => prev.filter((p) => p.name !== name));
    setSelectedProducts((prev) => prev.filter((n) => n !== name));
  };
  const addSoin = async (name: string, price: number): Promise<string | null> => {
    if (soinOptions.find((s) => s.name === name)) return 'Nom déjà utilisé';
    const { data, error } = await supabase.from('catalogue_soins').insert([{ name, price, user_id: userId }]).select().single();
    if (error) return 'Erreur : ' + error.message;
    setSoinOptions((prev) => [...prev, { id: data.id, name: data.name, price: data.price }]);
    return null;
  };
  const removeSoin = async (id: number, name: string) => {
    await supabase.from('catalogue_soins').delete().eq('id', id);
    setSoinOptions((prev) => prev.filter((s) => s.name !== name));
    setSelectedSoins((prev) => prev.filter((n) => n !== name));
  };
  const addTeintureSupp = async (name: string, price: number): Promise<string | null> => {
    if (teintureSuppOptions.find((t) => t.name === name)) return 'Nom déjà utilisé';
    const { data, error } = await supabase.from('catalogue_teintures_supp').insert([{ name, price, user_id: userId }]).select().single();
    if (error) return 'Erreur : ' + error.message;
    setTeintureSuppOptions((prev) => [...prev, { id: data.id, name: data.name, price: data.price }]);
    return null;
  };
  const removeTeintureSupp = async (id: number, name: string) => {
    await supabase.from('catalogue_teintures_supp').delete().eq('id', id);
    setTeintureSuppOptions((prev) => prev.filter((t) => t.name !== name));
    setWithTeinture(false);
  };

  const handleValidate = async () => {
    if (!selectedService || isSubmitting) return;
    setIsSubmitting(true);
    const now = new Date();
    try {
      const { error: insertError } = await supabase.from('transactions').insert([{
        service_name: selectedService.name,
        barber_name: selectedBarber ?? 'Non défini',
        amount: totalAmount,
        with_soin: selectedSoins.length > 0,
        with_teinture: withTeinture,
        transaction_date_sec: now.toISOString(),
        user_id: userId,
      }]);
      if (insertError) throw insertError;
      const newTicket = {
        receiptNumber: 'T' + Date.now().toString().slice(-6),
        salonName: salonName,
        serviceName: selectedService.name,
        barberName: selectedBarber ?? 'produits seul',
        basePrice: selectedService.basePrice,
        produits: selectedProducts.map((name) => productOptions.find((p) => p.name === name)),
        soins: selectedSoins.map((name) => soinOptions.find((s) => s.name === name)),
        withTeinture,
        teinturePrice: withTeinture && selectedCategory !== 'teinture' ? teintureBasePrice : 0,
        total: totalAmount,
        date: now.toISOString(),
      };
      setTicketData(newTicket);
      onConfirm(selectedService.name, totalAmount, newTicket);
      resetAll();
    } catch (error) {
      console.error('Erreur transaction :', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!ticketRef.current) return;
    const w = window.open('', '', 'width=350,height=600');
    if (!w) return;
    w.document.write(ticketRef.current.innerHTML);
    w.document.close();
    w.print();
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setTicketData(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <p className="text-zinc-400 text-sm animate-pulse">Chargement du catalogue...</p>
    </div>
  );

  const catLabels: Record<string, string> = {
    coupeAdulte: 'Coupe Adulte', coupeEnfant: 'Coupe Enfant',
    teinture: 'Teinture', produitSeul: 'Produit et Soins',
  };

  return (
    <div className="space-y-4 sm:space-y-6">

      {/* ── Catégories ── */}
      {!selectedCategory && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
          {Object.keys(services).map((cat) => (
            <button key={cat} onClick={() => {
              setSelectedCategory(cat);
              if (cat === 'produitSeul') setSelectedService(services[cat][0] ?? { name: 'Produit Seul', basePrice: 0, category: cat });
              else setSelectedService({ name: '', basePrice: 0, category: cat });
            }} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 sm:p-8 hover:border-white transition flex flex-col items-center">
              {cat === 'coupeAdulte' && <Scissors  className="w-10 h-10 sm:w-16 sm:h-16 text-white mb-2 sm:mb-3" />}
              {cat === 'coupeEnfant' && <Baby      className="w-10 h-10 sm:w-16 sm:h-16 text-white mb-2 sm:mb-3" />}
              {cat === 'teinture'    && <Sparkles  className="w-10 h-10 sm:w-16 sm:h-16 text-white mb-2 sm:mb-3" />}
              {cat === 'produitSeul' && <Box       className="w-10 h-10 sm:w-16 sm:h-16 text-white mb-2 sm:mb-3" />}
              <h3 className="text-white text-base sm:text-2xl font-bold text-center">{catLabels[cat]}</h3>
            </button>
          ))}
        </div>
      )}

      {/* ── Services ── */}
      {selectedCategory && selectedService?.name === '' && selectedCategory !== 'produitSeul' && (
        <div>
          <button onClick={resetAll} className="text-zinc-400 mb-4 text-sm">← Retour</button>
          <h4 className="text-white text-lg sm:text-xl font-bold mb-4">Choisissez un service :</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
            {services[selectedCategory].map((service) => (
              <div key={service.name} className="relative group">
                <button onClick={() => setSelectedService(service)}
                  className="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-4 sm:p-6 hover:border-white transition text-left">
                  <h3 className="text-white text-lg sm:text-2xl font-bold">{service.name}</h3>
                  <p className="text-zinc-400 text-sm">{service.basePrice.toLocaleString('fr-FR')} CFA</p>
                </button>
                <button onClick={() => removeService(selectedCategory, service.id!, service.name)}
                  className="absolute top-3 right-3 text-zinc-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <InlineAddForm onAdd={(name, price) => addService(selectedCategory, name, price)} />
        </div>
      )}

      {/* ── Options ── */}
      {selectedService?.name && (
        <div className="space-y-4 sm:space-y-6">
          <div className="flex justify-between items-start">
            <h3 className="text-white text-xl sm:text-2xl font-bold">{selectedService.name}</h3>
            <button onClick={resetAll} className="text-zinc-400 text-sm shrink-0 ml-4">← Retour</button>
          </div>

          {/* Coiffeurs - MODIFICATION ICI pour la désélection */}
          <div>
            <h4 className="text-white text-base sm:text-xl font-bold mb-3 sm:mb-4">Choisissez un coiffeur :</h4>
            <BarberManager
              userId={userId}
              onSelect={(barber) => {
                // Si le même coiffeur est sélectionné, on le désélectionne
                if (selectedBarber === (barber?.name || null)) {
                  setSelectedBarber(null);
                } else {
                  setSelectedBarber(barber?.name || null);
                }
              }}
              selectedBarberName={selectedBarber}
            />
          </div>

          {/* Produits */}
          <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-xl">
            <h4 className="text-white font-bold mb-3 sm:mb-4">Produits</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {productOptions.map((p) => (
                <div key={p.name} className="relative group">
                  <label className="flex justify-between items-center bg-zinc-800 rounded-lg px-3 sm:px-4 py-2 cursor-pointer">
                    <span className="text-white text-sm">{p.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-zinc-400 text-xs">{formatCFA(p.price)}</span>
                      <input type="checkbox" checked={selectedProducts.includes(p.name)}
                        onChange={() => toggleItem(p.name, selectedProducts, setSelectedProducts)}
                        className="w-5 h-5 accent-white" />
                    </div>
                  </label>
                  <button onClick={() => removeProduct(p.id!, p.name)}
                    className="absolute -top-1 -right-1 text-zinc-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <InlineAddForm onAdd={addProduct} />
          </div>

          {/* Soins */}
          <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-xl">
            <h4 className="text-white font-bold mb-3 sm:mb-4">Soins</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {soinOptions.map((s) => (
                <div key={s.name} className="relative group">
                  <label className="flex justify-between items-center bg-zinc-800 rounded-lg px-3 sm:px-4 py-2 cursor-pointer">
                    <span className="text-white text-sm">{s.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-zinc-400 text-xs">{formatCFA(s.price)}</span>
                      <input type="checkbox" checked={selectedSoins.includes(s.name)}
                        onChange={() => toggleItem(s.name, selectedSoins, setSelectedSoins)}
                        className="w-5 h-5 accent-white" />
                    </div>
                  </label>
                  <button onClick={() => removeSoin(s.id!, s.name)}
                    className="absolute -top-1 -right-1 text-zinc-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <InlineAddForm onAdd={addSoin} />
          </div>

          {/* Teinture supp */}
          {selectedCategory !== 'teinture' && selectedCategory !== 'produitSeul' && (
            <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-xl">
              {teintureSuppOptions.map((t) => (
                <div key={t.name} className="relative group">
                  <label className="flex justify-between items-center bg-zinc-800 rounded-lg px-3 sm:px-4 py-2 cursor-pointer">
                    <span className="text-white text-sm">+ {t.name} ({t.price.toLocaleString('fr-FR')} CFA)</span>
                    <input type="checkbox" checked={withTeinture}
                      onChange={(e) => setWithTeinture(e.target.checked)}
                      className="w-5 h-5 accent-white shrink-0" />
                  </label>
                  <button onClick={() => removeTeintureSupp(t.id!, t.name)}
                    className="absolute -top-1 -right-1 text-zinc-600 hover:text-red-400 transition opacity-0 group-hover:opacity-100">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <InlineAddForm onAdd={addTeintureSupp} />
            </div>
          )}

          {/* Total */}
          <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-xl text-right">
            <span className="text-white text-lg sm:text-xl font-bold">Total : {formatCFA(totalAmount)}</span>
          </div>

          <button onClick={handleValidate} disabled={isSubmitting}
            className="w-full bg-white text-black py-4 sm:py-5 rounded-xl font-bold text-lg sm:text-xl hover:bg-zinc-200 transition disabled:opacity-50">
            VALIDER
          </button>
        </div>
      )}

      {/* ── Ticket ── */}
      {ticketData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 w-full max-w-md relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button onClick={() => setTicketData(null)} className="absolute top-4 right-4 text-zinc-500">
              <X className="w-6 h-6" />
            </button>
            <div ref={ticketRef}>
              <div className="text-center mb-4">
                <h2 className="text-xl sm:text-2xl font-bold uppercase">{ticketData.salonName}</h2>
                <p className="text-xs text-zinc-500">Salon de Coiffure — {authUser.fullName}</p>
              </div>
              <hr className="border-dashed border-zinc-400 my-3" />
              <div className="flex justify-between text-sm mb-2"><span>N° Ticket:</span><span className="font-bold">{ticketData.receiptNumber}</span></div>
              <div className="flex justify-between text-sm mb-2"><span>Date:</span><span>{new Date(ticketData.date).toLocaleString('fr-FR')}</span></div>
              <div className="flex justify-between text-sm mb-4"><span>Coiffeur:</span><span>{ticketData.barberName}</span></div>
              <h3 className="font-bold text-black mb-2">Service principal :</h3>
              <div className="flex justify-between text-sm mb-2"><span>{ticketData.serviceName}</span><span>{formatCFA(ticketData.basePrice)}</span></div>
              {ticketData.withTeinture && <div className="flex justify-between text-sm mb-2"><span>+ Teinture</span><span>{formatCFA(ticketData.teinturePrice)}</span></div>}
              {ticketData.produits.length > 0 && (
                <>
                  <h3 className="font-bold text-black mt-3 mb-1">Produits :</h3>
                  {ticketData.produits.map((p: any, i: number) => (
                    <div key={p.name + i} className="flex justify-between text-sm"><span>{p.name}</span><span>{formatCFA(p.price)}</span></div>
                  ))}
                </>
              )}
              {ticketData.soins.length > 0 && (
                <>
                  <h3 className="font-bold text-black mt-3 mb-1">Soins :</h3>
                  {ticketData.soins.map((s: any, i: number) => (
                    <div key={s.name + i} className="flex justify-between text-sm"><span>{s.name}</span><span>{formatCFA(s.price)}</span></div>
                  ))}
                </>
              )}
              <hr className="border-dashed border-zinc-400 my-3" />
              <div className="flex justify-between text-lg font-bold"><span>TOTAL :</span><span>{formatCFA(ticketData.total)}</span></div>
              <div className="text-center mt-6 text-xs text-zinc-600 border-t border-dashed pt-3">
                Merci de votre visite ✂️<br />À bientôt chez {authUser.fullName}
              </div>
            </div>
            <button onClick={handlePrint} className="mt-4 sm:mt-6 w-full bg-black text-white py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800">
              <Printer className="w-5 h-5" /> IMPRIMER LE TICKET
            </button>
          </div>
        </div>
      )}
    </div>
  );
}