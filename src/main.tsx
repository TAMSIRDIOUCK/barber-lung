// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { BookingPage } from './components/BookingPage';
import { ClientApp } from './components/Clientapp';
import './index.css';

function BookingPageWrapper() {
  const { slug } = useParams<{ slug: string }>();
  return <BookingPage slug={slug || ''} />;
}

// ✅ CallbackRoute amélioré
function CallbackRoute() {
  console.log('📍 CallbackRoute - URL:', window.location.href);
  console.log('📍 CallbackRoute - Search:', window.location.search);
  
  // Récupérer le code OAuth
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const error = params.get('error');
  
  if (error) {
    console.error('❌ Erreur OAuth:', error);
    // Rediriger vers la page de connexion avec erreur
    window.location.href = '/?auth_error=true';
    return null;
  }

  if (code) {
    console.log('✅ Code OAuth trouvé, redirection vers ClientApp');
  }

  // Rediriger vers ClientApp qui gère l'auth
  return <ClientApp />;
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