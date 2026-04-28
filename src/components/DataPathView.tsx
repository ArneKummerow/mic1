import { useMemo } from 'react';
import { useAppStore, TURBO_THRESHOLD } from '../store';
import type { BBusSource, RegisterName, MicroTrace } from '../engine/types';
import styles from './DataPathView.module.css';

/**
 * MIC-1 data path — vertically aligned per Tanenbaum.
 *
 * Layout (top → bottom):
 *   MEM (rd / wr / fetch indicator, drawn like a register)
 *     ⋯ extra spacing ⋯
 *   MAR, MDR, PC, MBR, SP, LV, CPP, TOS, OPC, H
 *   ALU
 *   Shifter
 *
 * C-bus runs along the left, B-bus along the right; both are drawn as
 * single SVG paths so corners meet exactly. Memory ops light up the rd /
 * wr / fetch text in the MEM box. Animations short-circuit in turbo mode
 * (>200 µstep/s) and when `prefers-reduced-motion` is set.
 */

// Geometry --------------------------------------------------------------

const W = 460;
const H_CANVAS = 620;

const REG_X = 160;
const REG_W = 160;
const REG_H = 32;
const REG_GAP = 6;

// MEM "register" at the very top, separated from MAR by extra space.
const MEM_BOX_X = REG_X;
const MEM_BOX_Y = 20;
const MEM_BOX_W = REG_W;
const MEM_BOX_H = REG_H;
const MEM_TO_REG_GAP = 16;

const REG_FIRST_Y = MEM_BOX_Y + MEM_BOX_H + MEM_TO_REG_GAP;

const C_BUS_X = 80;
const B_BUS_X = 400;
const BUS_TOP_Y = REG_FIRST_Y - 10;

const REGISTER_LAYOUT: { name: RegisterName; y: number; cBusWritable: boolean }[] = [
  { name: 'MAR', y: REG_FIRST_Y + 0 * (REG_H + REG_GAP), cBusWritable: true },
  { name: 'MDR', y: REG_FIRST_Y + 1 * (REG_H + REG_GAP), cBusWritable: true },
  { name: 'PC', y: REG_FIRST_Y + 2 * (REG_H + REG_GAP), cBusWritable: true },
  { name: 'MBR', y: REG_FIRST_Y + 3 * (REG_H + REG_GAP), cBusWritable: false },
  { name: 'SP', y: REG_FIRST_Y + 4 * (REG_H + REG_GAP), cBusWritable: true },
  { name: 'LV', y: REG_FIRST_Y + 5 * (REG_H + REG_GAP), cBusWritable: true },
  { name: 'CPP', y: REG_FIRST_Y + 6 * (REG_H + REG_GAP), cBusWritable: true },
  { name: 'TOS', y: REG_FIRST_Y + 7 * (REG_H + REG_GAP), cBusWritable: true },
  { name: 'OPC', y: REG_FIRST_Y + 8 * (REG_H + REG_GAP), cBusWritable: true },
  { name: 'H', y: REG_FIRST_Y + 9 * (REG_H + REG_GAP), cBusWritable: true },
];

const H_REG = REGISTER_LAYOUT[REGISTER_LAYOUT.length - 1];
const H_BOTTOM_Y = H_REG.y + REG_H;

const ALU_X = REG_X;
const ALU_Y = H_BOTTOM_Y + 26;
const ALU_W = REG_W;
const ALU_H = 60;
const ALU_BOTTOM_Y = ALU_Y + ALU_H;

const SHIFTER_X = 190;
const SHIFTER_Y = ALU_BOTTOM_Y + 14;
const SHIFTER_W = 100;
const SHIFTER_H = 40;
const SHIFTER_BOTTOM_Y = SHIFTER_Y + SHIFTER_H;

const BUS_BOTTOM_Y = SHIFTER_BOTTOM_Y + 16;

const A_BUS_X = 200; // wire from H bottom down into ALU's A-input
const B_BUS_TO_ALU_X = 295; // wire from B-bus elbow into ALU's B-input
const B_BUS_ELBOW_Y = ALU_Y - 14;

// C-bus path: shifter bottom → down → left along the bottom → up the left side.
const C_BUS_PATH = `
  M ${SHIFTER_X + SHIFTER_W / 2} ${SHIFTER_BOTTOM_Y}
  L ${SHIFTER_X + SHIFTER_W / 2} ${BUS_BOTTOM_Y}
  L ${C_BUS_X} ${BUS_BOTTOM_Y}
  L ${C_BUS_X} ${BUS_TOP_Y}
`;

// B-bus path: down the right side → horizontal elbow → short vertical into ALU.
const B_BUS_PATH = `
  M ${B_BUS_X} ${BUS_TOP_Y}
  L ${B_BUS_X} ${B_BUS_ELBOW_Y}
  L ${B_BUS_TO_ALU_X} ${B_BUS_ELBOW_Y}
  L ${B_BUS_TO_ALU_X} ${ALU_Y}
`;

// Helpers ---------------------------------------------------------------

function fmtVal(n: number, name: RegisterName): string {
  if (name === 'MBR') return '0x' + (n & 0xff).toString(16).padStart(2, '0').toUpperCase();
  return '0x' + ((n >>> 0) & 0xffffffff).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Border + background colors for the MEM box, derived from which memory
 * operations are firing this cycle. With multiple ops active, mixes the
 * corresponding op colors via nested CSS `color-mix`. Returns null when no
 * op is active, in which case the rect falls back to its default `.reg`
 * styling.
 */
function memHighlightStyle(
  read: boolean,
  write: boolean,
  fetch: boolean,
): React.CSSProperties | undefined {
  const colors: string[] = [];
  if (read) colors.push('var(--mem-read)');
  if (write) colors.push('var(--mem-write)');
  if (fetch) colors.push('var(--mem-fetch)');
  if (colors.length === 0) return undefined;

  let stroke: string;
  if (colors.length === 1) {
    stroke = colors[0];
  } else if (colors.length === 2) {
    stroke = `color-mix(in srgb, ${colors[0]}, ${colors[1]})`;
  } else {
    stroke = `color-mix(in srgb, ${colors[0]}, color-mix(in srgb, ${colors[1]}, ${colors[2]}))`;
  }

  return {
    stroke,
    fill: `color-mix(in srgb, ${stroke} 25%, var(--bg-3))`,
    strokeWidth: 2,
  };
}

// Component -------------------------------------------------------------

export function DataPathView(): JSX.Element {
  const machine = useAppStore((s) => s.machine);
  const lastTrace = useAppStore((s) => s.lastTrace);
  const speed = useAppStore((s) => s.speed);

  const turbo = speed >= TURBO_THRESHOLD;
  const highlight = useMemo(() => deriveHighlight(lastTrace), [lastTrace]);

  return (
    <div className="panel">
      <div className={styles.body}>
        <svg
          viewBox={`0 0 ${W} ${H_CANVAS}`}
          xmlns="http://www.w3.org/2000/svg"
          className={`${styles.svg} ${turbo ? styles.turbo : ''}`}
          aria-label="MIC-1 data path"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* C-bus (loops from shifter back up the left side) */}
          <path
            d={C_BUS_PATH}
            className={`${styles.bus} ${styles.cBus} ${highlight.cBusActive ? styles.busActive : ''}`}
          />
          <text x={C_BUS_X - 12} y={BUS_TOP_Y + 8} className={styles.busLabel}>
            C
          </text>

          {/* B-bus (right side, elbows into ALU) */}
          <path
            d={B_BUS_PATH}
            className={`${styles.bus} ${styles.bBus} ${highlight.bBusActive ? styles.busActive : ''}`}
          />
          <text x={B_BUS_X + 6} y={BUS_TOP_Y + 8} className={styles.busLabel}>
            B
          </text>

          {/* MEM box — visual indicator for memory ops, sits above MAR. */}
          <g>
            <rect
              x={MEM_BOX_X}
              y={MEM_BOX_Y}
              width={MEM_BOX_W}
              height={MEM_BOX_H}
              rx={3}
              className={styles.reg}
              style={memHighlightStyle(highlight.memRead, highlight.memWrite, highlight.memFetch)}
            />
            <text
              x={MEM_BOX_X + 12}
              y={MEM_BOX_Y + MEM_BOX_H / 2 + 4}
              className={styles.regName}
            >
              MEM
            </text>
            <text
              x={MEM_BOX_X + 56}
              y={MEM_BOX_Y + MEM_BOX_H / 2 + 4}
              className={`${styles.memOp} ${highlight.memRead ? styles.memOpReadActive : ''}`}
            >
              rd
            </text>
            <text
              x={MEM_BOX_X + 78}
              y={MEM_BOX_Y + MEM_BOX_H / 2 + 4}
              className={`${styles.memOp} ${highlight.memWrite ? styles.memOpWriteActive : ''}`}
            >
              wr
            </text>
            <text
              x={MEM_BOX_X + 100}
              y={MEM_BOX_Y + MEM_BOX_H / 2 + 4}
              className={`${styles.memOp} ${highlight.memFetch ? styles.memOpFetchActive : ''}`}
            >
              fetch
            </text>
          </g>

          {/* Register taps + boxes */}
          {REGISTER_LAYOUT.map(({ name, y, cBusWritable }) => {
            const isWritten = highlight.cTargets.has(name);
            const isBSource =
              highlight.bSourceReg === name ||
              (name === 'MBR' &&
                (highlight.bSourceReg === 'MBR' || highlight.bSourceReg === 'MBRU'));
            const isAH = name === 'H' && highlight.aActive;
            const cy = y + REG_H / 2;

            return (
              <g key={name} className={styles.regGroup}>
                {cBusWritable && (
                  <line
                    x1={C_BUS_X}
                    y1={cy}
                    x2={REG_X}
                    y2={cy}
                    className={`${styles.tap} ${styles.cTap} ${isWritten ? styles.tapActive : ''}`}
                  />
                )}
                {name !== 'H' && (
                  <line
                    x1={REG_X + REG_W}
                    y1={cy}
                    x2={B_BUS_X}
                    y2={cy}
                    className={`${styles.tap} ${styles.bTap} ${isBSource ? styles.tapActive : ''}`}
                  />
                )}
                <rect
                  x={REG_X}
                  y={y}
                  width={REG_W}
                  height={REG_H}
                  rx={3}
                  className={`${styles.reg} ${isWritten ? styles.regWritten : ''} ${isBSource || isAH ? styles.regRead : ''}`}
                />
                <text x={REG_X + 12} y={cy + 4} className={styles.regName}>
                  {name}
                </text>
                <text x={REG_X + REG_W - 8} y={cy + 4} className={styles.regValue}>
                  {fmtVal(machine[name], name)}
                </text>
              </g>
            );
          })}

          {/* A-bus (H → ALU's A-input) */}
          <line
            x1={A_BUS_X}
            y1={H_BOTTOM_Y}
            x2={A_BUS_X}
            y2={ALU_Y}
            className={`${styles.bus} ${styles.aBus} ${highlight.aActive ? styles.busActive : ''}`}
          />
          <text x={A_BUS_X - 14} y={(H_BOTTOM_Y + ALU_Y) / 2 + 4} className={styles.busLabel}>
            A
          </text>

          {/* ALU */}
          <polygon
            points={`${ALU_X},${ALU_Y} ${ALU_X + ALU_W},${ALU_Y} ${ALU_X + ALU_W - 30},${ALU_BOTTOM_Y} ${ALU_X + 30},${ALU_BOTTOM_Y}`}
            className={`${styles.alu} ${highlight.aluActive ? styles.aluActive : ''}`}
          />
          <text x={ALU_X + ALU_W / 2} y={ALU_Y + 22} className={styles.aluLabel}>
            ALU
          </text>
          {highlight.aluText && (
            <text
              x={ALU_X + ALU_W / 2}
              y={ALU_Y + 42}
              className={styles.aluValueLabel}
            >
              {highlight.aluText}
            </text>
          )}
          {lastTrace && (
            <text x={ALU_X + ALU_W + 10} y={ALU_Y + 16} className={styles.flagsLabel}>
              N={lastTrace.aluFlags.N ? 1 : 0} Z={lastTrace.aluFlags.Z ? 1 : 0}
            </text>
          )}

          {/* ALU → Shifter */}
          <line
            x1={ALU_X + ALU_W / 2}
            y1={ALU_BOTTOM_Y}
            x2={ALU_X + ALU_W / 2}
            y2={SHIFTER_Y}
            className={`${styles.bus} ${highlight.aluActive ? styles.busActive : ''}`}
          />

          {/* Shifter */}
          <rect
            x={SHIFTER_X}
            y={SHIFTER_Y}
            width={SHIFTER_W}
            height={SHIFTER_H}
            rx={3}
            className={`${styles.shifter} ${highlight.shifterActive ? styles.shifterActive : ''}`}
          />
          <text x={SHIFTER_X + SHIFTER_W / 2} y={SHIFTER_Y + 16} className={styles.shifterLabel}>
            Shifter
          </text>
          <text
            x={SHIFTER_X + SHIFTER_W / 2}
            y={SHIFTER_Y + 32}
            className={styles.shifterValueLabel}
          >
            {highlight.shifterText || 'pass'}
          </text>
        </svg>
      </div>
    </div>
  );
}

// Highlight derivation --------------------------------------------------

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
