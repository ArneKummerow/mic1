import { useLayoutEffect, useRef } from 'react';
import { useAppStore } from '../store';
import { DEFAULT_STACK_BASE_WORD } from '../store/bootstrap';
import styles from './StackView.module.css';

const ROW_HEIGHT = 22; // px — must match `.row { height: … }` in CSS
const AT_TOP_THRESHOLD = 4; // px

function fmtHex(n: number, width: number): string {
  return ((n >>> 0) & ((1 << (width * 4)) - 1))
    .toString(16)
    .padStart(width, '0')
    .toUpperCase();
}

function fmtHex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function readWord(memory: Uint8Array, byteAddr: number): number {
  if (byteAddr < 0 || byteAddr + 3 >= memory.length) return 0;
  return (
    ((memory[byteAddr] << 24) |
      (memory[byteAddr + 1] << 16) |
      (memory[byteAddr + 2] << 8) |
      memory[byteAddr + 3]) |
    0
  );
}

/**
 * Operand-stack view.
 *
 * Renders every word from the stack base up to the current TOS (anchor at
 * `DEFAULT_STACK_BASE_WORD`). When the stack is shorter than the panel,
 * entries pin to the bottom so new pushes appear at the top — matching the
 * "stack grows up" mental model.
 *
 * Auto-follow rule: when the user is scrolled to the top (showing TOS) we
 * keep them pinned to the top as the stack grows. If they've scrolled down
 * to inspect a lower frame, we adjust scrollTop to compensate for entries
 * added/removed at the top, so the entry they were reading stays visually
 * fixed.
 */
export function StackView(): JSX.Element {
  const machine = useAppStore((s) => s.machine);
  // Subscribe to tick so the values refresh when memory mutates (the
  // Uint8Array reference is stable, so otherwise React wouldn't re-render).
  useAppStore((s) => s.tick);

  const sp = machine.SP;
  const lv = machine.LV;
  const base = DEFAULT_STACK_BASE_WORD;

  // Word indices from TOS down to base. If sp < base the stack is empty.
  const rows: { wordAddr: number; value: number; isTos: boolean; isLv: boolean }[] = [];
  for (let w = sp; w >= base; w--) {
    const value = w === sp ? machine.TOS : readWord(machine.memory, w * 4);
    rows.push({ wordAddr: w, value, isTos: w === sp, isLv: w === lv });
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const wasAtTopRef = useRef(true);
  // Row-level scroll anchor. We remember which word address is at the
  // top of the viewport (and the sub-row pixel offset) and, after each
  // SP change, scroll so that same word address sits at the same Y.
  // Anchoring by *content* (not by scrollTop math on deltas) is robust
  // across every push/pop pattern and across the spacer↔overflow
  // transition that happens when the stack first exceeds the panel
  // height.
  const anchorRef = useRef<{ wordAddr: number; offset: number } | null>(null);

  const captureAnchor = (el: HTMLDivElement): void => {
    wasAtTopRef.current = el.scrollTop <= AT_TOP_THRESHOLD;
    // In the overflow regime the spacer collapses to 0 and the first
    // row sits at content y = 0, so floor(scrollTop / ROW_HEIGHT) gives
    // the rendered index of the topmost visible row. rows are laid out
    // [TOS, TOS-1, …, base] so wordAddr = sp - index.
    const idx = Math.floor(el.scrollTop / ROW_HEIGHT);
    const offset = el.scrollTop - idx * ROW_HEIGHT;
    anchorRef.current = { wordAddr: sp - idx, offset };
  };

  const onScroll = (e: React.UIEvent<HTMLDivElement>): void => {
    captureAnchor(e.currentTarget);
  };

  // Re-anchor on every render that changes SP. Runs as a layout effect
  // (synchronously after commit, before paint) so the user never sees
  // a frame where a new row has appeared but scrollTop hasn't caught up.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchor = anchorRef.current;
    if (wasAtTopRef.current || !anchor) {
      el.scrollTop = 0;
    } else {
      const newIdx = sp - anchor.wordAddr;
      if (newIdx < 0) {
        // The anchor row was popped above us; nothing sensible to
        // pin to, so fall back to "follow TOS".
        el.scrollTop = 0;
      } else {
        el.scrollTop = newIdx * ROW_HEIGHT + anchor.offset;
      }
    }
    captureAnchor(el);
  }, [sp]);

  const empty = rows.length === 0;

  return (
    <div className="panel">
      <div ref={scrollRef} className={styles.body} onScroll={onScroll}>
        {empty ? (
          <div className={styles.empty}>(stack empty)</div>
        ) : (
          <>
            {/* flex spacer: collapses to 0 when content overflows, fills the
             * gap above when there are fewer entries than visible space. */}
            <div className={styles.spacer} />
            {rows.map(({ wordAddr, value, isTos, isLv }) => {
              const cls = [
                styles.row,
                isTos && styles.tosRow,
                isLv && styles.lvRow,
              ]
                .filter(Boolean)
                .join(' ');
              return (
                <div key={wordAddr} className={cls}>
                  <span className={`mono ${styles.addr}`}>[{fmtHex(wordAddr, 4)}]</span>
                  <span className={`mono ${styles.hex}`}>0x{fmtHex32(value)}</span>
                  <span className={`mono ${styles.dec}`}>{(value | 0).toString()}</span>
                  <span className={styles.tags}>
                    {isTos && <span className={`${styles.tag} ${styles.tagTos}`}>TOS</span>}
                    {isLv && <span className={`${styles.tag} ${styles.tagLv}`}>LV</span>}
                  </span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
