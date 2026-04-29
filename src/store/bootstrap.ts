import { createMachineState } from '../engine/simulator';
import type { MachineState } from '../engine/types';
import { assembleMicrocode, type AssembleResult } from '../engine/mal';
import { assembleIJVM, type IJVMAssembleResult } from '../engine/ijvm';

export const DEFAULT_MEMORY_SIZE = 64 * 1024; // 64 KiB

/**
 * Memory layout the default microprogram + sample expect:
 *
 *   bytes 0x000..0x1FF   method area (IJVM bytecode + method prologues)
 *   word  0x80..0xBF     constant pool (64 slots) ← CPP
 *   word  0xC0..0xFF     local-variable frame (64 slots) ← LV
 *   word  0x100..        operand stack (grows up) ← SP starts here
 *
 * `LV`, `CPP`, and `SP` are word indices — the engine multiplies by 4 for
 * byte addressing on `rd`/`wr`. The constant pool sits between the method
 * area and the local-variable frame; constants declared by the IJVM
 * assembler's `.constant`/`.method` directives are written there at
 * bootstrap time.
 */
export const DEFAULT_LV_WORD = 0xc0;
export const DEFAULT_STACK_BASE_WORD = 0x100; // first push lands here
export const DEFAULT_CPP_WORD = 0x80;

export interface BootstrapResult {
  machine: MachineState;
  microAssembly: AssembleResult;
  ijvmAssembly: IJVMAssembleResult;
}

/**
 * Build a fresh `MachineState` with the given source code assembled and
 * loaded. The machine is positioned at `MPC=0` (Main1) with the first
 * opcode pre-fetched into MBR (per the microprogram convention).
 *
 * If either assembly produces errors, the machine is still returned but its
 * control store / memory may be partially populated — useful for letting
 * the UI display the errors without crashing.
 */
export function bootstrap(microcode: string, macrocode: string): BootstrapResult {
  const microAssembly = assembleMicrocode(microcode);
  const ijvmAssembly = assembleIJVM(macrocode);

  const machine = createMachineState(DEFAULT_MEMORY_SIZE);
  machine.controlStore = microAssembly.controlStore;
  machine.memory.set(ijvmAssembly.bytes, 0);

  // Write the constant pool, big-endian per word, starting at CPP*4.
  const cppByte = DEFAULT_CPP_WORD * 4;
  for (let i = 0; i < ijvmAssembly.constants.length; i++) {
    const v = ijvmAssembly.constants[i] | 0;
    const off = cppByte + i * 4;
    if (off + 3 >= machine.memory.length) break;
    machine.memory[off + 0] = (v >>> 24) & 0xff;
    machine.memory[off + 1] = (v >>> 16) & 0xff;
    machine.memory[off + 2] = (v >>> 8) & 0xff;
    machine.memory[off + 3] = v & 0xff;
  }

  // Pre-fetch the first opcode for Main1's dispatch.
  machine.PC = 0;
  machine.MBR = machine.memory[0] ?? 0;
  machine.SP = DEFAULT_STACK_BASE_WORD - 1;
  machine.LV = DEFAULT_LV_WORD;
  machine.CPP = DEFAULT_CPP_WORD;
  machine.MPC = 0;

  return { machine, microAssembly, ijvmAssembly };
}
