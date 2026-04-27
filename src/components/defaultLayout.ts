import type { DockviewApi } from 'dockview-react';

/**
 * Hardcoded default arrangement. Mirrors the original 3×2 grid:
 *
 *   Microcode | Data Path | Registers / Ctrl Store
 *   Macrocode | Memory    | Console
 *
 * Used on first load and when the user clicks "Reset Layout" in the toolbar.
 */
export function applyDefaultLayout(api: DockviewApi): void {
  api.addPanel({
    id: 'microcode',
    component: 'microcode',
    title: 'Microcode (MAL)',
  });
  api.addPanel({
    id: 'dataPath',
    component: 'dataPath',
    title: 'Data Path',
    position: { referencePanel: 'microcode', direction: 'right' },
  });
  api.addPanel({
    id: 'registers',
    component: 'registers',
    title: 'Registers',
    position: { referencePanel: 'dataPath', direction: 'right' },
  });
  api.addPanel({
    id: 'controlStore',
    component: 'controlStore',
    title: 'Control Store',
    position: { referencePanel: 'registers', direction: 'within' },
    inactive: true,
  });
  api.addPanel({
    id: 'macrocode',
    component: 'macrocode',
    title: 'Macrocode (IJVM)',
    position: { referencePanel: 'microcode', direction: 'below' },
  });
  api.addPanel({
    id: 'memory',
    component: 'memory',
    title: 'Memory',
    position: { referencePanel: 'dataPath', direction: 'below' },
  });
  api.addPanel({
    id: 'console',
    component: 'console',
    title: 'Console',
    position: { referencePanel: 'registers', direction: 'below' },
  });
}
