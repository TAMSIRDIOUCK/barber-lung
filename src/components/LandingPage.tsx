// src/components/LandingPage.tsx
import { useState, useEffect } from 'react';
import { Scissors, TrendingUp, DollarSign, Users, Shield, Printer, Check, ChevronDown, Download, Smartphone, Apple, Chrome, Zap, Share, Plus, X } from 'lucide-react';

interface LandingPageProps {
  onGetStarted: () => void;
}

// Détecte iOS mobile uniquement
function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) &&
    navigator.maxTouchPoints > 1;
}

// Détecte Mac desktop (Chrome/Edge, pas iOS)
function isMacDesktop() {
  return /Macintosh|MacIntel/i.test(navigator.userAgent) &&
    navigator.maxTouchPoints === 0;
}

// Détecte si déjà en mode standalone (installé)
function isInStandaloneMode() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true;
}

// Modale iOS Safari
function IOSInstallModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm px-4 pb-4 sm:pb-0" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center"><Scissors className="w-5 h-5 text-black" /></div>
            <div><p className="font-bold text-white text-sm">Installer La Coupe</p><p className="text-zinc-500 text-xs">iOS — Safari</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center"><X className="w-4 h-4 text-zinc-400" /></button>
        </div>
        <div className="px-5 py-5 space-y-3">
          {[
            { color: 'blue', num: '1', title: 'Appuyez sur "Partager"', desc: <> En bas de Safari, l'icône <span className="inline-flex items-center gap-1 bg-zinc-800 rounded px-1.5 py-0.5"><Share className="w-3 h-3 text-blue-400" /><span className="text-blue-400 text-[10px] font-bold">Partager</span></span></> },
            { color: 'green', num: '2', title: '"Sur l\'écran d\'accueil"', desc: <> Faites défiler et appuyez sur <span className="inline-flex items-center gap-1 bg-zinc-800 rounded px-1.5 py-0.5"><Plus className="w-3 h-3 text-zinc-300" /><span className="text-zinc-300 text-[10px] font-bold">Sur l'écran d'accueil</span></span></> },
            { color: 'yellow', num: '3', title: 'Appuyez sur "Ajouter"', desc: "Confirmez en haut à droite. L'icône apparaît sur votre écran d'accueil !" },
          ].map((s, i, arr) => (
            <div key={i}>
              <div className="flex items-start gap-4">
                <div className={`w-8 h-8 rounded-full bg-${s.color}-500/20 border border-${s.color}-500/40 flex items-center justify-center shrink-0 mt-0.5`}>
                  <span className={`text-${s.color}-400 font-bold text-sm`}>{s.num}</span>
                </div>
                <div><p className="text-white text-sm font-semibold mb-1">{s.title}</p><p className="text-zinc-400 text-xs leading-relaxed">{s.desc}</p></div>
              </div>
              {i < arr.length - 1 && <div className="pl-4 text-zinc-700 text-lg mt-2">↓</div>}
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <div className="bg-zinc-800/60 rounded-2xl p-3 text-center">
            <p className="text-zinc-400 text-xs">📱 Fonctionne uniquement sur <strong className="text-white">Safari</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Modale Mac Chrome / Edge
function MacChromeInstallModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center"><Scissors className="w-5 h-5 text-black" /></div>
            <div><p className="font-bold text-white text-sm">Installer La Coupe</p><p className="text-zinc-500 text-xs">Mac — Chrome / Edge</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-zinc-800 rounded-full flex items-center justify-center"><X className="w-4 h-4 text-zinc-400" /></button>
        </div>
        <div className="px-5 py-5 space-y-3">
          {[
            { color: 'blue', num: '1', title: 'Icône d\'installation dans Chrome', desc: <> Dans la barre d'adresse à droite, cliquez sur l'icône <span className="inline-flex items-center gap-1 bg-zinc-800 rounded px-1.5 py-0.5"><Download className="w-3 h-3 text-blue-400" /><span className="text-blue-400 text-[10px] font-bold">Installer</span></span> (si absente, voir note ci-dessous)</> },
            { color: 'green', num: '2', title: 'Cliquez sur "Installer"', desc: "Une fenêtre de confirmation apparaît. Cliquez sur \"Installer\" pour confirmer." },
            { color: 'yellow', num: '3', title: 'L\'app s\'ouvre dans sa propre fenêtre', desc: "La Coupe est maintenant dans votre Dock et Launchpad comme une vraie app Mac !" },
          ].map((s, i, arr) => (
            <div key={i}>
              <div className="flex items-start gap-4">
                <div className={`w-8 h-8 rounded-full bg-${s.color}-500/20 border border-${s.color}-500/40 flex items-center justify-center shrink-0 mt-0.5`}>
                  <span className={`text-${s.color}-400 font-bold text-sm`}>{s.num}</span>
                </div>
                <div><p className="text-white text-sm font-semibold mb-1">{s.title}</p><p className="text-zinc-400 text-xs leading-relaxed">{s.desc}</p></div>
              </div>
              {i < arr.length - 1 && <div className="pl-4 text-zinc-700 text-lg mt-2">↓</div>}
            </div>
          ))}
        </div>
        <div className="px-5 pb-5 space-y-2">
          <div className="bg-zinc-800/60 rounded-2xl p-3 text-center">
            <p className="text-zinc-400 text-xs">💻 Chrome & Edge sur Mac uniquement</p>
          </div>
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-2xl p-3">
            <p className="text-yellow-400 text-[10px] leading-relaxed">⚠️ Si l'icône n'apparaît pas dans Chrome : le site doit avoir un <strong>manifest.json</strong> et un <strong>service worker</strong> actifs. Vérifiez la config PWA de votre app.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ onGetStarted }: LandingPageProps) {
  const [faqOpen, setFaqOpen] = useState<number | null>(null);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInstallSuccess, setShowInstallSuccess] = useState(false);
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [showMacModal, setShowMacModal] = useState(false);
  const [deviceIsIOS, setDeviceIsIOS] = useState(false);
  const [deviceIsMac, setDeviceIsMac] = useState(false);

  useEffect(() => {
    const ios = isIOS();
    const mac = isMacDesktop();
    setDeviceIsIOS(ios);
    setDeviceIsMac(mac);

    if (isInStandaloneMode()) {
      setIsInstalled(true);
    }

    if (!ios) {
      const handleBeforeInstallPrompt = (e: Event) => {
        e.preventDefault();
        setDeferredPrompt(e);
        setIsInstallable(true);
      };
      window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.addEventListener('appinstalled', () => {
        setIsInstalled(true);
        setIsInstallable(false);
        setShowInstallSuccess(true);
        setTimeout(() => setShowInstallSuccess(false), 3000);
      });
      return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    }
  }, []);

  const handleInstallClick = async () => {
    if (deviceIsIOS) {
      setShowIOSModal(true);
      return;
    }
    if (deferredPrompt) {
      // Android ou Mac Chrome avec PWA valide : prompt natif
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') console.log('Installation acceptée');
      setDeferredPrompt(null);
      setIsInstallable(false);
    } else if (deviceIsMac) {
      // Mac Chrome sans prompt natif disponible : guide manuel
      setShowMacModal(true);
    }
  };

  // Toujours afficher le bouton télécharger, même si déjà installé
  const showInstallButton = true;

  const features = [
    { icon: Scissors, title: 'Gestion des services', desc: 'Catalogue personnalisable de coupes, teintures et soins. Ajout rapide en temps réel.' },
    { icon: TrendingUp, title: 'Suivi des revenus', desc: 'Revenus par jour, semaine, mois ou année. Courbes et stats par coiffeur.' },
    { icon: Printer, title: "Tickets d'impression", desc: 'Générez et imprimez des tickets pour chaque transaction.' },
    { icon: Users, title: 'Équipe coiffeurs', desc: 'Profils photo, statistiques individuelles et performance par membre.' },
    { icon: DollarSign, title: 'Gestion des dépenses', desc: 'Revenue net calculé automatiquement. Vue comptable claire.' },
    { icon: Shield, title: 'Données sécurisées', desc: 'Chaque salon a son espace isolé. Vos données sont privées.' },
  ];

  const faqs = [
    { q: 'Puis-je annuler à tout moment ?', r: 'Oui, vous pouvez annuler votre abonnement à tout moment depuis votre espace client.' },
    { q: 'Mes données sont-elles sécurisées ?', r: 'Absolument. Chaque salon a son propre espace isolé. Vos données sont chiffrées et inaccessibles aux autres utilisateurs.' },
    { q: "Puis-je utiliser l'app sur mobile ?", r: "Oui, l'application est entièrement responsive et optimisée pour mobile. Sur Android, appuyez sur le bouton vert pour l'installer en 1 clic. Sur iOS, suivez le guide qui s'affiche." },
    { q: 'Comment payer mon abonnement ?', r: 'Nous acceptons Wave et Orange Money pour votre confort au Sénégal.' },
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      {/* Modale iOS */}
      {showIOSModal && <IOSInstallModal onClose={() => setShowIOSModal(false)} />}

      {/* Modale Mac Chrome */}
      {showMacModal && <MacChromeInstallModal onClose={() => setShowMacModal(false)} />}

      {/* Notification succès installation */}
      {showInstallSuccess && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="bg-green-600 text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-2">
            <Check className="w-5 h-5" />
            <span className="text-sm font-medium">✅ Application installée avec succès !</span>
          </div>
        </div>
      )}

      {/* ── NAV ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-xl border-b border-zinc-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
              <Scissors className="w-4 h-4 text-black" />
            </div>
            <span className="font-bold tracking-widest text-xs sm:text-sm uppercase">La Coupe</span>
          </div>
          <div className="flex items-center gap-3">
            {showInstallButton && (
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-bold px-4 sm:px-5 py-2 rounded-full transition-all duration-300 shadow-lg animate-pulse-slow"
              >
                <Download className="w-4 h-4" />
                <span className="hidden sm:inline">Installer l'app</span>
                <span className="sm:hidden">Installer</span>
              </button>
            )}
            {isInstalled && (
              <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-full">
                <Check className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-400 text-xs font-medium">Installée</span>
              </div>
            )}
            <button
              onClick={onGetStarted}
              className="bg-white text-black font-bold text-xs sm:text-sm px-4 sm:px-6 py-2 sm:py-2.5 rounded-full hover:bg-zinc-200 transition"
            >
              Commencer →
            </button>
          </div>
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

          {/* ── BOUTONS HERO : INSTALLER (vert) + COMMENCER ── */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
            {showInstallButton && (
              <button
                onClick={handleInstallClick}
                className="group relative overflow-hidden w-full sm:w-auto bg-gradient-to-r from-green-600 to-green-500 text-white font-bold px-8 py-4 rounded-2xl text-base shadow-xl hover:shadow-green-500/20 hover:shadow-2xl transition-all duration-300 hover:-translate-y-1"
              >
                <div className="absolute inset-0 w-0 bg-white/20 transition-all duration-300 ease-out group-hover:w-full" />
                <span className="relative flex items-center justify-center gap-3">
                  <Zap className="w-5 h-5" />
                  Télécharger l'application
                  <Download className="w-5 h-5" />
                </span>
              </button>
            )}

            {isInstalled && (
              <div className="w-full sm:w-auto bg-green-500/10 border border-green-500/30 rounded-2xl px-8 py-4 flex items-center justify-center gap-2">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-green-400 font-semibold text-base">Application installée ✓</span>
              </div>
            )}

            <button
              onClick={onGetStarted}
              className="w-full sm:w-auto bg-white text-black font-bold px-8 py-4 rounded-2xl text-base hover:bg-zinc-200 transition hover:-translate-y-0.5"
            >
              Commencer gratuitement
            </button>
          </div>

          {/* Badges plateforme */}
          <div className="flex items-center justify-center gap-3 mt-8">
            <span className="text-zinc-600 text-xs">Compatible :</span>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 bg-green-500/10 px-2.5 py-1 rounded-full">
                <Smartphone className="w-3 h-3 text-green-400" />
                <span className="text-green-400 text-[10px]">Android</span>
              </div>
              <div className="flex items-center gap-1.5 bg-green-500/10 px-2.5 py-1 rounded-full">
                <Apple className="w-3 h-3 text-green-400" />
                <span className="text-green-400 text-[10px]">iOS</span>
              </div>
              <div className="flex items-center gap-1.5 bg-green-500/10 px-2.5 py-1 rounded-full">
                <Chrome className="w-3 h-3 text-green-400" />
                <span className="text-green-400 text-[10px]">PWA</span>
              </div>
            </div>
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
                      <div key={s} className={`rounded-2xl p-3 flex flex-col items-center gap-2 border ${i === 0 ? 'bg-white border-white' : 'bg-zinc-900 border-zinc-800'}`}>
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${i === 0 ? 'bg-black' : 'bg-zinc-800'}`}>
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
              <button onClick={onGetStarted} className="w-full bg-zinc-800 border border-zinc-700 text-white font-bold py-3 rounded-xl hover:bg-zinc-700 transition">Commencer</button>
            </div>
            <div className="bg-zinc-900 border-2 border-yellow-500/50 rounded-3xl p-7 text-left relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-yellow-400 text-black text-[10px] font-black uppercase tracking-widest px-4 py-1 rounded-full">Meilleure offre</div>
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
              <button onClick={onGetStarted} className="w-full bg-yellow-400 text-black font-bold py-3 rounded-xl hover:bg-yellow-300 transition">Commencer →</button>
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
                <button onClick={() => setFaqOpen(faqOpen === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                  <span className="font-semibold text-sm sm:text-base">{faq.q}</span>
                  <ChevronDown className={`w-4 h-4 text-zinc-500 shrink-0 transition-transform ${faqOpen === i ? 'rotate-180' : ''}`} />
                </button>
                {faqOpen === i && (
                  <div className="px-5 pb-4 text-zinc-400 text-sm leading-relaxed border-t border-zinc-800 pt-3">{faq.r}</div>
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
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight mb-4">Prêt à gérer votre salon<br />comme un pro ?</h2>
            <p className="text-zinc-400 text-sm mb-8 font-light">Rejoignez les salons qui font confiance à La Coupe.</p>

            {showInstallButton && (
              <div className="mb-5">
                <button onClick={handleInstallClick} className="inline-flex items-center gap-3 bg-green-600 hover:bg-green-700 text-white font-bold px-8 py-4 rounded-2xl text-base shadow-xl transition-all hover:-translate-y-0.5">
                  <Download className="w-5 h-5" />
                  Télécharger l'application
                  <Zap className="w-5 h-5" />
                </button>
              </div>
            )}

            <button onClick={onGetStarted} className="bg-white text-black font-bold px-10 py-4 rounded-2xl text-base hover:bg-zinc-200 transition hover:-translate-y-0.5 inline-block">
              Commencer maintenant →
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-zinc-800 py-8 px-4 text-center">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-7 h-7 bg-white rounded-lg flex items-center justify-center"><Scissors className="w-3.5 h-3.5 text-black" /></div>
          <span className="font-bold tracking-widest text-xs uppercase">La Coupe</span>
        </div>
        <p className="text-zinc-500 text-xs">Salon de Coiffure — Dakar, Sénégal</p>
        <p className="text-zinc-600 text-xs mt-2">© 2026 La Coupe. Tous droits réservés.</p>
      </footer>

      <style>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.02); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}