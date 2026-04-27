/**
 * Imperative handle to the running Dockview instance.
 *
 * Layout.tsx sets `dockApiSingleton` on mount; the toolbar (or anyone else
 * who needs to talk to Dockview from outside its React tree) reads through
 * the helpers here. Keeping this in a separate module satisfies React Fast
 * Refresh's "components-only export" rule for Layout.tsx.
 */

import type { DockviewApi } from 'dockview-react';
import { applyDefaultLayout } from './defaultLayout';

let dockApiSingleton: DockviewApi | null = null;

export function setDockApi(api: DockviewApi | null): void {
  dockApiSingleton = api;
}

export function getDockApi(): DockviewApi | null {
  return dockApiSingleton;
}

// Bump this when changing the default layout — any cached layout under the
// old key would otherwise override the new arrangement on existing users.
export const LAYOUT_STORAGE_KEY = 'mic1-visualizer:layout:v3';

/** Restore the bundled default panel arrangement. */
export function resetLayout(): void {
  const api = getDockApi();
  if (!api) return;
  api.clear();
  applyDefaultLayout(api);
  localStorage.removeItem(LAYOUT_STORAGE_KEY);
}
