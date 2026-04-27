import { Toolbar } from './components/Toolbar';
import { Layout } from './components/Layout';
import { useKeyboardShortcuts } from './components/useKeyboardShortcuts';
import './styles/layout.css';

export function App(): JSX.Element {
  useKeyboardShortcuts();

  return (
    <div className="app-root">
      <Toolbar />
      <Layout />
    </div>
  );
}
