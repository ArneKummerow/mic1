/**
 * Default IJVM program loaded at first launch.
 *
 * Set to the recursive-sum sample to showcase INVOKEVIRTUAL / IRETURN —
 * the most pedagogically rich opcode pair in the engine. The bundled
 * sample picker in the Toolbar (or `IJVM_SAMPLES` in
 * [src/engine/ijvm/samples.ts](src/engine/ijvm/samples.ts)) lets users
 * swap to other samples (iterative loop, echo, WIDE).
 *
 * For N = 10 the final TOS is 55.
 */
export { SAMPLE_RECURSIVE_SUM as DEFAULT_MACROCODE } from './ijvm/samples';
