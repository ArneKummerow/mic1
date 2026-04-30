/**
 * Bit-level rendering of a MIC-1 microinstruction word — 36 control bits
 * laid out in Tanenbaum's textbook order:
 *
 *   NEXT_ADDR (9, hex) | JAM (3) | shifter (2) | ALU (6) | C-bus (9) |
 *   memory (3) | B-bus (4, by name)
 *
 * Used by both the Control Store table (when "bit view" is toggled on) and
 * by the Microinstruction Inspector panel.
 */
import type { BBusSource, Microinstruction, WritableRegister } from '../engine/types';
import styles from './BitView.module.css';

/**
 * Field configuration. Each entry produces one visual cell. Bit cells
 * (`kind: 'bit'`) extract a boolean from the instruction; the hex cell
 * shows `nextAddress` formatted, and the bbus cell shows the register name.
 */
export type FieldGroup =
  | 'next'
  | 'jam'
  | 'shifter'
  | 'alu'
  | 'cbus'
  | 'mem'
  | 'bbus';

interface FieldDef {
  /** Short header label. */
  label: string;
  /** Long-form description for tooltips. */
  title: string;
  /** Group, used for visual separators. */
  group: FieldGroup;
  /** Cell width in px (drives both header and body). */
  width: number;
  /** How to render the cell content. */
  kind: 'bit' | 'hex9' | 'bbusName';
  /** Bit getter — only meaningful for kind='bit'. */
  read?: (instr: Microinstruction) => boolean;
}

const cBusHas = (r: WritableRegister) => (instr: Microinstruction) => instr.cBus.has(r);

export const BIT_FIELDS: readonly FieldDef[] = [
  {
    label: 'NEXT',
    title: '9-bit NEXT_ADDRESS — base of the next-MPC computation (hex).',
    group: 'next',
    width: 44,
    kind: 'hex9',
  },

  // JAM
  { label: 'JMPC', title: 'JAM JMPC — OR MBR into NEXT_ADDR (opcode dispatch).', group: 'jam', width: 30, kind: 'bit', read: (i) => i.jam.JMPC },
  { label: 'JAMN', title: 'JAM JAMN — OR (1 << 8) when ALU N flag is set (negative result).', group: 'jam', width: 30, kind: 'bit', read: (i) => i.jam.JAMN },
  { label: 'JAMZ', title: 'JAM JAMZ — OR (1 << 8) when ALU Z flag is set (zero result).', group: 'jam', width: 30, kind: 'bit', read: (i) => i.jam.JAMZ },

  // Shifter
  { label: 'SLL8', title: 'Shifter — shift left by 8 (used to assemble high byte of operand).', group: 'shifter', width: 30, kind: 'bit', read: (i) => i.shifter === 'SLL8' },
  { label: 'SRA1', title: 'Shifter — arithmetic shift right by 1.', group: 'shifter', width: 30, kind: 'bit', read: (i) => i.shifter === 'SRA1' },

  // ALU
  { label: 'F0', title: 'ALU F0 — function select bit 0.', group: 'alu', width: 24, kind: 'bit', read: (i) => i.alu.F0 },
  { label: 'F1', title: 'ALU F1 — function select bit 1.', group: 'alu', width: 24, kind: 'bit', read: (i) => i.alu.F1 },
  { label: 'ENA', title: 'ALU ENA — enable A input (H register).', group: 'alu', width: 28, kind: 'bit', read: (i) => i.alu.ENA },
  { label: 'ENB', title: 'ALU ENB — enable B input (B-bus value).', group: 'alu', width: 28, kind: 'bit', read: (i) => i.alu.ENB },
  { label: 'INVA', title: 'ALU INVA — invert A input before the ALU operation.', group: 'alu', width: 30, kind: 'bit', read: (i) => i.alu.INVA },
  { label: 'INC', title: 'ALU INC — add 1 to the ALU result (carry-in).', group: 'alu', width: 26, kind: 'bit', read: (i) => i.alu.INC },

  // C-bus enables (MAR ... H, in textbook MSB→LSB order).
  { label: 'H', title: 'C-bus enable — write shifter output to H.', group: 'cbus', width: 22, kind: 'bit', read: cBusHas('H') },
  { label: 'OPC', title: 'C-bus enable — write to OPC (old PC / scratch).', group: 'cbus', width: 28, kind: 'bit', read: cBusHas('OPC') },
  { label: 'TOS', title: 'C-bus enable — write to TOS (top-of-stack cache).', group: 'cbus', width: 28, kind: 'bit', read: cBusHas('TOS') },
  { label: 'CPP', title: 'C-bus enable — write to CPP (constant-pool pointer).', group: 'cbus', width: 28, kind: 'bit', read: cBusHas('CPP') },
  { label: 'LV', title: 'C-bus enable — write to LV (local-variable frame base).', group: 'cbus', width: 24, kind: 'bit', read: cBusHas('LV') },
  { label: 'SP', title: 'C-bus enable — write to SP (stack pointer).', group: 'cbus', width: 22, kind: 'bit', read: cBusHas('SP') },
  { label: 'PC', title: 'C-bus enable — write to PC (program counter).', group: 'cbus', width: 22, kind: 'bit', read: cBusHas('PC') },
  { label: 'MDR', title: 'C-bus enable — write to MDR (memory data register).', group: 'cbus', width: 28, kind: 'bit', read: cBusHas('MDR') },
  { label: 'MAR', title: 'C-bus enable — write to MAR (memory address register).', group: 'cbus', width: 28, kind: 'bit', read: cBusHas('MAR') },

  // Memory ops
  { label: 'WR', title: 'Memory — write MDR to memory[MAR].', group: 'mem', width: 24, kind: 'bit', read: (i) => i.mem.write },
  { label: 'RD', title: 'Memory — read memory[MAR] into MDR.', group: 'mem', width: 24, kind: 'bit', read: (i) => i.mem.read },
  { label: 'FE', title: 'Memory — fetch byte at PC into MBR.', group: 'mem', width: 24, kind: 'bit', read: (i) => i.mem.fetch },

  // B-bus selector
  { label: 'B', title: 'B-bus selector — register driving the ALU B input.', group: 'bbus', width: 50, kind: 'bbusName' },
];

const GROUP_GAP = 6;

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

function fmtNext9(addr: number): string {
  return '0x' + (addr & 0x1ff).toString(16).toUpperCase().padStart(3, '0');
}

function fmtBBus(b: BBusSource): string {
  return b;
}

/**
 * Header row showing field labels (one per cell) with subtle
 * group-separator gaps. Aligned with the body row.
 */
export function BitFieldHeader(): JSX.Element {
  let prevGroup: FieldGroup | null = null;
  return (
    <div className={styles.row}>
      {BIT_FIELDS.map((f, i) => {
        const sep = prevGroup !== null && prevGroup !== f.group ? styles.groupSep : '';
        prevGroup = f.group;
        return (
          <span
            key={i}
            className={`${styles.cell} ${styles.headerCell} ${sep} mono`}
            style={{ width: f.width }}
            title={f.title}
          >
            {f.label}
          </span>
        );
      })}
    </div>
  );
}

/**
 * Body row showing the bit values of an instruction, or all-empty placeholders
 * when `instr` is undefined.
 */
export function BitFieldRow({ instr }: { instr: Microinstruction | undefined }): JSX.Element {
  let prevGroup: FieldGroup | null = null;
  return (
    <>
      {BIT_FIELDS.map((f, i) => {
        const sep = prevGroup !== null && prevGroup !== f.group ? styles.groupSep : '';
        prevGroup = f.group;

        let content: React.ReactNode = '';
        let on = false;

        if (instr === undefined) {
          content = '';
        } else if (f.kind === 'hex9') {
          content = fmtNext9(instr.nextAddress);
        } else if (f.kind === 'bbusName') {
          content = fmtBBus(instr.bBus);
        } else if (f.kind === 'bit') {
          on = !!f.read?.(instr);
          content = on ? '1' : '·';
        }

        const groupClass =
          f.kind === 'bit'
            ? on
              ? `${styles.bitOn} ${styles[`grp_${f.group}`] ?? ''}`
              : styles.bitOff
            : styles.textCell;

        return (
          <span
            key={i}
            className={`${styles.cell} ${groupClass} ${sep} mono`}
            style={{ width: f.width }}
            title={f.title}
          >
            {content}
          </span>
        );
      })}
    </>
  );
}
