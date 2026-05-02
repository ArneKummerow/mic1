import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import { useAppStore } from '../store';
import { PANEL_DEFS } from './panels';
import styles from './ViewMenu.module.css';

interface ViewMenuProps {
  open: boolean;
  setOpen: (v: boolean) => void;
}

/**
 * Toolbar dropdown for view-related preferences: which panels are visible
 * and whether tab bars are shown. Theme has its own dedicated toggle next
 * to this menu.
 *
 * The popover is rendered through a portal because the toolbar uses
 * `overflow: hidden` to keep its row layout tidy — without the portal the
 * dropdown would be clipped and invisible.
 */
export function ViewMenu({ open, setOpen }: ViewMenuProps): JSX.Element {
  const hiddenPanels = useAppStore((s) => s.uiPrefs.hiddenPanels);
  const hideTabBars = useAppStore((s) => s.uiPrefs.hideTabBars);
  const setHiddenPanels = useAppStore((s) => s.setHiddenPanels);
  const setHideTabBars = useAppStore((s) => s.setHideTabBars);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Compute the popover position from the trigger button's bounding rect
  // so it lines up with the button regardless of toolbar overflow clipping.
  useEffect(() => {
    if (!open) return;
    const update = (): void => {
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPos({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  // Click-outside / Escape closes the menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent): void => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, setOpen]);

  const togglePanel = (id: string): void => {
    const next = new Set(hiddenPanels);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setHiddenPanels(next);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        title="Show / hide panels and tab bars"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Eye size={14} />
        <span>View</span>
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            role="menu"
            style={{ top: pos.top, right: pos.right }}
          >
            <label className={styles.row}>
              <input
                type="checkbox"
                checked={hideTabBars}
                onChange={(e) => setHideTabBars(e.target.checked)}
              />
              <span>Hide tab bars</span>
            </label>
            <div className={styles.separator} />
            <div className={styles.groupLabel}>Panels</div>
            {PANEL_DEFS.map((p) => {
              const visible = !hiddenPanels.includes(p.id);
              return (
                <label key={p.id} className={styles.row}>
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => togglePanel(p.id)}
                  />
                  <span>{p.title}</span>
                </label>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
