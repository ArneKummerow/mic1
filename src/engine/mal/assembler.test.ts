import { describe, it, expect } from 'vitest';
import { assembleMicrocode } from './assembler';
import { disassembleControlStore } from './disassembler';
import { createMachineState, step } from '../simulator';
import type { Microinstruction } from '../types';

function expectNoErrors(result: ReturnType<typeof assembleMicrocode>): void {
  if (result.errors.length > 0) {
    throw new Error(`Assembly errors:\n${result.errors.map((e) => `  ${e.line}:${e.column} ${e.message}`).join('\n')}`);
  }
}

describe('MAL assembler: basic assignments', () => {
  it('assembles `H = MDR + 1`', () => {
    const r = assembleMicrocode('H = MDR + 1');
    expectNoErrors(r);
    const instr = r.controlStore[0]!;
    expect(instr.bBus).toBe('MDR');
    expect(instr.alu).toEqual({ F0: true, F1: true, ENA: false, ENB: true, INVA: false, INC: true });
    expect([...instr.cBus]).toEqual(['H']);
  });

  it('assembles assignment chain', () => {
    const r = assembleMicrocode('MDR = TOS = MDR + H');
    expectNoErrors(r);
    const instr = r.controlStore[0]!;
    expect(instr.bBus).toBe('MDR');
    expect(new Set(instr.cBus)).toEqual(new Set(['MDR', 'TOS']));
  });

  it('assembles bitwise AND/OR', () => {
    const r = assembleMicrocode('H = MDR AND H');
    expectNoErrors(r);
    const instr = r.controlStore[0]!;
    expect(instr.alu).toMatchObject({ F0: false, F1: false, ENA: true, ENB: true });
    expect(instr.bBus).toBe('MDR');
  });

  it('assembles subtraction R - 1', () => {
    const r = assembleMicrocode('SP = SP - 1');
    expectNoErrors(r);
    const instr = r.controlStore[0]!;
    expect(instr.alu).toMatchObject({ ENA: false, ENB: true, INVA: true, INC: false });
    expect(instr.bBus).toBe('SP');
  });

  it('assembles subtraction R - H', () => {
    const r = assembleMicrocode('MDR = MDR - H');
    expectNoErrors(r);
    const instr = r.controlStore[0]!;
    expect(instr.alu).toMatchObject({ ENA: true, ENB: true, INVA: true, INC: true });
    expect(instr.bBus).toBe('MDR');
  });

  it('assembles unary negate -H', () => {
    const r = assembleMicrocode('H = -H');
    expectNoErrors(r);
    const instr = r.controlStore[0]!;
    expect(instr.alu).toMatchObject({ ENA: true, INVA: true, INC: true, ENB: false });
  });

  it('assembles 3-term H + R + 1', () => {
    const r = assembleMicrocode('MDR = H + MDR + 1');
    expectNoErrors(r);
    const instr = r.controlStore[0]!;
    expect(instr.alu).toMatchObject({ ENA: true, ENB: true, INC: true });
    expect(instr.bBus).toBe('MDR');
  });

  it('rejects H - 1 with a clear error', () => {
    const r = assembleMicrocode('H = H - 1');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/'H - 1'/);
  });
});

describe('MAL assembler: shifter', () => {
  it('SLL8 modifier', () => {
    const r = assembleMicrocode('MDR = H << 8');
    expectNoErrors(r);
    expect(r.controlStore[0]!.shifter).toBe('SLL8');
  });

  it('SRA1 modifier', () => {
    const r = assembleMicrocode('MDR = H >> 1');
    expectNoErrors(r);
    expect(r.controlStore[0]!.shifter).toBe('SRA1');
  });

  it('rejects << 4 (only << 8 supported)', () => {
    const r = assembleMicrocode('MDR = H << 4');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/<< 8/);
  });
});

describe('MAL assembler: memory ops', () => {
  it('rd combines with assignment', () => {
    const r = assembleMicrocode('MAR = SP - 1; rd');
    expectNoErrors(r);
    expect(r.controlStore[0]!.mem.read).toBe(true);
    expect([...r.controlStore[0]!.cBus]).toEqual(['MAR']);
  });

  it('wr + fetch on the same line', () => {
    const r = assembleMicrocode('PC = PC + 1; fetch; wr');
    expectNoErrors(r);
    expect(r.controlStore[0]!.mem).toEqual({ read: false, write: true, fetch: true });
  });

  it('rejects rd and wr together', () => {
    const r = assembleMicrocode('MAR = SP; rd; wr');
    expect(r.errors.some((e) => /mutually exclusive/.test(e.message))).toBe(true);
  });
});

describe('MAL assembler: labels and goto', () => {
  it('resolves a forward label reference', () => {
    const src = `
      Start    H = MDR; goto End
      Skip     MDR = MDR + 1
      End      goto Start
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);
    expect(r.labels.get('Start')).toBe(0);
    expect(r.labels.get('Skip')).toBe(1);
    expect(r.labels.get('End')).toBe(2);
    expect(r.controlStore[0]!.nextAddress).toBe(2); // goto End
    expect(r.controlStore[2]!.nextAddress).toBe(0); // goto Start
  });

  it('places a label at an explicit address', () => {
    const src = `
      Main = 0x000   PC = PC + 1; fetch; goto (MBR)
      iadd1 = 0x60   MAR = SP = SP - 1; rd
      iadd2          H = TOS
      iadd3          MDR = TOS = MDR + H; wr; goto Main
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);
    expect(r.labels.get('Main')).toBe(0);
    expect(r.labels.get('iadd1')).toBe(0x60);
    expect(r.labels.get('iadd2')).toBe(0x61);
    expect(r.labels.get('iadd3')).toBe(0x62);
    expect(r.controlStore[0x62]!.nextAddress).toBe(0); // goto Main
  });

  it('handles goto (MBR)', () => {
    const r = assembleMicrocode('Main goto (MBR)');
    expectNoErrors(r);
    expect(r.controlStore[0]!.jam.JMPC).toBe(true);
    expect(r.controlStore[0]!.nextAddress).toBe(0);
  });

  it('handles goto (MBR OR Label)', () => {
    const src = `
      Main = 0x000   goto (MBR OR Tab)
      Tab = 0x100    H = MDR
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);
    expect(r.controlStore[0]!.jam.JMPC).toBe(true);
    expect(r.controlStore[0]!.nextAddress).toBe(0x100);
  });

  it('handles if (N) goto Label', () => {
    // The taken-branch label (L2) must live in the upper half so the JAM
    // mechanism (which only OR's bit 8) can reach it. NEXT_ADDR stores the
    // fall-through address (L2 & 0xFF); the fall-through microinstruction
    // is the user's responsibility to place at that low-half address.
    const src = `
      L1 = 0x010   H = MDR; if (N) goto L2
      L2 = 0x110   MDR = H
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);
    expect(r.controlStore[0x10]!.jam.JAMN).toBe(true);
    expect(r.controlStore[0x10]!.nextAddress).toBe(0x10);
  });

  it('rejects conditional if-goto whose target is in the lower half', () => {
    const src = `
      L1 = 0x010   H = MDR; if (Z) goto L2
      L2 = 0x050   MDR = H
    `;
    const r = assembleMicrocode(src);
    expect(r.errors.some((e) => /must be in 0x100..0x1ff/i.test(e.message))).toBe(true);
  });

  it('runs an if (Z) goto T branch correctly in the simulator', () => {
    // Verify the JAM bit-8 mechanism actually picks the right path: when Z
    // is true at the if-microinstruction, MPC should land at T; when false,
    // at the fall-through F (= T & 0xFF).
    const src = `
      Start = 0x000   H = MDR; if (Z) goto Taken
      Fall  = 0x001   goto Fall
      Taken = 0x101   goto Taken
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);

    // Z-true: MDR = 0 ⇒ ALU output = 0 ⇒ Z set ⇒ branch to Taken (0x101).
    {
      const state = createMachineState(64);
      state.controlStore = r.controlStore;
      state.MDR = 0;
      state.MPC = 0;
      const trace = step(state);
      expect(trace.aluFlags.Z).toBe(true);
      expect(trace.mpcAfter).toBe(0x101);
    }
    // Z-false: MDR = 7 ⇒ ALU output = 7 ⇒ Z clear ⇒ fall through to 0x001.
    {
      const state = createMachineState(64);
      state.controlStore = r.controlStore;
      state.MDR = 7;
      state.MPC = 0;
      const trace = step(state);
      expect(trace.aluFlags.Z).toBe(false);
      expect(trace.mpcAfter).toBe(0x001);
    }
  });

  it('reports unknown label', () => {
    const r = assembleMicrocode('foo H = MDR; goto Nowhere');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Unknown label 'Nowhere'/);
  });

  it('reports duplicate label', () => {
    const r = assembleMicrocode('foo H = MDR\nfoo MDR = H');
    expect(r.errors.some((e) => /Duplicate label/.test(e.message))).toBe(true);
  });

  it('reports address collision', () => {
    const r = assembleMicrocode('Foo = 0x10 H = MDR\nBar = 0x10 MDR = H');
    expect(r.errors.some((e) => /already used/.test(e.message))).toBe(true);
  });
});

describe('MAL assembler: comments and whitespace', () => {
  it('ignores // line comments', () => {
    const src = `
      // this is a comment
      H = MDR  // trailing comment
      // another
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);
    expect(r.controlStore[0]!.bBus).toBe('MDR');
  });

  it('ignores blank lines', () => {
    const r = assembleMicrocode('\n\n\nH = MDR\n\n');
    expectNoErrors(r);
    expect(r.controlStore[0]!.bBus).toBe('MDR');
  });
});

describe('MAL assembler: two-label and negated conditionals', () => {
  it('accepts the textbook two-label form', () => {
    const src = `
      L1 = 0x020   H = MDR; if (Z) goto L2; else goto L3
      L3 = 0x010   goto L3
      L2 = 0x110   MDR = H
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);
    expect(r.controlStore[0x20]!.jam.JAMZ).toBe(true);
    expect(r.controlStore[0x20]!.nextAddress).toBe(0x10);
  });

  it('rejects two-label form with mismatched low bytes', () => {
    const src = `
      L1 = 0x010   if (Z) goto L2; else goto L3
      L3 = 0x015   goto L3
      L2 = 0x110   goto L2
    `;
    const r = assembleMicrocode(src);
    expect(r.errors.some((e) => /share the low byte/.test(e.message))).toBe(true);
  });

  it('rejects two-label form when the else target has bit 8 set', () => {
    const src = `
      L1 = 0x010   if (Z) goto L2; else goto L3
      L3 = 0x111   goto L3
      L2 = 0x110   goto L2
    `;
    const r = assembleMicrocode(src);
    expect(r.errors.some((e) => /must be in 0x000..0x0ff/i.test(e.message))).toBe(true);
  });

  it('accepts negated single-label form `if (~Z) goto T` (T in lower half)', () => {
    const src = `
      L1 = 0x010   H = MDR; if (~Z) goto L2
      L2 = 0x011   goto L2
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);
    expect(r.controlStore[0x10]!.jam.JAMZ).toBe(true);
    expect(r.controlStore[0x10]!.nextAddress).toBe(0x11);
  });

  it('accepts `if (!N) goto T` with `!` syntax', () => {
    const src = `
      L1 = 0x010   if (!N) goto L2
      L2 = 0x011   goto L2
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);
    expect(r.controlStore[0x10]!.jam.JAMN).toBe(true);
  });

  it('rejects negated single-label whose target is in the upper half', () => {
    const src = `
      L1 = 0x010   if (~Z) goto L2
      L2 = 0x110   goto L2
    `;
    const r = assembleMicrocode(src);
    expect(r.errors.some((e) => /must be in 0x000..0x0ff/i.test(e.message))).toBe(true);
  });

  it('runs `if (~Z) goto T; else goto F` correctly in the simulator', () => {
    // Negated semantics: branch taken when Z is FALSE.
    const src = `
      Start = 0x000  H = MDR; if (~Z) goto NotZero; else goto IsZero
      NotZero = 0x001 goto NotZero
      IsZero  = 0x101 goto IsZero
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);

    // Z-false (MDR=7): should land at NotZero (0x001).
    {
      const state = createMachineState(64);
      state.controlStore = r.controlStore;
      state.MDR = 7;
      state.MPC = 0;
      const trace = step(state);
      expect(trace.aluFlags.Z).toBe(false);
      expect(trace.mpcAfter).toBe(0x001);
    }
    // Z-true (MDR=0): should land at IsZero (0x101).
    {
      const state = createMachineState(64);
      state.controlStore = r.controlStore;
      state.MDR = 0;
      state.MPC = 0;
      const trace = step(state);
      expect(trace.aluFlags.Z).toBe(true);
      expect(trace.mpcAfter).toBe(0x101);
    }
  });
});

describe('MAL encoder: improved diagnostics', () => {
  it('suggests a workaround for `H - 1`', () => {
    const r = assembleMicrocode('H = H - 1');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Move H/);
    expect(r.errors[0].message).toMatch(/B-bus register/);
  });

  it('points at swapping for `H - R`', () => {
    const r = assembleMicrocode('H = H - MDR');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/MDR - H/);
  });

  it('rejects -1 inside an addition with a hint', () => {
    const r = assembleMicrocode('H = MDR + -1');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/-1.*cannot be added directly/);
  });

  it('rejects `~R + 1` with a clear hint', () => {
    const r = assembleMicrocode('H = ~MDR + 1');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Unary.*not allowed inside an addition/);
  });

  it('explains why two B-bus regs are not allowed', () => {
    const r = assembleMicrocode('H = MDR + SP');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/Only one non-H register.*B-bus.*MDR.*SP/);
  });

  it('suggests unary form for `0 - H`', () => {
    const r = assembleMicrocode('H = 0 - H');
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/use the unary form '-H'/);
  });
});

describe('MAL assembler: round-trip via disassembler', () => {
  function semanticView(instr: Microinstruction): unknown {
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

  function expectRoundTrip(src: string): void {
    const a = assembleMicrocode(src);
    expectNoErrors(a);
    const disassembled = disassembleControlStore(a.controlStore);
    const b = assembleMicrocode(disassembled);
    if (b.errors.length > 0) {
      throw new Error(
        `Re-assembly errors:\n${b.errors.map((e) => `  ${e.line}:${e.column} ${e.message}`).join('\n')}\n--- disassembled output ---\n${disassembled}`,
      );
    }
    for (let addr = 0; addr < a.controlStore.length; addr++) {
      const ai = a.controlStore[addr];
      const bi = b.controlStore[addr];
      if (!ai && !bi) continue;
      if (!ai || !bi) {
        throw new Error(
          `Round-trip mismatch at 0x${addr.toString(16)}: a=${ai ? 'def' : 'undef'} b=${bi ? 'def' : 'undef'}\n--- disassembled ---\n${disassembled}`,
        );
      }
      expect(semanticView(bi)).toEqual(semanticView(ai));
    }
  }

  it('round-trips the full ALU expression set', () => {
    expectRoundTrip(`
      L0 = 0x000   H = MDR
      L1 = 0x001   H = -H
      L2 = 0x002   H = ~H
      L3 = 0x003   H = MDR + 1
      L4 = 0x004   H = H + 1
      L5 = 0x005   H = MDR + H + 1
      L6 = 0x006   H = MDR + H
      L7 = 0x007   H = MDR - 1
      L8 = 0x008   H = MDR - H
      L9 = 0x009   H = ~MDR
      LA = 0x00a   H = -MDR
      LB = 0x00b   H = MDR AND H
      LC = 0x00c   H = MDR OR H
      LD = 0x00d   H = 0
      LE = 0x00e   H = 1
      LF = 0x00f   H = -1
    `);
  });

  it('round-trips shifter forms', () => {
    expectRoundTrip(`
      A = 0x010   MDR = H << 8
      B = 0x011   MDR = H >> 1
    `);
  });

  it('round-trips memory ops and goto forms', () => {
    expectRoundTrip(`
      Main = 0x000   PC = PC + 1; fetch; goto (MBR)
      A    = 0x001   MAR = SP; rd
      B    = 0x002   wr; goto Main
      C    = 0x003   goto (MBR OR 0x100)
    `);
  });

  it('round-trips assignment chains', () => {
    expectRoundTrip(`
      L0 = 0x000   MDR = TOS = MDR + H
      L1 = 0x001   MAR = SP = SP - 1; rd
    `);
  });

  it('round-trips conditional branches', () => {
    expectRoundTrip(`
      L1 = 0x010   H = MDR; if (Z) goto L2
      L2 = 0x110   MDR = H
      L3 = 0x011   if (N) goto L4
      L4 = 0x111   goto L4
      L5 = 0x012   if (~Z) goto L6
      L6 = 0x013   goto L6
    `);
  });
});

describe('MAL assembler: end-to-end with simulator', () => {
  it('a + b: load two memory words and add them', () => {
    // Memory layout: a (word 0) = 5, b (word 1) = 7
    const state = createMachineState(64);
    state.memory[0] = 0x00;
    state.memory[1] = 0x00;
    state.memory[2] = 0x00;
    state.memory[3] = 0x05;
    state.memory[4] = 0x00;
    state.memory[5] = 0x00;
    state.memory[6] = 0x00;
    state.memory[7] = 0x07;

    const src = `
      L0   MAR = 0; rd
      L1                                     // wait one cycle for rd
      L2   H = MDR                           // save first word into H
      L3   MAR = 1; rd
      L4                                     // wait
      L5   MDR = MDR + H
      L6   MAR = 0; wr
      L7   goto L7                           // halt-loop
    `;
    const result = assembleMicrocode(src);
    expectNoErrors(result);
    state.controlStore = result.controlStore;

    // Run until we hit the self-goto, capped to avoid infinite loops on bugs.
    for (let i = 0; i < 20; i++) {
      const trace = step(state);
      if (trace.mpcAfter === trace.mpcBefore) break;
    }

    // Memory[0..3] should now be 5 + 7 = 12.
    expect(state.memory[0]).toBe(0);
    expect(state.memory[1]).toBe(0);
    expect(state.memory[2]).toBe(0);
    expect(state.memory[3]).toBe(0x0c);
  });
});
