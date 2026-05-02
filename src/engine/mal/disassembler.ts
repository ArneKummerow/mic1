/**
 * MAL disassembler — turns a `Microinstruction` back into a MAL source line.
 *
 * Used by the round-trip tests: parse → encode → disassemble → re-encode and
 * assert byte-equivalence. The output is intentionally explicit-address
 * (`Lxxx = 0xNNN ...`) so the original control-store layout is preserved
 * across the round trip.
 *
 * Goto targets are emitted as raw hex addresses (`goto 0x123`) since the
 * disassembler does not have access to the original label names. The MAL
 * grammar accepts hex literals everywhere a label is accepted.
 */

import type { AluControl, BBusSource, Microinstruction } from '../types';

function aluKey(alu: AluControl): string {
  return [
    alu.F0 ? '1' : '0',
    alu.F1 ? '1' : '0',
    alu.ENA ? '1' : '0',
    alu.ENB ? '1' : '0',
    alu.INVA ? '1' : '0',
    alu.INC ? '1' : '0',
  ].join('');
}

/** Forms that don't use the B-bus (bBus = 'NONE'). */
const NO_BBUS_FORMS: Record<string, string> = {
  // F0 F1 ENA ENB INVA INC
  '110000': '0',
  '110001': '1',
  '110010': '-1',
  '111000': 'H',
  '111010': '~H',
  '111011': '-H',
  '111001': 'H + 1',
};

/** Forms that use the B-bus; `R` is replaced with the actual bBus reg name. */
const BBUS_FORMS: Record<string, string> = {
  '110100': 'R',
  '100100': '~R',
  '100101': '-R',
  '111100': 'H + R',
  '111101': 'H + R + 1',
  '110101': 'R + 1',
  '110110': 'R - 1',
  '111111': 'R - H',
  '001100': 'H AND R',
  '011100': 'H OR R',
};

function decodeAluExpr(alu: AluControl, bBus: BBusSource): string | null {
  const key = aluKey(alu);
  if (bBus === 'NONE') {
    return NO_BBUS_FORMS[key] ?? null;
  }
  const template = BBUS_FORMS[key];
  if (!template) return null;
  // Match `R` only as a standalone word — otherwise the `R` inside `OR`
  // would be substituted too.
  return template.replace(/\bR\b/g, bBus);
}

const SHIFTER_SUFFIX: Record<Microinstruction['shifter'], string> = {
  NONE: '',
  SLL8: ' << 8',
  SRA1: ' >> 1',
};

function hex9(n: number): string {
  return `0x${n.toString(16).padStart(3, '0')}`;
}

/**
 * Disassemble a single microinstruction. Returns the statements portion
 * (without label/address prefix). `address` is the address this instruction
 * lives at — used to detect sequential next-address.
 */
export function disassembleStatements(instr: Microinstruction, address: number): string {
  const parts: string[] = [];

  // Assignment
  if (instr.cBus.size > 0) {
    const targets = [...instr.cBus].sort();
    const expr = decodeAluExpr(instr.alu, instr.bBus);
    if (expr === null) {
      // Should not happen for instructions produced by the encoder.
      throw new Error(
        `disassembler: unrecognised ALU/bBus combination ${aluKey(instr.alu)} / ${instr.bBus}`,
      );
    }
    parts.push(`${targets.join(' = ')} = ${expr}${SHIFTER_SUFFIX[instr.shifter]}`);
  }

  // Memory ops
  if (instr.mem.read) parts.push('rd');
  if (instr.mem.write) parts.push('wr');
  if (instr.mem.fetch) parts.push('fetch');

  // Goto / if
  const { JMPC, JAMN, JAMZ } = instr.jam;
  if (JMPC) {
    // goto (MBR [OR addr])
    if (instr.nextAddress === 0) {
      parts.push('goto (MBR)');
    } else {
      parts.push(`goto (MBR OR ${hex9(instr.nextAddress)})`);
    }
  } else if (JAMN || JAMZ) {
    const flag = JAMN ? 'N' : 'Z';
    const fall = instr.nextAddress & 0xff;
    const taken = fall | 0x100;
    parts.push(`if (${flag}) goto ${hex9(taken)}; else goto ${hex9(fall)}`);
  } else if (instr.nextAddress !== ((address + 1) & 0x1ff)) {
    // Non-sequential unconditional goto.
    parts.push(`goto ${hex9(instr.nextAddress)}`);
  }

  return parts.join('; ');
}

/**
 * Disassemble an entire control store back into a MAL source string. Each
 * filled address gets its own line, prefixed with an explicit-address label
 * directive so re-assembly preserves the layout exactly.
 */
export function disassembleControlStore(
  controlStore: readonly (Microinstruction | undefined)[],
): string {
  const lines: string[] = [];
  for (let addr = 0; addr < controlStore.length; addr++) {
    const instr = controlStore[addr];
    if (!instr) continue;
    const stmts = disassembleStatements(instr, addr);
    const labelDirective = `L${addr.toString(16).padStart(3, '0')} = ${hex9(addr)}`;
    lines.push(stmts.length > 0 ? `${labelDirective}  ${stmts}` : labelDirective);
  }
  return lines.join('\n') + '\n';
}
