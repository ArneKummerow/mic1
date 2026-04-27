import { useMemo } from 'react';
import { useAppStore, TURBO_THRESHOLD } from '../store';
import type { BBusSource, RegisterName, MicroTrace } from '../engine/types';
import styles from './DataPathView.module.css';

/**
 * MIC-1 data path — hand-authored SVG.
 *
 * Layout (top to bottom):
 *   ┌──────────────────── C-bus (horizontal) ────────────────────┐
 *   │                                                            │
 *   │   MAR  MDR  PC  MBR  SP  LV  CPP  TOS  OPC  H              │
 *   │                                                            │
 *   ├──────────────────── B-bus (horizontal) ────────────────────┤
 *   │                                                            │
 *   │            ┌────────┐    ┌────────────┐                    │
 *   │  ──────────┤  ALU   ├────┤  Shifter   ├──────►  C-bus      │
 *   │   A-bus    └────────┘    └────────────┘                    │
 *   │   (from H)                                                 │
 *   └────────────────────────────────────────────────────────────┘
 *
 * Memory interface is drawn to the right.
 *
 * Animation: each cycle we update class names on highlighted elements.
 * CSS transitions handle the fade. Turbo mode (>200 microsteps/s) and
 * `prefers-reduced-motion` short-circuit animations.
 */

const REGISTER_LAYOUT: { name: RegisterName; x: number }[] = [
  { name: 'MAR', x: 60 },
  { name: 'MDR', x: 140 },
  { name: 'PC', x: 220 },
  { name: 'MBR', x: 300 },
  { name: 'SP', x: 380 },
  { name: 'LV', x: 460 },
  { name: 'CPP', x: 540 },
  { name: 'TOS', x: 620 },
  { name: 'OPC', x: 700 },
  { name: 'H', x: 780 },
];

const REG_W = 60;
const REG_H = 36;
const REG_Y = 60;
const C_BUS_Y = 30;
const B_BUS_Y = 130;
const ALU_X = 320;
const ALU_Y = 200;
const ALU_W = 200;
const ALU_H = 60;
const SHIFTER_Y = 290;
const SHIFTER_H = 36;

function fmtVal(n: number, name: RegisterName): string {
  if (name === 'MBR') return '0x' + (n & 0xff).toString(16).padStart(2, '0').toUpperCase();
  return '0x' + ((n >>> 0) & 0xffffffff).toString(16).padStart(8, '0').toUpperCase();
}

export function DataPathView(): JSX.Element {
  const machine = useAppStore((s) => s.machine);
  const lastTrace = useAppStore((s) => s.lastTrace);
  const speed = useAppStore((s) => s.speed);

  const turbo = speed >= TURBO_THRESHOLD;

  const highlight = useMemo(() => deriveHighlight(lastTrace), [lastTrace]);

  return (
    <div className="panel">
      <div className="panel-header">
        Data Path
        {turbo && <span className={styles.turboNote}>turbo mode — animations disabled</span>}
      </div>
      <div className={styles.body}>
        <svg
          viewBox="0 0 900 380"
          xmlns="http://www.w3.org/2000/svg"
          className={`${styles.svg} ${turbo ? styles.turbo : ''}`}
          aria-label="MIC-1 data path"
        >
          <defs>
            <marker
              id="arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>

          {/* C-bus (horizontal across the top) */}
          <line
            x1={40}
            y1={C_BUS_Y}
            x2={840}
            y2={C_BUS_Y}
            className={`${styles.bus} ${styles.cBus} ${highlight.cBusActive ? styles.busActive : ''}`}
          />
          <text x={20} y={C_BUS_Y + 4} className={styles.busLabel}>
            C
          </text>

          {/* B-bus (horizontal below registers) */}
          <line
            x1={40}
            y1={B_BUS_Y}
            x2={840}
            y2={B_BUS_Y}
            className={`${styles.bus} ${styles.bBus} ${highlight.bBusActive ? styles.busActive : ''}`}
          />
          <text x={20} y={B_BUS_Y + 4} className={styles.busLabel}>
            B
          </text>

          {/* Registers */}
          {REGISTER_LAYOUT.map(({ name, x }) => {
            const isWritten = highlight.cTargets.has(name);
            const isRead =
              highlight.bSourceReg === name || (name === 'H' && highlight.aActive);
            const isMbr = name === 'MBR';
            return (
              <g key={name} className={styles.regGroup}>
                {/* C-bus tap (only for writable registers) */}
                {!isMbr && (
                  <line
                    x1={x + REG_W / 2}
                    y1={C_BUS_Y}
                    x2={x + REG_W / 2}
                    y2={REG_Y}
                    className={`${styles.tap} ${styles.cTap} ${isWritten ? styles.tapActive : ''}`}
                  />
                )}
                {/* B-bus tap */}
                <line
                  x1={x + REG_W / 2}
                  y1={REG_Y + REG_H}
                  x2={x + REG_W / 2}
                  y2={B_BUS_Y}
                  className={`${styles.tap} ${styles.bTap} ${highlight.bSourceReg === name ? styles.tapActive : ''}`}
                />
                <rect
                  x={x}
                  y={REG_Y}
                  width={REG_W}
                  height={REG_H}
                  rx={3}
                  className={`${styles.reg} ${isWritten ? styles.regWritten : ''} ${isRead ? styles.regRead : ''}`}
                />
                <text x={x + REG_W / 2} y={REG_Y + 14} className={styles.regName}>
                  {name}
                </text>
                <text x={x + REG_W / 2} y={REG_Y + 28} className={styles.regValue}>
                  {fmtVal(machine[name], name)}
                </text>
              </g>
            );
          })}

          {/* A-bus (from H to ALU) */}
          <path
            d={`M ${REGISTER_LAYOUT.find((r) => r.name === 'H')!.x + REG_W / 2} ${REG_Y + REG_H}
                Q 810 170 ${ALU_X + ALU_W} ${ALU_Y + ALU_H / 2}`}
            fill="none"
            className={`${styles.bus} ${styles.aBus} ${highlight.aActive ? styles.busActive : ''}`}
          />
          <text x={815} y={170} className={styles.busLabel}>
            A
          </text>

          {/* B-bus to ALU */}
          <line
            x1={ALU_X + 30}
            y1={B_BUS_Y}
            x2={ALU_X + 30}
            y2={ALU_Y}
            className={`${styles.bus} ${styles.bBus} ${highlight.bBusActive ? styles.busActive : ''}`}
          />

          {/* ALU */}
          <polygon
            points={`${ALU_X},${ALU_Y} ${ALU_X + ALU_W},${ALU_Y} ${ALU_X + ALU_W - 30},${ALU_Y + ALU_H} ${ALU_X + 30},${ALU_Y + ALU_H}`}
            className={`${styles.alu} ${highlight.aluActive ? styles.aluActive : ''}`}
          />
          <text x={ALU_X + ALU_W / 2} y={ALU_Y + ALU_H / 2 + 4} className={styles.aluLabel}>
            ALU{highlight.aluText ? ` · ${highlight.aluText}` : ''}
          </text>
          {/* Flags */}
          {lastTrace && (
            <text x={ALU_X + ALU_W + 10} y={ALU_Y + 14} className={styles.flagsLabel}>
              N={lastTrace.aluFlags.N ? 1 : 0} Z={lastTrace.aluFlags.Z ? 1 : 0}
            </text>
          )}

          {/* Shifter */}
          <rect
            x={ALU_X + 30}
            y={SHIFTER_Y}
            width={ALU_W - 60}
            height={SHIFTER_H}
            rx={3}
            className={`${styles.shifter} ${highlight.shifterActive ? styles.shifterActive : ''}`}
          />
          <text x={ALU_X + ALU_W / 2} y={SHIFTER_Y + 22} className={styles.shifterLabel}>
            Shifter{highlight.shifterText ? ` · ${highlight.shifterText}` : ''}
          </text>
          {/* ALU output → Shifter */}
          <line
            x1={ALU_X + ALU_W / 2}
            y1={ALU_Y + ALU_H}
            x2={ALU_X + ALU_W / 2}
            y2={SHIFTER_Y}
            className={`${styles.bus} ${highlight.aluActive ? styles.busActive : ''}`}
          />
          {/* Shifter → C-bus (loops back up on the left) */}
          <path
            d={`M ${ALU_X + 30} ${SHIFTER_Y + SHIFTER_H / 2}
                L 30 ${SHIFTER_Y + SHIFTER_H / 2}
                L 30 ${C_BUS_Y}`}
            fill="none"
            className={`${styles.bus} ${styles.cBus} ${highlight.cBusActive ? styles.busActive : ''}`}
          />

          {/* Memory interface */}
          <g transform="translate(0, 0)">
            <rect x={780} y={SHIFTER_Y - 20} width={100} height={70} rx={4} className={styles.memBox} />
            <text x={830} y={SHIFTER_Y - 6} className={styles.memLabel}>
              Memory
            </text>
            <text x={830} y={SHIFTER_Y + 12} className={`${styles.memOp} ${highlight.memRead ? styles.memOpActive : ''}`}>
              ← rd
            </text>
            <text x={830} y={SHIFTER_Y + 28} className={`${styles.memOp} ${highlight.memWrite ? styles.memOpActive : ''}`}>
              wr →
            </text>
            <text x={830} y={SHIFTER_Y + 44} className={`${styles.memOp} ${highlight.memFetch ? styles.memOpActive : ''}`}>
              ← fetch
            </text>
          </g>
        </svg>

        <div className={styles.legend}>
          <LegendDot color="var(--bus-a)" label="A-bus" />
          <LegendDot color="var(--bus-b)" label="B-bus" />
          <LegendDot color="var(--bus-c)" label="C-bus" />
          <LegendDot color="var(--alu)" label="ALU" />
          <LegendDot color="var(--mem-read)" label="rd" />
          <LegendDot color="var(--mem-write)" label="wr" />
          <LegendDot color="var(--mem-fetch)" label="fetch" />
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }): JSX.Element {
  return (
    <span className={styles.legendItem}>
      <span className={styles.legendDot} style={{ background: color }} />
      {label}
    </span>
  );
}

interface Highlight {
  cBusActive: boolean;
  bBusActive: boolean;
  aActive: boolean;
  aluActive: boolean;
  shifterActive: boolean;
  cTargets: Set<RegisterName>;
  bSourceReg: BBusSource | null;
  aluText: string;
  shifterText: string;
  memRead: boolean;
  memWrite: boolean;
  memFetch: boolean;
}

function deriveHighlight(trace: MicroTrace | null): Highlight {
  if (!trace) {
    return {
      cBusActive: false,
      bBusActive: false,
      aActive: false,
      aluActive: false,
      shifterActive: false,
      cTargets: new Set(),
      bSourceReg: null,
      aluText: '',
      shifterText: '',
      memRead: false,
      memWrite: false,
      memFetch: false,
    };
  }

  const bSource = trace.bBusSource;
  // For highlighting, MBR/MBRU both light up the MBR register tap.
  const bSourceReg: BBusSource | null = bSource === 'NONE' ? null : bSource;

  const alu = trace.microinstruction.alu;
  const F = (alu.F0 ? 1 : 0) * 2 + (alu.F1 ? 1 : 0);
  const fName = ['AND', 'OR', 'NOT', 'ADD'][F];
  const aluText = `${fName} = 0x${(trace.aluOutput >>> 0).toString(16).padStart(8, '0').toUpperCase()}`;

  const shifterOp = trace.microinstruction.shifter;
  const shifterText = shifterOp === 'NONE' ? 'pass' : shifterOp;

  return {
    cBusActive: trace.cBusTargets.length > 0,
    bBusActive: bSource !== 'NONE',
    aActive: alu.ENA,
    aluActive: true,
    shifterActive: shifterOp !== 'NONE',
    cTargets: new Set<RegisterName>(trace.cBusTargets),
    bSourceReg,
    aluText,
    shifterText,
    memRead: trace.memoryOpsIssued.includes('read'),
    memWrite: trace.memoryOpsIssued.includes('write'),
    memFetch: trace.memoryOpsIssued.includes('fetch'),
  };
}
