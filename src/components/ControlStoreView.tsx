import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FixedSizeList } from 'react-window';
import { useAppStore } from '../store';
import type { Microinstruction } from '../engine/types';
import { CONTROL_STORE_SIZE } from '../engine/mal';
import styles from './ControlStoreView.module.css';

const ROW_HEIGHT = 22;

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

interface RowData {
  controlStore: readonly (Microinstruction | undefined)[];
  currentMpc: number;
  breakpoints: ReadonlySet<number>;
  toggleBreakpoint: (addr: number) => void;
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
  const instr = data.controlStore[index];
  const isCurrent = data.currentMpc === index;
  const hasBreakpoint = data.breakpoints.has(index);
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
        onClick={() => data.toggleBreakpoint(index)}
        title={hasBreakpoint ? 'Remove breakpoint' : 'Set breakpoint'}
        aria-label="Toggle breakpoint"
      />
      <span className={`mono ${styles.addr}`}>{fmtMpc(index)}</span>
      <span className={styles.label}>{instr?.label ?? ''}</span>
      <span className={`mono ${styles.alu}`}>{instr ? summarizeAlu(instr) : '—'}</span>
      <span className={`mono ${styles.cBus}`}>{instr ? [...instr.cBus].join(',') : ''}</span>
      <span className={`mono ${styles.mem}`}>{instr ? summarizeMem(instr) : ''}</span>
      <span className={`mono ${styles.next}`}>{instr ? `→${fmtMpc(instr.nextAddress)}` : ''}</span>
      <span className={`mono ${styles.jam}`}>{instr ? summarizeJam(instr) : ''}</span>
    </div>
  );
}

export function ControlStoreView(): JSX.Element {
  const controlStore = useAppStore((s) => s.machine.controlStore);
  const mpc = useAppStore((s) => s.machine.MPC);
  const breakpoints = useAppStore((s) => s.breakpoints);
  const toggleBreakpoint = useAppStore((s) => s.toggleBreakpoint);

  const listRef = useRef<FixedSizeList<RowData>>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = (): void => setSize({ width: el.clientWidth, height: el.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    listRef.current?.scrollToItem(mpc, 'smart');
  }, [mpc]);

  const itemData: RowData = useMemo(
    () => ({ controlStore, currentMpc: mpc, breakpoints, toggleBreakpoint }),
    [controlStore, mpc, breakpoints, toggleBreakpoint],
  );

  return (
    <div className="panel">
      <div className="panel-header">Control Store</div>
      <div className={styles.headerRow}>
        <span className={styles.colSpacer} />
        <span className={styles.addrCol}>Addr</span>
        <span className={styles.labelCol}>Label</span>
        <span className={styles.aluCol}>ALU</span>
        <span className={styles.cBusCol}>C</span>
        <span className={styles.memCol}>Mem</span>
        <span className={styles.nextCol}>Next</span>
        <span className={styles.jamCol}>Jam</span>
      </div>
      <div ref={containerRef} className={styles.listContainer}>
        {size.width > 0 && size.height > 0 && (
          <FixedSizeList<RowData>
            ref={listRef}
            width={size.width}
            height={size.height}
            itemCount={CONTROL_STORE_SIZE}
            itemSize={ROW_HEIGHT}
            itemData={itemData}
          >
            {Row}
          </FixedSizeList>
        )}
      </div>
    </div>
  );
}
