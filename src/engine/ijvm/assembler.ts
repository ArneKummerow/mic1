/**
 * IJVM assembler.
 *
 * Two-pass: pass 1 scans the source, lays out bytes/methods/constants and
 * binds labels; pass 2 encodes operands and resolves symbolic references.
 *
 * Lines are blank, comments (`//`), labels (`name:`), instructions, or
 * directives:
 *
 *   .constant N <value>          ; 32-bit constant pool entry, named N
 *   .const    N <value>          ;   (alias)
 *   .method foo(p1, p2, ...)     ; start a method body. Lays out a 4-byte
 *     .args 3                    ;   prologue (argsCount, localsCount), and
 *     .var v1                    ;   binds `foo` as a constant pool entry
 *     ...                        ;   whose value is the prologue's byte
 *   .end-method                  ;   address.
 *
 * Local-variable layout for a `.method foo(p1, p2)` with `.var v1; .var v2`:
 *
 *   LV[0]  OBJREF (the implicit `this` slot)
 *   LV[1]  p1
 *   LV[2]  p2
 *   LV[3]  v1
 *   LV[4]  v2
 *
 * `argsCount` in the prologue is the number of stack slots consumed
 * (1 OBJREF + named args). `localsCount` is the additional `.var`s.
 *
 * Operand resolution:
 *   - ILOAD / ISTORE / IINC `name`     → local index (named arg or `.var`).
 *   - LDC_W / INVOKEVIRTUAL `name`     → constant pool index.
 *   - GOTO / IFEQ / IFLT / IF_ICMPEQ `name` → branch label (PC-relative).
 *   - Numeric literals always work as before.
 */

import { OPCODES_BY_MNEMONIC, instructionSize, type OpcodeInfo, type OperandKind } from './opcodes';

export interface AssemblyError {
  line: number;
  column: number;
  message: string;
}

export interface MethodInfo {
  name: string;
  /** Byte address of the 4-byte prologue within the method area. */
  prologueAddress: number;
  /** Stack slots consumed (1 for OBJREF + named args). */
  argsCount: number;
  /** Additional locals beyond args. */
  localsCount: number;
  /** Named args in declaration order. `args[i]` lives at LV[1 + i]. */
  args: readonly string[];
  /** Locals in declaration order. `vars[i]` lives at LV[1 + args.length + i]. */
  vars: readonly string[];
}

export interface ConstantPoolEntry {
  name: string;
  /** 32-bit constant value (signed int32 range). */
  value: number;
  /** Constant pool index. */
  index: number;
  /** True if this entry was created by `.method` (value is a method address). */
  isMethod: boolean;
}

export interface IJVMAssembleResult {
  /** Method-area bytes (instruction bytes + method prologues). */
  bytes: Uint8Array;
  errors: AssemblyError[];
  /** Branch label → byte offset within `bytes`. */
  labels: Map<string, number>;
  /** 1-based source line → byte offset of the first byte emitted on that line. */
  addressByLine: Map<number, number>;
  /** Byte offset → 1-based source line. */
  lineByAddress: Map<number, number>;
  /** Constant pool — 32-bit values, in declaration order. */
  constants: Int32Array;
  /** Constant-pool metadata, in declaration order. */
  constantEntries: readonly ConstantPoolEntry[];
  /** Methods declared with `.method`, keyed by name. */
  methods: Map<string, MethodInfo>;
}

interface RawInstruction {
  line: number;
  column: number;
  mnemonic: string;
  operandTokens: OperandToken[];
  /** Method context (if inside a `.method` block). Used for resolving named locals. */
  method: MutableMethod | null;
  /** Byte address of this instruction's first byte. */
  address: number;
  /**
   * True if this instruction is folded under a preceding `WIDE` byte. Only
   * meaningful for `ILOAD`/`ISTORE`/`IINC`: their local-variable index is
   * encoded as a 16-bit big-endian word instead of an 8-bit byte.
   */
  wide: boolean;
}

type OperandToken =
  | { kind: 'number'; value: number; line: number; column: number }
  | { kind: 'ident'; name: string; line: number; column: number };

/** Mutable bookkeeping while scanning a `.method` block. */
interface MutableMethod {
  name: string;
  prologueAddress: number;
  args: string[];
  vars: string[];
  /** Set if `.args N` was specified explicitly. */
  declaredArgsCount?: number;
  /** Source position of `.method`, used for error reporting. */
  line: number;
  column: number;
}

export function assembleIJVM(source: string): IJVMAssembleResult {
  const errors: AssemblyError[] = [];
  const labels = new Map<string, number>();
  const addressByLine = new Map<number, number>();
  const lineByAddress = new Map<number, number>();
  const instructions: RawInstruction[] = [];
  const pendingLabels: { name: string; line: number; column: number }[] = [];

  // Constant pool: built up as `.constant`/`.const`/`.method` declarations are seen.
  const constantEntries: ConstantPoolEntry[] = [];
  const constantsByName = new Map<string, ConstantPoolEntry>();

  // Methods seen so far. The currently open one (if any) tracks state across lines.
  const methods = new Map<string, MutableMethod>();
  let currentMethod: MutableMethod | null = null;

  /**
   * Set true when the most-recently-laid-out instruction was `WIDE` (0xC4).
   * The next ILOAD/ISTORE/IINC that follows is folded into a wide-encoded
   * instruction (16-bit local-variable index).
   */
  let widePending = false;
  let widePendingFrom: { line: number; column: number } | null = null;

  const registerConstant = (
    name: string,
    value: number,
    isMethod: boolean,
    loc: { line: number; column: number },
  ): ConstantPoolEntry | undefined => {
    if (constantsByName.has(name)) {
      errors.push({
        line: loc.line,
        column: loc.column,
        message: `Duplicate constant '${name}'`,
      });
      return undefined;
    }
    const entry: ConstantPoolEntry = {
      name,
      value: value | 0,
      index: constantEntries.length,
      isMethod,
    };
    constantEntries.push(entry);
    constantsByName.set(name, entry);
    return entry;
  };

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

    if (scan.label !== undefined) {
      pendingLabels.push({
        name: scan.label,
        line: lineNum,
        column: scan.labelColumn ?? 1,
      });
    }

    if (scan.directive !== undefined) {
      const d = scan.directive;
      switch (d.kind) {
        case 'method': {
          if (currentMethod !== null) {
            errors.push({
              line: d.line,
              column: d.column,
              message: `Nested .method (previous '${currentMethod.name}' not closed with .end-method)`,
            });
            break;
          }
          if (methods.has(d.name)) {
            errors.push({
              line: d.line,
              column: d.column,
              message: `Duplicate method '${d.name}'`,
            });
            break;
          }
          // Methods auto-register a constant-pool entry pointing at the
          // prologue's byte address.
          registerConstant(d.name, address, true, d);
          // Bind any pending labels to the prologue's address.
          flushPendingLabels(pendingLabels, labels, address, errors);
          addressByLine.set(lineNum, address);
          if (!lineByAddress.has(address)) lineByAddress.set(address, lineNum);
          const m: MutableMethod = {
            name: d.name,
            prologueAddress: address,
            args: d.args.slice(),
            vars: [],
            line: d.line,
            column: d.column,
          };
          methods.set(d.name, m);
          currentMethod = m;
          address += 4; // reserve 4-byte prologue (filled in pass 2)
          break;
        }
        case 'end-method': {
          if (currentMethod === null) {
            errors.push({
              line: d.line,
              column: d.column,
              message: `.end-method outside of .method`,
            });
          } else {
            // Validate `.args` if it was declared.
            const expectedArgs = 1 + currentMethod.args.length;
            if (
              currentMethod.declaredArgsCount !== undefined &&
              currentMethod.declaredArgsCount !== expectedArgs
            ) {
              errors.push({
                line: d.line,
                column: d.column,
                message: `.args ${currentMethod.declaredArgsCount} disagrees with method header (${expectedArgs} including OBJREF)`,
              });
            }
            currentMethod = null;
          }
          break;
        }
        case 'var': {
          if (currentMethod === null) {
            errors.push({
              line: d.line,
              column: d.column,
              message: `.var outside of .method`,
            });
            break;
          }
          if (
            currentMethod.args.includes(d.name) ||
            currentMethod.vars.includes(d.name)
          ) {
            errors.push({
              line: d.line,
              column: d.column,
              message: `Duplicate local '${d.name}' in method '${currentMethod.name}'`,
            });
          } else {
            currentMethod.vars.push(d.name);
            // Indices > 0xFF are fine — uses must be `WIDE`-prefixed. Per-use
            // validation lives in encodeOperand.
          }
          break;
        }
        case 'args': {
          if (currentMethod === null) {
            errors.push({
              line: d.line,
              column: d.column,
              message: `.args outside of .method`,
            });
            break;
          }
          if (currentMethod.declaredArgsCount !== undefined) {
            errors.push({
              line: d.line,
              column: d.column,
              message: `.args already declared for method '${currentMethod.name}'`,
            });
            break;
          }
          if (d.count < 1 || d.count > 0xffff) {
            errors.push({
              line: d.line,
              column: d.column,
              message: `.args count out of range: ${d.count}`,
            });
          }
          currentMethod.declaredArgsCount = d.count;
          break;
        }
        case 'constant': {
          if (d.value < -0x80000000 || d.value > 0xffffffff) {
            errors.push({
              line: d.line,
              column: d.column,
              message: `Constant value out of 32-bit range: ${d.value}`,
            });
          }
          registerConstant(d.name, d.value | 0, false, d);
          break;
        }
      }
      continue;
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

    flushPendingLabels(pendingLabels, labels, address, errors);

    addressByLine.set(lineNum, address);
    if (!lineByAddress.has(address)) lineByAddress.set(address, lineNum);

    let wide = false;
    if (widePending) {
      if (info.mnemonic === 'ILOAD' || info.mnemonic === 'ISTORE' || info.mnemonic === 'IINC') {
        wide = true;
      } else {
        errors.push({
          line: widePendingFrom!.line,
          column: widePendingFrom!.column,
          message: `WIDE must be followed by ILOAD, ISTORE, or IINC (got ${info.mnemonic})`,
        });
      }
      widePending = false;
      widePendingFrom = null;
    }

    instructions.push({
      line: lineNum,
      column: scan.mnemonicColumn ?? 1,
      mnemonic: info.mnemonic,
      operandTokens: scan.operandTokens,
      method: currentMethod,
      address,
      wide,
    });
    address += wide ? wideInstructionSize(info) : instructionSize(info);

    if (info.mnemonic === 'WIDE') {
      widePending = true;
      widePendingFrom = { line: lineNum, column: scan.mnemonicColumn ?? 1 };
    }
  }

  // Trailing pending labels point past the last instruction.
  flushPendingLabels(pendingLabels, labels, address, errors);

  if (widePending && widePendingFrom !== null) {
    errors.push({
      line: widePendingFrom.line,
      column: widePendingFrom.column,
      message: `WIDE not followed by ILOAD, ISTORE, or IINC`,
    });
  }

  if (currentMethod !== null) {
    errors.push({
      line: currentMethod.line,
      column: currentMethod.column,
      message: `Method '${currentMethod.name}' missing .end-method`,
    });
  }

  // ─── Pass 2: encode prologues, instructions, resolve operands ─────
  const bytes = new Uint8Array(address);

  // Method prologues.
  const finalMethods = new Map<string, MethodInfo>();
  for (const m of methods.values()) {
    const argsCount =
      m.declaredArgsCount !== undefined ? m.declaredArgsCount : 1 + m.args.length;
    const localsCount = m.vars.length;
    bytes[m.prologueAddress + 0] = (argsCount >> 8) & 0xff;
    bytes[m.prologueAddress + 1] = argsCount & 0xff;
    bytes[m.prologueAddress + 2] = (localsCount >> 8) & 0xff;
    bytes[m.prologueAddress + 3] = localsCount & 0xff;
    finalMethods.set(m.name, {
      name: m.name,
      prologueAddress: m.prologueAddress,
      argsCount,
      localsCount,
      args: m.args,
      vars: m.vars,
    });
  }

  // Build constant pool typed array.
  const constants = new Int32Array(constantEntries.length);
  for (const e of constantEntries) {
    constants[e.index] = e.value | 0;
  }

  // Encode instruction operands.
  for (const inst of instructions) {
    const info = OPCODES_BY_MNEMONIC.get(inst.mnemonic)!;
    let pos = inst.address;
    bytes[pos++] = info.opcode;

    for (let opIdx = 0; opIdx < info.operandKinds.length; opIdx++) {
      const kind = info.operandKinds[opIdx];
      const tok = inst.operandTokens[opIdx];
      if (!tok) continue; // already errored in pass 1
      const enc = encodeOperand(
        info,
        opIdx,
        kind,
        tok,
        inst,
        labels,
        constantsByName,
      );
      // Under WIDE, the first ubyte operand widens to 2 bytes (big-endian).
      const widenThis = inst.wide && opIdx === 0 && kind === 'ubyte';
      const len = widenThis ? 2 : sizeOfKind(kind);
      if (!('error' in enc)) {
        if (len === 1) {
          bytes[pos] = enc.value & 0xff;
        } else {
          bytes[pos] = (enc.value >> 8) & 0xff;
          bytes[pos + 1] = enc.value & 0xff;
        }
      } else {
        errors.push(enc.error);
      }
      pos += len;
    }
  }

  return {
    bytes,
    errors,
    labels,
    addressByLine,
    lineByAddress,
    constants,
    constantEntries,
    methods: finalMethods,
  };
}

function flushPendingLabels(
  pending: { name: string; line: number; column: number }[],
  labels: Map<string, number>,
  address: number,
  errors: AssemblyError[],
): void {
  for (const p of pending) {
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
  pending.length = 0;
}

function sizeOfKind(kind: OperandKind): number {
  return kind === 'sbyte' || kind === 'ubyte' ? 1 : 2;
}

/**
 * Size of an ILOAD/ISTORE/IINC under a `WIDE` prefix: the leading `ubyte`
 * index becomes a 2-byte word; other operand kinds keep their normal size.
 */
function wideInstructionSize(info: OpcodeInfo): number {
  let size = 1; // opcode byte
  for (let i = 0; i < info.operandKinds.length; i++) {
    const k = info.operandKinds[i];
    // First operand is the local-variable index (originally `ubyte`); under
    // WIDE it widens to 2 bytes. Subsequent operands (e.g. IINC's sbyte
    // const) keep their normal size.
    if (i === 0 && k === 'ubyte') size += 2;
    else size += sizeOfKind(k);
  }
  return size;
}

interface OperandValue {
  value: number;
}

function encodeOperand(
  info: OpcodeInfo,
  opIdx: number,
  kind: OperandKind,
  tok: OperandToken,
  inst: RawInstruction,
  labels: Map<string, number>,
  constantsByName: Map<string, ConstantPoolEntry>,
): OperandValue | { error: AssemblyError } {
  // Resolve identifiers based on the opcode + operand position.
  if (tok.kind === 'ident') {
    if (kind === 'ubyte' && isLocalRefMnemonic(info.mnemonic) && opIdx === 0) {
      const idx = lookupLocal(inst.method, tok.name);
      if (idx === undefined) {
        return errorAt(
          tok,
          inst.method
            ? `Unknown local '${tok.name}' in method '${inst.method.name}'`
            : `Unknown local '${tok.name}' (no .method context)`,
        );
      }
      const ceiling = inst.wide ? 0xffff : 0xff;
      if (idx > ceiling) {
        return errorAt(
          tok,
          inst.wide
            ? `Local index ${idx} for '${tok.name}' exceeds 0xFFFF`
            : `Local index ${idx} for '${tok.name}' exceeds 0xFF (use WIDE prefix)`,
        );
      }
      return { value: idx };
    }
    if (kind === 'uword' && isConstantRefMnemonic(info.mnemonic)) {
      const entry = constantsByName.get(tok.name);
      if (entry === undefined) {
        return errorAt(tok, `Unknown constant '${tok.name}'`);
      }
      return { value: entry.index & 0xffff };
    }
    if (kind === 'branch') {
      const target = labels.get(tok.name);
      if (target === undefined) {
        return errorAt(tok, `Unknown label '${tok.name}'`);
      }
      const offset = target - inst.address;
      if (offset < -32768 || offset > 32767) {
        return errorAt(tok, `Branch offset out of range: ${offset}`);
      }
      return { value: offset & 0xffff };
    }
    return errorAt(
      tok,
      `Unexpected identifier '${tok.name}' for ${info.mnemonic} operand`,
    );
  }

  // tok.kind === 'number'
  if (kind === 'sbyte') {
    if (tok.value < -128 || tok.value > 127) {
      return errorAt(tok, `Signed byte out of range: ${tok.value}`);
    }
    return { value: tok.value & 0xff };
  }
  if (kind === 'ubyte') {
    const widenThis = inst.wide && opIdx === 0 && isLocalRefMnemonic(info.mnemonic);
    const max = widenThis ? 0xffff : 0xff;
    if (tok.value < 0 || tok.value > max) {
      return errorAt(
        tok,
        widenThis
          ? `Unsigned word out of range: ${tok.value}`
          : `Unsigned byte out of range: ${tok.value}`,
      );
    }
    if (isLocalRefMnemonic(info.mnemonic) && inst.method !== null) {
      const declared = inst.method.args.length + inst.method.vars.length; // excludes OBJREF slot 0
      if (tok.value > declared) {
        return errorAt(
          tok,
          `Local index ${tok.value} exceeds ${declared} declared in method '${inst.method.name}'`,
        );
      }
    }
    return { value: tok.value };
  }
  if (kind === 'uword') {
    if (tok.value < 0 || tok.value > 0xffff) {
      return errorAt(tok, `Unsigned word out of range: ${tok.value}`);
    }
    return { value: tok.value };
  }
  // 'branch'
  if (tok.value < -32768 || tok.value > 32767) {
    return errorAt(tok, `Branch offset out of range: ${tok.value}`);
  }
  return { value: tok.value & 0xffff };
}

function isLocalRefMnemonic(mnemonic: string): boolean {
  return mnemonic === 'ILOAD' || mnemonic === 'ISTORE' || mnemonic === 'IINC';
}

function isConstantRefMnemonic(mnemonic: string): boolean {
  return mnemonic === 'LDC_W' || mnemonic === 'INVOKEVIRTUAL';
}

function lookupLocal(method: MutableMethod | null, name: string): number | undefined {
  if (method === null) return undefined;
  const argIdx = method.args.indexOf(name);
  if (argIdx >= 0) return 1 + argIdx; // LV[0] is OBJREF
  const varIdx = method.vars.indexOf(name);
  if (varIdx >= 0) return 1 + method.args.length + varIdx;
  return undefined;
}

function errorAt(
  tok: { line: number; column: number },
  message: string,
): { error: AssemblyError } {
  return { error: { line: tok.line, column: tok.column, message } };
}

// ─── Line scanning ───────────────────────────────────────────────────

type Directive =
  | { kind: 'method'; name: string; args: string[]; line: number; column: number }
  | { kind: 'end-method'; line: number; column: number }
  | { kind: 'var'; name: string; line: number; column: number }
  | { kind: 'args'; count: number; line: number; column: number }
  | { kind: 'constant'; name: string; value: number; line: number; column: number };

interface ScanResult {
  label?: string;
  labelColumn?: number;
  mnemonic?: string;
  mnemonicColumn?: number;
  operandTokens: OperandToken[];
  directive?: Directive;
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

  const parseNumber = (): { value: number; column: number } | null => {
    const opCol = i + 1;
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
      return null;
    }
    return { value, column: opCol };
  };

  const parseIdent = (): { name: string; column: number } | null => {
    const opCol = i + 1;
    if (!isIdentStart(line[i])) return null;
    const start = i;
    while (i < len && isIdentCont(line[i])) i++;
    return { name: line.slice(start, i), column: opCol };
  };

  skipWs();
  if (i >= len) return result;

  // Optional label — IDENT followed by ':'.
  const startIdx = i;
  if (isIdentStart(line[i])) {
    let j = i;
    while (j < len && isIdentCont(line[j])) j++;
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

  // Directive — leading '.'.
  if (line[i] === '.') {
    const dotCol = i + 1;
    i++;
    if (!isIdentStart(line[i])) {
      result.errors.push({
        line: lineNum,
        column: dotCol,
        message: `Expected directive name after '.'`,
      });
      return result;
    }
    const idStart = i;
    while (i < len && (isIdentCont(line[i]) || line[i] === '-')) i++;
    const directiveName = line.slice(idStart, i).toLowerCase();
    skipWs();

    switch (directiveName) {
      case 'method': {
        const ident = parseIdent();
        if (ident === null) {
          result.errors.push({
            line: lineNum,
            column: i + 1,
            message: `Expected method name after .method`,
          });
          return result;
        }
        skipWs();
        const args: string[] = [];
        if (line[i] === '(') {
          i++;
          skipWs();
          if (line[i] !== ')') {
            for (;;) {
              skipWs();
              const argId = parseIdent();
              if (argId === null) {
                result.errors.push({
                  line: lineNum,
                  column: i + 1,
                  message: `Expected parameter name`,
                });
                return result;
              }
              if (args.includes(argId.name)) {
                result.errors.push({
                  line: lineNum,
                  column: argId.column,
                  message: `Duplicate parameter '${argId.name}'`,
                });
              } else {
                args.push(argId.name);
              }
              skipWs();
              if (line[i] === ',') {
                i++;
                continue;
              }
              break;
            }
          }
          skipWs();
          if (line[i] !== ')') {
            result.errors.push({
              line: lineNum,
              column: i + 1,
              message: `Expected ')' to close parameter list`,
            });
            return result;
          }
          i++;
        }
        result.directive = {
          kind: 'method',
          name: ident.name,
          args,
          line: lineNum,
          column: dotCol,
        };
        return result;
      }
      case 'end-method': {
        result.directive = { kind: 'end-method', line: lineNum, column: dotCol };
        return result;
      }
      case 'var': {
        const ident = parseIdent();
        if (ident === null) {
          result.errors.push({
            line: lineNum,
            column: i + 1,
            message: `Expected variable name after .var`,
          });
          return result;
        }
        result.directive = {
          kind: 'var',
          name: ident.name,
          line: lineNum,
          column: dotCol,
        };
        return result;
      }
      case 'args': {
        skipWs();
        if (line[i] !== '-' && !/[0-9]/.test(line[i] ?? '')) {
          result.errors.push({
            line: lineNum,
            column: i + 1,
            message: `Expected count after .args`,
          });
          return result;
        }
        const num = parseNumber();
        if (num === null) return result;
        result.directive = {
          kind: 'args',
          count: num.value,
          line: lineNum,
          column: dotCol,
        };
        return result;
      }
      case 'const':
      case 'constant': {
        const ident = parseIdent();
        if (ident === null) {
          result.errors.push({
            line: lineNum,
            column: i + 1,
            message: `Expected constant name after .${directiveName}`,
          });
          return result;
        }
        skipWs();
        if (line[i] !== '-' && !/[0-9]/.test(line[i] ?? '')) {
          result.errors.push({
            line: lineNum,
            column: i + 1,
            message: `Expected numeric value for .${directiveName} '${ident.name}'`,
          });
          return result;
        }
        const num = parseNumber();
        if (num === null) return result;
        result.directive = {
          kind: 'constant',
          name: ident.name,
          value: num.value,
          line: lineNum,
          column: dotCol,
        };
        return result;
      }
      default: {
        result.errors.push({
          line: lineNum,
          column: dotCol,
          message: `Unknown directive '.${directiveName}'`,
        });
        return result;
      }
    }
  }

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
      const num = parseNumber();
      if (num !== null) {
        result.operandTokens.push({ kind: 'number', value: num.value, line: lineNum, column: opCol });
      }
    } else if (isIdentStart(line[i])) {
      const id = parseIdent();
      if (id !== null) {
        result.operandTokens.push({ kind: 'ident', name: id.name, line: lineNum, column: opCol });
      }
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
