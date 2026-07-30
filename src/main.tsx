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
  const hash = window.location.hash;
  const params = new URLSearchParams(hash.split('?')[1]);
  const token = params.get('token');
  const subscriptionId = params.get('subscription_id');
  
  console.log('📍 CallbackRoute - Hash:', hash);
  console.log('📍 CallbackRoute - Token:', !!token);
  console.log('📍 CallbackRoute - Subscription ID:', subscriptionId);
  
  // Stocker le token pour restauration
  if (token) {
    sessionStorage.setItem('payment_token', token);
    sessionStorage.setItem('payment_subscription_id', subscriptionId || '');
    console.log('✅ Token stocké dans sessionStorage');
  }
  
  // Rediriger vers l'accueil avec les paramètres de succès/annulation
  const isSuccess = hash.includes('payment_success');
  const isCancelled = hash.includes('payment_cancelled');
  
  let redirectUrl = '/';
  if (isSuccess) {
    redirectUrl = '/?payment_success=true';
  } else if (isCancelled) {
    redirectUrl = '/?payment_cancelled=true';
  }
  
  // Rediriger vers l'accueil
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