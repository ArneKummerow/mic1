import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DockviewReact,
  themeAbyss,
  themeLight,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
  type SerializedDockview,
} from 'dockview-react';
import { useAppStore } from '../store';
import 'dockview-react/dist/styles/dockview.css';
import { MicrocodeEditor } from './MicrocodeEditor';
import { MacrocodeEditor } from './MacrocodeEditor';
import { DataPathView } from './DataPathView';
import { MemoryView } from './MemoryView';
import { StackView } from './StackView';
import { RegisterPanel } from './RegisterPanel';
import { ControlStoreView } from './ControlStoreView';
import { MicroInspector } from './MicroInspector';
import { Console } from './Console';
import { LAYOUT_STORAGE_KEY, setDockApi, getDockApi } from './layoutApi';
import { applyDefaultLayout } from './defaultLayout';
import { PANEL_DEFS } from './panels';
import './Layout.css';

const LAYOUT_DEBOUNCE_MS = 250;

/**
 * Map of panel-component ids to their renderers. Adding a new dockable panel
 * is a one-line addition here plus a default-layout entry below.
 */
const components = {
  microcode: () => <MicrocodeEditor />,
  macrocode: () => <MacrocodeEditor />,
  dataPath: () => <DataPathView />,
  memory: () => <MemoryView />,
  stack: () => <StackView />,
  registers: () => <RegisterPanel />,
  controlStore: () => <ControlStoreView />,
  microInspector: () => <MicroInspector />,
  console: () => <Console />,
} as const satisfies Record<string, React.FunctionComponent<IDockviewPanelProps>>;

/**
 * Custom tab component — same as Dockview's default but without the `×`
 * close button, since panels in this app cannot be hidden.
 */
function ClosablelessTab(props: IDockviewPanelHeaderProps): JSX.Element {
  const [isActive, setIsActive] = useState(props.api.isActive);

  useEffect(() => {
    const sub = props.api.onDidActiveChange((e) => setIsActive(e.isActive));
    setIsActive(props.api.isActive);
    return () => sub.dispose();
  }, [props.api]);

  return (
    <div className="mic1-tab" data-active={isActive}>
      <span className="mic1-tab-title">{props.api.title}</span>
    </div>
  );
}

const tabComponents = { default: ClosablelessTab };

function loadPersistedLayout(): SerializedDockview | null {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SerializedDockview;
  } catch {
    return null;
  }
}

/**
 * Reconcile the dock so its open panels match the user's `hiddenPanels`
 * preference. Removes panels that should be hidden; re-adds panels that
 * should be visible but are missing (positioned at the end of the dock —
 * the user can drag them where they like).
 */
function reconcileHiddenPanels(api: ReturnType<typeof getDockApi>, hidden: readonly string[]): void {
  if (!api) return;
  const hiddenSet = new Set(hidden);
  for (const def of PANEL_DEFS) {
    const present = api.getPanel(def.id);
    if (hiddenSet.has(def.id)) {
      if (present) api.removePanel(present);
    } else {
      if (!present) {
        api.addPanel({
          id: def.id,
          component: def.id,
          title: def.title,
        });
      }
    }
  }
}

function persistLayout(state: SerializedDockview): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable / quota exceeded — non-fatal.
  }
}

export function Layout(): JSX.Element {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const theme = useAppStore((s) => s.uiPrefs.theme);
  const hideTabBars = useAppStore((s) => s.uiPrefs.hideTabBars);
  const hiddenPanels = useAppStore((s) => s.uiPrefs.hiddenPanels);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    const api = event.api;
    setDockApi(api);

    const persisted = loadPersistedLayout();
    let restored = false;
    if (persisted) {
      try {
        api.fromJSON(persisted);
        restored = true;
      } catch {
        // Persisted layout is incompatible (e.g. after a panel-id rename) —
        // fall through to defaults and clear the bad state.
        localStorage.removeItem(LAYOUT_STORAGE_KEY);
      }
    }
    if (!restored) {
      applyDefaultLayout(api);
    }

    // Apply current visibility prefs once after layout init.
    reconcileHiddenPanels(api, useAppStore.getState().uiPrefs.hiddenPanels);

    api.onDidLayoutChange(() => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        persistLayout(api.toJSON());
      }, LAYOUT_DEBOUNCE_MS);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      setDockApi(null);
    };
  }, []);

  // Sync the dock's open panels with the user's visibility prefs whenever
  // they change.
  useEffect(() => {
    reconcileHiddenPanels(getDockApi(), hiddenPanels);
  }, [hiddenPanels]);

  return (
    <DockviewReact
      className={`mic1-dock${hideTabBars ? ' mic1-dock--hide-tabs' : ''}`}
      components={components}
      tabComponents={tabComponents}
      defaultTabComponent={ClosablelessTab}
      theme={theme === 'light' ? themeLight : themeAbyss}
      onReady={onReady}
      disableFloatingGroups
      singleTabMode="fullwidth"
    />
  );
}
