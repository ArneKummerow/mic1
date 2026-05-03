import type { DockviewApi } from 'dockview-react';

/**
 * Default panel arrangement, used on first load and when the user clicks
 * "Reset layout" in the View menu.
 *
 *   ┌───────────┬─────────────────────────┬──────────────┐
 *   │           │  Macrocode (active)     │              │
 *   │ Data Path │  Control Store          │              │
 *   │           │  Memory  (tabbed)       │  Microcode   │
 *   │           │                         │              │
 *   │           ├──────────┬──────────────┤              │
 *   ├───────────┤          │              │              │
 *   │ µInst.    │  Stack   │  Console     │              │
 *   │ Inspector │          │              │              │
 *   └───────────┴──────────┴──────────────┴──────────────┘
 *
 * Three columns:
 *   - A (≈20% width): Data Path on top (85%), µInstruction Inspector
 *     pinned at the bottom (15%).
 *   - B (≈40% width): top group (60% height) tabs Macrocode / Control
 *     Store / Memory; bottom split 25/75 into Stack (left, narrow) and
 *     Console (right, wide).
 *   - C (≈40% width): Microcode editor (single tab).
 *
 * The Registers panel is intentionally not added — it's reachable via the
 * View menu's "Panels" section, but hidden by default to keep the
 * arrangement focused on the textbook MIC-1 surfaces.
 */

// Approximate target widths/heights, in pixels relative to a baseline window.
// Dockview snaps these to whatever fits, but the proportions hold.
const COL_A_WIDTH = 440;
const COL_B_WIDTH = 700;
// COL_C absorbs the remainder.

const A_INSPECTOR_HEIGHT = 120; // ≈15% of column A
const B_BOTTOM_HEIGHT = 360; // ≈40% of column B
const B_BOTTOM_STACK_WIDTH = 180; // ≈25% of the bottom row — Stack stays narrow

export function applyDefaultLayout(api: DockviewApi): void {
  // Column A anchor — Data Path.
  api.addPanel({
    id: 'dataPath',
    component: 'dataPath',
    title: 'Data Path',
  });

  // Column B anchor — Macrocode (active tab of the top-B group).
  api.addPanel({
    id: 'macrocode',
    component: 'macrocode',
    title: 'Macrocode (IJVM)',
    position: { referencePanel: 'dataPath', direction: 'right' },
  });

  // Column C — Microcode (single tab).
  api.addPanel({
    id: 'microcode',
    component: 'microcode',
    title: 'Microcode (MAL)',
    position: { referencePanel: 'macrocode', direction: 'right' },
  });

  // Tabs alongside Macrocode in the top-B group.
  api.addPanel({
    id: 'controlStore',
    component: 'controlStore',
    title: 'Control Store',
    position: { referencePanel: 'macrocode', direction: 'within' },
    inactive: true,
  });
  api.addPanel({
    id: 'memory',
    component: 'memory',
    title: 'Memory',
    position: { referencePanel: 'macrocode', direction: 'within' },
    inactive: true,
  });

  // Column A bottom — µInstruction Inspector.
  api.addPanel({
    id: 'microInspector',
    component: 'microInspector',
    title: 'µInst. Inspector',
    position: { referencePanel: 'dataPath', direction: 'below' },
  });

  // Column B bottom — Stack (left, narrow) and Console (right, wide).
  api.addPanel({
    id: 'stack',
    component: 'stack',
    title: 'Stack',
    position: { referencePanel: 'macrocode', direction: 'below' },
  });
  api.addPanel({
    id: 'console',
    component: 'console',
    title: 'Console',
    position: { referencePanel: 'stack', direction: 'right' },
  });

  // Resize to the target proportions. Some Dockview versions reject `setSize`
  // on freshly-created groups, so wrap each call individually.
  const trySetSize = (id: string, size: { width?: number; height?: number }): void => {
    try {
      api.getPanel(id)?.api.setSize(size);
    } catch {
      // Older dockview versions: silently fall back to default sizing.
    }
  };

  trySetSize('dataPath', { width: COL_A_WIDTH });
  trySetSize('macrocode', { width: COL_B_WIDTH });
  trySetSize('microInspector', { height: A_INSPECTOR_HEIGHT });
  trySetSize('stack', { height: B_BOTTOM_HEIGHT, width: B_BOTTOM_STACK_WIDTH });
}
