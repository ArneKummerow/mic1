import { useEffect, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { Layout } from './components/Layout';
import { Docs } from './components/Docs';
import { useKeyboardShortcuts } from './components/useKeyboardShortcuts';
import { useAppStore } from './store';
import './styles/layout.css';

export function App(): JSX.Element {
  useKeyboardShortcuts();

  const [showDocs, setShowDocs] = useState(false);

  const theme = useAppStore((s) => s.uiPrefs.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!showDocs) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setShowDocs(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showDocs]);

  return (
    <div className="app-root">
      <Toolbar onOpenDocs={() => setShowDocs(true)} />
      <Layout />
      {showDocs && <Docs onClose={() => setShowDocs(false)} />}
    </div>
  );
}
