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
  // Récupérer le hash complet
  const hash = window.location.hash;
  console.log('📍 CallbackRoute - Hash complet:', hash);
  
  // Extraire les paramètres du hash
  const hashWithoutHash = hash.startsWith('#') ? hash.substring(1) : hash;
  const params = new URLSearchParams(hashWithoutHash.split('?')[1] || '');
  const token = params.get('token');
  const subscriptionId = params.get('subscription_id');
  const type = hashWithoutHash.includes('payment_success') ? 'success' : 
               hashWithoutHash.includes('payment_cancelled') ? 'cancelled' : 'unknown';
  
  console.log('📍 CallbackRoute - Type:', type);
  console.log('📍 CallbackRoute - Token:', token ? '✅ Présent' : '❌ MANQUANT');
  console.log('📍 CallbackRoute - Subscription ID:', subscriptionId);
  
  // Stocker le token et les informations dans sessionStorage
  if (token) {
    sessionStorage.setItem('payment_token', token);
    sessionStorage.setItem('payment_subscription_id', subscriptionId || '');
    sessionStorage.setItem('payment_status', type);
    console.log('✅ Token stocké dans sessionStorage');
  } else {
    console.warn('⚠️ Aucun token trouvé dans l\'URL');
    // Essayer de récupérer depuis sessionStorage
    const storedToken = sessionStorage.getItem('payment_token');
    if (storedToken) {
      console.log('✅ Token trouvé dans sessionStorage');
    }
  }
  
  // Rediriger vers l'accueil avec le statut
  let redirectUrl = '/';
  if (type === 'success') {
    redirectUrl = '/?payment_success=true';
  } else if (type === 'cancelled') {
    redirectUrl = '/?payment_cancelled=true';
  }
  
  console.log('📍 Redirection vers:', redirectUrl);
  
  // Forcer le rechargement pour restaurer la session
  window.location.href = redirectUrl;
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/booking/:slug" element={<BookingPageWrapper />} />
        <Route path="/auth/callback" element={<CallbackRoute />} />
        <Route path="/*" element={<ClientApp />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);