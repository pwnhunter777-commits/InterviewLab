import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      for (const reg of registrations) {
        reg.unregister();
      }
    })
    .catch(() => {
      // ignore cleanup failures
    });
} else {
  registerSW({ immediate: true });
}

createRoot(document.getElementById('root')!).render(<App />);
