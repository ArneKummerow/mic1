import { describe, it, expect } from 'vitest';
import { createMachineState, step } from './simulator';
import { assembleMicrocode } from './mal';
import { assembleIJVM } from './ijvm';
import { DEFAULT_MICROCODE } from './defaultMicrocode';
import { DEFAULT_MACROCODE } from './defaultMacrocode';

const STACK_BASE_WORD = 0x100; // word index where pushed values land first
const LV_WORD = 0xc0; // local-variable frame base (clear of the method area)
const CPP_WORD = 0x80;

/**
 * Bootstraps a MachineState ready to run the assembled IJVM bytecode at
 * memory address 0:
 *   - copies bytecode to memory
 *   - pre-fetches the first opcode into MBR (Main1's invariant)
 *   - sets PC, SP, LV, CPP to sensible initial values
 *   - sets MPC to Main1
 */
function bootstrap(controlStore: ReturnType<typeof assembleMicrocode>['controlStore'], bytes: Uint8Array): ReturnType<typeof createMachineState> {
  const state = createMachineState(64 * 1024);
  state.controlStore = controlStore;
  state.memory.set(bytes, 0);
  state.PC = 0;
  state.MBR = state.memory[0];
  state.SP = STACK_BASE_WORD - 1;
  state.LV = LV_WORD;
  state.CPP = CPP_WORD;
  state.MPC = 0;
  return state;
}

/** Run until halted (self-loop) or step cap reached. */
function runToHalt(state: ReturnType<typeof createMachineState>, maxSteps = 1000): { steps: number; halted: boolean } {
  for (let i = 0; i < maxSteps; i++) {
    const trace = step(state);
    if (trace.mpcAfter === trace.mpcBefore) {
      // Run one more cycle so the pending memory ops from the cycle that
      // entered the halt loop actually commit. Then we're safely halted.
      step(state);
      return { steps: i + 2, halted: true };
    }
    if (state.halted) return { steps: i + 1, halted: true };
  }
  return { steps: maxSteps, halted: false };
}

describe('integration: full pipeline', () => {
  it('default microprogram assembles without errors', () => {
    const r = assembleMicrocode(DEFAULT_MICROCODE);
    expect(r.errors).toEqual([]);
    expect(r.controlStore[0]).toBeDefined(); // Main1
    expect(r.controlStore[0x010]).toBeDefined(); // bipush1
    expect(r.controlStore[0x060]).toBeDefined(); // iadd1
    expect(r.controlStore[0x0ff]).toBeDefined(); // halt1
  });

  it('default macroprogram assembles without errors', () => {
    const r = assembleIJVM(DEFAULT_MACROCODE);
    expect(r.errors).toEqual([]);
  });

  it('default program (sum 1..10) leaves 55 on TOS and halts', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(DEFAULT_MACROCODE);
    expect(micro.errors).toEqual([]);
    expect(ijvm.errors).toEqual([]);

    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state, 5000);

    expect(halted).toBe(true);
    expect(state.TOS).toBe(55);
    expect(state.MBR).toBe(0xff);
  });

  it('5 + 7 leaves 12 on TOS and halts', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      BIPUSH 5
      BIPUSH 7
      IADD
      HALT
    `);
    expect(micro.errors).toEqual([]);
    expect(ijvm.errors).toEqual([]);

    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);

    expect(halted).toBe(true);
    expect(state.TOS).toBe(12);
    expect(state.SP).toBe(STACK_BASE_WORD); // one word pushed (5+7=12)
    expect(state.MBR).toBe(0xff);
  });

  it('chained adds: 1 + 2 + 3 = 6', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      BIPUSH 1
      BIPUSH 2
      IADD
      BIPUSH 3
      IADD
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(6);
    expect(state.SP).toBe(STACK_BASE_WORD);
  });

  it('subtraction: 20 − 7 = 13', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      BIPUSH 20
      BIPUSH 7
      ISUB
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(13);
  });

  it('DUP duplicates the top word', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      BIPUSH 42
      DUP
      IADD
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(84);
  });

  it('POP discards the top', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      BIPUSH 1
      BIPUSH 99
      POP
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(1);
    expect(state.SP).toBe(STACK_BASE_WORD); // one word remaining
  });

  it('IAND and IOR', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      BIPUSH 0x0F
      BIPUSH 0x33
      IAND
      BIPUSH 0x40
      IOR
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    // 0x0F AND 0x33 = 0x03 ; 0x03 OR 0x40 = 0x43
    expect(state.TOS).toBe(0x43);
  });

  it('ILOAD reads a local variable', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      ILOAD 1
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    // Pre-populate LV[1] = 42 (word index LV+1 → byte LV*4+4).
    const lvByte = (LV_WORD + 1) * 4;
    state.memory[lvByte + 0] = 0;
    state.memory[lvByte + 1] = 0;
    state.memory[lvByte + 2] = 0;
    state.memory[lvByte + 3] = 42;
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(42);
  });

  it('ISTORE writes the popped TOS into a local variable', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      BIPUSH 99
      ISTORE 3
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    // SP should be back to its initial value after BIPUSH (push) + ISTORE (pop).
    expect(state.SP).toBe(STACK_BASE_WORD - 1);
    const lvByte = (LV_WORD + 3) * 4;
    const stored =
      (state.memory[lvByte] << 24) |
      (state.memory[lvByte + 1] << 16) |
      (state.memory[lvByte + 2] << 8) |
      state.memory[lvByte + 3];
    expect(stored).toBe(99);
  });

  it('IINC increments a local variable in place', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      BIPUSH 10
      ISTORE 1
      IINC 1, 5
      ILOAD 1
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(15);
  });

  it('IINC handles a negative constant (sign-extended byte)', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      BIPUSH 7
      ISTORE 1
      IINC 1, -3
      ILOAD 1
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(4);
  });

  it('GOTO branches forward over an unreachable instruction', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
        GOTO skip
        BIPUSH 99
      skip:
        BIPUSH 7
        HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(7);
    expect(state.SP).toBe(STACK_BASE_WORD);
  });

  it('IFEQ branches when the popped value is zero, falls through otherwise', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    // Branch case: push 0, IFEQ should branch.
    {
      const ijvm = assembleIJVM(`
          BIPUSH 0
          IFEQ taken
          BIPUSH 99
          HALT
        taken:
          BIPUSH 7
          HALT
      `);
      const state = bootstrap(micro.controlStore, ijvm.bytes);
      const { halted } = runToHalt(state);
      expect(halted).toBe(true);
      expect(state.TOS).toBe(7);
    }
    // Fall-through: push 1, IFEQ should not branch.
    {
      const ijvm = assembleIJVM(`
          BIPUSH 1
          IFEQ taken
          BIPUSH 99
          HALT
        taken:
          BIPUSH 7
          HALT
      `);
      const state = bootstrap(micro.controlStore, ijvm.bytes);
      const { halted } = runToHalt(state);
      expect(halted).toBe(true);
      expect(state.TOS).toBe(99);
    }
  });

  it('IFLT branches when the popped value is negative', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    {
      // Negative: branch.
      const ijvm = assembleIJVM(`
          BIPUSH -5
          IFLT taken
          BIPUSH 99
          HALT
        taken:
          BIPUSH 7
          HALT
      `);
      const state = bootstrap(micro.controlStore, ijvm.bytes);
      const { halted } = runToHalt(state);
      expect(halted).toBe(true);
      expect(state.TOS).toBe(7);
    }
    {
      // Zero: do not branch.
      const ijvm = assembleIJVM(`
          BIPUSH 0
          IFLT taken
          BIPUSH 99
          HALT
        taken:
          BIPUSH 7
          HALT
      `);
      const state = bootstrap(micro.controlStore, ijvm.bytes);
      const { halted } = runToHalt(state);
      expect(halted).toBe(true);
      expect(state.TOS).toBe(99);
    }
  });

  it('IF_ICMPEQ branches when the top two stack values are equal', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    // Equal: branch.
    {
      const ijvm = assembleIJVM(`
          BIPUSH 5
          BIPUSH 5
          IF_ICMPEQ taken
          BIPUSH 99
          HALT
        taken:
          BIPUSH 7
          HALT
      `);
      const state = bootstrap(micro.controlStore, ijvm.bytes);
      const { halted } = runToHalt(state);
      expect(halted).toBe(true);
      expect(state.TOS).toBe(7);
    }
    // Unequal: fall through.
    {
      const ijvm = assembleIJVM(`
          BIPUSH 5
          BIPUSH 6
          IF_ICMPEQ taken
          BIPUSH 99
          HALT
        taken:
          BIPUSH 7
          HALT
      `);
      const state = bootstrap(micro.controlStore, ijvm.bytes);
      const { halted } = runToHalt(state);
      expect(halted).toBe(true);
      expect(state.TOS).toBe(99);
    }
  });

  it('LDC_W loads a word from the constant pool', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      LDC_W 2
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    // Constant pool entry [2] = 0xCAFE: write 4 bytes at (CPP+2)*4.
    const cpByte = (CPP_WORD + 2) * 4;
    state.memory[cpByte + 0] = 0x00;
    state.memory[cpByte + 1] = 0x00;
    state.memory[cpByte + 2] = 0xca;
    state.memory[cpByte + 3] = 0xfe;
    const { halted } = runToHalt(state);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(0xcafe);
  });

  it('counted loop with ILOAD/ISTORE/IINC/IFEQ/GOTO computes sum 1..5 = 15', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
            BIPUSH 5
            ISTORE 1
            BIPUSH 0
            ISTORE 2
        loop:
            ILOAD 1
            IFEQ done
            ILOAD 2
            ILOAD 1
            IADD
            ISTORE 2
            IINC 1, -1
            GOTO loop
        done:
            ILOAD 2
            HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state, 5000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(15);
  });
});
