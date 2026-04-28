import type { DockviewApi } from 'dockview-react';

/**
 * Default panel arrangement, used on first load and when the user clicks
 * "Layout" in the toolbar.
 *
 *   ┌──────────────────┬──────────────────┬──────────────────┐
 *   │  Memory          │                  │                  │
 *   │  Registers       │   Data Path      │  Microcode (MAL) │
 *   │  Stack           │   (only tab)     │  Macrocode (IJVM)│
 *   ├──────────────────┤                  │  (tabbed)        │
 *   │  Control Store   │                  │                  │
 *   │  Console         │                  │                  │
 *   └──────────────────┴──────────────────┴──────────────────┘
 *
 * Three equal-width columns. Left column has two vertical groups (top:
 * Memory/Registers/Stack, bottom: Control Store/Console). Middle column
 * holds only Data Path. Right column holds Microcode + Macrocode tabbed.
 */
export function applyDefaultLayout(api: DockviewApi): void {
  // 1. Establish all three columns first so subsequent vertical splits stay local.

  // Left column anchor: Memory.
  api.addPanel({
    id: 'memory',
    component: 'memory',
    title: 'Memory',
  });

  // Middle column: Data Path only.
  api.addPanel({
    id: 'dataPath',
    component: 'dataPath',
    title: 'Data Path',
    position: { referencePanel: 'memory', direction: 'right' },
  });

  // Right column: Microcode (active) + Macrocode tab.
  api.addPanel({
    id: 'microcode',
    component: 'microcode',
    title: 'Microcode (MAL)',
    position: { referencePanel: 'dataPath', direction: 'right' },
  });
  api.addPanel({
    id: 'macrocode',
    component: 'macrocode',
    title: 'Macrocode (IJVM)',
    position: { referencePanel: 'microcode', direction: 'within' },
    inactive: true,
  });

  // 2. Now split the left column vertically — stays inside the left column
  //    because the column boundaries are already established.
  api.addPanel({
    id: 'controlStore',
    component: 'controlStore',
    title: 'Control Store',
    position: { referencePanel: 'memory', direction: 'below' },
  });
  api.addPanel({
    id: 'console',
    component: 'console',
    title: 'Console',
    position: { referencePanel: 'controlStore', direction: 'within' },
    inactive: true,
  });

  // 3. Extra tabs in the left-top group.
  api.addPanel({
    id: 'registers',
    component: 'registers',
    title: 'Registers',
    position: { referencePanel: 'memory', direction: 'within' },
    inactive: true,
  });
  api.addPanel({
    id: 'stack',
    component: 'stack',
    title: 'Stack',
    position: { referencePanel: 'memory', direction: 'within' },
    inactive: true,
  });
}
