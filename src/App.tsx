import { useEffect, useState } from 'react';
import { Toolbar } from './components/Toolbar';
import { Layout } from './components/Layout';
import { Docs } from './components/Docs';
import { useKeyboardShortcuts } from './components/useKeyboardShortcuts';
import { useAppStore } from './store';
import './styles/layout.css';

const DOCS_HASH = '#docs';

function isDocsRoute(): boolean {
  return window.location.hash === DOCS_HASH;
}

export function App(): JSX.Element {
  useKeyboardShortcuts();

  // Docs render in their own browser tab so the user can read alongside the
  // simulator. The tab is identified by `#docs` in the URL — both freshly
  // opened (via the Toolbar's "Docs" button) and reload-resilient.
  const [docsRoute, setDocsRoute] = useState(isDocsRoute);

  const theme = useAppStore((s) => s.uiPrefs.theme);
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const onHash = (): void => setDocsRoute(isDocsRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (!docsRoute) return;
    const prev = document.title;
    document.title = 'MIC-1 Documentation';
    return () => {
      document.title = prev;
    };
  }, [docsRoute]);

  if (docsRoute) {
    // `window.close()` only succeeds for tabs opened via script (which is
    // how the Toolbar opens this one). If the user landed here by other
    // means, it's a no-op — they'll just close the tab themselves.
    return <Docs onClose={() => window.close()} />;
  }

  return (
    <div className="app-root">
      <Toolbar />
      <Layout />
    </div>
  );
}
