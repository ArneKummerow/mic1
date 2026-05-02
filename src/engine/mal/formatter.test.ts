import { describe, it, expect } from 'vitest';
import { formatMal } from './formatter';
import { assembleMicrocode } from './assembler';
import type { Microinstruction } from '../types';

function assertSemanticallyEqual(a: string, b: string): void {
  const ra = assembleMicrocode(a);
  const rb = assembleMicrocode(b);
  expect(ra.errors).toEqual([]);
  expect(rb.errors).toEqual([]);
  for (let addr = 0; addr < ra.controlStore.length; addr++) {
    const ai = ra.controlStore[addr];
    const bi = rb.controlStore[addr];
    if (!ai && !bi) continue;
    expect(view(bi)).toEqual(view(ai));
  }
}

function view(instr: Microinstruction | undefined): unknown {
  if (!instr) return null;
  return {
    nextAddress: instr.nextAddress,
    jam: instr.jam,
    alu: instr.alu,
    shifter: instr.shifter,
    cBus: [...instr.cBus].sort(),
    mem: instr.mem,
    bBus: instr.bBus,
  };
}

describe('MAL formatter', () => {
  it('aligns labels into a single column', () => {
    const src = ['Main goto (MBR)', 'iadd1 = 0x60 MAR = SP = SP - 1; rd', 'iadd2 H = TOS'].join(
      '\n',
    );
    const out = formatMal(src);
    const lines = out.split('\n');
    // Each label-prefixed line should start with a label segment of the same
    // width — the longest is "iadd1 = 0x60" (12 chars).
    expect(lines[0].slice(0, 12)).toBe('Main        ');
    expect(lines[1].slice(0, 12)).toBe('iadd1 = 0x60');
    expect(lines[2].slice(0, 12)).toBe('iadd2       ');
  });

  it('groups assignments / mem ops / jump into columns', () => {
    const src = `
Main = 0x000   PC = PC + 1; fetch; goto (MBR)
iadd1 = 0x60   MAR = SP = SP - 1; rd
iadd2          H = TOS
iadd3          MDR = TOS = MDR + H; wr; goto Main
`.trim();
    const out = formatMal(src);
    // The mem-op column should start at the same offset on every line that
    // has one — find it by locating "fetch" / "rd" / "wr".
    const lines = out.split('\n');
    const fetchCol = lines[0].indexOf('fetch');
    const rdCol = lines[1].indexOf('rd');
    const wrCol = lines[3].indexOf('wr');
    expect(fetchCol).toBeGreaterThan(0);
    expect(rdCol).toBe(fetchCol);
    expect(wrCol).toBe(fetchCol);
  });

  it('preserves comments', () => {
    const src = `
// top comment
Main goto (MBR)   // dispatch
iadd1 H = TOS     // pop b -> H
`.trim();
    const out = formatMal(src);
    expect(out).toContain('// top comment');
    expect(out).toContain('// dispatch');
    expect(out).toContain('// pop b -> H');
  });

  it('preserves blank lines', () => {
    const src = 'Main goto Main\n\niadd1 H = TOS\n';
    const out = formatMal(src);
    expect(out.split('\n').filter((l) => l === '').length).toBeGreaterThan(0);
  });

  it('passes broken lines through unchanged', () => {
    const src = 'Main goto Main\nthis line is not valid mal at all !!\niadd1 H = TOS';
    const out = formatMal(src);
    expect(out).toContain('this line is not valid mal at all !!');
  });

  it('is semantically idempotent (round-trips through the assembler)', () => {
    const src = `
Main = 0x000   PC = PC + 1; fetch; goto (MBR)
iadd1 = 0x60   MAR = SP = SP - 1; rd
iadd2          H = TOS
iadd3          MDR = TOS = MDR + H; wr; goto Main
L1 = 0x010     H = MDR; if (Z) goto L2
L2 = 0x110     MDR = H
`.trim();
    const formatted = formatMal(src);
    assertSemanticallyEqual(src, formatted);
    // Formatting twice should be a fixed point.
    expect(formatMal(formatted)).toBe(formatted);
  });

  it('renders negated and two-label conditionals', () => {
    const src = 'L1 = 0x010 if (~Z) goto L2; else goto L3\nL2 = 0x110 goto L2\nL3 = 0x011 goto L3';
    const formatted = formatMal(src);
    expect(formatted).toMatch(/if \(~Z\) goto L2; else goto L3/);
  });
});
