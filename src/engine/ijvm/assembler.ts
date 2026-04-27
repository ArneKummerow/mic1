/**
 * IJVM assembler.
 *
 * Single-pass scan + two-pass layout/resolve. Supported syntax:
 *
 *   ; lines are blank, comments, or `[label:] [MNEMONIC operands]`
 *   ; comments use //
 *
 *   start:
 *       BIPUSH 5
 *       BIPUSH 7
 *       IADD
 *       OUT
 *       GOTO end
 *       BIPUSH 99      // unreachable
 *   end:
 *       HALT
 *
 * Operands:
 *   - `BIPUSH n`      — signed 8-bit literal (-128..127)
 *   - `ILOAD i`       — unsigned 8-bit local-variable index (0..255)
 *   - `ISTORE i`      — same
 *   - `LDC_W i`       — unsigned 16-bit constant pool index
 *   - `IINC i, c`     — index + signed 8-bit constant
 *   - `IFEQ label`    — signed 16-bit PC-relative offset to label
 *   - `IFLT`, `IF_ICMPEQ`, `GOTO` — same
 *   - `INVOKEVIRTUAL i` — unsigned 16-bit method index
 *
 * Branches resolve to `targetAddress - opcodeAddress` as a signed 16-bit
 * offset (matches Tanenbaum's IJVM semantics).
 */

import { OPCODES_BY_MNEMONIC, instructionSize, type OpcodeInfo, type OperandKind } from './opcodes';

export interface AssemblyError {
  line: number;
  column: number;
  message: string;
}

export interface IJVMAssembleResult {
  bytes: Uint8Array;
  errors: AssemblyError[];
  /** Label → byte offset within `bytes`. */
  labels: Map<string, number>;
  /** 1-based source line → byte offset. */
  addressByLine: Map<number, number>;
  /** Byte offset → 1-based source line. */
  lineByAddress: Map<number, number>;
}

interface RawInstruction {
  line: number;
  column: number;
  label?: string;
  mnemonic: string;
  /** Tokens of the operands as they appeared in source. */
  operandTokens: OperandToken[];
  /** Byte address assigned in the layout pass. */
  address: number;
}

type OperandToken =
  | { kind: 'number'; value: number; line: number; column: number }
  | { kind: 'ident'; name: string; line: number; column: number };

export function assembleIJVM(source: string): IJVMAssembleResult {
  const errors: AssemblyError[] = [];
  const labels = new Map<string, number>();
  const addressByLine = new Map<number, number>();
  const lineByAddress = new Map<number, number>();
  const instructions: RawInstruction[] = [];
  /** Lines containing only a label (no mnemonic) — these bind the label to
   *  the address of the *next* instruction. */
  const pendingLabels: { name: string; line: number; column: number }[] = [];

  // ─── Pass 1: scan lines, build IR, lay out addresses ───────────────
  let address = 0;
  const lines = source.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const lineNum = i + 1;
    const raw = stripComment(lines[i]);
    if (raw.trim().length === 0) continue;

    const scan = scanLine(raw, lineNum);
    if (scan.errors.length > 0) {
      errors.push(...scan.errors);
      continue;
    }

    // Resolve any pending labels onto this line if it has a mnemonic;
    // otherwise defer.
    if (scan.label !== undefined) {
      pendingLabels.push({
        name: scan.label,
        line: lineNum,
        column: scan.labelColumn ?? 1,
      });
    }
    if (scan.mnemonic === undefined) continue;

    const info = OPCODES_BY_MNEMONIC.get(scan.mnemonic.toUpperCase());
    if (!info) {
      errors.push({
        line: lineNum,
        column: scan.mnemonicColumn ?? 1,
        message: `Unknown mnemonic '${scan.mnemonic}'`,
      });
      continue;
    }

    if (scan.operandTokens.length !== info.operandKinds.length) {
      errors.push({
        line: lineNum,
        column: scan.mnemonicColumn ?? 1,
        message: `${info.mnemonic} expects ${info.operandKinds.length} operand(s), got ${scan.operandTokens.length}`,
      });
    }

    // Bind any pending labels to this address.
    for (const p of pendingLabels) {
      if (labels.has(p.name)) {
        errors.push({
          line: p.line,
          column: p.column,
          message: `Duplicate label '${p.name}'`,
        });
      } else {
        labels.set(p.name, address);
      }
    }
    pendingLabels.length = 0;

    addressByLine.set(lineNum, address);
    lineByAddress.set(address, lineNum);

    instructions.push({
      line: lineNum,
      column: scan.mnemonicColumn ?? 1,
      ...(scan.label !== undefined && { label: scan.label }),
      mnemonic: info.mnemonic,
      operandTokens: scan.operandTokens,
      address,
    });
    address += instructionSize(info);
  }

  // Trailing pending labels point past the last instruction.
  for (const p of pendingLabels) {
    if (labels.has(p.name)) {
      errors.push({
        line: p.line,
        column: p.column,
        message: `Duplicate label '${p.name}'`,
      });
    } else {
      labels.set(p.name, address);
    }
  }

  // ─── Pass 2: encode operands, resolving labels for branches ────────
  const bytes = new Uint8Array(address);
  for (const inst of instructions) {
    const info = OPCODES_BY_MNEMONIC.get(inst.mnemonic)!;
    let pos = inst.address;
    bytes[pos++] = info.opcode;

    for (let opIdx = 0; opIdx < info.operandKinds.length; opIdx++) {
      const kind = info.operandKinds[opIdx];
      const tok = inst.operandTokens[opIdx];
      if (!tok) continue; // already errored in pass 1
      const enc = encodeOperand(kind, tok, inst.address, labels);
      if ('error' in enc) {
        errors.push(enc.error);
      } else {
        const len = sizeOfKind(kind);
        if (len === 1) {
          bytes[pos] = enc.value & 0xff;
        } else {
          bytes[pos] = (enc.value >> 8) & 0xff;
          bytes[pos + 1] = enc.value & 0xff;
        }
      }
      pos += sizeOfKind(kind);
    }
  }

  return { bytes, errors, labels, addressByLine, lineByAddress };
}

function sizeOfKind(kind: OperandKind): number {
  return kind === 'sbyte' || kind === 'ubyte' ? 1 : 2;
}

interface OperandValue {
  value: number;
}

function encodeOperand(
  kind: OperandKind,
  tok: OperandToken,
  thisAddress: number,
  labels: Map<string, number>,
): OperandValue | { error: AssemblyError } {
  if (kind === 'sbyte') {
    if (tok.kind !== 'number') {
      return errorAt(tok, `Expected signed-byte literal`);
    }
    if (tok.value < -128 || tok.value > 127) {
      return errorAt(tok, `Signed byte out of range: ${tok.value}`);
    }
    return { value: tok.value & 0xff };
  }
  if (kind === 'ubyte') {
    if (tok.kind !== 'number') {
      return errorAt(tok, `Expected unsigned-byte literal`);
    }
    if (tok.value < 0 || tok.value > 255) {
      return errorAt(tok, `Unsigned byte out of range: ${tok.value}`);
    }
    return { value: tok.value };
  }
  if (kind === 'uword') {
    if (tok.kind !== 'number') {
      return errorAt(tok, `Expected unsigned-word literal`);
    }
    if (tok.value < 0 || tok.value > 0xffff) {
      return errorAt(tok, `Unsigned word out of range: ${tok.value}`);
    }
    return { value: tok.value };
  }
  // 'branch'
  if (tok.kind === 'number') {
    if (tok.value < -32768 || tok.value > 32767) {
      return errorAt(tok, `Branch offset out of range: ${tok.value}`);
    }
    return { value: tok.value & 0xffff };
  }
  // ident → label
  const target = labels.get(tok.name);
  if (target === undefined) {
    return errorAt(tok, `Unknown label '${tok.name}'`);
  }
  const offset = target - thisAddress;
  if (offset < -32768 || offset > 32767) {
    return errorAt(tok, `Branch offset out of range: ${offset}`);
  }
  return { value: offset & 0xffff };
}

function errorAt(tok: { line: number; column: number }, message: string): { error: AssemblyError } {
  return { error: { line: tok.line, column: tok.column, message } };
}

// ─── Line scanning ───────────────────────────────────────────────────

interface ScanResult {
  label?: string;
  labelColumn?: number;
  mnemonic?: string;
  mnemonicColumn?: number;
  operandTokens: OperandToken[];
  errors: AssemblyError[];
}

function stripComment(line: string): string {
  const idx = line.indexOf('//');
  return idx === -1 ? line : line.slice(0, idx);
}

function scanLine(line: string, lineNum: number): ScanResult {
  const result: ScanResult = { operandTokens: [], errors: [] };
  let i = 0;
  const len = line.length;

  const skipWs = (): void => {
    while (i < len && (line[i] === ' ' || line[i] === '\t' || line[i] === '\r')) i++;
  };

  const isIdentStart = (c: string): boolean => /[A-Za-z_]/.test(c);
  const isIdentCont = (c: string): boolean => /[A-Za-z0-9_]/.test(c);

  skipWs();
  if (i >= len) return result;

  // Optional label — IDENT followed by ':'.
  const startIdx = i;
  if (isIdentStart(line[i])) {
    let j = i;
    while (j < len && isIdentCont(line[j])) j++;
    // Look ahead, optionally past whitespace, for ':'.
    let k = j;
    while (k < len && (line[k] === ' ' || line[k] === '\t')) k++;
    if (line[k] === ':') {
      result.label = line.slice(i, j);
      result.labelColumn = startIdx + 1;
      i = k + 1;
      skipWs();
    }
  }

  if (i >= len) return result;

  // Mnemonic.
  if (!isIdentStart(line[i])) {
    result.errors.push({
      line: lineNum,
      column: i + 1,
      message: `Expected mnemonic, got '${line[i]}'`,
    });
    return result;
  }
  const mnStart = i;
  while (i < len && isIdentCont(line[i])) i++;
  result.mnemonic = line.slice(mnStart, i);
  result.mnemonicColumn = mnStart + 1;
  skipWs();

  // Operands separated by ',' or whitespace.
  let first = true;
  while (i < len) {
    if (!first) {
      if (line[i] === ',') {
        i++;
        skipWs();
      }
    }
    first = false;
    if (i >= len) break;

    const opCol = i + 1;
    if (line[i] === '-' || /[0-9]/.test(line[i])) {
      const numStart = i;
      if (line[i] === '-') i++;
      if (line[i] === '0' && (line[i + 1] === 'x' || line[i + 1] === 'X')) {
        i += 2;
        while (i < len && /[0-9a-fA-F]/.test(line[i])) i++;
      } else {
        while (i < len && /[0-9]/.test(line[i])) i++;
      }
      const text = line.slice(numStart, i);
      const value = text.startsWith('-0x') || text.startsWith('-0X')
        ? -parseInt(text.slice(3), 16)
        : text.startsWith('0x') || text.startsWith('0X')
          ? parseInt(text.slice(2), 16)
          : parseInt(text, 10);
      if (Number.isNaN(value)) {
        result.errors.push({ line: lineNum, column: opCol, message: `Invalid number '${text}'` });
      } else {
        result.operandTokens.push({ kind: 'number', value, line: lineNum, column: opCol });
      }
    } else if (isIdentStart(line[i])) {
      const idStart = i;
      while (i < len && isIdentCont(line[i])) i++;
      result.operandTokens.push({
        kind: 'ident',
        name: line.slice(idStart, i),
        line: lineNum,
        column: opCol,
      });
    } else {
      result.errors.push({
        line: lineNum,
        column: opCol,
        message: `Unexpected character '${line[i]}' in operand`,
      });
      i++;
    }
    skipWs();
  }

  return result;
}

export type { OpcodeInfo };
