import {
  type AluControl,
  type BBusSource,
  type CompletedMemoryOp,
  type MachineState,
  type MemoryOp,
  type Microinstruction,
  type MicroTrace,
  type ShifterOp,
  type WritableRegister,
} from './types';

const DEFAULT_MEMORY_SIZE = 4 * 1024 * 1024; // 4 MiB

/** Allocate a fresh, all-zero machine state. */
export function createMachineState(memorySize: number = DEFAULT_MEMORY_SIZE): MachineState {
  return {
    MAR: 0,
    MDR: 0,
    PC: 0,
    MBR: 0,
    SP: 0,
    LV: 0,
    CPP: 0,
    TOS: 0,
    OPC: 0,
    H: 0,
    MPC: 0,
    memory: new Uint8Array(memorySize),
    controlStore: [],
    pendingRead: false,
    pendingWrite: false,
    pendingFetch: false,
    pendingMAR: 0,
    pendingMDR: 0,
    pendingPC: 0,
    halted: false,
    error: null,
  };
}

/**
 * Deep-copy a machine state, including memory. Use this to snapshot for a
 * step-back history; never use it inside `step` itself (memory is multi-MiB).
 */
export function snapshotMachineState(state: MachineState): MachineState {
  return {
    ...state,
    memory: new Uint8Array(state.memory),
  };
}

function readBBus(state: MachineState, src: BBusSource): number {
  switch (src) {
    case 'MDR':
      return state.MDR | 0;
    case 'PC':
      return state.PC | 0;
    case 'MBR':
      return ((state.MBR & 0xff) << 24) >> 24; // sign-extend low byte
    case 'MBRU':
      return state.MBR & 0xff;
    case 'SP':
      return state.SP | 0;
    case 'LV':
      return state.LV | 0;
    case 'CPP':
      return state.CPP | 0;
    case 'TOS':
      return state.TOS | 0;
    case 'OPC':
      return state.OPC | 0;
    case 'NONE':
      return 0;
  }
}

function aluCompute(alu: AluControl, A: number, B: number): number {
  let a = alu.ENA ? A | 0 : 0;
  const b = alu.ENB ? B | 0 : 0;
  if (alu.INVA) a = ~a;

  let result: number;
  if (!alu.F0 && !alu.F1) result = a & b;
  else if (!alu.F0 && alu.F1) result = a | b;
  else if (alu.F0 && !alu.F1) result = ~b;
  else result = (a + b) | 0;

  if (alu.INC) result = (result + 1) | 0;
  return result | 0;
}

function applyShifter(shifter: ShifterOp, value: number): number {
  switch (shifter) {
    case 'NONE':
      return value | 0;
    case 'SLL8':
      return (value << 8) | 0;
    case 'SRA1':
      return value >> 1;
  }
}

function writeRegister(state: MachineState, reg: WritableRegister, value: number): void {
  const v = value | 0;
  switch (reg) {
    case 'H':
      state.H = v;
      return;
    case 'OPC':
      state.OPC = v;
      return;
    case 'TOS':
      state.TOS = v;
      return;
    case 'CPP':
      state.CPP = v;
      return;
    case 'LV':
      state.LV = v;
      return;
    case 'SP':
      state.SP = v;
      return;
    case 'PC':
      state.PC = v;
      return;
    case 'MDR':
      state.MDR = v;
      return;
    case 'MAR':
      state.MAR = v;
      return;
  }
}

function completePendingMemoryOps(state: MachineState): CompletedMemoryOp[] {
  const completed: CompletedMemoryOp[] = [];
  const memSize = state.memory.length;

  if (state.pendingWrite) {
    const addr = (state.pendingMAR | 0) * 4;
    if (addr < 0 || addr + 3 >= memSize) {
      state.error = `Out-of-bounds memory write at MAR=0x${(state.pendingMAR >>> 0).toString(16)}`;
      state.halted = true;
    } else {
      const v = state.pendingMDR | 0;
      state.memory[addr] = (v >>> 24) & 0xff;
      state.memory[addr + 1] = (v >>> 16) & 0xff;
      state.memory[addr + 2] = (v >>> 8) & 0xff;
      state.memory[addr + 3] = v & 0xff;
      completed.push({ op: 'write', address: addr, value: v });
    }
  }

  if (state.pendingRead) {
    const addr = (state.pendingMAR | 0) * 4;
    if (addr < 0 || addr + 3 >= memSize) {
      state.error = `Out-of-bounds memory read at MAR=0x${(state.pendingMAR >>> 0).toString(16)}`;
      state.halted = true;
    } else {
      const word =
        ((state.memory[addr] << 24) |
          (state.memory[addr + 1] << 16) |
          (state.memory[addr + 2] << 8) |
          state.memory[addr + 3]) |
        0;
      state.MDR = word;
      completed.push({ op: 'read', address: addr, value: word });
    }
  }

  if (state.pendingFetch) {
    const addr = state.pendingPC | 0;
    if (addr < 0 || addr >= memSize) {
      state.error = `Out-of-bounds fetch at PC=0x${(state.pendingPC >>> 0).toString(16)}`;
      state.halted = true;
    } else {
      state.MBR = state.memory[addr];
      completed.push({ op: 'fetch', address: addr, value: state.memory[addr] });
    }
  }

  state.pendingRead = false;
  state.pendingWrite = false;
  state.pendingFetch = false;
  return completed;
}

function computeNextMpc(
  instr: Microinstruction,
  state: MachineState,
  flags: { N: boolean; Z: boolean },
): number {
  let next = instr.nextAddress & 0x1ff;
  if (instr.jam.JMPC) next |= state.MBR & 0xff;
  let bit8 = (next >> 8) & 1;
  if (instr.jam.JAMN && flags.N) bit8 |= 1;
  if (instr.jam.JAMZ && flags.Z) bit8 |= 1;
  return ((next & 0xff) | (bit8 << 8)) & 0x1ff;
}

/**
 * Execute one microcycle. Mutates `state` in place; returns a trace of what
 * happened so the UI can animate it.
 *
 * Step order (matches Tanenbaum's MIC-1 timing):
 *   1. Complete pending memory ops scheduled by the previous microcycle.
 *   2. Read B-bus (selected register) and A-bus (always H).
 *   3. ALU computes; latch N/Z from its output.
 *   4. Shifter operates on the ALU output.
 *   5. C-bus writes the shifter output to the selected register subset.
 *   6. Issue new memory ops (snapshotting MAR/MDR/PC after C-bus updates).
 *   7. Compute next MPC via JAM logic.
 */
export function step(state: MachineState): MicroTrace {
  if (state.halted) {
    throw new Error('Cannot step a halted machine. Reset first.');
  }

  const mpcBefore = state.MPC & 0x1ff;
  const instr = state.controlStore[mpcBefore];
  if (!instr) {
    state.halted = true;
    state.error = `No microinstruction at MPC=0x${mpcBefore.toString(16)}`;
    throw new Error(state.error);
  }

  // 1. Memory ops from the previous cycle.
  const memoryOpsCompleted = completePendingMemoryOps(state);
  if (state.halted) {
    return {
      microinstructionAddress: mpcBefore,
      microinstruction: instr,
      bBusSource: 'NONE',
      bBusValue: 0,
      aBusValue: 0,
      aluOutput: 0,
      aluFlags: { N: false, Z: true },
      shifterOutput: 0,
      cBusTargets: [],
      cBusValue: 0,
      memoryOpsIssued: [],
      memoryOpsCompleted,
      mpcBefore,
      mpcAfter: mpcBefore,
    };
  }

  // 2. Busses.
  const bBusValue = readBBus(state, instr.bBus);
  const aBusValue = state.H | 0;

  // 3. ALU + flags.
  const aluOutput = aluCompute(instr.alu, aBusValue, bBusValue);
  const N = aluOutput < 0;
  const Z = aluOutput === 0;

  // 4. Shifter.
  const shifterOutput = applyShifter(instr.shifter, aluOutput);

  // 5. C-bus writes.
  const cBusTargets: WritableRegister[] = [];
  for (const reg of instr.cBus) {
    writeRegister(state, reg, shifterOutput);
    cBusTargets.push(reg);
  }

  // 6. Issue memory ops, latching MAR/MDR/PC after C-bus updates.
  const memoryOpsIssued: MemoryOp[] = [];
  if (instr.mem.read || instr.mem.write) {
    state.pendingMAR = state.MAR | 0;
    state.pendingMDR = state.MDR | 0;
  }
  if (instr.mem.fetch) {
    state.pendingPC = state.PC | 0;
  }
  if (instr.mem.read) {
    state.pendingRead = true;
    memoryOpsIssued.push('read');
  }
  if (instr.mem.write) {
    state.pendingWrite = true;
    memoryOpsIssued.push('write');
  }
  if (instr.mem.fetch) {
    state.pendingFetch = true;
    memoryOpsIssued.push('fetch');
  }

  // 7. Next MPC.
  const mpcAfter = computeNextMpc(instr, state, { N, Z });
  state.MPC = mpcAfter;

  return {
    microinstructionAddress: mpcBefore,
    microinstruction: instr,
    bBusSource: instr.bBus,
    bBusValue,
    aBusValue,
    aluOutput,
    aluFlags: { N, Z },
    shifterOutput,
    cBusTargets,
    cBusValue: shifterOutput | 0,
    memoryOpsIssued,
    memoryOpsCompleted,
    mpcBefore,
    mpcAfter,
  };
}
