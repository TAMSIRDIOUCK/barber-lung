// src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BookingPage } from './components/BookingPage';
import { ClientApp } from './components/Clientapp';
import './index.css';

function Root() {
  const path = window.location.pathname;

  // Route publique : /booking/:slug
  const bookingMatch = path.match(/^\/booking\/([^/]+)$/);
  if (bookingMatch) {
    return <BookingPage slug={bookingMatch[1]} />;
  }

  // Tout le reste → app avec auth (ClientApp gère sa propre logique)
  return <ClientApp />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);