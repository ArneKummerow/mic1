/**
 * Single source of truth for the dockable panels: id and display title. The
 * Layout, the default-layout helper, and the View menu all read from this
 * list.
 */

export type PanelId =
  | 'microcode'
  | 'macrocode'
  | 'dataPath'
  | 'memory'
  | 'stack'
  | 'registers'
  | 'controlStore'
  | 'microInspector'
  | 'console';

export interface PanelDef {
  id: PanelId;
  title: string;
}

/** Stable display order, used by the View menu. */
export const PANEL_DEFS: readonly PanelDef[] = [
  { id: 'microcode', title: 'Microcode (MAL)' },
  { id: 'macrocode', title: 'Macrocode (IJVM)' },
  { id: 'dataPath', title: 'Data Path' },
  { id: 'memory', title: 'Memory' },
  { id: 'registers', title: 'Registers' },
  { id: 'stack', title: 'Stack' },
  { id: 'controlStore', title: 'Control Store' },
  { id: 'console', title: 'Console' },
  { id: 'microInspector', title: 'µInst. Inspector' },
];

export function panelTitle(id: PanelId): string {
  return PANEL_DEFS.find((p) => p.id === id)?.title ?? id;
}
