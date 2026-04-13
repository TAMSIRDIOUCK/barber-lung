// src/components/LandingPage.tsx
import { useState } from 'react';
import { Scissors, TrendingUp, DollarSign, Users, Shield, Printer, Check, ChevronDown } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const features = [
    { icon: Scissors, title: 'Gestion des services', desc: 'Catalogue personnalisable de coupes, teintures et soins. Ajout rapide en temps réel.' },
    { icon: TrendingUp, title: 'Suivi des revenus', desc: 'Revenus par jour, semaine, mois ou année. Courbes et stats par coiffeur.' },
    { icon: Printer, title: 'Tickets d\'impression', desc: 'Générez et imprimez des tickets pour chaque transaction.' },
    { icon: Users, title: 'Équipe coiffeurs', desc: 'Profils photo, statistiques individuelles et performance par membre.' },
    { icon: DollarSign, title: 'Gestion des dépenses', desc: 'Revenue net calculé automatiquement. Vue comptable claire.' },
    { icon: Shield, title: 'Données sécurisées', desc: 'Chaque salon a son espace isolé. Vos données sont privées.' },
  ];

  const faqs = [
    { q: 'Puis-je annuler à tout moment ?', r: 'Oui, vous pouvez annuler votre abonnement à tout moment depuis votre espace client.' },
    { q: 'Mes données sont-elles sécurisées ?', r: 'Absolument. Chaque salon a son propre espace isolé. Vos données sont chiffrées et inaccessibles aux autres utilisateurs.' },
    { q: 'Puis-je utiliser l\'app sur mobile ?', r: "Oui, l'application est entièrement responsive et optimisée pour mobile avec une navigation native." },
    { q: 'Comment payer mon abonnement ?', r: 'Nous acceptons Wave et Orange Money pour votre confort au Sénégal.' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Scissors className="w-4 h-4 text-black" />
            </div>
            <span className="font-bold tracking-widest text-xs sm:text-sm uppercase">La Coupe</span>
          </div>
          <button
            onClick={onGetStarted}
            className="bg-white text-black font-bold text-xs sm:text-sm px-4 sm:px-6 py-2 sm:py-2.5 rounded-full hover:bg-zinc-200 transition"
          >
            Commencer →
          </button>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section className="pt-28 sm:pt-36 pb-16 sm:pb-24 px-4 text-center relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-yellow-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-xs font-medium px-4 py-1.5 rounded-full mb-8">
            <span className="w-1.5 h-1.5 bg-yellow-400 rounded-full animate-pulse" />
            Disponible maintenant — Dakar, Sénégal
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tighter leading-none mb-6">
            Gérez votre<br />
            <span className="text-yellow-400">salon</span><br />
            simplement.
          </h1>

          <p className="text-zinc-400 text-base sm:text-lg max-w-md mx-auto mb-10 leading-relaxed font-light">
            Le système de gestion tout-en-un pour les salons de coiffure professionnels.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto bg-white text-black font-bold px-8 py-4 rounded-2xl text-base hover:bg-zinc-200 transition hover:-translate-y-0.5"
            >
              Commencer gratuitement 
              
            </button>
            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto bg-transparent text-zinc-400 font-medium px-8 py-4 rounded-2xl text-base border border-zinc-700 hover:border-zinc-500 hover:text-white transition"
            >
              Se connecter
            </button>
          </div>
        </div>

        {/* Phone mockup */}
        <div className="relative z-10 mt-16 flex justify-center">
          <div className="relative">
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-64 h-16 bg-yellow-500/10 blur-2xl rounded-full" />

            <div className="w-[240px] sm:w-[280px] h-[480px] sm:h-[560px] bg-zinc-900 rounded-[40px] border border-zinc-700 relative overflow-hidden shadow-2xl">
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-20 h-5 bg-black rounded-full z-10" />

              <div className="h-full flex flex-col bg-zinc-950">
                <div className="bg-black px-4 pt-12 pb-3 border-b border-zinc-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-white rounded-lg flex items-center justify-center">
                      <Scissors className="w-3 h-3 text-black" />
                    </div>
                    <span className="text-white font-bold text-[10px] tracking-widest uppercase">La Coupe</span>
                  </div>
                  <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1">
                    <span className="text-yellow-400 text-[8px]">★</span>
                    <span className="text-white text-[8px] font-bold">Mensuel</span>
                  </div>
                </div>

                <div className="flex-1 p-3">
                  <p className="text-white text-[10px] font-bold text-center mb-3">Sélectionnez un Service</p>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {['Coupe Adulte', 'Coupe Enfant', 'Teinture', 'Produits'].map((s, i) => (
                      <div key={s} className={`rounded-2xl p-3 flex flex-col items-center gap-2 border ${
                        i === 0 ? 'bg-white border-white' : 'bg-zinc-900 border-zinc-800'
                      }`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          i === 0 ? 'bg-black' : 'bg-zinc-800'
                        }`}>
                          <Scissors className={`w-3.5 h-3.5 ${i === 0 ? 'text-white' : 'text-zinc-400'}`} />
                        </div>
                        <span className={`text-[8px] font-bold text-center ${i === 0 ? 'text-black' : 'text-white'}`}>{s}</span>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5">
                      <p className="text-zinc-500 text-[7px] mb-1">Aujourd'hui</p>
                      <p className="text-white font-bold text-xs">47 500 F</p>
                    </div>
                    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-2.5">
                      <p className="text-zinc-500 text-[7px] mb-1">Transactions</p>
                      <p className="text-white font-bold text-xs">12</p>
                    </div>
                  </div>
                </div>

                <div className="bg-black border-t border-zinc-800 flex justify-around py-2 px-2">
                  {[
                    { Icon: Scissors, label: 'Services', active: true },
                    { Icon: TrendingUp, label: 'Revenus', active: false },
                    { Icon: DollarSign, label: 'Dépenses', active: false },
                  ].map(({ Icon, label, active }) => (
                    <div key={label} className="flex flex-col items-center gap-1">
                      <div className={`p-1.5 rounded-lg ${active ? 'bg-white' : ''}`}>
                        <Icon className={`w-3.5 h-3.5 ${active ? 'text-black' : 'text-zinc-600'}`} />
                      </div>
                      <span className={`text-[7px] font-medium ${active ? 'text-white' : 'text-zinc-600'}`}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section className="py-16 sm:py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-yellow-400 text-xs font-bold tracking-widest uppercase mb-3">Fonctionnalités</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Tout ce dont vous avez besoin.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 hover:border-zinc-600 transition hover:-translate-y-1">
                <div className="w-10 h-10 bg-yellow-500/10 rounded-xl flex items-center justify-center mb-4">
                  <Icon className="w-5 h-5 text-yellow-400" />
                </div>
                <h3 className="font-bold text-base mb-2">{title}</h3>
                <p className="text-zinc-400 text-sm leading-relaxed font-light">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PLANS ── */}
      <section className="py-16 sm:py-24 px-4" id="plans">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-yellow-400 text-xs font-bold tracking-widest uppercase mb-3">Tarifs</p>
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-12">Un prix simple,<br />transparent.</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Mensuel */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-7 text-left">
              <p className="text-zinc-400 text-xs font-bold tracking-widest uppercase mb-4">Mensuel</p>
              <p className="text-4xl font-black tracking-tight mb-1">5 000 <span className="text-xl text-zinc-500 font-normal">F</span></p>
              <p className="text-zinc-500 text-sm mb-6">par mois</p>
              <ul className="space-y-2.5 mb-7">
                {['Accès complet', 'Coiffeurs illimités', 'Historique complet', 'Support Wave & OM'].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-300">
                    <Check className="w-4 h-4 text-yellow-400 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button onClick={onGetStarted}
                className="w-full bg-zinc-800 border border-zinc-700 text-white font-bold py-3 rounded-xl hover:bg-zinc-700 transition">
                Commencer
              </button>
            </div>

            {/* Annuel */}
            <div className="bg-zinc-900 border-2 border-yellow-500/50 rounded-3xl p-7 text-left relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full">
                Meilleure offre
              </div>
              <p className="text-zinc-400 text-xs font-bold tracking-widest uppercase mb-4">Annuel</p>
              <p className="text-4xl font-black tracking-tight mb-1">50 000 <span className="text-xl text-zinc-500 font-normal">F</span></p>
              <p className="text-zinc-500 text-sm mb-6">par an — économisez 17%</p>
              <ul className="space-y-2.5 mb-7">
                {['Tout du plan Mensuel', '2 mois offerts', 'Support prioritaire', 'Nouvelles fonctionnalités'].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-sm text-zinc-300">
                    <Check className="w-4 h-4 text-yellow-400 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button onClick={onGetStarted}
                className="w-full bg-yellow-400 text-black font-bold py-3 rounded-xl hover:bg-yellow-300 transition">
                Commencer →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 sm:py-24 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-yellow-400 text-xs font-bold tracking-widest uppercase mb-3">FAQ</p>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight">Questions fréquentes.</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                >
                  <span className="font-semibold text-sm sm:text-base">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} />
                </button>
                {faqOpen === i && (
                  <div className="px-5 pb-4 text-zinc-400 text-sm leading-relaxed border-t border-zinc-800 pt-3">
                    {faq.r}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-16 sm:py-24 px-4">
        <div className="max-w-2xl mx-auto text-center">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 sm:p-14">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">
              Prêt à gérer votre salon<br />comme un pro ?
            </h2>
            <p className="text-zinc-400 text-sm mb-8 font-light">Rejoignez les salons qui font confiance à La Coupe.</p>
            <button
              onClick={onGetStarted}
              className="bg-white text-black font-bold px-10 py-4 rounded-2xl text-base hover:bg-zinc-200 transition hover:-translate-y-0.5 inline-block"
            >
              Commencer maintenant →
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-zinc-800 py-8 px-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center">
            <Scissors className="w-3.5 h-3.5 text-black" />
          </div>
          <span className="font-bold tracking-widest text-xs uppercase">La Coupe</span>
        </div>
        <p className="text-zinc-500 text-xs">Salon de Coiffure — Dakar, Sénégal</p>
        <p className="text-zinc-600 text-xs mt-2">© 2026 La Coupe. Tous droits réservés.</p>
      </footer>

    </div>
  );
}