import { useState, useRef, useEffect, useMemo } from 'react';
import { Scissors, Sparkles, Baby, X, Printer, Box } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Service {
  name: string;
  basePrice: number;
}

interface ServiceSelectorProps {
  onConfirm: (serviceName: string, amount: number, options: any) => void;
}

export function ServiceSelector({ onConfirm }: ServiceSelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<Service | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedSoins, setSelectedSoins] = useState<string[]>([]);
  const [withTeinture, setWithTeinture] = useState(false);
  const [ticketData, setTicketData] = useState<any | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const ticketRef = useRef<HTMLDivElement>(null);

  const services: Record<string, Service[]> = {
    coupeAdulte: [
      { name: 'Dégradé', basePrice: 4000 },
      { name: 'Taper', basePrice: 4000 },
      { name: 'Coupe Classique', basePrice: 5000 },
      { name: 'Coupe Simple', basePrice: 3000 },
      { name: 'Contour', basePrice: 2000 },
    ],
    coupeEnfant: [
      { name: 'Dégradé Enfant', basePrice: 3000 },
      { name: 'Taper Enfant', basePrice: 3000 },
      { name: 'Coupe Classique Enfant', basePrice: 4000 },
      { name: 'Coupe Simple Enfant', basePrice: 2000 },
      { name: 'Contour Enfant', basePrice: 1500 },
    ],
    teinture: [{ name: 'Teinture rouge', basePrice: 8000 },
      { name: 'Teinture rouge', basePrice: 10000 },

      { name: 'coupe+Teinture blanc', basePrice: 12000 },
      { name: 'coupe+Teinture blanc', basePrice: 15000 },

      { name: 'coupe+Teinture', basePrice: 10000 },
    ],
    produitSeul: [{ name: 'Produit Seul', basePrice: 0 }], // Nouveau service
  };

  

// ✅ Produits
const productOptions = [
  { name: 'Easy Curls', price: 7000 },
  { name: 'Pure Gel', price: 6000 },
  { name: 'Cantu', price: 7000 },
  { name: 'Olive Oil', price: 2500 },
  { name: 'Wave', price: 5000 },
  { name: 'Brosse', price: 3000 },
  { name: 'Brosse', price: 6000 },

  { name: 'Éponge', price: 2000 },
  { name: 'Dureg', price: 2000 },
  { name: 'Dureg', price: 3000 },

  { name: 'Huile Barbe', price: 10000 },
  { name: 'Parfum Homme', price: 20000 },
  { name: 'New Product', price: 15000 },
  { name: 'puff', price: 9000 },

];

  const soinOptions = [
    { name: 'Pédicure', price: 5000 },
    { name: 'Manicure', price: 5000 },
    { name: 'Soin de Visage', price: 5000 },
  ];

  const totalAmount = useMemo(() => {
    if (!selectedService) return 0;
    let total = selectedService.basePrice;

    if (withTeinture && selectedCategory !== 'teinture') total += 1000;

    selectedProducts.forEach((name) => {
      const product = productOptions.find((p) => p.name === name);
      if (product) total += product.price;
    });

    selectedSoins.forEach((name) => {
      const soin = soinOptions.find((s) => s.name === name);
      if (soin) total += soin.price;
    });

    return total;
  }, [selectedService, withTeinture, selectedProducts, selectedSoins, selectedCategory]);

  const formatCFA = (value: number) => `${value.toLocaleString('fr-FR')} CFA`;

  const toggleItem = (name: string, list: string[], setList: any) => {
    setList((prev: string[]) =>
      prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name]
    );
  };

  const resetAll = () => {
    setSelectedCategory(null);
    setSelectedService(null);
    setSelectedProducts([]);
    setSelectedSoins([]);
    setWithTeinture(false);
  };

  const handleValidate = async () => {
    if (!selectedService || isSubmitting) return;
    setIsSubmitting(true);
    const now = new Date();

    try {
      await supabase.from('transactions').insert([
        {
          service_name: selectedService.name,
          amount: totalAmount,
          options: {
            withTeinture,
            produits: selectedProducts,
            soins: selectedSoins,
          },
          transaction_date: now.toISOString(),
        },
      ]);

      const newTicket = {
        receiptNumber: 'T' + Date.now().toString().slice(-6),
        serviceName: selectedService.name,
        basePrice: selectedService.basePrice,
        produits: selectedProducts.map((name) => productOptions.find((p) => p.name === name)),
        soins: selectedSoins.map((name) => soinOptions.find((s) => s.name === name)),
        withTeinture,
        teinturePrice: withTeinture && selectedCategory !== 'teinture' ? 1000 : 0,
        total: totalAmount,
        date: now.toISOString(),
      };

      setTicketData(newTicket);
      onConfirm(selectedService.name, totalAmount, newTicket);
      resetAll();
    } catch (error) {
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    if (!ticketRef.current) return;
    const printWindow = window.open('', '', 'width=350,height=600');
    if (!printWindow) return;
    printWindow.document.write(ticketRef.current.innerHTML);
    printWindow.document.close();
    printWindow.print();
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setTicketData(null);
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);

  return (
    <div className="space-y-6">
      {/* Catégories */}
      {!selectedCategory && (
        <div className="grid md:grid-cols-4 gap-6">
          <button onClick={() => setSelectedCategory('coupeAdulte')} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 hover:border-white transition">
            <Scissors className="w-16 h-16 text-white mx-auto mb-3" />
            <h3 className="text-white text-2xl font-bold">Coupe Adulte</h3>
          </button>
          <button onClick={() => setSelectedCategory('coupeEnfant')} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 hover:border-white transition">
            <Baby className="w-16 h-16 text-white mx-auto mb-3" />
            <h3 className="text-white text-2xl font-bold">Coupe Enfant</h3>
          </button>
          <button onClick={() => setSelectedCategory('teinture')} className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 hover:border-white transition">
            <Sparkles className="w-16 h-16 text-white mx-auto mb-3" />
            <h3 className="text-white text-2xl font-bold">Teinture</h3>
          </button>
          <button
            onClick={() => {
              setSelectedCategory('produitSeul');
              setSelectedService(services.produitSeul[0]);
            }}
            className="bg-zinc-900 border border-zinc-700 rounded-2xl p-8 hover:border-white transition"
          >
            <Box className="w-16 h-16 text-white mx-auto mb-3" />
            <h3 className="text-white text-2xl font-bold">Produit Seul</h3>
          </button>
        </div>
      )}

      {/* Services */}
      {selectedCategory && selectedCategory !== 'produitSeul' && !selectedService && (
        <div>
          <button onClick={resetAll} className="text-zinc-400 mb-4">← Retour</button>
          <div className="grid md:grid-cols-2 gap-4">
            {services[selectedCategory].map((s) => (
              <button key={s.name} onClick={() => setSelectedService(s)} className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl hover:border-white text-left">
                <h4 className="text-white text-xl font-semibold">{s.name}</h4>
                <p className="text-zinc-400">{formatCFA(s.basePrice)}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Options & Validation */}
      {selectedService && (
        <div className="space-y-6">
          <div className="flex justify-between">
            <h3 className="text-white text-2xl font-bold">{selectedService.name}</h3>
            <button onClick={resetAll} className="text-zinc-400">← Retour</button>
          </div>

          {/* Produits */}
          <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl">
            <h4 className="text-white font-bold mb-4">Produits</h4>
            <div className="grid md:grid-cols-2 gap-3">
              {productOptions.map((p) => (
                <label key={p.name} className="flex justify-between items-center bg-zinc-800 rounded-lg px-4 py-2">
                  <span className="text-white">{p.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 text-sm">{formatCFA(p.price)}</span>
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(p.name)}
                      onChange={() => toggleItem(p.name, selectedProducts, setSelectedProducts)}
                      className="w-5 h-5 accent-white"
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Soins */}
          <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl">
            <h4 className="text-white font-bold mb-4">Soins</h4>
            <div className="grid md:grid-cols-2 gap-3">
              {soinOptions.map((s) => (
                <label key={s.name} className="flex justify-between items-center bg-zinc-800 rounded-lg px-4 py-2">
                  <span className="text-white">{s.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400 text-sm">{formatCFA(s.price)}</span>
                    <input
                      type="checkbox"
                      checked={selectedSoins.includes(s.name)}
                      onChange={() => toggleItem(s.name, selectedSoins, setSelectedSoins)}
                      className="w-5 h-5 accent-white"
                    />
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Teinture */}
          {selectedCategory !== 'teinture' && selectedCategory !== 'produitSeul' && (
            <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl">
              <label className="flex justify-between items-center bg-zinc-800 rounded-lg px-4 py-2">
                <span className="text-white">+ Teinture (1000 CFA)</span>
                <input
                  type="checkbox"
                  checked={withTeinture}
                  onChange={(e) => setWithTeinture(e.target.checked)}
                  className="w-5 h-5 accent-white"
                />
              </label>
            </div>
          )}

          {/* Total */}
          <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl text-right">
            <span className="text-white text-xl font-bold">Total : {formatCFA(totalAmount)}</span>
          </div>

          <button
            onClick={handleValidate}
            disabled={isSubmitting}
            className="w-full bg-white text-black py-5 rounded-xl font-bold text-xl hover:bg-zinc-200"
          >
            VALIDER
          </button>
        </div>
      )}

      {/* Ticket */}
      {ticketData && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full relative shadow-2xl">
            <button onClick={() => setTicketData(null)} className="absolute top-4 right-4 text-zinc-500">
              <X className="w-6 h-6" />
            </button>

            <div ref={ticketRef}>
              <div className="text-center mb-4">
                <h2 className="text-2xl font-bold">BARBER LOUNGE</h2>
                <p className="text-xs text-zinc-500">Salon de Coiffure - Dakar, Sénégal</p>
              </div>

              <hr className="border-dashed border-zinc-400 my-3" />

              <div className="flex justify-between text-sm mb-2">
                <span>N° Ticket:</span>
                <span className="font-bold">{ticketData.receiptNumber}</span>
              </div>

              <div className="flex justify-between text-sm mb-4">
                <span>Date:</span>
                <span>{new Date(ticketData.date).toLocaleString('fr-FR')}</span>
              </div>

              <h3 className="font-bold text-black mb-2">Service principal :</h3>
              <div className="flex justify-between text-sm mb-2">
                <span>{ticketData.serviceName}</span>
                <span>{formatCFA(ticketData.basePrice)}</span>
              </div>

              {ticketData.withTeinture && (
                <div className="flex justify-between text-sm mb-2">
                  <span>+ Teinture</span>
                  <span>{formatCFA(ticketData.teinturePrice)}</span>
                </div>
              )}

              {ticketData.produits.length > 0 && (
                <>
                  <h3 className="font-bold text-black mt-3 mb-1">Produits :</h3>
                  {ticketData.produits.map((p: any) => (
                    <div key={p.name} className="flex justify-between text-sm">
                      <span>{p.name}</span>
                      <span>{formatCFA(p.price)}</span>
                    </div>
                  ))}
                </>
              )}

              {ticketData.soins.length > 0 && (
                <>
                  <h3 className="font-bold text-black mt-3 mb-1">Soins :</h3>
                  {ticketData.soins.map((s: any) => (
                    <div key={s.name} className="flex justify-between text-sm">
                      <span>{s.name}</span>
                      <span>{formatCFA(s.price)}</span>
                    </div>
                  ))}
                </>
              )}

              <hr className="border-dashed border-zinc-400 my-3" />

              <div className="flex justify-between text-lg font-bold">
                <span>TOTAL :</span>
                <span>{formatCFA(ticketData.total)}</span>
              </div>

              <div className="text-center mt-6 text-xs text-zinc-600 border-t border-dashed pt-3">
                Merci de votre visite ✂️<br />
                À bientôt chez Barber Lounge
              </div>
            </div>

            <button
              onClick={handlePrint}
              className="mt-6 w-full bg-black text-white py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-zinc-800"
            >
              <Printer className="w-5 h-5" /> IMPRIMER LE TICKET
            </button>
          </div>
        </div>
      )}
    </div>
  );
}