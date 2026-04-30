import type { DockviewApi } from 'dockview-react';

/**
 * Default panel arrangement, used on first load and when the user clicks
 * "Layout" in the toolbar.
 *
 *   ┌──────────────────┬──────────────────┬──────────────────┐
 *   │  Memory          │                  │                  │
 *   │  Registers       │   Data Path      │  Microcode (MAL) │
 *   │  Stack           │                  │  Macrocode (IJVM)│
 *   ├──────────────────┤                  │  (tabbed)        │
 *   │  Control Store   ├──────────────────┤                  │
 *   │  Console         │ µInst. Inspector │                  │
 *   └──────────────────┴──────────────────┴──────────────────┘
 *
 * Three columns. Left column has two vertical groups (top:
 * Memory/Registers/Stack, bottom: Control Store/Console). Middle column
 * holds Data Path on top with the Microinstruction Inspector pinned at
 * the bottom (~20% of the column height). Right column holds Microcode +
 * Macrocode tabbed.
 */
export function applyDefaultLayout(api: DockviewApi): void {
  // 1. Establish all three columns first so subsequent vertical splits stay local.

  // Left column anchor: Memory.
  api.addPanel({
    id: 'memory',
    component: 'memory',
    title: 'Memory',
  });

  // Middle column: Data Path (top) and Microinstruction Inspector (bottom).
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

  // 2. Split the middle column vertically — Microinstruction Inspector
  //    pinned below the Data Path. Dockview uses 50/50 by default; we
  //    resize the inspector to roughly 20% of the column height afterwards.
  api.addPanel({
    id: 'microInspector',
    component: 'microInspector',
    title: 'µInst. Inspector',
    position: { referencePanel: 'dataPath', direction: 'below' },
  });
  // Try to give the data path most of the vertical space.
  const inspector = api.getPanel('microInspector');
  if (inspector) {
    try {
      inspector.api.setSize({ height: 140 });
    } catch {
      // Older dockview versions may not support setSize; default 50/50 is fine.
    }
  }

  // 3. Now split the left column vertically — stays inside the left column
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

  // 4. Extra tabs in the left-top group.
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
