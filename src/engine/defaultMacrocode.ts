/**
 * Sample IJVM program — `5 + 7`, then halt.
 *
 * After execution: TOS = 12, SP = stack base + 1 (the only word pushed),
 * machine halted.
 */
export const DEFAULT_MACROCODE = `
  BIPUSH 5
  BIPUSH 7
  IADD
  HALT
`.trim();
