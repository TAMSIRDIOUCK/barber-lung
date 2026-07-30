// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { BookingPage } from './components/BookingPage';
import { ClientApp } from './components/Clientapp';
import './index.css';

// Composant wrapper pour BookingPage avec paramètre
function BookingPageWrapper() {
  const { slug } = useParams<{ slug: string }>();
  return <BookingPage slug={slug || ''} />;
}

// Composant pour la route /auth/callback
function CallbackRoute() {
  // On vérifie si on a un token dans l'URL
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.split('?')[1]);
  const token = params.get('token');
  const subscriptionId = params.get('subscription_id');
  
  console.log('📍 CallbackRoute - Hash:', hash);
  console.log('📍 CallbackRoute - Token:', !!token);
  console.log('📍 CallbackRoute - Subscription ID:', subscriptionId);
  
  // Si on a un token, on le stocke dans sessionStorage pour le récupérer après
  if (token) {
    sessionStorage.setItem('payment_token', token);
    sessionStorage.setItem('payment_subscription_id', subscriptionId || '');
  }
  
  // Rediriger vers l'app principale
  return <ClientApp />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Route pour le booking public */}
        <Route path="/booking/:slug" element={<BookingPageWrapper />} />
        
        {/* Route pour le callback de paiement */}
        <Route path="/auth/callback" element={<CallbackRoute />} />
        
        {/* Route par défaut - L'application principale */}
        <Route path="/*" element={<ClientApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);