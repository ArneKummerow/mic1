/**
 * Default IJVM program — iteratively compute 1 + 2 + … + N and leave the
 * total on top of the stack. Adapted from the standard textbook example
 * (Tanenbaum, *Structured Computer Organization*, Ch. 4) of a counted loop
 * over local variables.
 *
 * Local-variable layout (set up by bootstrap.ts; LV points clear of the
 * method area):
 *   LV[0]  unused (reserved for OBJREF in the textbook calling convention)
 *   LV[1]  n      — counter, decremented to 0
 *   LV[2]  sum    — running total
 *
 * For N = 10 the final TOS is 55.
 *
 * Opcodes exercised: BIPUSH, ISTORE, ILOAD, IFEQ, IADD, IINC, GOTO, HALT.
 */
export const DEFAULT_MACROCODE = `
        BIPUSH 10
        ISTORE 1          // n = 10
        BIPUSH 0
        ISTORE 2          // sum = 0
loop:
        ILOAD 1
        IFEQ done         // if n == 0, exit
        ILOAD 2
        ILOAD 1
        IADD
        ISTORE 2          // sum += n
        IINC 1, -1        // n -= 1
        GOTO loop
done:
        ILOAD 2           // push final sum
        HALT
`.trim();
