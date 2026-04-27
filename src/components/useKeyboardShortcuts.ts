import { useEffect } from 'react';
import { useAppStore } from '../store';

/**
 * Global keyboard shortcuts. Mounted once at the app root.
 *
 * F5         — toggle Run / Pause
 * Shift+F5   — Reset
 * F10        — Step one IJVM instruction
 * F11        — Step one microinstruction
 *
 * Shortcuts are suppressed when focus is inside an input / textarea / Monaco
 * editor (where the user is typing).
 */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (target.isContentEditable) return;
        if (target.closest('.monaco-editor')) return;
      }

      const store = useAppStore.getState();

      switch (e.key) {
        case 'F5':
          e.preventDefault();
          if (e.shiftKey) {
            store.reset();
          } else {
            if (store.mode === 'running') store.pause();
            else store.run();
          }
          return;
        case 'F10':
          e.preventDefault();
          store.macrostep();
          return;
        case 'F11':
          e.preventDefault();
          store.microstep();
          return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
