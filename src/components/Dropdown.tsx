import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './Dropdown.module.css';

interface DropdownProps {
  /** Trigger button label. */
  label: string;
  /** Optional leading icon for the trigger. */
  icon?: ReactNode;
  /** Tooltip / aria-label for the trigger button. */
  title: string;
  /**
   * Render-prop for the menu body. Receives a `close` callback so individual
   * menu items can dismiss the popover after firing their action.
   */
  children: (ctx: { close: () => void }) => ReactNode;
}

/**
 * Reusable toolbar dropdown. Renders the popover through a portal so it's
 * not clipped by the toolbar's `overflow: hidden`, and positions it from the
 * trigger button's bounding rect (right-aligned by default, falling back to
 * left-aligned if there isn't enough room on the right side of the screen).
 */
export function Dropdown({ label, icon, title, children }: DropdownProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

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
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen(!open)}
        title={title}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {icon}
        <span>{label}</span>
      </button>
      {open && pos &&
        createPortal(
          <div
            ref={menuRef}
            className={styles.menu}
            role="menu"
            style={{ top: pos.top, right: pos.right }}
          >
            {children({ close: () => setOpen(false) })}
          </div>,
          document.body,
        )}
    </>
  );
}

/** Plain clickable menu row — closes the menu when activated. */
export function MenuItem({
  onClick,
  children,
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  disabled?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      className={styles.item}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export function MenuCheckbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <label className={styles.row}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}

/** Radio row — for mutually-exclusive option groups in the menu. */
export function MenuRadio<T extends string>({
  name,
  value,
  current,
  onChange,
  children,
}: {
  name: string;
  value: T;
  current: T;
  onChange: (v: T) => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <label className={styles.row}>
      <input
        type="radio"
        name={name}
        checked={value === current}
        onChange={() => onChange(value)}
      />
      <span>{children}</span>
    </label>
  );
}

export function MenuSeparator(): JSX.Element {
  return <div className={styles.separator} role="separator" />;
}

export function MenuGroupLabel({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.groupLabel}>{children}</div>;
}
