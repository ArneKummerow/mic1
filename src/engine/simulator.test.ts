import { describe, it, expect, beforeEach } from 'vitest';
import { createMachineState, snapshotMachineState, step } from './simulator';
import type { AluControl, MachineState, Microinstruction, WritableRegister } from './types';

// Test helpers ────────────────────────────────────────────────────────────

function uinstr(overrides: Partial<Microinstruction> = {}): Microinstruction {
  return {
    nextAddress: 0,
    jam: { JMPC: false, JAMN: false, JAMZ: false },
    alu: { F0: false, F1: false, ENA: false, ENB: false, INVA: false, INC: false },
    shifter: 'NONE',
    cBus: new Set<WritableRegister>(),
    mem: { read: false, write: false, fetch: false },
    bBus: 'NONE',
    ...overrides,
  };
}

// Common ALU op encodings (Tanenbaum table).
const ALU_ZERO: AluControl = { F0: true, F1: true, ENA: false, ENB: false, INVA: false, INC: false };
const ALU_ADD: AluControl = { F0: true, F1: true, ENA: true, ENB: true, INVA: false, INC: false };
const ALU_PASS_A: AluControl = { F0: true, F1: true, ENA: true, ENB: false, INVA: false, INC: false };
const ALU_PASS_B: AluControl = { F0: true, F1: true, ENA: false, ENB: true, INVA: false, INC: false };
const ALU_NEG_ONE: AluControl = { F0: true, F1: true, ENA: false, ENB: false, INVA: true, INC: false };
const ALU_AND: AluControl = { F0: false, F1: false, ENA: true, ENB: true, INVA: false, INC: false };
const ALU_OR: AluControl = { F0: false, F1: true, ENA: true, ENB: true, INVA: false, INC: false };
// B − A = ~A + B + 1
const ALU_B_MINUS_A: AluControl = { F0: true, F1: true, ENA: true, ENB: true, INVA: true, INC: true };

// Tests ───────────────────────────────────────────────────────────────────

describe('simulator: ALU', () => {
  let state: MachineState;
  beforeEach(() => {
    state = createMachineState(64);
  });

  it('A + B writes to MDR', () => {
    state.H = 5;
    state.MDR = 7;
    state.controlStore = [uinstr({ alu: ALU_ADD, bBus: 'MDR', cBus: new Set(['MDR']) })];
    const trace = step(state);
    expect(trace.aluOutput).toBe(12);
    expect(state.MDR).toBe(12);
  });

  it('B − A via ~A + B + 1', () => {
    state.H = 3;
    state.MDR = 10;
    state.controlStore = [uinstr({ alu: ALU_B_MINUS_A, bBus: 'MDR', cBus: new Set(['H']) })];
    step(state);
    expect(state.H).toBe(7);
  });

  it('zero result sets Z flag', () => {
    state.controlStore = [uinstr({ alu: ALU_ZERO, cBus: new Set(['MDR']) })];
    const trace = step(state);
    expect(trace.aluFlags).toEqual({ N: false, Z: true });
    expect(state.MDR).toBe(0);
  });

  it('negative result sets N flag', () => {
    state.H = -1;
    state.controlStore = [uinstr({ alu: ALU_PASS_A, cBus: new Set(['MDR']) })];
    const trace = step(state);
    expect(state.MDR).toBe(-1);
    expect(trace.aluFlags).toEqual({ N: true, Z: false });
  });

  it('-1 constant via INVA on zero A', () => {
    state.controlStore = [uinstr({ alu: ALU_NEG_ONE, cBus: new Set(['H']) })];
    step(state);
    expect(state.H).toBe(-1);
  });

  it('A AND B', () => {
    state.H = 0xf0f0;
    state.MDR = 0xffff;
    state.controlStore = [uinstr({ alu: ALU_AND, bBus: 'MDR', cBus: new Set(['MDR']) })];
    step(state);
    expect(state.MDR).toBe(0xf0f0);
  });

  it('A OR B', () => {
    state.H = 0x0f00;
    state.MDR = 0x00f0;
    state.controlStore = [uinstr({ alu: ALU_OR, bBus: 'MDR', cBus: new Set(['MDR']) })];
    step(state);
    expect(state.MDR).toBe(0x0ff0);
  });

  it('overflow wraps to int32', () => {
    state.H = 0x7fffffff;
    state.MDR = 1;
    state.controlStore = [uinstr({ alu: ALU_ADD, bBus: 'MDR', cBus: new Set(['MDR']) })];
    step(state);
    expect(state.MDR).toBe(-0x80000000); // wrap
  });
});

describe('simulator: shifter', () => {
  let state: MachineState;
  beforeEach(() => {
    state = createMachineState(64);
  });

  it('SLL8 shifts left by 8', () => {
    state.MDR = 0xab;
    state.controlStore = [
      uinstr({ alu: ALU_PASS_B, bBus: 'MDR', shifter: 'SLL8', cBus: new Set(['MDR']) }),
    ];
    step(state);
    expect(state.MDR).toBe(0xab00);
  });

  it('SRA1 arithmetic shift right preserves sign', () => {
    state.MDR = -2;
    state.controlStore = [
      uinstr({ alu: ALU_PASS_B, bBus: 'MDR', shifter: 'SRA1', cBus: new Set(['MDR']) }),
    ];
    step(state);
    expect(state.MDR).toBe(-1);
  });
});

describe('simulator: C-bus', () => {
  let state: MachineState;
  beforeEach(() => {
    state = createMachineState(64);
  });

  it('writes to multiple targets simultaneously', () => {
    state.H = 42;
    state.controlStore = [uinstr({ alu: ALU_PASS_A, cBus: new Set(['H', 'MDR', 'TOS']) })];
    step(state);
    expect(state.H).toBe(42);
    expect(state.MDR).toBe(42);
    expect(state.TOS).toBe(42);
  });

  it('with no C-bus targets, no register changes', () => {
    state.MDR = 7;
    state.controlStore = [uinstr({ alu: ALU_PASS_B, bBus: 'MDR' })];
    step(state);
    expect(state.MDR).toBe(7);
  });
});

describe('simulator: B-bus encodings', () => {
  let state: MachineState;
  beforeEach(() => {
    state = createMachineState(64);
  });

  it('MBR sign-extends low 8 bits', () => {
    state.MBR = 0xff;
    state.controlStore = [uinstr({ alu: ALU_PASS_B, bBus: 'MBR', cBus: new Set(['H']) })];
    step(state);
    expect(state.H).toBe(-1);
  });

  it('MBRU zero-extends low 8 bits', () => {
    state.MBR = 0xff;
    state.controlStore = [uinstr({ alu: ALU_PASS_B, bBus: 'MBRU', cBus: new Set(['H']) })];
    step(state);
    expect(state.H).toBe(0xff);
  });
});

describe('simulator: memory timing', () => {
  let state: MachineState;
  beforeEach(() => {
    state = createMachineState(64);
  });

  it('rd is pending in cycle N, observable at start of cycle N+1', () => {
    // Memory: word at MAR=1 (bytes 4..7) = 0xDEADBEEF
    state.memory[4] = 0xde;
    state.memory[5] = 0xad;
    state.memory[6] = 0xbe;
    state.memory[7] = 0xef;
    state.MAR = 1;
    state.MDR = 0;
    state.controlStore = [
      uinstr({
        alu: ALU_ZERO,
        mem: { read: true, write: false, fetch: false },
        nextAddress: 1,
      }),
      uinstr({ alu: ALU_ZERO }),
    ];

    const t1 = step(state);
    expect(t1.memoryOpsIssued).toEqual(['read']);
    expect(state.MDR).toBe(0); // not yet visible

    const t2 = step(state);
    expect(t2.memoryOpsCompleted).toHaveLength(1);
    expect(t2.memoryOpsCompleted[0]).toMatchObject({ op: 'read', value: 0xdeadbeef | 0 });
    expect(state.MDR).toBe(0xdeadbeef | 0);
  });

  it('wr stores MDR to memory[MAR*4..+3] big-endian', () => {
    state.MAR = 2;
    state.MDR = 0x12345678;
    state.controlStore = [
      uinstr({
        alu: ALU_ZERO,
        mem: { read: false, write: true, fetch: false },
        nextAddress: 1,
      }),
      uinstr({ alu: ALU_ZERO }),
    ];
    step(state);
    step(state);
    expect(state.memory[8]).toBe(0x12);
    expect(state.memory[9]).toBe(0x34);
    expect(state.memory[10]).toBe(0x56);
    expect(state.memory[11]).toBe(0x78);
  });

  it('fetch reads byte at PC into MBR (delayed one cycle)', () => {
    state.memory[3] = 0xc4;
    state.PC = 3;
    state.controlStore = [
      uinstr({
        alu: ALU_ZERO,
        mem: { read: false, write: false, fetch: true },
        nextAddress: 1,
      }),
      uinstr({ alu: ALU_ZERO }),
    ];
    step(state);
    expect(state.MBR).toBe(0); // not yet
    step(state);
    expect(state.MBR).toBe(0xc4);
  });

  it('out-of-bounds read halts with error', () => {
    state.MAR = 1000; // way out
    state.controlStore = [
      uinstr({
        alu: ALU_ZERO,
        mem: { read: true, write: false, fetch: false },
        nextAddress: 1,
      }),
      uinstr({ alu: ALU_ZERO }),
    ];
    step(state);
    step(state);
    expect(state.halted).toBe(true);
    expect(state.error).toMatch(/Out-of-bounds memory read/);
  });
});

describe('simulator: JAM logic', () => {
  let state: MachineState;
  function csOfLength(n: number): Microinstruction[] {
    return Array.from({ length: n }, () => uinstr({ alu: ALU_ZERO }));
  }
  beforeEach(() => {
    state = createMachineState(64);
  });

  it('plain goto sets MPC to nextAddress', () => {
    const cs = csOfLength(16);
    cs[0] = uinstr({ alu: ALU_ZERO, nextAddress: 7 });
    state.controlStore = cs;
    step(state);
    expect(state.MPC).toBe(7);
  });

  it('JAMN ORs bit 8 into MPC when N is set', () => {
    state.MDR = -1;
    const cs = csOfLength(0x200);
    cs[0] = uinstr({
      alu: ALU_PASS_B,
      bBus: 'MDR',
      cBus: new Set(['H']),
      jam: { JMPC: false, JAMN: true, JAMZ: false },
      nextAddress: 0x010,
    });
    state.controlStore = cs;
    step(state);
    expect(state.MPC).toBe(0x110);
  });

  it('JAMN does not set bit 8 when N is clear', () => {
    state.MDR = 1;
    const cs = csOfLength(0x200);
    cs[0] = uinstr({
      alu: ALU_PASS_B,
      bBus: 'MDR',
      cBus: new Set(['H']),
      jam: { JMPC: false, JAMN: true, JAMZ: false },
      nextAddress: 0x010,
    });
    state.controlStore = cs;
    step(state);
    expect(state.MPC).toBe(0x010);
  });

  it('JAMZ ORs bit 8 into MPC when Z is set', () => {
    const cs = csOfLength(0x200);
    cs[0] = uinstr({
      alu: ALU_ZERO,
      jam: { JMPC: false, JAMN: false, JAMZ: true },
      nextAddress: 0x020,
    });
    state.controlStore = cs;
    step(state);
    expect(state.MPC).toBe(0x120);
  });

  it('JMPC ORs MBR low 8 bits into nextAddress', () => {
    state.MBR = 0x37;
    const cs = csOfLength(0x200);
    cs[0] = uinstr({
      alu: ALU_ZERO,
      jam: { JMPC: true, JAMN: false, JAMZ: false },
      nextAddress: 0x100,
    });
    state.controlStore = cs;
    step(state);
    expect(state.MPC).toBe(0x137);
  });
});

describe('simulator: error states', () => {
  it('throws if MPC points past the control store', () => {
    const state = createMachineState(64);
    state.controlStore = [];
    expect(() => step(state)).toThrow(/No microinstruction/);
    expect(state.halted).toBe(true);
  });

  it('refuses to step a halted machine', () => {
    const state = createMachineState(64);
    state.halted = true;
    expect(() => step(state)).toThrow(/halted/i);
  });
});

describe('simulator: snapshotMachineState', () => {
  it('deep-copies memory and console buffers (independent of original)', () => {
    const original = createMachineState(64);
    original.memory[0] = 0x42;
    original.consoleInputBuffer.push(0x41);
    original.consoleOutputBuffer.push(0x42);
    original.PC = 7;
    original.waitingForInput = true;

    const snap = snapshotMachineState(original);
    // Mutate the original; the snapshot should be unaffected.
    original.memory[0] = 0x00;
    original.consoleInputBuffer.push(0x99);
    original.consoleOutputBuffer.push(0x99);
    original.PC = 0;
    original.waitingForInput = false;

    expect(snap.memory[0]).toBe(0x42);
    expect(snap.consoleInputBuffer).toEqual([0x41]);
    expect(snap.consoleOutputBuffer).toEqual([0x42]);
    expect(snap.PC).toBe(7);
    expect(snap.waitingForInput).toBe(true);
  });
});

describe('simulator: memory-mapped I/O', () => {
  it('rd at MAR=-1 drains a byte from consoleInputBuffer into MDR', () => {
    const state = createMachineState(64);
    // One-instruction program: rd at MAR=-1; we set up the pending read
    // directly to exercise completePendingMemoryOps.
    state.controlStore = [uinstr({ nextAddress: 0 })];
    state.MAR = -1;
    state.pendingMAR = -1;
    state.pendingRead = true;
    state.consoleInputBuffer.push(0xab);
    step(state);
    expect(state.MDR).toBe(0xab);
    expect(state.consoleInputBuffer.length).toBe(0);
    expect(state.waitingForInput).toBe(false);
  });

  it('rd at MAR=-1 with empty buffer stalls (waitingForInput=true, MPC unchanged)', () => {
    const state = createMachineState(64);
    state.controlStore = [
      uinstr({ nextAddress: 0x42 }),
      // 0x42 unused — the stall should keep MPC at 0.
    ];
    state.controlStore = [...state.controlStore, ...new Array(0x60).fill(uinstr())];
    state.MAR = -1;
    state.pendingMAR = -1;
    state.pendingRead = true;
    const trace = step(state);
    expect(state.waitingForInput).toBe(true);
    expect(state.pendingRead).toBe(true); // still pending — will retry
    expect(trace.mpcAfter).toBe(trace.mpcBefore); // no advance
  });

  it('wr at MAR=-1 appends MDR\'s low byte to consoleOutputBuffer', () => {
    const state = createMachineState(64);
    state.controlStore = [uinstr({ nextAddress: 0 })];
    state.pendingMAR = -1;
    state.pendingMDR = 0x12345678;
    state.pendingWrite = true;
    step(state);
    expect(state.consoleOutputBuffer).toEqual([0x78]);
  });
});
