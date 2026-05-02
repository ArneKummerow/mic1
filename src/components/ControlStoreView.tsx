import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList } from 'react-window';
import { useAppStore } from '../store';
import type { Microinstruction } from '../engine/types';
import { CONTROL_STORE_SIZE } from '../engine/mal';
import { BitFieldRow, BIT_FIELDS_WIDTH, BIT_ROW_HEIGHT } from './BitView';
import styles from './ControlStoreView.module.css';

const TEXT_ROW_HEIGHT = 22;

function fmtMpc(addr: number): string {
  return '0x' + addr.toString(16).padStart(3, '0').toUpperCase();
}

function summarizeAlu(instr: Microinstruction): string {
  const { alu, bBus, shifter } = instr;
  const F = (alu.F0 ? 1 : 0) * 2 + (alu.F1 ? 1 : 0);
  const fName = ['AND', 'OR', 'NOT', 'ADD'][F];
  const a = alu.ENA ? 'H' : '0';
  const aSign = alu.INVA ? `~${a}` : a;
  const b = alu.ENB ? bBus : '0';
  let core: string;
  if (fName === 'ADD') {
    core = `${aSign}+${b}${alu.INC ? '+1' : ''}`;
  } else if (fName === 'NOT') {
    core = `~${b}`;
  } else {
    core = `${aSign} ${fName} ${b}`;
  }
  if (shifter === 'SLL8') core += ' <<8';
  if (shifter === 'SRA1') core += ' >>1';
  return core;
}

function summarizeMem(instr: Microinstruction): string {
  const parts: string[] = [];
  if (instr.mem.read) parts.push('rd');
  if (instr.mem.write) parts.push('wr');
  if (instr.mem.fetch) parts.push('fe');
  return parts.join('|');
}

function summarizeJam(instr: Microinstruction): string {
  const parts: string[] = [];
  if (instr.jam.JMPC) parts.push('JMPC');
  if (instr.jam.JAMN) parts.push('JAMN');
  if (instr.jam.JAMZ) parts.push('JAMZ');
  return parts.join(' ');
}

/**
 * Per-row payload. Each row is either an instruction (or undefined slot in
 * non-collapsed mode) at a specific microaddress, or a "gap" marker
 * representing a span of contiguous empty addresses that have been hidden.
 */
type RowItem =
  | { kind: 'instr'; address: number }
  | { kind: 'gap'; from: number; to: number };

interface RowData {
  items: readonly RowItem[];
  controlStore: readonly (Microinstruction | undefined)[];
  currentMpc: number;
  breakpoints: ReadonlySet<number>;
  toggleBreakpoint: (addr: number) => void;
  bitView: boolean;
}

function Row({
  index,
  style,
  data,
}: {
  index: number;
  style: React.CSSProperties;
  data: RowData;
}): JSX.Element {
  const item = data.items[index];

  if (item.kind === 'gap') {
    const count = item.to - item.from + 1;
    return (
      <div style={style} className={`${styles.row} ${styles.gapRow}`}>
        <span className={styles.bpDot} aria-hidden />
        <span className={`mono ${styles.addr}`}>{fmtMpc(item.from)}</span>
        <span className={styles.gapText}>… {count} empty row{count === 1 ? '' : 's'} hidden …</span>
      </div>
    );
  }

  const addr = item.address;
  const instr = data.controlStore[addr];
  const isCurrent = data.currentMpc === addr;
  const hasBreakpoint = data.breakpoints.has(addr);
  const isEmpty = !instr;

  const rowClass = [
    styles.row,
    isCurrent && styles.currentRow,
    isEmpty && styles.emptyRow,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div style={style} className={rowClass}>
      <button
        className={`${styles.bpDot} ${hasBreakpoint ? styles.bpActive : ''}`}
        onClick={() => data.toggleBreakpoint(addr)}
        title={hasBreakpoint ? 'Remove breakpoint' : 'Set breakpoint'}
        aria-label="Toggle breakpoint"
      />
      <span className={`mono ${styles.addr}`}>{fmtMpc(addr)}</span>
      <span className={styles.label}>{instr?.label ?? ''}</span>
      {data.bitView ? (
        <span className={styles.bitsCell} style={{ width: BIT_FIELDS_WIDTH }}>
          <BitFieldRow instr={instr} />
        </span>
      ) : (
        <>
          <span className={`mono ${styles.alu}`}>{instr ? summarizeAlu(instr) : '—'}</span>
          <span className={`mono ${styles.cBus}`}>{instr ? [...instr.cBus].join(',') : ''}</span>
          <span className={`mono ${styles.mem}`}>{instr ? summarizeMem(instr) : ''}</span>
          <span className={`mono ${styles.next}`}>{instr ? `→${fmtMpc(instr.nextAddress)}` : ''}</span>
          <span className={`mono ${styles.jam}`}>{instr ? summarizeJam(instr) : ''}</span>
        </>
      )}
    </div>
  );
}

/**
 * Build the rendered row list, optionally collapsing empty spans.
 *
 * In hide-empty mode, contiguous empty addresses are merged into a single
 * gap marker — except that any address with a breakpoint is preserved as a
 * regular row so the user never loses visibility of where they've set one.
 */
function buildItems(
  controlStore: readonly (Microinstruction | undefined)[],
  hideEmpty: boolean,
  breakpoints: ReadonlySet<number>,
): RowItem[] {
  if (!hideEmpty) {
    const items: RowItem[] = [];
    for (let i = 0; i < CONTROL_STORE_SIZE; i++) items.push({ kind: 'instr', address: i });
    return items;
  }

  const items: RowItem[] = [];
  let gapStart: number | null = null;
  const flushGap = (toExclusive: number): void => {
    if (gapStart !== null) {
      items.push({ kind: 'gap', from: gapStart, to: toExclusive - 1 });
      gapStart = null;
    }
  };
  for (let i = 0; i < CONTROL_STORE_SIZE; i++) {
    const populated = controlStore[i] !== undefined || breakpoints.has(i);
    if (populated) {
      flushGap(i);
      items.push({ kind: 'instr', address: i });
    } else if (gapStart === null) {
      gapStart = i;
    }
  }
  flushGap(CONTROL_STORE_SIZE);
  return items;
}

export function ControlStoreView(): JSX.Element {
  const controlStore = useAppStore((s) => s.machine.controlStore);
  // Track the just-executed microinstruction so the highlighted row matches
  // the data-path animation. Before the first step `lastTrace` is null;
  // fall back to MPC (which equals 0 / Main1 at boot).
  const mpc = useAppStore((s) => s.lastTrace?.mpcBefore ?? s.machine.MPC);
  const breakpoints = useAppStore((s) => s.breakpoints);
  const toggleBreakpoint = useAppStore((s) => s.toggleBreakpoint);

  const bitView = useAppStore((s) => s.uiPrefs.controlStoreBitView);
  const hideEmpty = useAppStore((s) => s.uiPrefs.controlStoreHideEmpty);

  const listRef = useRef<FixedSizeList<RowData>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [sbWidth] = useState(() => {
    const div = document.createElement('div');
    div.style.cssText = 'overflow-y:scroll;position:fixed;top:-9999px;width:50px;height:50px';
    document.body.appendChild(div);
    const w = div.offsetWidth - div.clientWidth;
    document.body.removeChild(div);
    return w;
  });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = (): void => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const items = useMemo(
    () => buildItems(controlStore, hideEmpty, breakpoints),
    [controlStore, hideEmpty, breakpoints],
  );

  // Find which list row corresponds to the current MPC (so we can scroll to
  // it). With hide-empty active, an empty MPC is folded into a gap row.
  const currentRowIdx = useMemo(() => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'instr' && it.address === mpc) return i;
      if (it.kind === 'gap' && mpc >= it.from && mpc <= it.to) return i;
    }
    return 0;
  }, [items, mpc]);

  useEffect(() => {
    listRef.current?.scrollToItem(currentRowIdx, 'smart');
  }, [currentRowIdx]);

  const itemData: RowData = useMemo(
    () => ({ items, controlStore, currentMpc: mpc, breakpoints, toggleBreakpoint, bitView }),
    [items, controlStore, mpc, breakpoints, toggleBreakpoint, bitView],
  );

  const rowHeight = bitView ? BIT_ROW_HEIGHT : TEXT_ROW_HEIGHT;

  return (
    <div className="panel">
      {!bitView && (
        // The bit view embeds its own labels (vertically) into every row,
        // so the column-header strip is only useful in textual mode.
        <div className={styles.headerRow} style={{ paddingRight: 6 + sbWidth }}>
          <span className={styles.colSpacer} />
          <span className={styles.addrCol}>Addr</span>
          <span className={styles.labelCol}>Label</span>
          <span className={styles.aluCol}>ALU</span>
          <span className={styles.cBusCol}>C</span>
          <span className={styles.memCol}>Mem</span>
          <span className={styles.nextCol}>Next</span>
          <span className={styles.jamCol}>Jam</span>
        </div>
      )}
      <div ref={containerRef} className={styles.listContainer}>
        {size.width > 0 && size.height > 0 && (
          <FixedSizeList<RowData>
            ref={listRef}
            width={size.width}
            height={size.height}
            itemCount={items.length}
            itemSize={rowHeight}
            itemData={itemData}
          >
            {Row}
          </FixedSizeList>
        )}
      </div>
    </div>
  );
}
