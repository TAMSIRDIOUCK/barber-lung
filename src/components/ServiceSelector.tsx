// src/components/ServiceSelector.tsx
import { useState, useRef, useEffect, useMemo } from 'react';
import { Scissors, Sparkles, Baby, X, Printer, Box, Plus, Trash2, Edit2, AlertCircle, MoreHorizontal, Check } from 'lucide-react';import { supabase } from '../lib/supabase';
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

// Composant Modal Portal pour empêcher le scroll
function ModalPortal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  return (
    <div 
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}
    >
      <div onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// Modal d'ajout
function AddModal({ onAdd, placeholder, onClose }: { onAdd: (name: string, price: number) => Promise<string | null>; placeholder: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAdd = async () => {
    const n = name.trim();
    const p = parseInt(price, 10);
    if (!n) {
      setError('Nom requis');
      return;
    }
    if (isNaN(p) || p < 0) {
      setError('Prix invalide');
      return;
    }
    setLoading(true);
    const err = await onAdd(n, p);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
    onClose();
  };

  return (
    <ModalPortal onClose={onClose}>
      <div className="bg-zinc-900 rounded-2xl max-w-md w-full p-6 border border-zinc-700">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-white">Ajouter {placeholder}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Nom <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              placeholder={`Nom du ${placeholder}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition-colors"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Prix <span className="text-red-400">*</span>
            </label>
            <input
              type="number"
              placeholder="Prix en CFA"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full p-3 rounded-xl bg-zinc-800 text-white border border-zinc-700 focus:outline-none focus:border-white transition-colors"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-950/30 p-3 rounded-xl">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleAdd}
              disabled={loading}
              className="flex-1 bg-white text-black py-3 rounded-xl font-semibold hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Ajout en cours...' : 'Ajouter'}
            </button>
            <button
              onClick={onClose}
              className="flex-1 bg-zinc-800 text-white py-3 rounded-xl font-semibold hover:bg-zinc-700 transition"
            >
              Annuler
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

function ConfirmationDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

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

function ActionButtons({ onEdit, onDelete, onClose }: { onEdit: () => void; onDelete: () => void; onClose: () => void }) {
  return (
    <div className="flex gap-2">
      <button
        onClick={(e) => { e.stopPropagation(); onEdit(); onClose(); }}
        className="bg-blue-500 hover:bg-blue-600 text-white rounded-full p-1.5 transition-all shadow-lg"
        title="Modifier"
      >
        <Edit2 className="w-3 h-3" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); onClose(); }}
        className="bg-red-500 hover:bg-red-600 text-white rounded-full p-1.5 transition-all shadow-lg"
        title="Supprimer"
      >
        <Trash2 className="w-3 h-3" />
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

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

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
  // Remplace le booléen "withTeinture" par l'id de l'option teinture précisément sélectionnée
  const [selectedTeintureId, setSelectedTeintureId] = useState<number | null>(null);
  const [ticketData, setTicketData] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [editModal, setEditModal] = useState<{ item: any; type: 'service' | 'product' | 'soin' | 'teinture'; category?: string } | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [addModal, setAddModal] = useState<{ type: string; onAdd: (name: string, price: number) => Promise<string | null>; placeholder: string } | null>(null);
  const ticketRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const [services, setServices] = useState<Record<string, Service[]>>({
    coupeAdulte: [], coupeEnfant: [], teinture: [], produitSeul: [],
  });
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [soinOptions, setSoinOptions] = useState<SoinOption[]>([]);
  const [teintureSuppOptions, setTeintureSuppOptions] = useState<TeintureSuppOption[]>([]);

  // Fermer le menu au clic ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuId(null);
      }
    };
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

  // Option teinture actuellement sélectionnée (objet complet, pas juste un booléen)
  const selectedTeinture = useMemo(
    () => teintureSuppOptions.find((t) => t.id === selectedTeintureId) ?? null,
    [teintureSuppOptions, selectedTeintureId]
  );

  const totalAmount = useMemo(() => {
    if (!selectedService) return 0;
    let total = selectedService.basePrice;
    if (selectedTeinture && selectedCategory !== 'teinture') total += selectedTeinture.price;
    selectedProducts.forEach((name) => { const p = productOptions.find((p) => p.name === name); if (p) total += p.price; });
    selectedSoins.forEach((name) => { const s = soinOptions.find((s) => s.name === name); if (s) total += s.price; });
    return total;
  }, [selectedService, selectedTeinture, selectedProducts, selectedSoins, selectedCategory, productOptions, soinOptions]);

  const formatCFA = (value: number) => `${value.toLocaleString('fr-FR')} CFA`;

  const toggleItem = (name: string, list: string[], setList: React.Dispatch<React.SetStateAction<string[]>>) => {
    setList((prev) => prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name]);
  };

  const resetAll = () => {
    setSelectedCategory(null); setSelectedService(null); setSelectedBarber(null);
    setSelectedProducts([]); setSelectedSoins([]); setSelectedTeintureId(null);
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
        setActiveMenuId(null);
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
        setActiveMenuId(null);
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
        setActiveMenuId(null);
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
        // On ne désélectionne que si l'option supprimée était celle sélectionnée
        setSelectedTeintureId((prev) => (prev === id ? null : prev));
        setConfirmDialog(null);
        setActiveMenuId(null);
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
        with_teinture: !!selectedTeinture,
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
        withTeinture: !!selectedTeinture,
        teintureName: selectedTeinture?.name ?? null,
        teinturePrice: selectedTeinture && selectedCategory !== 'teinture' ? selectedTeinture.price : 0,
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

  // Composant pour les services
  const ServiceItem = ({ service, category }: { service: Service; category: string }) => {
    const isMenuOpen = activeMenuId === `service-${service.id}`;

    return (
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-4 sm:p-6 hover:border-white transition">
        {/* Zone de sélection - clic sur toute la carte sauf le menu */}
        <div 
          onClick={() => setSelectedService(service)}
          className="w-full text-left cursor-pointer pr-8"
        >
          <h3 className="text-white text-lg sm:text-2xl font-bold">{service.name}</h3>
          <p className="text-zinc-400 text-sm">{service.basePrice.toLocaleString('fr-FR')} CFA</p>
        </div>
        
        {/* Bouton à 3 points */}
        <div className="absolute top-3 right-3" ref={isMenuOpen ? menuRef : null}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenuId(isMenuOpen ? null : `service-${service.id}`);
            }}
            className="p-1.5 rounded-full hover:bg-zinc-800 transition-colors"
          >
            <MoreHorizontal className="w-5 h-5 text-zinc-400" />
          </button>
          
          {/* Menu des actions */}
          {isMenuOpen && (
            <div className="absolute top-full right-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-1 z-10 min-w-[120px]">
              <button
                onClick={() => {
                  setEditModal({ item: service, type: 'service', category });
                  setActiveMenuId(null);
                }}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
              >
                <Edit2 className="w-3 h-3" /> Modifier
              </button>
              <button
                onClick={() => {
                  removeService(category, service.id!, service.name);
                  setActiveMenuId(null);
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
              >
                <Trash2 className="w-3 h-3" /> Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Composant pour les produits/soins/teinture
  const ActionItem = ({ item, type, onEdit, onDelete, children }: { item: any; type: string; onEdit: () => void; onDelete: () => void; children: React.ReactNode }) => {
    const isMenuOpen = activeMenuId === `${type}-${item.id}`;

    return (
      <div className="relative bg-zinc-800 rounded-lg">
        {children}
        <div className="absolute top-1 right-1" ref={isMenuOpen ? menuRef : null}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenuId(isMenuOpen ? null : `${type}-${item.id}`);
            }}
            className="p-1 rounded-full hover:bg-zinc-700 transition-colors"
          >
            <MoreHorizontal className="w-4 h-4 text-zinc-400" />
          </button>
          
          {/* Menu des actions */}
          {isMenuOpen && (
            <div className="absolute top-full right-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-1 z-10 min-w-[120px]">
              <button
                onClick={() => {
                  onEdit();
                  setActiveMenuId(null);
                }}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
              >
                <Edit2 className="w-3 h-3" /> Modifier
              </button>
              <button
                onClick={() => {
                  onDelete();
                  setActiveMenuId(null);
                }}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
              >
                <Trash2 className="w-3 h-3" /> Supprimer
              </button>
            </div>
          )}
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
          <button 
            onClick={() => setAddModal({ type: 'service', onAdd: (name, price) => addService(selectedCategory, name, price), placeholder: 'service' })}
            className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm mt-3 transition"
          >
            <Plus className="w-4 h-4" /> Ajouter un service
          </button>
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
  <div className="flex justify-between items-center mb-3">
    <h4 className="text-white font-bold">Produits</h4>
    <button 
      onClick={() => setAddModal({ type: 'product', onAdd: addProduct, placeholder: 'produit' })}
      className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs transition"
    >
      <Plus className="w-3 h-3" /> Ajouter
    </button>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
    {productOptions.map((p) => {
      const isSelected = selectedProducts.includes(p.name);
      const isMenuOpen = activeMenuId === `product-${p.id}`;
      
      return (
        <div 
          key={p.id} 
          className={`relative bg-zinc-800 rounded-lg p-3 transition-all cursor-pointer ${
            isSelected ? 'ring-2 ring-green-500 bg-green-950/20' : 'hover:bg-zinc-750'
          }`}
          onClick={() => toggleItem(p.name, selectedProducts, setSelectedProducts)}
        >
          {/* Bouton à 3 points */}
          <div 
            className="absolute top-2 right-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuId(isMenuOpen ? null : `product-${p.id}`);
              }}
              className="p-1 rounded-full hover:bg-zinc-700 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4 text-zinc-400" />
            </button>
            
            {isMenuOpen && (
              <div 
                className="absolute top-full right-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-1 z-10 min-w-[120px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setEditModal({ item: p, type: 'product' });
                    setActiveMenuId(null);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
                >
                  <Edit2 className="w-3 h-3" /> Modifier
                </button>
                <button
                  onClick={() => {
                    removeProduct(p.id!, p.name);
                    setActiveMenuId(null);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
                >
                  <Trash2 className="w-3 h-3" /> Supprimer
                </button>
              </div>
            )}
          </div>
          
          {/* Nom du produit */}
          <div className="pr-6 mb-2">
            <span className="text-white text-sm font-medium block break-all">{p.name}</span>
          </div>
          
          {/* Prix et case à cocher - Case noire visible */}
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">{formatCFA(p.price)}</span>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
              isSelected 
                ? 'bg-black border-black' 
                : 'bg-zinc-700 border-zinc-500'
            }`}>
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
        </div>
      );
    })}
  </div>
</div>

{/* Soins */}
<div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-xl">
  <div className="flex justify-between items-center mb-3">
    <h4 className="text-white font-bold">Soins</h4>
    <button 
      onClick={() => setAddModal({ type: 'soin', onAdd: addSoin, placeholder: 'soin' })}
      className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs transition"
    >
      <Plus className="w-3 h-3" /> Ajouter
    </button>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
    {soinOptions.map((s) => {
      const isSelected = selectedSoins.includes(s.name);
      const isMenuOpen = activeMenuId === `soin-${s.id}`;
      
      return (
        <div 
          key={s.id} 
          className={`relative bg-zinc-800 rounded-lg p-3 transition-all cursor-pointer ${
            isSelected ? 'ring-2 ring-green-500 bg-green-950/20' : 'hover:bg-zinc-750'
          }`}
          onClick={() => toggleItem(s.name, selectedSoins, setSelectedSoins)}
        >
          {/* Bouton à 3 points */}
          <div 
            className="absolute top-2 right-2"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenuId(isMenuOpen ? null : `soin-${s.id}`);
              }}
              className="p-1 rounded-full hover:bg-zinc-700 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4 text-zinc-400" />
            </button>
            
            {isMenuOpen && (
              <div 
                className="absolute top-full right-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-1 z-10 min-w-[120px]"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setEditModal({ item: s, type: 'soin' });
                    setActiveMenuId(null);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
                >
                  <Edit2 className="w-3 h-3" /> Modifier
                </button>
                <button
                  onClick={() => {
                    removeSoin(s.id!, s.name);
                    setActiveMenuId(null);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
                >
                  <Trash2 className="w-3 h-3" /> Supprimer
                </button>
              </div>
            )}
          </div>
          
          {/* Nom du soin */}
          <div className="pr-6 mb-2">
            <span className="text-white text-sm font-medium block break-all">{s.name}</span>
          </div>
          
          {/* Prix et case à cocher - Case noire visible */}
          <div className="flex justify-between items-center">
            <span className="text-zinc-400 text-sm">{formatCFA(s.price)}</span>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
              isSelected 
                ? 'bg-black border-black' 
                : 'bg-zinc-700 border-zinc-500'
            }`}>
              {isSelected && <Check className="w-3 h-3 text-white" />}
            </div>
          </div>
        </div>
      );
    })}
  </div>
</div>

{/* Teinture supp */}
{selectedCategory !== 'teinture' && selectedCategory !== 'produitSeul' && (
  <div className="bg-zinc-900 border border-zinc-700 p-4 sm:p-6 rounded-xl">
    <div className="flex justify-between items-center mb-3">
      <h4 className="text-white font-bold">Teinture</h4>
      <button 
        onClick={() => setAddModal({ type: 'teinture', onAdd: addTeintureSupp, placeholder: 'option teinture' })}
        className="flex items-center gap-1 text-zinc-400 hover:text-white text-xs transition"
      >
        <Plus className="w-3 h-3" /> Ajouter
      </button>
    </div>
    {teintureSuppOptions.length === 0 && (
      <p className="text-zinc-500 text-sm mb-3">Aucune option teinture</p>
    )}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
      {teintureSuppOptions.map((t) => {
        // On compare l'id précis de CETTE option à l'id sélectionné, pas un booléen global
        const isSelected = selectedTeintureId === t.id;
        const isMenuOpen = activeMenuId === `teinture-${t.id}`;

        return (
          <div 
            key={t.id} 
            className={`relative bg-zinc-800 rounded-lg p-3 transition-all cursor-pointer ${
              isSelected ? 'ring-2 ring-green-500 bg-green-950/20' : 'hover:bg-zinc-750'
            }`}
            onClick={() => setSelectedTeintureId((prev) => (prev === t.id ? null : t.id!))}
          >
            {/* Bouton à 3 points */}
            <div 
              className="absolute top-2 right-2"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveMenuId(isMenuOpen ? null : `teinture-${t.id}`);
                }}
                className="p-1 rounded-full hover:bg-zinc-700 transition-colors"
              >
                <MoreHorizontal className="w-4 h-4 text-zinc-400" />
              </button>
              
              {isMenuOpen && (
                <div 
                  className="absolute top-full right-0 mt-1 bg-zinc-800 rounded-lg shadow-lg border border-zinc-700 p-1 z-10 min-w-[120px]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => {
                      setEditModal({ item: t, type: 'teinture' });
                      setActiveMenuId(null);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-white hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
                  >
                    <Edit2 className="w-3 h-3" /> Modifier
                  </button>
                  <button
                    onClick={() => {
                      removeTeintureSupp(t.id!, t.name);
                      setActiveMenuId(null);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-zinc-700 rounded-md transition flex items-center gap-2"
                  >
                    <Trash2 className="w-3 h-3" /> Supprimer
                  </button>
                </div>
              )}
            </div>
            
            {/* Nom de la teinture */}
            <div className="pr-6 mb-2">
              <span className="text-white text-sm font-medium block break-all">+ {t.name}</span>
            </div>
            
            {/* Prix et case à cocher - Case noire visible */}
            <div className="flex justify-between items-center">
              <span className="text-zinc-400 text-sm">{formatCFA(t.price)}</span>
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                isSelected 
                  ? 'bg-black border-black' 
                  : 'bg-zinc-700 border-zinc-500'
              }`}>
                {isSelected && <Check className="w-3 h-3 text-white" />}
              </div>
            </div>
          </div>
        );
      })}
    </div>
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
        <ModalPortal onClose={() => setTicketData(null)}>
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
                  <span>+ {ticketData.teintureName ?? 'Teinture'}</span>
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
        </ModalPortal>
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

      {/* Modal d'ajout */}
      {addModal && (
        <AddModal
          onAdd={addModal.onAdd}
          placeholder={addModal.placeholder}
          onClose={() => setAddModal(null)}
        />
      )}
    </div>
  );
}