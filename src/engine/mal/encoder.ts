/**
 * MAL encoder. Turns a `ParsedLine` (statements + label) into a
 * `Microinstruction` ready for the control store.
 *
 * The hard part is the ALU expression encoder: pattern-match the parsed
 * expression against the supported one-cycle ALU encodings and emit the
 * 6 control bits (F0 F1 ENA ENB INVA INC) plus the B-bus selector.
 *
 * Supported expression forms (R = any non-H register):
 *   0, 1, -1                       — constants
 *   H, R                           — passthrough
 *   ~H, ~R, -H, -R                 — unary
 *   H + R, R + H                   — addition with H
 *   H + R + 1, etc. (any order)    — addition with INC
 *   R + 1, R - 1                   — increment / decrement
 *   H + 1                          — H increment
 *   R - H                          — subtraction (always B − A)
 *   H AND R, H OR R (commutative)  — bitwise
 *
 * Anything else produces an "unsupported expression" error.
 */

import type {
  AluControl,
  BBusSource,
  JamControl,
  MemControl,
  Microinstruction,
  ShifterOp as ShifterOpEngine,
  WritableRegister,
} from '../types';
import type {
  AluRegister,
  Expr,
  GotoTarget,
  ParsedLine,
  Statement,
  WritableReg,
} from './parser';

export interface AssemblyError {
  line: number;
  column: number;
  message: string;
}

export interface EncodedLine {
  instr: Microinstruction;
  /** Symbolic next-target before label resolution. */
  unresolvedNext: UnresolvedNext;
}

export type UnresolvedNext =
  | { kind: 'sequential' }
  | { kind: 'absolute'; address: number; jam: JamControl }
  | { kind: 'label'; name: string; jam: JamControl; line: number; column: number }
  | { kind: 'mbr'; orLabel?: string; orAddress?: number; line: number; column: number }
  | {
      kind: 'if-pair';
      jam: JamControl;
      /** Target reached when the JAM mechanism sets bit 8 (condition true). */
      jamTaken?: { target: GotoTarget; line: number; column: number };
      /** Target reached when bit 8 stays 0 (condition false). */
      fallThrough?: { target: GotoTarget; line: number; column: number };
      line: number;
      column: number;
    };

// Narrowed expression types ---------------------------------------------

type NumExpr = Extract<Expr, { kind: 'num' }>;
type RegExpr = Extract<Expr, { kind: 'reg' }>;
type UnaryExpr = Extract<Expr, { kind: 'unary' }>;
type BinaryExpr = Extract<Expr, { kind: 'binary' }>;

/** Registers that can appear on the B-bus (H is on the A-bus only). */
type BBusReg = Exclude<AluRegister, 'H'>;

function isBBusReg(r: AluRegister): r is BBusReg {
  return r !== 'H';
}

// Helpers ---------------------------------------------------------------

function emptyInstr(line: number, label: string | undefined): Microinstruction {
  return {
    nextAddress: 0,
    jam: { JMPC: false, JAMN: false, JAMZ: false },
    alu: { F0: false, F1: false, ENA: false, ENB: false, INVA: false, INC: false },
    shifter: 'NONE',
    cBus: new Set<WritableRegister>(),
    mem: { read: false, write: false, fetch: false },
    bBus: 'NONE',
    sourceLine: line,
    ...(label !== undefined && { label }),
  };
}

const ALU_ZERO: AluControl = { F0: true, F1: true, ENA: false, ENB: false, INVA: false, INC: false };

interface AluEncoding {
  alu: AluControl;
  bBus: BBusSource;
}

interface EncodingError {
  error: string;
  line: number;
  column: number;
}

type EncodingResult = AluEncoding | EncodingError;

function isError(r: EncodingResult): r is EncodingError {
  return 'error' in r;
}

function errAt(tok: { line: number; column: number }, msg: string): EncodingError {
  return { error: msg, line: tok.line, column: tok.column };
}

// ALU expression encoder ------------------------------------------------

function encodeExpr(expr: Expr): EncodingResult {
  switch (expr.kind) {
    case 'num':
      return encodeNum(expr);
    case 'reg':
      return encodeReg(expr);
    case 'unary':
      return encodeUnary(expr);
    case 'binary':
      if (expr.op === '+') return encodePlusChain(expr);
      if (expr.op === '-') return encodeMinus(expr);
      return encodeAndOr(expr);
  }
}

function encodeNum(expr: NumExpr): EncodingResult {
  if (expr.value === 0) return { alu: { ...ALU_ZERO }, bBus: 'NONE' };
  if (expr.value === 1) return { alu: { ...ALU_ZERO, INC: true }, bBus: 'NONE' };
  if (expr.value === -1) return { alu: { ...ALU_ZERO, INVA: true }, bBus: 'NONE' };
  return errAt(expr.token, `Numeric constant must be 0, 1, or -1`);
}

function encodeReg(expr: RegExpr): EncodingResult {
  return passthroughReg(expr.name);
}

function encodeUnary(expr: UnaryExpr): EncodingResult {
  if (expr.arg.kind !== 'reg') {
    return errAt(expr.token, `Unary '${expr.op}' must wrap a register`);
  }
  const r = expr.arg.name;
  if (expr.op === '~') return notReg(r);
  return negReg(r);
}

function passthroughReg(r: AluRegister): AluEncoding {
  if (r === 'H') {
    return {
      alu: { F0: true, F1: true, ENA: true, ENB: false, INVA: false, INC: false },
      bBus: 'NONE',
    };
  }
  return {
    alu: { F0: true, F1: true, ENA: false, ENB: true, INVA: false, INC: false },
    bBus: r,
  };
}

function notReg(r: AluRegister): AluEncoding {
  if (r === 'H') {
    return {
      alu: { F0: true, F1: true, ENA: true, ENB: false, INVA: true, INC: false },
      bBus: 'NONE',
    };
  }
  return {
    alu: { F0: true, F1: false, ENA: false, ENB: true, INVA: false, INC: false },
    bBus: r,
  };
}

function negReg(r: AluRegister): AluEncoding {
  if (r === 'H') {
    return {
      alu: { F0: true, F1: true, ENA: true, ENB: false, INVA: true, INC: true },
      bBus: 'NONE',
    };
  }
  return {
    alu: { F0: true, F1: false, ENA: false, ENB: true, INVA: false, INC: true },
    bBus: r,
  };
}

/** Flatten a left-associative chain of `+`. */
function flattenPlus(expr: Expr): Expr[] {
  if (expr.kind === 'binary' && expr.op === '+') {
    return [...flattenPlus(expr.left), ...flattenPlus(expr.right)];
  }
  return [expr];
}

function encodePlusChain(expr: BinaryExpr): EncodingResult {
  const terms = flattenPlus(expr);
  let hCount = 0;
  let oneCount = 0;
  const bBusRegs: BBusReg[] = [];

  for (const t of terms) {
    if (t.kind === 'reg') {
      if (t.name === 'H') hCount++;
      else if (isBBusReg(t.name)) bBusRegs.push(t.name);
    } else if (t.kind === 'num') {
      if (t.value === 1) oneCount++;
      else if (t.value === -1) {
        return errAt(
          t.token,
          `'-1' cannot be added directly; use 'R - 1' for decrement or '-H'/'-R' for negation.`,
        );
      } else {
        return errAt(
          t.token,
          `Only +1 is supported as a literal in additions (got ${t.value}); the ALU only has the 'plus 1' (INC) input.`,
        );
      }
    } else if (t.kind === 'unary') {
      return errAt(
        t.token,
        `Unary '${t.op}' is not allowed inside an addition; the ALU has no 'A + ~B' / 'A + (-B)' encoding. Compute the unary in a separate cycle.`,
      );
    } else {
      return errAt(t.token, `Unsupported term in '+' expression`);
    }
  }

  if (hCount > 1) return errAt(expr.token, `H can appear at most once in an expression`);
  if (bBusRegs.length > 1) {
    return errAt(
      expr.token,
      `Only one non-H register can be on the B-bus per cycle (got ${bBusRegs.join(', ')}). Move one of them through H first.`,
    );
  }
  if (oneCount > 1) return errAt(expr.token, `Constant 1 may appear at most once`);

  const r: BBusReg | undefined = bBusRegs[0];

  // H + R [+ 1]
  if (hCount === 1 && r) {
    return {
      alu: { F0: true, F1: true, ENA: true, ENB: true, INVA: false, INC: oneCount === 1 },
      bBus: r,
    };
  }
  // H + 1
  if (hCount === 1 && oneCount === 1 && !r) {
    return {
      alu: { F0: true, F1: true, ENA: true, ENB: false, INVA: false, INC: true },
      bBus: 'NONE',
    };
  }
  // R + 1
  if (oneCount === 1 && r) {
    return {
      alu: { F0: true, F1: true, ENA: false, ENB: true, INVA: false, INC: true },
      bBus: r,
    };
  }
  // Single H
  if (hCount === 1 && !r && oneCount === 0) return passthroughReg('H');
  // Single R
  if (r && hCount === 0 && oneCount === 0) return passthroughReg(r);

  return errAt(expr.token, `Unsupported '+' expression`);
}

function encodeMinus(expr: BinaryExpr): EncodingResult {
  const { left, right, token } = expr;

  // R - 1
  if (
    left.kind === 'reg' &&
    isBBusReg(left.name) &&
    right.kind === 'num' &&
    right.value === 1
  ) {
    return {
      alu: { F0: true, F1: true, ENA: false, ENB: true, INVA: true, INC: false },
      bBus: left.name,
    };
  }
  // R - H
  if (
    left.kind === 'reg' &&
    isBBusReg(left.name) &&
    right.kind === 'reg' &&
    right.name === 'H'
  ) {
    return {
      alu: { F0: true, F1: true, ENA: true, ENB: true, INVA: true, INC: true },
      bBus: left.name,
    };
  }
  if (left.kind === 'reg' && left.name === 'H' && right.kind === 'num' && right.value === 1) {
    return errAt(
      token,
      `'H - 1' is not expressible in one ALU cycle: H is on the A-bus only and the ALU has no 'A - 1' encoding. Move H to a B-bus register first, e.g. 'MDR = H' then 'MDR = MDR - 1'.`,
    );
  }
  if (left.kind === 'reg' && left.name === 'H' && right.kind === 'reg' && right.name !== 'H') {
    return errAt(
      token,
      `'H - ${right.name}' is not expressible: subtraction is always B - A, so only '${right.name} - H' is supported. Either swap operands ('${right.name} - H' yields ${right.name} - H), or compute it across two cycles.`,
    );
  }
  if (
    left.kind === 'reg' &&
    isBBusReg(left.name) &&
    right.kind === 'num' &&
    right.value !== 1
  ) {
    return errAt(
      token,
      `Only 'R - 1' is a supported decrement; the ALU has no 'R - ${right.value}' encoding.`,
    );
  }
  if (left.kind === 'num' && right.kind === 'reg') {
    if (right.name === 'H' && left.value === 0) {
      return errAt(
        token,
        `'0 - H' is not expressible directly; use the unary form '-H' instead.`,
      );
    }
    if (isBBusReg(right.name) && left.value === 0) {
      return errAt(
        token,
        `'0 - ${right.name}' is not expressible directly; use the unary form '-${right.name}' instead.`,
      );
    }
  }
  return errAt(token, `Unsupported subtraction`);
}

function encodeAndOr(expr: BinaryExpr): EncodingResult {
  if (expr.op !== 'AND' && expr.op !== 'OR') {
    return errAt(expr.token, `Unexpected operator in encodeAndOr`);
  }
  const F0 = false;
  const F1 = expr.op === 'OR';

  let h: RegExpr | null = null;
  let other: Expr | null = null;
  if (expr.left.kind === 'reg' && expr.left.name === 'H') {
    h = expr.left;
    other = expr.right;
  } else if (expr.right.kind === 'reg' && expr.right.name === 'H') {
    h = expr.right;
    other = expr.left;
  }
  if (!h || !other || other.kind !== 'reg' || !isBBusReg(other.name)) {
    return errAt(expr.token, `'${expr.op}' must combine H with a non-H register`);
  }
  return {
    alu: { F0, F1, ENA: true, ENB: true, INVA: false, INC: false },
    bBus: other.name,
  };
}

// Statement aggregator --------------------------------------------------

export function encodeLine(parsedLine: ParsedLine): {
  encoded: EncodedLine;
  errors: AssemblyError[];
} {
  const errors: AssemblyError[] = [];
  const instr = emptyInstr(parsedLine.line, parsedLine.label);
  let unresolvedNext: UnresolvedNext = { kind: 'sequential' };

  let assignSeen = false;
  let gotoSeen = false;

  const cBusTargets = new Set<WritableRegister>();
  const mem: MemControl = { read: false, write: false, fetch: false };
  const jam: JamControl = { JMPC: false, JAMN: false, JAMZ: false };

  for (const stmt of parsedLine.statements) {
    handleStatement(stmt, {
      pushError: (e) => errors.push(e),
      onAssign: (s) => {
        if (assignSeen) {
          errors.push(diagnostic(s.token, `Multiple assignments per microinstruction`));
          return;
        }
        assignSeen = true;
        for (const t of s.targets) cBusTargets.add(t as WritableRegister);
        const enc = encodeExpr(s.expr);
        if (isError(enc)) {
          errors.push({ line: enc.line, column: enc.column, message: enc.error });
        } else {
          instr.alu = enc.alu;
          instr.bBus = enc.bBus;
        }
        instr.shifter = s.shifter as ShifterOpEngine;
      },
      onMem: (s) => {
        if (s.op === 'rd') {
          if (mem.read) errors.push(diagnostic(s.token, `Duplicate 'rd'`));
          if (mem.write) errors.push(diagnostic(s.token, `'rd' and 'wr' are mutually exclusive`));
          mem.read = true;
        } else if (s.op === 'wr') {
          if (mem.write) errors.push(diagnostic(s.token, `Duplicate 'wr'`));
          if (mem.read) errors.push(diagnostic(s.token, `'rd' and 'wr' are mutually exclusive`));
          mem.write = true;
        } else {
          if (mem.fetch) errors.push(diagnostic(s.token, `Duplicate 'fetch'`));
          mem.fetch = true;
        }
      },
      onGoto: (s) => {
        if (gotoSeen) {
          errors.push(diagnostic(s.token, `Multiple goto/if statements per microinstruction`));
          return;
        }
        gotoSeen = true;
        const t = s.target;
        if (t.kind === 'label') {
          unresolvedNext = {
            kind: 'label',
            name: t.name,
            jam: { ...jam },
            line: t.token.line,
            column: t.token.column,
          };
        } else if (t.kind === 'addr') {
          unresolvedNext = { kind: 'absolute', address: t.value, jam: { ...jam } };
        } else {
          jam.JMPC = true;
          unresolvedNext = {
            kind: 'mbr',
            ...(t.orLabel !== undefined && { orLabel: t.orLabel }),
            ...(t.orAddress !== undefined && { orAddress: t.orAddress }),
            line: t.token.line,
            column: t.token.column,
          };
        }
      },
      onIf: (s) => {
        if (gotoSeen) {
          errors.push(diagnostic(s.token, `Multiple goto/if statements per microinstruction`));
          return;
        }
        gotoSeen = true;
        if (s.flag === 'N') jam.JAMN = true;
        else jam.JAMZ = true;

        // Reject indirect MBR targets in either clause.
        if (s.target.kind === 'mbr' || (s.elseTarget && s.elseTarget.kind === 'mbr')) {
          errors.push(diagnostic(s.token, `'if' cannot use indirect MBR target`));
          return;
        }

        // The JAM mechanism ORs bit 8 into NEXT_ADDR when the condition is
        // true. So the "JAM-taken" target lives in 0x100..0x1FF, and the
        // "fall-through" target is its low-half twin. Negation just swaps
        // which user-facing label is which.
        const jamTakenSrc = s.negated ? s.elseTarget : s.target;
        const fallThroughSrc = s.negated ? s.target : s.elseTarget;

        unresolvedNext = {
          kind: 'if-pair',
          jam: { ...jam },
          ...(jamTakenSrc && {
            jamTaken: {
              target: jamTakenSrc,
              line: jamTakenSrc.token.line,
              column: jamTakenSrc.token.column,
            },
          }),
          ...(fallThroughSrc && {
            fallThrough: {
              target: fallThroughSrc,
              line: fallThroughSrc.token.line,
              column: fallThroughSrc.token.column,
            },
          }),
          line: s.token.line,
          column: s.token.column,
        };
      },
    });
  }

  instr.cBus = cBusTargets;
  instr.mem = mem;
  instr.jam = jam;
  return { encoded: { instr, unresolvedNext }, errors };
}

interface StatementHandler {
  pushError: (e: AssemblyError) => void;
  onAssign: (s: Extract<Statement, { kind: 'assign' }>) => void;
  onMem: (s: Extract<Statement, { kind: 'mem' }>) => void;
  onGoto: (s: Extract<Statement, { kind: 'goto' }>) => void;
  onIf: (s: Extract<Statement, { kind: 'if' }>) => void;
}

function handleStatement(stmt: Statement, h: StatementHandler): void {
  switch (stmt.kind) {
    case 'assign':
      h.onAssign(stmt);
      return;
    case 'mem':
      h.onMem(stmt);
      return;
    case 'goto':
      h.onGoto(stmt);
      return;
    case 'if':
      h.onIf(stmt);
      return;
  }
}

function diagnostic(tok: { line: number; column: number }, message: string): AssemblyError {
  return { line: tok.line, column: tok.column, message };
}

export type { Statement, ParsedLine, AluRegister, WritableReg };
