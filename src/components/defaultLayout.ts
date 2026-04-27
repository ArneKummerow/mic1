import type { DockviewApi } from 'dockview-react';

/**
 * Default panel arrangement, used on first load and when the user clicks
 * "Layout" in the toolbar.
 *
 *   ┌────────────────────┬───────────┬──────────────────┐
 *   │                    │           │                  │
 *   │  Microcode         │ Registers │ Ctrl Store /     │
 *   │  Macrocode         │           │ Memory           │
 *   │  Console           ├───────────┴──────────────────┤
 *   │  (tabbed)          │                              │
 *   │                    │         Data Path            │
 *   │                    │                              │
 *   └────────────────────┴──────────────────────────────┘
 *
 * The left column (Microcode group) spans the full height. The right column
 * is split vertically: top half holds Registers + Ctrl Store/Memory; bottom
 * half holds Data Path.
 *
 * Order of `addPanel` calls matters because Dockview's splits are local: a
 * "below" split goes inside the reference panel's cell, not across the whole
 * width. Placing Registers on the right of Microcode first establishes the
 * left/right divide; subsequent splits stay within the right column.
 */
export function applyDefaultLayout(api: DockviewApi): void {
  // 1. Left column: Microcode group, with Macrocode + Console as inactive tabs.
  api.addPanel({
    id: 'microcode',
    component: 'microcode',
    title: 'Microcode (MAL)',
  });
  api.addPanel({
    id: 'macrocode',
    component: 'macrocode',
    title: 'Macrocode (IJVM)',
    position: { referencePanel: 'microcode', direction: 'within' },
    inactive: true,
  });
  api.addPanel({
    id: 'console',
    component: 'console',
    title: 'Console',
    position: { referencePanel: 'microcode', direction: 'within' },
    inactive: true,
  });

  // 2. Right column starts as Registers (full right-column height for now).
  api.addPanel({
    id: 'registers',
    component: 'registers',
    title: 'Registers',
    position: { referencePanel: 'microcode', direction: 'right' },
  });

  // 3. Split the right column vertically — Data Path takes the bottom half.
  api.addPanel({
    id: 'dataPath',
    component: 'dataPath',
    title: 'Data Path',
    position: { referencePanel: 'registers', direction: 'below' },
  });

  // 4. Split the top of the right column horizontally — Control Store on the right.
  api.addPanel({
    id: 'controlStore',
    component: 'controlStore',
    title: 'Control Store',
    position: { referencePanel: 'registers', direction: 'right' },
  });

  // 5. Memory as a tab in the Control Store group.
  api.addPanel({
    id: 'memory',
    component: 'memory',
    title: 'Memory',
    position: { referencePanel: 'controlStore', direction: 'within' },
    inactive: true,
  });
}
