import { createMachineState } from '../engine/simulator';
import type { MachineState } from '../engine/types';
import { assembleMicrocode, type AssembleResult } from '../engine/mal';
import { assembleIJVM, type IJVMAssembleResult } from '../engine/ijvm';

export const DEFAULT_MEMORY_SIZE = 64 * 1024; // 64 KiB
export const DEFAULT_STACK_BASE_WORD = 0x100; // first push lands here

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

  // Pre-fetch the first opcode for Main1's dispatch.
  machine.PC = 0;
  machine.MBR = machine.memory[0] ?? 0;
  machine.SP = DEFAULT_STACK_BASE_WORD - 1;
  machine.MPC = 0;

  return { machine, microAssembly, ijvmAssembly };
}
