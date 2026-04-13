import { useState } from 'react';
import { Scissors, TrendingUp, DollarSign, LogOut, Crown, Menu, X, Share2, Check } from 'lucide-react';
import { ServiceSelector } from './components/ServiceSelector';
import TransactionHistory from './components/TransactionHistory';
import RevenuePage from './components/RevenuePage';
import ExpensesPage from './components/ExpensesPage';
import type { AuthUser } from './components/Clientapp';

type Page = 'home' | 'revenue' | 'expenses';
export interface ServiceOption { withTeinture?: boolean; withSoin?: boolean; }

interface AppProps {
  authUser: AuthUser;
  onLogout: () => void;
}

// ── Logos paiement ──────────────────────────────────────────────────────────

function WaveLogo() {
  return (
    <svg width="52" height="22" viewBox="0 0 52 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="52" height="22" rx="4" fill="#1A73E8"/>
      <text
        x="26"
        y="15"
        textAnchor="middle"
        fontFamily="'Arial Rounded MT Bold', 'Arial Black', sans-serif"
        fontWeight="800"
        fontSize="12"
        fill="#FFFFFF"
        letterSpacing="0.5"
      >
        wave
      </text>
      {/* Petite vague décorative sous le texte */}
      <path
        d="M10 18 Q13 16 16 18 Q19 20 22 18 Q25 16 28 18 Q31 20 34 18 Q37 16 40 18 Q43 20 46 18"
        stroke="#FFFFFF"
        strokeWidth="1.2"
        strokeLinecap="round"
        fill="none"
        opacity="0.5"
      />
    </svg>
  );
}

function OrangeMoneyLogo() {
  return (
    <svg width="72" height="22" viewBox="0 0 72 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="72" height="22" rx="4" fill="#FF6600"/>
      {/* Cercle "O" stylisé à gauche */}
      <circle cx="11" cy="11" r="7" fill="none" stroke="#FFFFFF" strokeWidth="1.8"/>
      <circle cx="11" cy="11" r="3.5" fill="#FFFFFF" opacity="0.4"/>
      {/* Texte */}
      <text
        x="44"
        y="9"
        textAnchor="middle"
        fontFamily="'Arial Black', 'Arial', sans-serif"
        fontWeight="900"
        fontSize="6.5"
        fill="#FFFFFF"
        letterSpacing="0.3"
      >
        ORANGE
      </text>
      <text
        x="44"
        y="17"
        textAnchor="middle"
        fontFamily="'Arial Black', 'Arial', sans-serif"
        fontWeight="900"
        fontSize="6.5"
        fill="#FFFFFF"
        letterSpacing="0.3"
      >
        MONEY
      </text>
    </svg>
  );
}

function PaymentBadges() {
  return (
    <div className="flex items-center justify-center gap-2 mt-2">
      <span className="text-zinc-600 text-xs">Paiement :</span>
      <div className="bg-zinc-800 rounded-lg px-2 py-1 border border-zinc-700">
        <WaveLogo />
      </div>
      <div className="bg-zinc-800 rounded-lg px-2 py-1 border border-zinc-700">
        <OrangeMoneyLogo />
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────

function App({ authUser, onLogout }: AppProps) {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [salonName] = useState<string>('LE COUPE');

  const handleServiceConfirm = async () => setRefreshTrigger(prev => prev + 1);
  const handleExpenseAdded = () => setRefreshTrigger(prev => prev + 1);

  const navigate = (page: Page) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
  };

  const handleShare = async () => {
    const url = window.location.origin;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'LE COUPE',
          text: 'Gérez votre salon comme un pro avec LE COUPE 💈',
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {}
  };

  const pages = [
    { id: 'home' as Page, label: 'Services', Icon: Scissors },
    { id: 'revenue' as Page, label: 'Revenus', Icon: TrendingUp },
    { id: 'expenses' as Page, label: 'Dépenses', Icon: DollarSign },
  ];

  const expiryDate = new Date(authUser.subscription.expires_at).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  return (
    <div className="min-h-screen bg-zinc-950">

      {/* ── HEADER DESKTOP ── */}
      <header className="hidden md:block bg-black border-b border-zinc-800 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="bg-white w-8 h-8 rounded-lg flex items-center justify-center">
                <Scissors className="w-4 h-4 text-black" />
              </div>
              <span className="text-white font-bold tracking-widest text-sm uppercase">LE COUPE</span>
            </div>

            <nav className="flex items-center gap-1">
              {pages.map(({ id, label, Icon }) => (
                <button key={id} onClick={() => navigate(id)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    currentPage === id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                  }`}>
                  <Icon className="w-4 h-4" />{label}
                </button>
              ))}
            </nav>

            <div className="flex items-center gap-3">
              <button onClick={handleShare}
                className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition text-sm px-3 py-1.5 rounded-lg hover:bg-zinc-800 border border-zinc-700">
                {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Share2 className="w-3.5 h-3.5" />}
                <span className="text-xs">{copied ? 'Copié !' : 'Partager'}</span>
              </button>

              <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-1.5">
                <Crown className="w-3 h-3 text-yellow-400" />
                <span className="text-white text-xs font-semibold">{authUser.subscription.plan_name}</span>
                <span className="text-zinc-500 text-xs">· {expiryDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">
                    {(authUser.fullName || authUser.email)[0].toUpperCase()}
                  </span>
                </div>
                <span className="text-zinc-400 text-sm max-w-[120px] truncate">
                  {authUser.fullName || authUser.email}
                </span>
              </div>
              <button onClick={onLogout}
                className="text-zinc-500 hover:text-white transition p-1.5 rounded-lg hover:bg-zinc-800"
                title="Déconnexion">
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── HEADER MOBILE ── */}
      <header className="md:hidden bg-black border-b border-zinc-800 sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <div className="bg-white w-7 h-7 rounded-lg flex items-center justify-center">
              <Scissors className="w-3.5 h-3.5 text-black" />
            </div>
            <span className="text-white font-bold tracking-widest text-xs uppercase">LE COUPE</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2 py-1">
              <Crown className="w-3 h-3 text-yellow-400" />
              <span className="text-white text-xs font-semibold">{authUser.subscription.plan_name}</span>
            </div>
            <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-zinc-400 hover:text-white p-1.5">
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="border-t border-zinc-800 bg-black px-4 py-3 space-y-1">
            {pages.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => navigate(id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  currentPage === id ? 'bg-white text-black' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
            <div className="pt-2 border-t border-zinc-800 mt-2 space-y-2">
              <button onClick={handleShare}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-zinc-400 hover:text-white hover:bg-zinc-800 transition">
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Share2 className="w-4 h-4" />}
                {copied ? 'Lien copié !' : "Partager l'application"}
              </button>
              <div className="flex items-center justify-between px-3 py-2">
                <div>
                  <p className="text-white text-sm font-medium">{authUser.fullName || authUser.email}</p>
                  <p className="text-zinc-500 text-xs">Expire le {expiryDate}</p>
                </div>
                <button onClick={onLogout}
                  className="flex items-center gap-1.5 text-zinc-400 hover:text-white text-sm transition">
                  <LogOut className="w-4 h-4" /> Déconnexion
                </button>
              </div>
              {/* Logos paiement dans le menu mobile */}
              <div className="px-3 pb-1">
                <PaymentBadges />
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── MAIN ── */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8">
        {currentPage === 'home' && (
          <div className="space-y-8">
            <div className="text-center pt-2">
              <h2 className="text-white text-xl sm:text-2xl font-bold">Sélectionnez un Service</h2>
              <p className="text-zinc-500 text-sm mt-1">Choisissez une catégorie pour commencer</p>
              {/* ── Logos Wave & Orange Money ── */}
              <PaymentBadges />
            </div>
            <ServiceSelector
              userId={authUser.id}
              salonName={salonName}
              authUser={authUser}
              onConfirm={handleServiceConfirm}
            />
            <TransactionHistory userId={authUser.id} refreshTrigger={refreshTrigger} />
          </div>
        )}
        {currentPage === 'revenue' && <RevenuePage userId={authUser.id} refreshTrigger={refreshTrigger} />}
        {currentPage === 'expenses' && <ExpensesPage userId={authUser.id} onExpenseAdded={handleExpenseAdded} />}
      </main>

      {/* ── BOTTOM NAV MOBILE ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black border-t border-zinc-800 z-40">
        <div className="flex items-center justify-around px-2 py-2">
          {pages.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => navigate(id)}
              className="flex flex-col items-center gap-1 px-5 py-1">
              <div className={`p-1.5 rounded-xl transition-all ${currentPage === id ? 'bg-white' : ''}`}>
                <Icon className={`w-5 h-5 ${currentPage === id ? 'text-black' : 'text-zinc-600'}`} />
              </div>
              <span className={`text-xs font-medium ${currentPage === id ? 'text-white' : 'text-zinc-600'}`}>
                {label}
              </span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

export default App;