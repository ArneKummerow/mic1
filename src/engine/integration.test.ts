import { describe, it, expect } from 'vitest';
import { createMachineState, step } from './simulator';
import { assembleMicrocode } from './mal';
import { assembleIJVM } from './ijvm';
import { DEFAULT_MICROCODE } from './defaultMicrocode';
import { DEFAULT_MACROCODE } from './defaultMacrocode';

const STACK_BASE_WORD = 0x100; // word index where pushed values land first

/**
 * Bootstraps a MachineState ready to run the assembled IJVM bytecode at
 * memory address 0:
 *   - copies bytecode to memory
 *   - pre-fetches the first opcode into MBR (Main1's invariant)
 *   - sets PC, SP to sensible initial values
 *   - sets MPC to Main1
 */
function bootstrap(controlStore: ReturnType<typeof assembleMicrocode>['controlStore'], bytes: Uint8Array): ReturnType<typeof createMachineState> {
  const state = createMachineState(64 * 1024);
  state.controlStore = controlStore;
  state.memory.set(bytes, 0);
  state.PC = 0;
  state.MBR = state.memory[0];
  state.SP = STACK_BASE_WORD - 1;
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
    expect([...r.bytes]).toEqual([0x10, 5, 0x10, 7, 0x60, 0xff]);
  });

  it('5 + 7 leaves 12 on TOS and halts', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(DEFAULT_MACROCODE);
    expect(micro.errors).toEqual([]);
    expect(ijvm.errors).toEqual([]);

    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state);

    expect(halted).toBe(true);
    expect(state.TOS).toBe(12);
    expect(state.SP).toBe(STACK_BASE_WORD); // one word pushed (5+7=12)
    // The HALT byte is at PC=5 in the bytecode and MBR holds it.
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
});
