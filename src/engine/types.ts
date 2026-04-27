/**
 * Core MIC-1 engine types.
 *
 * All registers are 32-bit two's-complement integers, stored as plain JS
 * numbers and kept in int32 range with `| 0` coercion.
 */

export const REGISTER_NAMES = [
  'MAR',
  'MDR',
  'PC',
  'MBR',
  'SP',
  'LV',
  'CPP',
  'TOS',
  'OPC',
  'H',
] as const;

export type RegisterName = (typeof REGISTER_NAMES)[number];

/** Registers writable from the C-bus. MBR is sourced from memory only. */
export type WritableRegister = Exclude<RegisterName, 'MBR'>;

/**
 * Bit order of the 9 C-bus enable bits in a microinstruction word.
 * Bit 0 (LSB) → H, bit 8 (MSB) → MAR.
 */
export const C_BUS_BIT_ORDER: readonly WritableRegister[] = [
  'H',
  'OPC',
  'TOS',
  'CPP',
  'LV',
  'SP',
  'PC',
  'MDR',
  'MAR',
];

/** Encodings of the B-bus 4-bit selector. NONE produces 0 on the B-bus. */
export type BBusSource =
  | 'MDR'
  | 'PC'
  | 'MBR'
  | 'MBRU'
  | 'SP'
  | 'LV'
  | 'CPP'
  | 'TOS'
  | 'OPC'
  | 'NONE';

export type ShifterOp = 'NONE' | 'SLL8' | 'SRA1';

/** ALU control bits. See docs/MIC1_REFERENCE.md for the truth table. */
export interface AluControl {
  F0: boolean;
  F1: boolean;
  ENA: boolean;
  ENB: boolean;
  INVA: boolean;
  INC: boolean;
}

export interface JamControl {
  JMPC: boolean;
  JAMN: boolean;
  JAMZ: boolean;
}

export interface MemControl {
  read: boolean;
  write: boolean;
  fetch: boolean;
}

export interface Microinstruction {
  /** 9-bit next-microaddress field. */
  nextAddress: number;
  jam: JamControl;
  alu: AluControl;
  shifter: ShifterOp;
  cBus: ReadonlySet<WritableRegister>;
  mem: MemControl;
  bBus: BBusSource;

  // Tooling fields (not used by the simulator):
  sourceLine?: number;
  label?: string;
}

export type MemoryOp = 'read' | 'write' | 'fetch';

export interface MachineState {
  // Ten 32-bit registers (int32, signed).
  MAR: number;
  MDR: number;
  PC: number;
  MBR: number;
  SP: number;
  LV: number;
  CPP: number;
  TOS: number;
  OPC: number;
  H: number;

  /** 9-bit microprogram counter. */
  MPC: number;

  /** Main memory, byte-addressed. */
  memory: Uint8Array;

  /** Microprogram (control store). 512 slots; gaps are `undefined`. */
  controlStore: readonly (Microinstruction | undefined)[];

  // Memory ops scheduled by the previous microcycle, completing this one.
  pendingRead: boolean;
  pendingWrite: boolean;
  pendingFetch: boolean;

  // MAR / MDR / PC values latched at the time the pending op was issued.
  pendingMAR: number;
  pendingMDR: number;
  pendingPC: number;

  halted: boolean;
  error: string | null;
}

export interface CompletedMemoryOp {
  op: MemoryOp;
  /** Byte address. */
  address: number;
  /** Word value for read/write; byte value for fetch. */
  value: number;
}

export interface MicroTrace {
  /** Address of the microinstruction that was executed. */
  microinstructionAddress: number;
  microinstruction: Microinstruction;

  bBusSource: BBusSource;
  bBusValue: number;
  aBusValue: number;
  aluOutput: number;
  aluFlags: { N: boolean; Z: boolean };
  shifterOutput: number;
  cBusTargets: readonly WritableRegister[];
  cBusValue: number;

  /** Memory ops issued during this cycle (now pending for the next). */
  memoryOpsIssued: readonly MemoryOp[];
  /** Memory ops issued during the *previous* cycle that completed this one. */
  memoryOpsCompleted: readonly CompletedMemoryOp[];

  mpcBefore: number;
  mpcAfter: number;
}

/** Coerce a JS number into int32 range. */
export const toInt32 = (n: number): number => n | 0;
