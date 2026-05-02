import { Eye, Sun, Moon, LayoutGrid } from 'lucide-react';
import { useAppStore } from '../store';
import { PANEL_DEFS } from './panels';
import { resetLayout } from './layoutApi';
import {
  Dropdown,
  MenuItem,
  MenuCheckbox,
  MenuSeparator,
  MenuGroupLabel,
} from './Dropdown';

/**
 * Toolbar dropdown for view-related preferences: theme, layout reset, tab
 * bar visibility, and which panels are visible.
 */
export function ViewMenu(): JSX.Element {
  const theme = useAppStore((s) => s.uiPrefs.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const hiddenPanels = useAppStore((s) => s.uiPrefs.hiddenPanels);
  const hideTabBars = useAppStore((s) => s.uiPrefs.hideTabBars);
  const setHiddenPanels = useAppStore((s) => s.setHiddenPanels);
  const setHideTabBars = useAppStore((s) => s.setHideTabBars);
  const controlStoreBitView = useAppStore((s) => s.uiPrefs.controlStoreBitView);
  const controlStoreHideEmpty = useAppStore((s) => s.uiPrefs.controlStoreHideEmpty);
  const setControlStoreBitView = useAppStore((s) => s.setControlStoreBitView);
  const setControlStoreHideEmpty = useAppStore((s) => s.setControlStoreHideEmpty);

  const togglePanel = (id: string): void => {
    const next = new Set(hiddenPanels);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHiddenPanels(next);
  };

  return (
    <Dropdown label="View" icon={<Eye size={14} />} title="Theme, layout, panels">
      {({ close }) => (
        <>
          <MenuItem
            onClick={() => {
              toggleTheme();
              close();
            }}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            <span>Switch to {theme === 'dark' ? 'light' : 'dark'} theme</span>
          </MenuItem>
          <MenuItem
            onClick={() => {
              resetLayout();
              close();
            }}
          >
            <LayoutGrid size={14} />
            <span>Reset layout</span>
          </MenuItem>
          <MenuSeparator />
          <MenuCheckbox checked={hideTabBars} onChange={setHideTabBars}>
            Hide tab bars
          </MenuCheckbox>
          <MenuSeparator />
          <MenuGroupLabel>Control Store</MenuGroupLabel>
          <MenuCheckbox checked={controlStoreBitView} onChange={setControlStoreBitView}>
            Bit view
          </MenuCheckbox>
          <MenuCheckbox checked={controlStoreHideEmpty} onChange={setControlStoreHideEmpty}>
            Hide empty rows
          </MenuCheckbox>
          <MenuSeparator />
          <MenuGroupLabel>Panels</MenuGroupLabel>
          {PANEL_DEFS.map((p) => (
            <MenuCheckbox
              key={p.id}
              checked={!hiddenPanels.includes(p.id)}
              onChange={() => togglePanel(p.id)}
            >
              {p.title}
            </MenuCheckbox>
          ))}
        </>
      )}
    </Dropdown>
  );
}
