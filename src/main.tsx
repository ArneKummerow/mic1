import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { setupMonaco } from './components/monacoSetup';
import './index.css';

setupMonaco();

// Register the service worker so the app works offline after first load.
// `autoUpdate` mode (configured in vite.config) silently fetches new
// builds; the next reload picks them up.
registerSW({ immediate: true });

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element not found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
