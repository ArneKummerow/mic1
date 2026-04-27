import { describe, it, expect } from 'vitest';
import { assembleMicrocode } from './assembler';
import { createMachineState, step } from '../simulator';

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
    const src = `
      L1 = 0x010   H = MDR; if (N) goto L2
      L2 = 0x110   MDR = H
    `;
    const r = assembleMicrocode(src);
    expectNoErrors(r);
    expect(r.controlStore[0x10]!.jam.JAMN).toBe(true);
    expect(r.controlStore[0x10]!.nextAddress).toBe(0x110);
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
