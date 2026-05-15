// src/components/ServiceSelector.tsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { Scissors, Sparkles, Baby, X, Printer, Box, Plus, Trash2, Edit2 } from 'lucide-react';
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

function InlineAddForm({ onAdd, placeholder = "Nom" }: { onAdd: (name: string, price: number) => Promise<string | null>; placeholder?: string }) {
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
      <Plus className="w-4 h-4" /> Ajouter {placeholder}
    </button>
  );

  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input autoFocus type="text" placeholder={placeholder} value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="flex-1 min-w-0 bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-600 focus:outline-none focus:border-white" />
        <input type="number" placeholder="Prix" value={price}
          onChange={(e) => setPrice(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          className="w-full sm:w-28 bg-zinc-800 text-white text-sm rounded-lg px-3 py-2 border border-zinc-600 focus:outline-none focus:border-white" />
        <div className="flex gap-2">
          <button onClick={handleAdd} disabled={loading}
            className="bg-white text-black rounded-lg px-3 py-2 hover:bg-zinc-200 transition disabled:opacity-50">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={() => { setOpen(false); setError(''); }}
            className="text-zinc-500 hover:text-white transition px-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}
    </div>
  );
}

function ConfirmationDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl p-6 max-w-sm w-full border border-zinc-700">
        <p className="text-white text-center mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onConfirm} className="flex-1 bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition">
            Supprimer
          </button>
          <button onClick={onCancel} className="flex-1 bg-zinc-700 text-white py-2 rounded-lg hover:bg-zinc-600 transition">
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}

// Hook personnalisé pour détecter l'appui long
function useLongPress(onLongPress: () => void, onClick: () => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);

  const start = () => {
    isLongPress.current = false;
    timerRef.current = setTimeout(() => {
      isLongPress.current = true;
      onLongPress();
    }, 500);
  };

  const end = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (!isLongPress.current) {
      onClick();
    }
  };

  return {
    onTouchStart: start,
    onTouchEnd: end,
    onMouseDown: start,
    onMouseUp: end,
  };
}

function ActionButtons({ onEdit, onDelete, isActive }: { onEdit: () => void; onDelete: () => void; isActive: boolean }) {
  return (
    <div className={`flex gap-2 transition-all duration-200 ${isActive ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none'}`}>
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); }}
        className="bg-blue-500 hover:bg-blue-600 text-white rounded-full p-2 transition-all shadow-lg"
        title="Modifier"
      >
        <Edit2 className="w-4 h-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="bg-red-500 hover:bg-red-600 text-white rounded-full p-2 transition-all shadow-lg"
        title="Supprimer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function EditModal({ item, type, onSave, onClose }: { 
  item: any; 
  type: 'service' | 'product' | 'soin' | 'teinture';
  onSave: (id: number, name: string, price: number) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(item.name);
  const [price, setPrice] = useState(item.price?.toString() || item.basePrice?.toString() || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    const newName = name.trim();
    const newPrice = parseInt(price, 10);
    if (!newName || isNaN(newPrice) || newPrice < 0) return;
    setLoading(true);
    await onSave(item.id, newName, newPrice);
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl p-6 max-w-md w-full border border-zinc-700">
        <h3 className="text-white text-xl font-bold mb-4">Modifier</h3>
        <input type="text" value={name} onChange={(e) => setName(e.target.value)}
          className="w-full bg-zinc-800 text-white rounded-lg px-4 py-2 mb-3 border border-zinc-600 focus:outline-none focus:border-white"
          placeholder="Nom" />
        <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
          className="w-full bg-zinc-800 text-white rounded-lg px-4 py-2 mb-4 border border-zinc-600 focus:outline-none focus:border-white"
          placeholder="Prix" />
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={loading}
            className="flex-1 bg-white text-black py-2 rounded-lg hover:bg-zinc-200 transition disabled:opacity-50">
            Sauvegarder
          </button>
          <button onClick={onClose}
            className="flex-1 bg-zinc-700 text-white py-2 rounded-lg hover:bg-zinc-600 transition">
            Annuler
          </button>
        </div>
      </div>
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
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [editModal, setEditModal] = useState<{ item: any; type: 'service' | 'product' | 'soin' | 'teinture'; category?: string } | null>(null);
  const [activeActionItem, setActiveActionItem] = useState<string | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);

  const [services, setServices] = useState<Record<string, Service[]>>({
    coupeAdulte: [], coupeEnfant: [], teinture: [], produitSeul: [],
  });
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [soinOptions, setSoinOptions] = useState<SoinOption[]>([]);
  const [teintureSuppOptions, setTeintureSuppOptions] = useState<TeintureSuppOption[]>([]);

  // Fermer les actions au clic ailleurs
  useEffect(() => {
    const handleClickOutside = () => setActiveActionItem(null);
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

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

  // CRUD Services
  const addService = async (cat: string, name: string, price: number): Promise<string | null> => {
    if (services[cat].find((s) => s.name === name)) return 'Nom déjà utilisé';
    const { data, error } = await supabase.from('catalogue_services')
      .insert([{ name, base_price: price, category: cat, user_id: userId }]).select().single();
    if (error) return 'Erreur : ' + error.message;
    setServices((prev) => ({ ...prev, [cat]: [...prev[cat], { id: data.id, name: data.name, basePrice: data.base_price, category: cat }] }));
    return null;
  };

  const removeService = async (cat: string, id: number, name: string) => {
    setConfirmDialog({
      message: `Supprimer "${name}" ?`,
      onConfirm: async () => {
        await supabase.from('catalogue_services').delete().eq('id', id);
        setServices((prev) => ({ ...prev, [cat]: prev[cat].filter((s) => s.id !== id) }));
        if (selectedService?.id === id) resetAll();
        setConfirmDialog(null);
        setActiveActionItem(null);
      }
    });
  };

  const updateService = async (cat: string, id: number, name: string, price: number) => {
    const { error } = await supabase.from('catalogue_services').update({ name, base_price: price }).eq('id', id);
    if (!error) {
      setServices((prev) => ({
        ...prev,
        [cat]: prev[cat].map((s) => s.id === id ? { ...s, name, basePrice: price } : s)
      }));
      if (selectedService?.id === id) setSelectedService({ ...selectedService, name, basePrice: price });
    }
  };

  // CRUD Produits
  const addProduct = async (name: string, price: number): Promise<string | null> => {
    if (productOptions.find((p) => p.name === name)) return 'Nom déjà utilisé';
    const { data, error } = await supabase.from('catalogue_produits').insert([{ name, price, user_id: userId }]).select().single();
    if (error) return 'Erreur : ' + error.message;
    setProductOptions((prev) => [...prev, { id: data.id, name: data.name, price: data.price }]);
    return null;
  };

  const removeProduct = async (id: number, name: string) => {
    setConfirmDialog({
      message: `Supprimer "${name}" ?`,
      onConfirm: async () => {
        await supabase.from('catalogue_produits').delete().eq('id', id);
        setProductOptions((prev) => prev.filter((p) => p.id !== id));
        setSelectedProducts((prev) => prev.filter((n) => n !== name));
        setConfirmDialog(null);
        setActiveActionItem(null);
      }
    });
  };

  const updateProduct = async (id: number, name: string, price: number) => {
    const { error } = await supabase.from('catalogue_produits').update({ name, price }).eq('id', id);
    if (!error) setProductOptions((prev) => prev.map((p) => p.id === id ? { ...p, name, price } : p));
  };

  // CRUD Soins
  const addSoin = async (name: string, price: number): Promise<string | null> => {
    if (soinOptions.find((s) => s.name === name)) return 'Nom déjà utilisé';
    const { data, error } = await supabase.from('catalogue_soins').insert([{ name, price, user_id: userId }]).select().single();
    if (error) return 'Erreur : ' + error.message;
    setSoinOptions((prev) => [...prev, { id: data.id, name: data.name, price: data.price }]);
    return null;
  };

  const removeSoin = async (id: number, name: string) => {
    setConfirmDialog({
      message: `Supprimer "${name}" ?`,
      onConfirm: async () => {
        await supabase.from('catalogue_soins').delete().eq('id', id);
        setSoinOptions((prev) => prev.filter((s) => s.id !== id));
        setSelectedSoins((prev) => prev.filter((n) => n !== name));
        setConfirmDialog(null);
        setActiveActionItem(null);
      }
    });
  };

  const updateSoin = async (id: number, name: string, price: number) => {
    const { error } = await supabase.from('catalogue_soins').update({ name, price }).eq('id', id);
    if (!error) setSoinOptions((prev) => prev.map((s) => s.id === id ? { ...s, name, price } : s));
  };

  // CRUD Teinture Supp
  const addTeintureSupp = async (name: string, price: number): Promise<string | null> => {
    if (teintureSuppOptions.find((t) => t.name === name)) return 'Nom déjà utilisé';
    const { data, error } = await supabase.from('catalogue_teintures_supp').insert([{ name, price, user_id: userId }]).select().single();
    if (error) return 'Erreur : ' + error.message;
    setTeintureSuppOptions((prev) => [...prev, { id: data.id, name: data.name, price: data.price }]);
    return null;
  };

  const removeTeintureSupp = async (id: number, name: string) => {
    setConfirmDialog({
      message: `Supprimer "${name}" ?`,
      onConfirm: async () => {
        await supabase.from('catalogue_teintures_supp').delete().eq('id', id);
        setTeintureSuppOptions((prev) => prev.filter((t) => t.id !== id));
        setWithTeinture(false);
        setConfirmDialog(null);
        setActiveActionItem(null);
      }
    });
  };

  const updateTeintureSupp = async (id: number, name: string, price: number) => {
    const { error } = await supabase.from('catalogue_teintures_supp').update({ name, price }).eq('id', id);
    if (!error) setTeintureSuppOptions((prev) => prev.map((t) => t.id === id ? { ...t, name, price } : t));
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
        salonName,
        serviceName: selectedService.name,
        barberName: selectedBarber ?? 'Non défini',
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
    w.document.write(`
      <html><head><title>Ticket ${salonName}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .text-center { text-align: center; }
        .border-dashed { border-top: 1px dashed #ccc; }
        .text-xs { font-size: 12px; }
      </style></head>
      <body>${ticketRef.current.innerHTML}</body></html>
    `);
    w.document.close(); w.print(); w.close();
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

  // Composant d'élément avec appui long
  const ServiceItem = ({ service, category }: { service: Service; category: string }) => {
    const [showActions, setShowActions] = useState(false);
    const isActive = activeActionItem === `service-${service.id}`;

    const longPress = useLongPress(
      () => {
        setActiveActionItem(`service-${service.id}`);
        setShowActions(true);
      },
      () => {
        if (!showActions) {
          setSelectedService(service);
        }
        setShowActions(false);
      }
    );

    return (
      <div className="relative group bg-zinc-900 border border-zinc-700 rounded-2xl p-4 sm:p-6 hover:border-white transition">
        <div {...longPress} className="w-full text-left cursor-pointer">
          <h3 className="text-white text-lg sm:text-2xl font-bold">{service.name}</h3>
          <p className="text-zinc-400 text-sm">{service.basePrice.toLocaleString('fr-FR')} CFA</p>
        </div>
        <div className="absolute top-3 right-3">
          <ActionButtons
            onEdit={() => setEditModal({ item: service, type: 'service', category })}
            onDelete={() => removeService(category, service.id!, service.name)}
            isActive={isActive}
          />
        </div>
      </div>
    );
  };

  // Composant pour les produits/soins avec appui long
  const ActionItem = ({ item, type, onEdit, onDelete, children }: { item: any; type: string; onEdit: () => void; onDelete: () => void; children: React.ReactNode }) => {
    const isActive = activeActionItem === `${type}-${item.id}`;
    
    const longPress = useLongPress(
      () => setActiveActionItem(`${type}-${item.id}`),
      () => setActiveActionItem(null)
    );

    return (
      <div {...longPress} className="relative group bg-zinc-800 rounded-lg">
        {children}
        <div className="absolute top-1 right-1">
          <ActionButtons onEdit={onEdit} onDelete={onDelete} isActive={isActive} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-4 sm:px-0">

      {/* ── Catégories ── */}
      {!selectedCategory && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
          {Object.keys(services).map((cat) => (
            <button key={cat} onClick={() => {
              setSelectedCategory(cat);
              if (cat === 'produitSeul') setSelectedService(services[cat][0] ?? { name: 'Produit Seul', basePrice: 0, category: cat });
              else setSelectedService({ name: '', basePrice: 0, category: cat });
            }} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-4 sm:p-8 hover:border-white transition flex flex-col items-center group">
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
          <button onClick={resetAll} className="text-zinc-400 mb-4 text-sm hover:text-white transition">← Retour</button>
          <h4 className="text-white text-lg sm:text-xl font-bold mb-4">Choisissez un service :</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6">
            {services[selectedCategory].map((service) => (
              <ServiceItem key={service.id} service={service} category={selectedCategory} />
            ))}
          </div>
          <InlineAddForm onAdd={(name, price) => addService(selectedCategory, name, price)} placeholder="service" />
        </div>
      )}

      {/* ── Options ── */}
      {selectedService?.name && (
        <div className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <h3 className="text-white text-xl sm:text-2xl font-bold break-all">{selectedService.name}</h3>
            <button onClick={resetAll} className="text-zinc-400 text-sm hover:text-white transition">← Retour aux catégories</button>
          </div>

          {/* Coiffeurs */}
          <div>
            <h4 className="text-white text-base sm:text-xl font-bold mb-3 sm:mb-4">
              Choisissez un coiffeur : <span className="text-zinc-500 text-sm font-normal">(optionnel)</span>
            </h4>
            <BarberManager
              userId={userId}
              onSelect={(barber) => {
                setSelectedBarber((prev) =>
                  prev === (barber?.name ?? null) ? null : (barber?.name ?? null)
                );
              }}
              selectedBarberName={selectedBarber}
            />
          </div>

          {/* Produits */}
          <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-xl">
            <h4 className="text-white font-bold mb-3 sm:mb-4">Produits</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {productOptions.map((p) => (
                <ActionItem
                  key={p.id}
                  item={p}
                  type="product"
                  onEdit={() => setEditModal({ item: p, type: 'product' })}
                  onDelete={() => removeProduct(p.id!, p.name)}
                >
                  <label className="flex justify-between items-center px-3 sm:px-4 py-2 cursor-pointer">
                    <span className="text-white text-sm break-all flex-1 mr-2">{p.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-zinc-400 text-xs">{formatCFA(p.price)}</span>
                      <input type="checkbox" checked={selectedProducts.includes(p.name)}
                        onChange={() => toggleItem(p.name, selectedProducts, setSelectedProducts)}
                        className="w-5 h-5 accent-white" />
                    </div>
                  </label>
                </ActionItem>
              ))}
            </div>
            <InlineAddForm onAdd={addProduct} placeholder="produit" />
          </div>

          {/* Soins */}
          <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-xl">
            <h4 className="text-white font-bold mb-3 sm:mb-4">Soins</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              {soinOptions.map((s) => (
                <ActionItem
                  key={s.id}
                  item={s}
                  type="soin"
                  onEdit={() => setEditModal({ item: s, type: 'soin' })}
                  onDelete={() => removeSoin(s.id!, s.name)}
                >
                  <label className="flex justify-between items-center px-3 sm:px-4 py-2 cursor-pointer">
                    <span className="text-white text-sm break-all flex-1 mr-2">{s.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-zinc-400 text-xs">{formatCFA(s.price)}</span>
                      <input type="checkbox" checked={selectedSoins.includes(s.name)}
                        onChange={() => toggleItem(s.name, selectedSoins, setSelectedSoins)}
                        className="w-5 h-5 accent-white" />
                    </div>
                  </label>
                </ActionItem>
              ))}
            </div>
            <InlineAddForm onAdd={addSoin} placeholder="soin" />
          </div>

          {/* Teinture supp */}
          {selectedCategory !== 'teinture' && selectedCategory !== 'produitSeul' && (
            <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-xl">
              <h4 className="text-white font-bold mb-3 sm:mb-4">Teinture</h4>
              {teintureSuppOptions.length === 0 && (
                <p className="text-zinc-500 text-sm mb-3"></p>
              )}
              {teintureSuppOptions.map((t) => (
                <ActionItem
                  key={t.id}
                  item={t}
                  type="teinture"
                  onEdit={() => setEditModal({ item: t, type: 'teinture' })}
                  onDelete={() => removeTeintureSupp(t.id!, t.name)}
                >
                  <label className="flex justify-between items-center px-3 sm:px-4 py-2 cursor-pointer">
                    <span className="text-white text-sm break-all flex-1 mr-2">
                      + {t.name} ({t.price.toLocaleString('fr-FR')} CFA)
                    </span>
                    <input type="checkbox" checked={withTeinture}
                      onChange={(e) => setWithTeinture(e.target.checked)}
                      className="w-5 h-5 accent-white shrink-0" />
                  </label>
                </ActionItem>
              ))}
              <InlineAddForm onAdd={addTeintureSupp} placeholder="option teinture" />
            </div>
          )}

          {/* Total */}
          <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-xl text-right">
            <span className="text-white text-lg sm:text-xl font-bold">Total : {formatCFA(totalAmount)}</span>
          </div>

          <button onClick={handleValidate} disabled={isSubmitting}
            className="w-full bg-white text-black py-4 sm:py-5 rounded-xl font-bold text-lg sm:text-xl hover:bg-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed">
            {isSubmitting ? 'Validation...' : 'VALIDER'}
          </button>
        </div>
      )}

      {/* ── Ticket ── */}
      {ticketData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 sm:p-8 w-full max-w-md relative shadow-2xl max-h-[90vh] overflow-y-auto">
            <button onClick={() => setTicketData(null)} className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-700">
              <X className="w-6 h-6" />
            </button>
            <div ref={ticketRef}>
              <div className="text-center mb-4">
                <h2 className="text-xl sm:text-2xl font-bold uppercase">{ticketData.salonName}</h2>
                <p className="text-xs text-zinc-500">Salon de Coiffure — {authUser.fullName}</p>
              </div>
              <hr className="border-dashed border-zinc-400 my-3" />
              <div className="flex justify-between text-sm mb-2"><span>N° Ticket :</span><span className="font-bold">{ticketData.receiptNumber}</span></div>
              <div className="flex justify-between text-sm mb-2"><span>Date :</span><span>{new Date(ticketData.date).toLocaleString('fr-FR')}</span></div>
              <div className="flex justify-between text-sm mb-4"><span>Coiffeur :</span><span>{ticketData.barberName}</span></div>

              <h3 className="font-bold text-black mb-2">Service principal :</h3>
              <div className="flex justify-between text-sm mb-2">
                <span>{ticketData.serviceName}</span>
                <span>{formatCFA(ticketData.basePrice)}</span>
              </div>

              {ticketData.withTeinture && ticketData.teinturePrice > 0 && (
                <div className="flex justify-between text-sm mb-2">
                  <span>+ Teinture</span>
                  <span>{formatCFA(ticketData.teinturePrice)}</span>
                </div>
              )}

              {ticketData.produits.length > 0 && (
                <>
                  <h3 className="font-bold text-black mt-3 mb-1">Produits :</h3>
                  {ticketData.produits.map((p: any, i: number) => (
                    <div key={p.name + i} className="flex justify-between text-sm">
                      <span>{p.name}</span><span>{formatCFA(p.price)}</span>
                    </div>
                  ))}
                </>
              )}

              {ticketData.soins.length > 0 && (
                <>
                  <h3 className="font-bold text-black mt-3 mb-1">Soins :</h3>
                  {ticketData.soins.map((s: any, i: number) => (
                    <div key={s.name + i} className="flex justify-between text-sm">
                      <span>{s.name}</span><span>{formatCFA(s.price)}</span>
                    </div>
                  ))}
                </>
              )}

              <hr className="border-dashed border-zinc-400 my-3" />
              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL :</span><span>{formatCFA(ticketData.total)}</span>
              </div>
              <div className="text-center mt-6 text-xs text-zinc-600 border-t border-dashed pt-3">
                Merci de votre visite ✂️<br />À bientôt chez {authUser.fullName}
              </div>
            </div>
            <button onClick={handlePrint}
              className="mt-4 sm:mt-6 w-full bg-black text-white py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800 transition">
              <Printer className="w-5 h-5" /> IMPRIMER LE TICKET
            </button>
          </div>
        </div>
      )}

      {confirmDialog && (
        <ConfirmationDialog
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}

      {editModal && (
        <EditModal
          item={editModal.item}
          type={editModal.type}
          onSave={async (id, name, price) => {
            if (editModal.type === 'service' && editModal.category) await updateService(editModal.category, id, name, price);
            else if (editModal.type === 'product') await updateProduct(id, name, price);
            else if (editModal.type === 'soin') await updateSoin(id, name, price);
            else if (editModal.type === 'teinture') await updateTeintureSupp(id, name, price);
            setEditModal(null);
          }}
          onClose={() => setEditModal(null)}
        />
      )}
    </div>
  );
}