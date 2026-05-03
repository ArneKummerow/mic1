/**
 * IJVM sample programs.
 *
 * Each sample is a self-contained `.ijvm` source string designed to exercise
 * a different region of the default microprogram + assembler: control flow,
 * call/return, console I/O, and the WIDE prefix. They double as the seeds
 * for the in-app sample picker and as smoke tests for the engine.
 */

/**
 * NOP / HALT — the smallest possible program. Useful as a sanity check
 * (does the simulator boot and reach HALT cleanly?) and as a starting
 * point for new programs.
 */
export const SAMPLE_NOP_HALT = `// Smallest possible program — execute a single NOP, then HALT.
//
// A useful first step when learning the toolchain: the simulator boots,
// dispatches Main1 (MPC = 0), executes NOP (one trivial microcycle),
// returns to Main1, dispatches HALT, and stops. Watch the µInst.
// Inspector and Data Path panels follow each cycle.

        NOP
        HALT
`.trimStart();

/**
 * "HELLO\\n" via OUT — the classic first I/O program. Each character is
 * pushed via BIPUSH and emitted to the Console with OUT.
 */
export const SAMPLE_HELLO = `// Print "HELLO" + newline by pushing each ASCII byte and OUT-ing it.
//
// IJVM has no string literals; the assembler emits BIPUSH values directly.
// Watch the Console panel — each OUT appends one character. The trailing
// 0x0A is a line feed.

        BIPUSH 72         // 'H'
        OUT
        BIPUSH 69         // 'E'
        OUT
        BIPUSH 76         // 'L'
        OUT
        BIPUSH 76         // 'L'
        OUT
        BIPUSH 79         // 'O'
        OUT
        BIPUSH 10         // '\\n'
        OUT
        HALT
`.trimStart();

/**
 * Arithmetic mini-tour — exercises IADD, ISUB, IAND, IOR using small
 * constants. The final TOS is the boolean-OR mix of two computed values.
 */
export const SAMPLE_ARITHMETIC = `// Arithmetic & bitwise mini-tour: IADD, ISUB, IAND, IOR.
//
// Computes (7 + 5) - 3 = 9 (binary 1001), then ORs in 0b0110 = 6
// to leave 0b1111 = 15 on top of the stack, then ANDs against 0b1010 = 10
// to leave 0b1010 = 10. After HALT the Stack panel shows TOS = 10.

        BIPUSH 7
        BIPUSH 5
        IADD              // 12
        BIPUSH 3
        ISUB              // 9
        BIPUSH 6
        IOR               // 15
        BIPUSH 10
        IAND              // 10
        HALT
`.trimStart();

/**
 * Stack manipulation — DUP, SWAP, POP. Useful for visualising how the
 * top-of-stack cache (TOS register) and SP move during pure stack work.
 */
export const SAMPLE_STACK_OPS = `// Stack manipulation: DUP, SWAP, POP.
//
// Walks the operand stack through:
//   push 1, 2          → [1, 2]
//   DUP                → [1, 2, 2]
//   SWAP               → [1, 2, 2]   (swap top two — already 2,2)
//   POP                → [1, 2]
//   SWAP               → [2, 1]
//
// Open the Stack panel and step through with Step ▸ µstep / IJVM step.
// Watch how TOS (the top-of-stack cache) updates without a memory write.

        BIPUSH 1
        BIPUSH 2
        DUP
        SWAP
        POP
        SWAP
        HALT
`.trimStart();

/**
 * Branching — find the larger of two values using IFLT and IF_ICMPEQ.
 * A natural follow-on to the looped sum: still no method calls, but two
 * different conditional branches to dispatch.
 */
export const SAMPLE_MAX_OF_TWO = `// Find the maximum of two values using IFLT.
//
// LV[1] = a, LV[2] = b. After the branch, the larger value is left on
// top of the stack. Try changing the BIPUSH constants and re-running.

        BIPUSH 17
        ISTORE 1          // a = 17
        BIPUSH 42
        ISTORE 2          // b = 42

        // (a - b) < 0  ⇒  a < b  ⇒  return b; otherwise return a.
        ILOAD 1
        ILOAD 2
        ISUB
        IFLT bIsBigger

        ILOAD 1
        GOTO done

bIsBigger:
        ILOAD 2

done:
        HALT
`.trimStart();

/**
 * LDC_W + constant pool — pushes a 32-bit value the BIPUSH range cannot
 * reach (BIPUSH is signed 8-bit). Demonstrates the \`.constant\` directive
 * and the assembler's constant-pool machinery.
 */
export const SAMPLE_LDC = `// LDC_W: load a 32-bit constant from the constant pool.
//
// BIPUSH is limited to signed 8-bit values, so anything outside [-128, 127]
// must come from the constant pool. \`.constant N value\` declares a pool
// entry; \`LDC_W N\` emits a 3-byte instruction whose 16-bit operand is the
// pool index.
//
// The two pool loads here add to 0x12345678 + 0x0000ABCD = 0x1234C145.

.constant BIG     0x12345678
.constant SMALL   0x0000ABCD

        LDC_W BIG
        LDC_W SMALL
        IADD
        HALT
`.trimStart();

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
 * Curated registry of bundled samples — sorted basic → advanced. Used by
 * the File menu's sample picker; the first entry is the default loaded
 * fresh into the editor on first launch and via the "Defaults" button.
 */
export const IJVM_SAMPLES: readonly IjvmSample[] = [
  {
    id: 'nop-halt',
    label: 'NOP / HALT',
    source: SAMPLE_NOP_HALT,
    description:
      'The smallest possible program — one NOP and HALT. Useful as a starting point or sanity check.',
  },
  {
    id: 'hello',
    label: 'Hello',
    source: SAMPLE_HELLO,
    description: 'Print "HELLO" via BIPUSH + OUT — first taste of console output.',
  },
  {
    id: 'arithmetic',
    label: 'Arithmetic',
    source: SAMPLE_ARITHMETIC,
    description: 'IADD / ISUB / IAND / IOR mini-tour over small BIPUSH constants.',
  },
  {
    id: 'stack-ops',
    label: 'Stack ops',
    source: SAMPLE_STACK_OPS,
    description: 'DUP, SWAP and POP — pure stack manipulation, no arithmetic.',
  },
  {
    id: 'max-of-two',
    label: 'Max of two',
    source: SAMPLE_MAX_OF_TWO,
    description: 'Find the larger of two values using IFLT — first conditional branch.',
  },
  {
    id: 'ldc',
    label: 'LDC_W constant pool',
    source: SAMPLE_LDC,
    description: 'Load 32-bit constants from the pool with LDC_W when BIPUSH cannot reach.',
  },
  {
    id: 'sum-loop',
    label: 'Sum loop',
    source: SAMPLE_SUM_LOOP,
    description: 'Iterative sum 1..N — counted loop over local variables.',
  },
  {
    id: 'recursive-sum',
    label: 'Recursive sum',
    source: SAMPLE_RECURSIVE_SUM,
    description:
      'Recursive sum 1..N via INVOKEVIRTUAL / IRETURN. Demonstrates the textbook calling convention.',
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
