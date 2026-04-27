/**
 * IJVM opcode table (subset implemented by the simulator).
 *
 * See docs/MIC1_REFERENCE.md for semantic descriptions.
 */

export type OperandKind =
  | 'sbyte' // signed 8-bit
  | 'ubyte' // unsigned 8-bit (local variable / method index)
  | 'uword' // unsigned 16-bit (constant pool index)
  | 'branch'; // signed 16-bit PC-relative offset

export interface OpcodeInfo {
  opcode: number;
  mnemonic: string;
  operandKinds: readonly OperandKind[];
}

export const OPCODES: readonly OpcodeInfo[] = [
  { opcode: 0x00, mnemonic: 'NOP', operandKinds: [] },
  { opcode: 0x10, mnemonic: 'BIPUSH', operandKinds: ['sbyte'] },
  { opcode: 0x13, mnemonic: 'LDC_W', operandKinds: ['uword'] },
  { opcode: 0x15, mnemonic: 'ILOAD', operandKinds: ['ubyte'] },
  { opcode: 0x36, mnemonic: 'ISTORE', operandKinds: ['ubyte'] },
  { opcode: 0x57, mnemonic: 'POP', operandKinds: [] },
  { opcode: 0x59, mnemonic: 'DUP', operandKinds: [] },
  { opcode: 0x5f, mnemonic: 'SWAP', operandKinds: [] },
  { opcode: 0x60, mnemonic: 'IADD', operandKinds: [] },
  { opcode: 0x64, mnemonic: 'ISUB', operandKinds: [] },
  { opcode: 0x7e, mnemonic: 'IAND', operandKinds: [] },
  { opcode: 0xb0, mnemonic: 'IOR', operandKinds: [] },
  { opcode: 0x99, mnemonic: 'IFEQ', operandKinds: ['branch'] },
  { opcode: 0x9b, mnemonic: 'IFLT', operandKinds: ['branch'] },
  { opcode: 0x9f, mnemonic: 'IF_ICMPEQ', operandKinds: ['branch'] },
  { opcode: 0xa7, mnemonic: 'GOTO', operandKinds: ['branch'] },
  { opcode: 0x84, mnemonic: 'IINC', operandKinds: ['ubyte', 'sbyte'] },
  { opcode: 0xb6, mnemonic: 'INVOKEVIRTUAL', operandKinds: ['uword'] },
  { opcode: 0xac, mnemonic: 'IRETURN', operandKinds: [] },
  { opcode: 0xc4, mnemonic: 'WIDE', operandKinds: [] },
  { opcode: 0xfc, mnemonic: 'IN', operandKinds: [] },
  { opcode: 0xfd, mnemonic: 'OUT', operandKinds: [] },
  { opcode: 0xfe, mnemonic: 'ERR', operandKinds: [] },
  { opcode: 0xff, mnemonic: 'HALT', operandKinds: [] },
] as const;

export const OPCODES_BY_MNEMONIC: ReadonlyMap<string, OpcodeInfo> = new Map(
  OPCODES.map((info) => [info.mnemonic, info]),
);

export const OPCODES_BY_BYTE: ReadonlyMap<number, OpcodeInfo> = new Map(
  OPCODES.map((info) => [info.opcode, info]),
);

/** Byte size of an instruction with the given operand kinds. */
export function operandSize(kinds: readonly OperandKind[]): number {
  let size = 0;
  for (const k of kinds) {
    size += k === 'sbyte' || k === 'ubyte' ? 1 : 2;
  }
  return size;
}

/** Total instruction size including the opcode byte. */
export function instructionSize(info: OpcodeInfo): number {
  return 1 + operandSize(info.operandKinds);
}
