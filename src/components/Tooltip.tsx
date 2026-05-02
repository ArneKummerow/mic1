/**
 * Lightweight portal-rendered tooltip. Renders into `document.body`, so it
 * isn't clipped by any `overflow: hidden` ancestor (panels, the bit-row
 * scroll, control-store rows). Native `title` tooltips are unreliable
 * inside dense layouts — slow, easily suppressed by the OS, and can't
 * escape ancestor clipping — so dense interactive surfaces (BitView,
 * the µinstruction inspector) wrap their cells with this instead.
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Tooltip.module.css';

interface TooltipProps {
  text: string;
  children: React.ReactElement;
  /** Delay before showing, in ms. Default 200. */
  delay?: number;
}

interface TooltipPos {
  /** Desired left edge, clamped to viewport. */
  x: number;
  /** Desired top edge, clamped to viewport. */
  y: number;
}

export function Tooltip({ text, children, delay = 200 }: TooltipProps): JSX.Element {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<TooltipPos>({ x: 0, y: 0 });
  const timerRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLElement | null>(null);

  const cancelTimer = (): void => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // After the tooltip mounts we know its size; reposition once so it
  // doesn't fall off the right or bottom edge of the viewport.
  useEffect(() => {
    if (!show || !tooltipRef.current || !targetRef.current) return;
    const tip = tooltipRef.current.getBoundingClientRect();
    const tgt = targetRef.current.getBoundingClientRect();
    const margin = 6;
    let x = tgt.left + tgt.width / 2 - tip.width / 2;
    let y = tgt.bottom + margin;
    // Flip above if it overflows the bottom edge.
    if (y + tip.height > window.innerHeight - margin) {
      y = tgt.top - tip.height - margin;
    }
    // Clamp horizontally.
    x = Math.max(margin, Math.min(x, window.innerWidth - tip.width - margin));
    setPos({ x, y });
  }, [show, text]);

  useEffect(() => {
    return cancelTimer;
  }, []);

  const handleEnter = (e: React.MouseEvent<HTMLElement>): void => {
    targetRef.current = e.currentTarget;
    cancelTimer();
    timerRef.current = window.setTimeout(() => {
      setShow(true);
      timerRef.current = null;
    }, delay);
    children.props.onMouseEnter?.(e);
  };

  const handleLeave = (e: React.MouseEvent<HTMLElement>): void => {
    cancelTimer();
    setShow(false);
    children.props.onMouseLeave?.(e);
  };

  // Hide immediately on any click — keeps tooltips from sticking when
  // the user toggles a breakpoint or clicks a cell.
  const handleClick = (e: React.MouseEvent<HTMLElement>): void => {
    cancelTimer();
    setShow(false);
    children.props.onClick?.(e);
  };

  // Clone the child so we don't introduce an extra wrapper element that
  // could disturb the flex layout of the bit row.
  const clone = (
    <Cloner
      element={children}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    />
  );

  return (
    <>
      {clone}
      {show &&
        createPortal(
          <div
            ref={tooltipRef}
            className={styles.tooltip}
            style={{ left: pos.x, top: pos.y }}
            role="tooltip"
          >
            {text}
          </div>,
          document.body,
        )}
    </>
  );
}

/**
 * `React.cloneElement` doesn't merge handler props nicely (the new prop
 * just overwrites the old one). This helper takes the existing handlers
 * already wired by `Tooltip` and emits a clone with merged listeners.
 */
function Cloner({
  element,
  onMouseEnter,
  onMouseLeave,
  onClick,
}: {
  element: React.ReactElement;
  onMouseEnter: (e: React.MouseEvent<HTMLElement>) => void;
  onMouseLeave: (e: React.MouseEvent<HTMLElement>) => void;
  onClick: (e: React.MouseEvent<HTMLElement>) => void;
}): React.ReactElement {
  // Override; the wrapper handler delegates back to the original child
  // handler internally (see Tooltip handle*).
  return {
    ...element,
    props: {
      ...element.props,
      onMouseEnter,
      onMouseLeave,
      onClick,
    },
  } as React.ReactElement;
}
