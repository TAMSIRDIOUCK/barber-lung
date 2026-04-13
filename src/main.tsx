import { createRoot } from 'react-dom/client';
import { ClientApp } from './components/Clientapp';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ClientApp>
    {(authUser, onLogout) => (
      <App authUser={authUser} onLogout={onLogout} />
    )}
  </ClientApp>
);