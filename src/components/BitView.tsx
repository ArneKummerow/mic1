/**
 * Bit-level rendering of a MIC-1 microinstruction word — 36 control bits
 * laid out in Tanenbaum's textbook order:
 *
 *   NEXT_ADDR (9, hex) | JAM (3) | shifter (2) | ALU (6) | C-bus (9) |
 *   memory (3) | B-bus (4, by name)
 *
 * Each cell carries its field name as a vertical (top-to-bottom) label,
 * with the cell tinted by its functional group's color (matching the
 * data-path visualization). The tint stays visible at low saturation
 * even when the bit is cleared, so the row reads as a coloured field
 * map rather than a sparse on/off matrix.
 *
 * Used by both the Control Store table (when "bit view" is toggled on) and
 * by the Microinstruction Inspector panel.
 */
import type { BBusSource, Microinstruction, WritableRegister } from '../engine/types';
import { Tooltip } from './Tooltip';
import styles from './BitView.module.css';

export type FieldGroup =
  | 'next'
  | 'jam'
  | 'shifter'
  | 'alu'
  | 'cbus'
  | 'mem'
  | 'bbus';

interface FieldDef {
  /** Short header label, written vertically in each cell. Empty for value
   *  cells (NEXT_ADDR / B-bus) where the value itself replaces the label. */
  label: string;
  /** Long-form description for tooltips. */
  title: string;
  group: FieldGroup;
  width: number;
  /** How to render the cell content. */
  kind: 'bit' | 'hex9' | 'bbusName';
  /** Bit getter — only meaningful for kind='bit'. */
  read?: (instr: Microinstruction) => boolean;
  /** CSS color override for this field. Defaults to the group's colour. */
  color?: string;
}

const cBusHas = (r: WritableRegister) => (instr: Microinstruction) => instr.cBus.has(r);

// Group colors mirror the data-path visualization (see index.css palette):
//   ALU -> --alu, A-bus / shifter -> --bus-a, B-bus -> --bus-b,
//   C-bus -> --bus-c, mem ops -> --mem-{read,write,fetch}.
// JAM gets --accent-2 (the only remaining unused warm tone); NEXT_ADDR
// stays a neutral grey since it's a value cell, not a switch.
const COLOR_NEXT = 'var(--fg-3)';
const COLOR_JAM = 'var(--accent-2)';
const COLOR_SHIFTER = 'var(--bus-a)';
const COLOR_ALU = 'var(--alu)';
const COLOR_CBUS = 'var(--bus-c)';
const COLOR_BBUS = 'var(--bus-b)';

// Cell widths.
const BIT_CELL_W = 14;
const NEXT_CELL_W = 44;
const BBUS_CELL_W = 22;

const GROUP_GAP = 3;

export const BIT_FIELDS: readonly FieldDef[] = [
  {
    label: '',
    title: '9-bit NEXT_ADDRESS — base of the next-MPC computation (hex).',
    group: 'next',
    width: NEXT_CELL_W,
    kind: 'hex9',
  },

  // JAM
  { label: 'JMPC', title: 'JAM JMPC — OR MBR into NEXT_ADDR (opcode dispatch).', group: 'jam', width: BIT_CELL_W, kind: 'bit', read: (i) => i.jam.JMPC },
  { label: 'JAMN', title: 'JAM JAMN — OR (1 << 8) when ALU N flag is set (negative result).', group: 'jam', width: BIT_CELL_W, kind: 'bit', read: (i) => i.jam.JAMN },
  { label: 'JAMZ', title: 'JAM JAMZ — OR (1 << 8) when ALU Z flag is set (zero result).', group: 'jam', width: BIT_CELL_W, kind: 'bit', read: (i) => i.jam.JAMZ },

  // Shifter
  { label: 'SLL8', title: 'Shifter — shift left by 8 (used to assemble high byte of operand).', group: 'shifter', width: BIT_CELL_W, kind: 'bit', read: (i) => i.shifter === 'SLL8' },
  { label: 'SRA1', title: 'Shifter — arithmetic shift right by 1.', group: 'shifter', width: BIT_CELL_W, kind: 'bit', read: (i) => i.shifter === 'SRA1' },

  // ALU
  { label: 'F0', title: 'ALU F0 — function select bit 0.', group: 'alu', width: BIT_CELL_W, kind: 'bit', read: (i) => i.alu.F0 },
  { label: 'F1', title: 'ALU F1 — function select bit 1.', group: 'alu', width: BIT_CELL_W, kind: 'bit', read: (i) => i.alu.F1 },
  { label: 'ENA', title: 'ALU ENA — enable A input (H register).', group: 'alu', width: BIT_CELL_W, kind: 'bit', read: (i) => i.alu.ENA },
  { label: 'ENB', title: 'ALU ENB — enable B input (B-bus value).', group: 'alu', width: BIT_CELL_W, kind: 'bit', read: (i) => i.alu.ENB },
  { label: 'INVA', title: 'ALU INVA — invert A input before the ALU operation.', group: 'alu', width: BIT_CELL_W, kind: 'bit', read: (i) => i.alu.INVA },
  { label: 'INC', title: 'ALU INC — add 1 to the ALU result (carry-in).', group: 'alu', width: BIT_CELL_W, kind: 'bit', read: (i) => i.alu.INC },

  // C-bus enables (textbook MSB→LSB order: H ... MAR).
  { label: 'H', title: 'C-bus enable — write shifter output to H.', group: 'cbus', width: BIT_CELL_W, kind: 'bit', read: cBusHas('H') },
  { label: 'OPC', title: 'C-bus enable — write to OPC (old PC / scratch).', group: 'cbus', width: BIT_CELL_W, kind: 'bit', read: cBusHas('OPC') },
  { label: 'TOS', title: 'C-bus enable — write to TOS (top-of-stack cache).', group: 'cbus', width: BIT_CELL_W, kind: 'bit', read: cBusHas('TOS') },
  { label: 'CPP', title: 'C-bus enable — write to CPP (constant-pool pointer).', group: 'cbus', width: BIT_CELL_W, kind: 'bit', read: cBusHas('CPP') },
  { label: 'LV', title: 'C-bus enable — write to LV (local-variable frame base).', group: 'cbus', width: BIT_CELL_W, kind: 'bit', read: cBusHas('LV') },
  { label: 'SP', title: 'C-bus enable — write to SP (stack pointer).', group: 'cbus', width: BIT_CELL_W, kind: 'bit', read: cBusHas('SP') },
  { label: 'PC', title: 'C-bus enable — write to PC (program counter).', group: 'cbus', width: BIT_CELL_W, kind: 'bit', read: cBusHas('PC') },
  { label: 'MDR', title: 'C-bus enable — write to MDR (memory data register).', group: 'cbus', width: BIT_CELL_W, kind: 'bit', read: cBusHas('MDR') },
  { label: 'MAR', title: 'C-bus enable — write to MAR (memory address register).', group: 'cbus', width: BIT_CELL_W, kind: 'bit', read: cBusHas('MAR') },

  // Memory ops — each gets its own data-path color.
  { label: 'WR', title: 'Memory — write MDR to memory[MAR].', group: 'mem', width: BIT_CELL_W, kind: 'bit', read: (i) => i.mem.write, color: 'var(--mem-write)' },
  { label: 'RD', title: 'Memory — read memory[MAR] into MDR.', group: 'mem', width: BIT_CELL_W, kind: 'bit', read: (i) => i.mem.read, color: 'var(--mem-read)' },
  { label: 'FE', title: 'Memory — fetch byte at PC into MBR.', group: 'mem', width: BIT_CELL_W, kind: 'bit', read: (i) => i.mem.fetch, color: 'var(--mem-fetch)' },

  // B-bus selector — register name rendered vertically in the cell.
  {
    label: '',
    title: 'B-bus selector — register driving the ALU B input.',
    group: 'bbus',
    width: BBUS_CELL_W,
    kind: 'bbusName',
  },
];

const GROUP_COLOR: Record<FieldGroup, string> = {
  next: COLOR_NEXT,
  jam: COLOR_JAM,
  shifter: COLOR_SHIFTER,
  alu: COLOR_ALU,
  cbus: COLOR_CBUS,
  mem: 'var(--mem-fetch)', // unused — every mem field overrides its color
  bbus: COLOR_BBUS,
};

function colorFor(f: FieldDef): string {
  return f.color ?? GROUP_COLOR[f.group];
}

/** Total width of the field strip, including inter-group gaps. */
export const BIT_FIELDS_WIDTH = (() => {
  let w = 0;
  let prevGroup: FieldGroup | null = null;
  for (const f of BIT_FIELDS) {
    if (prevGroup !== null && prevGroup !== f.group) w += GROUP_GAP;
    w += f.width;
    prevGroup = f.group;
  }
  return w;
})();

/**
 * Longest vertical inscription across both bit cells (field labels like
 * `JMPC`, `INVA`) and B-bus cells (register names like `MBRU`). Drives
 * the row height — each character takes one `--fs-xs`-tall line.
 */
const MAX_VLABEL_CHARS = (() => {
  let max = 0;
  for (const f of BIT_FIELDS) max = Math.max(max, f.label.length);
  // B-bus register names: 'MBRU' is the longest (4 chars).
  return Math.max(max, 4);
})();

const ROW_HEIGHT_PADDING = 4;
const ROW_HEIGHT_FALLBACK_FS = 11;

/**
 * Recommended row height for a bit-view row. Reads `--fs-xs` at call
 * time so the row scales with the type scale; tall enough for the
 * longest vertical inscription plus a small padding.
 */
export function bitRowHeight(): number {
  let charPx = ROW_HEIGHT_FALLBACK_FS;
  if (typeof window !== 'undefined') {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--fs-xs')
      .trim();
    const n = parseFloat(raw);
    if (Number.isFinite(n)) charPx = n;
  }
  return Math.ceil(charPx * MAX_VLABEL_CHARS + ROW_HEIGHT_PADDING);
}

function fmtNext9(addr: number): string {
  return '0x' + (addr & 0x1ff).toString(16).toUpperCase().padStart(3, '0');
}

function fmtBBus(b: BBusSource): string {
  return b;
}

/**
 * Body row showing the bit values of an instruction, or all-empty placeholders
 * when `instr` is undefined. Each cell carries its field label as a vertical
 * top-to-bottom inscription; bit cells are highlighted (saturated tint) when
 * set and faintly tinted when cleared.
 */
export function BitFieldRow({ instr }: { instr: Microinstruction | undefined }): JSX.Element {
  let prevGroup: FieldGroup | null = null;
  return (
    <>
      {BIT_FIELDS.map((f, i) => {
        const sep = prevGroup !== null && prevGroup !== f.group ? styles.groupSep : '';
        prevGroup = f.group;
        const cellStyle: React.CSSProperties = {
          width: f.width,
          ['--bit-color' as string]: colorFor(f),
        };

        if (f.kind === 'bit') {
          const on = instr !== undefined && !!f.read?.(instr);
          return (
            <Tooltip key={i} text={f.title}>
              <span
                className={`${styles.cell} ${styles.bitCell} ${on ? styles.bitOn : styles.bitOff} ${sep}`}
                style={cellStyle}
              >
                <VerticalLabel label={f.label} />
              </span>
            </Tooltip>
          );
        }

        // Value cell. NEXT shows the hex address horizontally; B-bus shows
        // the register name as a vertical inscription (matching bit cells).
        if (f.kind === 'hex9') {
          const value = instr === undefined ? '' : fmtNext9(instr.nextAddress);
          return (
            <Tooltip key={i} text={f.title}>
              <span
                className={`${styles.cell} ${styles.valueCell} ${styles.nextCell} ${sep}`}
                style={cellStyle}
              >
                <span className={`mono ${styles.nextValue}`}>{value}</span>
              </span>
            </Tooltip>
          );
        }

        // bbusName
        const reg = instr === undefined ? '' : fmtBBus(instr.bBus);
        const isActive = instr !== undefined && instr.bBus !== 'NONE';
        return (
          <Tooltip key={i} text={f.title}>
            <span
              className={`${styles.cell} ${styles.bbusCell} ${isActive ? styles.bitOn : styles.bitOff} ${sep}`}
              style={cellStyle}
            >
              <VerticalLabel label={reg} />
            </span>
          </Tooltip>
        );
      })}
    </>
  );
}

/**
 * Stack of upright characters with an explicit per-letter line box. Using
 * one span per character (rather than CSS `writing-mode`) gives reliable,
 * tight inter-letter spacing — the font's intrinsic em-box leading is
 * collapsed by the fixed-height row child.
 */
function VerticalLabel({ label }: { label: string }): JSX.Element {
  return (
    <span className={`${styles.vlabel} mono`}>
      {label.split('').map((c, idx) => (
        <span key={idx} className={styles.vchar}>
          {c}
        </span>
      ))}
    </span>
  );
}
