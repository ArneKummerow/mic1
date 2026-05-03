export { assembleIJVM } from './assembler';
export type {
  IJVMAssembleResult,
  AssemblyError,
  ConstantPoolEntry,
  MethodInfo,
} from './assembler';
export { OPCODES, OPCODES_BY_BYTE, OPCODES_BY_MNEMONIC } from './opcodes';
export type { OpcodeInfo, OperandKind } from './opcodes';
export {
  IJVM_SAMPLES,
  SAMPLE_NOP_HALT,
  SAMPLE_HELLO,
  SAMPLE_ARITHMETIC,
  SAMPLE_STACK_OPS,
  SAMPLE_MAX_OF_TWO,
  SAMPLE_LDC,
  SAMPLE_SUM_LOOP,
  SAMPLE_RECURSIVE_SUM,
  SAMPLE_ECHO,
  SAMPLE_WIDE,
} from './samples';
export type { IjvmSample } from './samples';
