/**
 * IJVM sample programs.
 *
 * Each sample is a self-contained `.ijvm` source string designed to exercise
 * a different region of the default microprogram + assembler: control flow,
 * call/return, console I/O, and the WIDE prefix. They double as the seeds
 * for the in-app sample picker and as smoke tests for the engine.
 */

/**
 * Iterative sum 1..N — counted loop over local variables.
 * Exercises BIPUSH, ISTORE, ILOAD, IFEQ, IADD, IINC, GOTO, HALT.
 */
export const SAMPLE_SUM_LOOP = `// Iterative sum 1..N — counted loop, no method calls.
//
// Local-variable layout (LV is set up by bootstrap clear of the method area):
//   LV[1]  n      — counter, decremented to 0
//   LV[2]  sum    — running total
//
// For N = 10 the final TOS is 55.

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
`.trimStart();

/**
 * Recursive sum 1..N — exercises INVOKEVIRTUAL / IRETURN.
 * Stand-in for the textbook "recursive factorial" demo (factorial would
 * additionally need a multiply method since IJVM has no IMUL opcode).
 */
export const SAMPLE_RECURSIVE_SUM = `// Recursive sum 1..N — demonstrates INVOKEVIRTUAL / IRETURN.
//
// recsum(n) = n + recsum(n - 1),    recsum(0) = 0.
// For N = 10 the final TOS is 55.

        BIPUSH 0          // OBJREF (this slot for the call)
        BIPUSH 10
        INVOKEVIRTUAL recsum
        HALT

.method recsum(n)
        ILOAD n
        IFEQ baseCase
        // Otherwise: return n + recsum(n - 1)
        ILOAD n
        BIPUSH 0          // OBJREF for recursive call
        ILOAD n
        BIPUSH -1
        IADD              // n - 1
        INVOKEVIRTUAL recsum
        IADD              // n + recsum(n - 1)
        IRETURN
baseCase:
        BIPUSH 0
        IRETURN
.end-method
`.trimStart();

/**
 * Echo loop — read a byte at a time via IN, write each back via OUT until
 * a null byte is read. With the simulator's input-stall semantics, the
 * program transparently waits for input when the buffer is empty.
 */
export const SAMPLE_ECHO = `// Echo loop — IN / OUT until null byte.
//
// Type into the Console input field; the program echoes each character
// back to the output. Submit a byte of value 0 (or close the input) to
// terminate. While the input buffer is empty, the simulator stalls on
// IN's memory-mapped read (MAR = -1) and the status bar shows
// "waiting for input…".

loop:
        IN
        DUP
        IFEQ done    // exit when we read a null byte
        OUT
        GOTO loop
done:
        HALT
`.trimStart();

/**
 * WIDE prefix demo — uses 16-bit-indexed ILOAD/ISTORE/IINC inside a method
 * with named locals. The assembler folds \`WIDE ILOAD x\` into the 4-byte
 * sequence \`0xC4 0x15 idxHi idxLo\`; the microprogram dispatches via
 * \`(MBR OR 0x100)\`.
 */
export const SAMPLE_WIDE = `// WIDE prefix demo.
//
// All three locals fit in a byte index, so WIDE is unnecessary here;
// it's used purely to demonstrate the prefix mechanism. The assembler
// emits 4-byte WIDE-prefixed ILOAD / ISTORE / IINC instructions which
// the microprogram dispatches via (MBR OR 0x100).

        BIPUSH 0          // OBJREF
        BIPUSH 100
        INVOKEVIRTUAL bumpAndAdd
        HALT

.method bumpAndAdd(start)
        .var counter
        // counter = start (using a WIDE ISTORE).
        ILOAD start
        WIDE
        ISTORE counter

        // counter += 5 in two WIDE IINC steps.
        WIDE
        IINC counter, 3
        WIDE
        IINC counter, 2

        // Return start + counter using WIDE ILOADs.
        WIDE
        ILOAD start
        WIDE
        ILOAD counter
        IADD
        IRETURN
.end-method
`.trimStart();

export interface IjvmSample {
  id: string;
  label: string;
  source: string;
  description: string;
}

/**
 * Curated registry of bundled samples. Used by the Toolbar's sample
 * picker; the first entry is the default (loaded fresh into the editor on
 * first launch and via the "Defaults" button).
 */
export const IJVM_SAMPLES: readonly IjvmSample[] = [
  {
    id: 'recursive-sum',
    label: 'Recursive sum',
    source: SAMPLE_RECURSIVE_SUM,
    description:
      'Recursive sum 1..N via INVOKEVIRTUAL / IRETURN. Demonstrates the textbook calling convention.',
  },
  {
    id: 'sum-loop',
    label: 'Sum loop',
    source: SAMPLE_SUM_LOOP,
    description: 'Iterative sum 1..N — counted loop over local variables.',
  },
  {
    id: 'echo',
    label: 'Echo',
    source: SAMPLE_ECHO,
    description:
      'IN / OUT echo loop — type in the Console; press Enter to submit. Halts on a null byte.',
  },
  {
    id: 'wide',
    label: 'WIDE prefix',
    source: SAMPLE_WIDE,
    description:
      'Uses the WIDE prefix to access locals via 16-bit-indexed ILOAD / ISTORE / IINC.',
  },
];
