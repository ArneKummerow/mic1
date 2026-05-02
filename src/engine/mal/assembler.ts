/**
 * MAL assembler — top-level entry point.
 *
 * Two passes:
 *   1. Lay out addresses: each line gets a microaddress (sequential, unless
 *      the line has an explicit `Label = 0xNN` directive).
 *   2. Encode each line and resolve label references in goto targets.
 */

import { lex } from './lexer';
import { parse } from './parser';
import type { ParsedLine } from './parser';
import { encodeLine, type AssemblyError, type EncodedLine, type UnresolvedNext } from './encoder';
import type { GotoTarget } from './parser';
import type { Microinstruction } from '../types';

export const CONTROL_STORE_SIZE = 512;

export interface AssembleResult {
  controlStore: (Microinstruction | undefined)[];
  errors: AssemblyError[];
  /** Label → microaddress. */
  labels: Map<string, number>;
  /** 1-based source line → microaddress. */
  addressByLine: Map<number, number>;
  /** Microaddress → 1-based source line. */
  lineByAddress: Map<number, number>;
}

interface LaidOut {
  parsed: ParsedLine;
  address: number;
}

export function assembleMicrocode(source: string): AssembleResult {
  const errors: AssemblyError[] = [];
  const labels = new Map<string, number>();
  const addressByLine = new Map<number, number>();
  const lineByAddress = new Map<number, number>();
  const controlStore: (Microinstruction | undefined)[] = new Array(CONTROL_STORE_SIZE).fill(undefined);

  // Lex + parse.
  const lexed = lex(source);
  const parsed = parse(lexed.tokens, lexed.errors);
  errors.push(...parsed.errors);

  // Pass 1: assign addresses.
  const laidOut: LaidOut[] = [];
  let cursor = 0;
  const occupied = new Set<number>();

  for (const line of parsed.lines) {
    if (line.explicitAddress !== undefined) {
      cursor = line.explicitAddress;
    }
    if (cursor < 0 || cursor >= CONTROL_STORE_SIZE) {
      errors.push({
        line: line.line,
        column: 1,
        message: `Address 0x${cursor.toString(16)} out of range (max 0x${(CONTROL_STORE_SIZE - 1).toString(16)})`,
      });
      continue;
    }
    if (occupied.has(cursor)) {
      errors.push({
        line: line.line,
        column: 1,
        message: `Address 0x${cursor.toString(16)} already used`,
      });
      continue;
    }
    occupied.add(cursor);
    if (line.label !== undefined) {
      if (labels.has(line.label)) {
        errors.push({
          line: line.line,
          column: 1,
          message: `Duplicate label '${line.label}'`,
        });
      } else {
        labels.set(line.label, cursor);
      }
    }
    laidOut.push({ parsed: line, address: cursor });
    addressByLine.set(line.line, cursor);
    lineByAddress.set(cursor, line.line);
    cursor++;
  }

  // Pass 2: encode.
  for (const { parsed: line, address } of laidOut) {
    const result = encodeLine(line);
    errors.push(...result.errors);
    const resolved = resolveNext(result.encoded, address, labels);
    if (resolved.errors.length > 0) {
      errors.push(...resolved.errors);
    }
    const instr: Microinstruction = {
      ...result.encoded.instr,
      nextAddress: resolved.nextAddress,
      jam: resolved.jam,
    };
    controlStore[address] = instr;
  }

  return {
    controlStore,
    errors,
    labels,
    addressByLine,
    lineByAddress,
  };
}

interface Resolved {
  nextAddress: number;
  jam: { JMPC: boolean; JAMN: boolean; JAMZ: boolean };
  errors: AssemblyError[];
}

function resolveNext(
  encoded: EncodedLine,
  thisAddress: number,
  labels: Map<string, number>,
): Resolved {
  const u: UnresolvedNext = encoded.unresolvedNext;
  const errors: AssemblyError[] = [];

  if (u.kind === 'sequential') {
    return {
      nextAddress: (thisAddress + 1) & 0x1ff,
      jam: encoded.instr.jam,
      errors,
    };
  }
  if (u.kind === 'absolute') {
    return validatedJamGoto(u.address, u.jam, errors, { line: 0, column: 0 });
  }
  if (u.kind === 'label') {
    const addr = labels.get(u.name);
    if (addr === undefined) {
      errors.push({ line: u.line, column: u.column, message: `Unknown label '${u.name}'` });
      return { nextAddress: 0, jam: u.jam, errors };
    }
    return validatedJamGoto(addr, u.jam, errors, { line: u.line, column: u.column });
  }
  if (u.kind === 'if-pair') {
    return resolveIfPair(u, labels, errors);
  }
  // mbr
  let baseAddr = 0;
  if (u.orLabel) {
    const labelAddr = labels.get(u.orLabel);
    if (labelAddr === undefined) {
      errors.push({ line: u.line, column: u.column, message: `Unknown label '${u.orLabel}'` });
    } else {
      baseAddr = labelAddr;
    }
  } else if (u.orAddress !== undefined) {
    if (u.orAddress < 0 || u.orAddress >= CONTROL_STORE_SIZE) {
      errors.push({
        line: u.line,
        column: u.column,
        message: `MBR-OR base 0x${u.orAddress.toString(16)} out of range`,
      });
    } else {
      baseAddr = u.orAddress;
    }
  }
  return {
    nextAddress: baseAddr & 0x1ff,
    jam: { ...encoded.instr.jam, JMPC: true },
    errors,
  };
}

function resolveTarget(
  target: GotoTarget,
  labels: Map<string, number>,
  errors: AssemblyError[],
  loc: { line: number; column: number },
): number | undefined {
  if (target.kind === 'addr') return target.value;
  if (target.kind === 'label') {
    const addr = labels.get(target.name);
    if (addr === undefined) {
      errors.push({ line: loc.line, column: loc.column, message: `Unknown label '${target.name}'` });
      return undefined;
    }
    return addr;
  }
  // 'mbr' is rejected at parse-to-encoding time for if-statements; ignore here.
  return undefined;
}

function resolveIfPair(
  u: Extract<UnresolvedNext, { kind: 'if-pair' }>,
  labels: Map<string, number>,
  errors: AssemblyError[],
): Resolved {
  const loc = { line: u.line, column: u.column };
  const jamTakenAddr = u.jamTaken
    ? resolveTarget(u.jamTaken.target, labels, errors, {
        line: u.jamTaken.line,
        column: u.jamTaken.column,
      })
    : undefined;
  const fallThroughAddr = u.fallThrough
    ? resolveTarget(u.fallThrough.target, labels, errors, {
        line: u.fallThrough.line,
        column: u.fallThrough.column,
      })
    : undefined;

  if (jamTakenAddr === undefined && fallThroughAddr === undefined) {
    return { nextAddress: 0, jam: u.jam, errors };
  }

  // Validate ranges and bit-8 invariant.
  if (jamTakenAddr !== undefined) {
    if (jamTakenAddr < 0 || jamTakenAddr >= CONTROL_STORE_SIZE) {
      errors.push({ ...loc, message: `Goto target 0x${jamTakenAddr.toString(16)} out of range` });
      return { nextAddress: 0, jam: u.jam, errors };
    }
    if ((jamTakenAddr & 0x100) === 0) {
      errors.push({
        ...loc,
        message: `Conditional taken-branch target 0x${jamTakenAddr.toString(16)} must be in 0x100..0x1FF (the JAM mechanism only sets bit 8). Place the taken-branch microinstruction in the upper half and the fall-through at 0x${(jamTakenAddr & 0xff).toString(16).padStart(2, '0')}.`,
      });
    }
  }
  if (fallThroughAddr !== undefined) {
    if (fallThroughAddr < 0 || fallThroughAddr >= CONTROL_STORE_SIZE) {
      errors.push({ ...loc, message: `Goto target 0x${fallThroughAddr.toString(16)} out of range` });
      return { nextAddress: 0, jam: u.jam, errors };
    }
    if ((fallThroughAddr & 0x100) !== 0) {
      errors.push({
        ...loc,
        message: `Conditional fall-through target 0x${fallThroughAddr.toString(16)} must be in 0x000..0x0FF (the JAM mechanism only sets bit 8, so the not-taken path stays in the low half).`,
      });
    }
  }
  if (jamTakenAddr !== undefined && fallThroughAddr !== undefined) {
    if ((jamTakenAddr & 0xff) !== (fallThroughAddr & 0xff)) {
      errors.push({
        ...loc,
        message: `Conditional taken (0x${jamTakenAddr.toString(16)}) and fall-through (0x${fallThroughAddr.toString(16)}) targets must share the low byte; the JAM mechanism only ORs bit 8 onto NEXT_ADDR.`,
      });
    }
  }

  // NEXT_ADDR holds the fall-through address (low half). When JAM fires, bit 8
  // gets ORed in to reach the taken target.
  const lowByte =
    fallThroughAddr !== undefined
      ? fallThroughAddr & 0xff
      : ((jamTakenAddr ?? 0) & 0xff);
  return { nextAddress: lowByte, jam: u.jam, errors };
}

function validatedJamGoto(
  addr: number,
  jam: { JMPC: boolean; JAMN: boolean; JAMZ: boolean },
  errors: AssemblyError[],
  loc: { line: number; column: number },
): Resolved {
  if (addr < 0 || addr >= CONTROL_STORE_SIZE) {
    errors.push({
      line: loc.line,
      column: loc.column,
      message: `Goto target 0x${addr.toString(16)} out of range`,
    });
    return { nextAddress: 0, jam, errors };
  }
  // The JAM trick on MIC-1: NEXT_ADDR is 9 bits but in conditional `if (N|Z)
  // goto Label` the hardware OR's bit 8 from the JAM result. The micro-
  // assembler is responsible for emitting NEXT_ADDR with bit 8 = 0 (the
  // fall-through address). The taken-branch label is required to live in the
  // upper half (bit 8 = 1) so JAM's bit-8 OR reaches it; the fall-through
  // microinstruction must be placed at (target & 0xFF).
  if (jam.JAMN || jam.JAMZ) {
    if ((addr & 0x100) === 0) {
      errors.push({
        line: loc.line,
        column: loc.column,
        message: `Conditional 'if' target 0x${addr.toString(16)} must be in 0x100..0x1FF (the JAM mechanism only sets bit 8). Place the taken-branch microinstruction in the upper half and a fall-through microinstruction at 0x${(addr & 0xff).toString(16).padStart(2, '0')}.`,
      });
    }
    return { nextAddress: addr & 0xff, jam, errors };
  }
  return { nextAddress: addr & 0x1ff, jam, errors };
}
