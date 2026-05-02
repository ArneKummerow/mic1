import { useEffect } from 'react';
import { Toolbar } from './components/Toolbar';
import { Layout } from './components/Layout';
import { useKeyboardShortcuts } from './components/useKeyboardShortcuts';
import { useAppStore } from './store';
import './styles/layout.css';

export function App(): JSX.Element {
  useKeyboardShortcuts();

  const theme = useAppStore((s) => s.uiPrefs.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <div className="app-root">
      <Toolbar />
      <Layout />
    </div>
  );
}
