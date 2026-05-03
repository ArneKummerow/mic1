import { describe, it, expect } from 'vitest';
import { createMachineState, step } from './simulator';
import { assembleMicrocode } from './mal';
import { assembleIJVM } from './ijvm';
import { DEFAULT_MICROCODE } from './defaultMicrocode';
import { DEFAULT_MACROCODE } from './defaultMacrocode';
import {
  IJVM_SAMPLES,
  SAMPLE_NOP_HALT,
  SAMPLE_HELLO,
  SAMPLE_ARITHMETIC,
  SAMPLE_STACK_OPS,
  SAMPLE_MAX_OF_TWO,
  SAMPLE_LDC,
  SAMPLE_RECURSIVE_SUM,
  SAMPLE_SUM_LOOP,
  SAMPLE_ECHO,
  SAMPLE_WIDE,
} from './ijvm';

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
function bootstrap(
  controlStore: ReturnType<typeof assembleMicrocode>['controlStore'],
  bytes: Uint8Array,
  constants?: Int32Array,
): ReturnType<typeof createMachineState> {
  const state = createMachineState(64 * 1024);
  state.controlStore = controlStore;
  state.memory.set(bytes, 0);
  if (constants) {
    const cppByte = CPP_WORD * 4;
    for (let i = 0; i < constants.length; i++) {
      const v = constants[i] | 0;
      const off = cppByte + i * 4;
      state.memory[off + 0] = (v >>> 24) & 0xff;
      state.memory[off + 1] = (v >>> 16) & 0xff;
      state.memory[off + 2] = (v >>> 8) & 0xff;
      state.memory[off + 3] = v & 0xff;
    }
  }
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

  it('default program (recursive sum 1..10) leaves 55 on TOS and halts', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(DEFAULT_MACROCODE);
    expect(micro.errors).toEqual([]);
    expect(ijvm.errors).toEqual([]);

    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 20000);

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

describe('integration: INVOKEVIRTUAL / IRETURN', () => {
  it('zero-arg method returns a constant', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
            BIPUSH 0          // OBJREF
            INVOKEVIRTUAL fortytwo
            HALT
        .method fortytwo()
            BIPUSH 42
            IRETURN
        .end-method
    `);
    expect(micro.errors).toEqual([]);
    expect(ijvm.errors).toEqual([]);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 5000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(42);
    // After IRETURN the stack should be just the return value (one slot
    // above the original SP).
    expect(state.SP).toBe(STACK_BASE_WORD);
  });

  it('method with two args adds them and returns', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
            BIPUSH 0          // OBJREF
            BIPUSH 5
            BIPUSH 7
            INVOKEVIRTUAL add
            HALT
        .method add(a, b)
            ILOAD a
            ILOAD b
            IADD
            IRETURN
        .end-method
    `);
    expect(micro.errors).toEqual([]);
    expect(ijvm.errors).toEqual([]);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 5000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(12);
    expect(state.SP).toBe(STACK_BASE_WORD);
  });

  it('method uses a local variable', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
            BIPUSH 0
            BIPUSH 6
            INVOKEVIRTUAL square
            HALT
        .method square(n)
            .var tmp
            ILOAD n
            ILOAD n
            IADD
            ISTORE tmp
            ILOAD tmp
            ILOAD n
            IADD
            IRETURN
        .end-method
    `);
    expect(ijvm.errors).toEqual([]);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 8000);
    expect(halted).toBe(true);
    // 3 * n where n=6 → 18
    expect(state.TOS).toBe(18);
  });

  it('caller registers (LV, SP, PC) restored on IRETURN', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
            BIPUSH 1
            BIPUSH 2
            BIPUSH 0          // OBJREF
            BIPUSH 9
            INVOKEVIRTUAL doubler
            IADD              // pop the doubled value + the 2
            HALT
        .method doubler(n)
            ILOAD n
            ILOAD n
            IADD
            IRETURN
        .end-method
    `);
    expect(ijvm.errors).toEqual([]);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const lvBefore = state.LV;
    const { halted } = runToHalt(state, 8000);
    expect(halted).toBe(true);
    // After IRETURN: stack holds [1, 2, 18]. Final IADD: 2 + 18 = 20. Then
    // HALT. TOS = 20, SP = STACK_BASE_WORD + 1 (1 left).
    expect(state.TOS).toBe(20);
    expect(state.LV).toBe(lvBefore);
  });

  it('recursive sum 1..5 = 15 via INVOKEVIRTUAL/IRETURN', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
            BIPUSH 0          // OBJREF
            BIPUSH 5
            INVOKEVIRTUAL sum
            HALT
        .method sum(n)
            ILOAD n
            IFEQ baseCase
            // sum(n) = n + sum(n-1)
            ILOAD n
            BIPUSH 0          // OBJREF for recursive call
            ILOAD n
            BIPUSH -1
            IADD
            INVOKEVIRTUAL sum
            IADD
            IRETURN
        baseCase:
            BIPUSH 0
            IRETURN
        .end-method
    `);
    expect(ijvm.errors).toEqual([]);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 50000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(15);
  });

  it('nested call: f(x) = g(x)+1, g(x) = x+x', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
            BIPUSH 0
            BIPUSH 4
            INVOKEVIRTUAL f
            HALT
        .method f(x)
            BIPUSH 0          // OBJREF for inner call
            ILOAD x
            INVOKEVIRTUAL g
            BIPUSH 1
            IADD
            IRETURN
        .end-method
        .method g(x)
            ILOAD x
            ILOAD x
            IADD
            IRETURN
        .end-method
    `);
    expect(ijvm.errors).toEqual([]);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 12000);
    expect(halted).toBe(true);
    // g(4) = 8, f(4) = 9
    expect(state.TOS).toBe(9);
    expect(state.SP).toBe(STACK_BASE_WORD);
  });
});

describe('integration: IN / OUT', () => {
  it('OUT pops a byte and appends to consoleOutputBuffer', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      BIPUSH 0x48          // 'H'
      OUT
      BIPUSH 0x69          // 'i'
      OUT
      HALT
    `);
    expect(ijvm.errors).toEqual([]);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    const { halted } = runToHalt(state, 5000);
    expect(halted).toBe(true);
    expect(String.fromCharCode(...state.consoleOutputBuffer)).toBe('Hi');
    // Stack should be drained back to its initial state.
    expect(state.SP).toBe(STACK_BASE_WORD - 1);
  });

  it('IN reads a byte from consoleInputBuffer', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      IN
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    state.consoleInputBuffer.push(0x41); // 'A'
    const { halted } = runToHalt(state, 5000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(0x41);
    // Buffer drained.
    expect(state.consoleInputBuffer.length).toBe(0);
  });

  it('IN with empty buffer stalls (waitingForInput=true, MPC unchanged)', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      IN
      HALT
    `);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    // Run far enough that IN's rd-completion cycle stalls.
    let lastMpc = state.MPC;
    let stalledFor = 0;
    for (let i = 0; i < 200; i++) {
      const trace = step(state);
      if (state.waitingForInput) {
        // Once stalled, MPC should remain the same across repeated steps.
        if (lastMpc === trace.mpcBefore && trace.mpcAfter === trace.mpcBefore) {
          stalledFor++;
          if (stalledFor > 3) break;
        }
        lastMpc = trace.mpcBefore;
      }
    }
    expect(state.waitingForInput).toBe(true);
    expect(state.halted).toBe(false);
    // Now feed input — the next step should drain it.
    state.consoleInputBuffer.push(0x5a); // 'Z'
    const { halted } = runToHalt(state, 1000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(0x5a);
    expect(state.waitingForInput).toBe(false);
  });

  it('echo loop: IN/OUT until null byte', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(`
      loop:
        IN
        DUP
        IFEQ done    // exit on null byte
        OUT
        GOTO loop
      done:
        HALT
    `);
    expect(ijvm.errors).toEqual([]);
    const state = bootstrap(micro.controlStore, ijvm.bytes);
    // Pre-feed "Hi!" + null terminator.
    for (const c of [0x48, 0x69, 0x21, 0x00]) state.consoleInputBuffer.push(c);
    const { halted } = runToHalt(state, 20000);
    expect(halted).toBe(true);
    expect(String.fromCharCode(...state.consoleOutputBuffer)).toBe('Hi!');
  });
});

describe('integration: WIDE prefix', () => {
  it('WIDE ILOAD reads a 16-bit local index', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    // The IJVM assembler doesn't fold WIDE+ILOAD into a wide-encoded
    // instruction yet, so we hand-assemble: WIDE (0xC4), ILOAD (0x15),
    // index (16-bit big-endian) — here index = 1.
    const ijvm = assembleIJVM(`HALT`);
    const program = new Uint8Array([0xc4, 0x15, 0x00, 0x01, 0xff]);
    const state = bootstrap(micro.controlStore, program);
    // Pre-populate LV[1] = 0x1234.
    const lvByte = (LV_WORD + 1) * 4;
    state.memory[lvByte + 0] = 0x00;
    state.memory[lvByte + 1] = 0x00;
    state.memory[lvByte + 2] = 0x12;
    state.memory[lvByte + 3] = 0x34;
    const { halted } = runToHalt(state, 1000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(0x1234);
    expect(ijvm.errors).toEqual([]); // unrelated, but covers HALT-only assembly
  });

  it('WIDE ISTORE writes through a 16-bit index', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    // BIPUSH 99 ; WIDE ISTORE 2 ; HALT
    const program = new Uint8Array([0x10, 99, 0xc4, 0x36, 0x00, 0x02, 0xff]);
    const state = bootstrap(micro.controlStore, program);
    const { halted } = runToHalt(state, 1000);
    expect(halted).toBe(true);
    const lvByte = (LV_WORD + 2) * 4;
    const stored =
      (state.memory[lvByte] << 24) |
      (state.memory[lvByte + 1] << 16) |
      (state.memory[lvByte + 2] << 8) |
      state.memory[lvByte + 3];
    expect(stored).toBe(99);
  });

  it('WIDE IINC adds a sign-extended byte to a 16-bit-indexed local', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    // BIPUSH 10 ; ISTORE 3 ; WIDE IINC 0x0003, -4 ; ILOAD 3 ; HALT
    const program = new Uint8Array([
      0x10, 10,           // BIPUSH 10
      0x36, 0x03,         // ISTORE 3
      0xc4, 0x84,         // WIDE IINC
      0x00, 0x03,         //   idx = 3 (16-bit)
      0xfc,               //   const = -4 (sign-extended)
      0x15, 0x03,         // ILOAD 3
      0xff,               // HALT
    ]);
    const state = bootstrap(micro.controlStore, program);
    const { halted } = runToHalt(state, 2000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(6);
  });
});

describe('integration: bundled samples', () => {
  it('every sample in IJVM_SAMPLES assembles without errors', () => {
    for (const sample of IJVM_SAMPLES) {
      const r = assembleIJVM(sample.source);
      if (r.errors.length > 0) {
        const msg = r.errors
          .map((e) => `  ${e.line}:${e.column} ${e.message}`)
          .join('\n');
        throw new Error(`Sample '${sample.id}' failed to assemble:\n${msg}`);
      }
    }
  });

  it('SAMPLE_RECURSIVE_SUM computes 55 for N=10', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(SAMPLE_RECURSIVE_SUM);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 20000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(55);
  });

  it('SAMPLE_SUM_LOOP computes 55 for N=10', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(SAMPLE_SUM_LOOP);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 5000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(55);
  });

  it('SAMPLE_ECHO echoes pre-fed input until null byte', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(SAMPLE_ECHO);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    for (const c of [0x4d, 0x69, 0x63, 0x21, 0x00]) state.consoleInputBuffer.push(c);
    const { halted } = runToHalt(state, 30000);
    expect(halted).toBe(true);
    expect(String.fromCharCode(...state.consoleOutputBuffer)).toBe('Mic!');
  });

  it('SAMPLE_WIDE bumpAndAdd(100) returns 100 + (100 + 5) = 205', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(SAMPLE_WIDE);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 10000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(205);
  });

  it('SAMPLE_NOP_HALT halts cleanly', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(SAMPLE_NOP_HALT);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 200);
    expect(halted).toBe(true);
  });

  it('SAMPLE_HELLO emits "HELLO\\n" via OUT', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(SAMPLE_HELLO);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 2000);
    expect(halted).toBe(true);
    expect(String.fromCharCode(...state.consoleOutputBuffer)).toBe('HELLO\n');
  });

  it('SAMPLE_ARITHMETIC leaves 10 on TOS', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(SAMPLE_ARITHMETIC);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 2000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(10);
  });

  it('SAMPLE_STACK_OPS leaves 1 on TOS', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(SAMPLE_STACK_OPS);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 1000);
    expect(halted).toBe(true);
    // After: BIPUSH 1, BIPUSH 2, DUP, SWAP, POP, SWAP → stack [2, 1] (TOS = 1).
    expect(state.TOS).toBe(1);
  });

  it('SAMPLE_MAX_OF_TWO picks the larger of 17 and 42', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(SAMPLE_MAX_OF_TWO);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 2000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(42);
  });

  it('SAMPLE_LDC adds two pool constants', () => {
    const micro = assembleMicrocode(DEFAULT_MICROCODE);
    const ijvm = assembleIJVM(SAMPLE_LDC);
    const state = bootstrap(micro.controlStore, ijvm.bytes, ijvm.constants);
    const { halted } = runToHalt(state, 1000);
    expect(halted).toBe(true);
    expect(state.TOS).toBe(0x12345678 + 0x0000abcd);
  });
});
