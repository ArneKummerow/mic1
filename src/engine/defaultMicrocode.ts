/**
 * Default MIC-1 microprogram (minimal IJVM subset).
 *
 * This is a pedagogical starter, not the full textbook microprogram. It
 * implements just enough opcodes to demonstrate the data path and validate
 * the engine end-to-end:
 *
 *   NOP, BIPUSH, DUP, POP, SWAP, IADD, ISUB, IAND, IOR, HALT
 *
 * Conventions (matching Tanenbaum):
 *   - PC points at the byte that is *currently* in MBR, i.e. the opcode (or
 *     operand) being processed. Each handler ends with
 *     `PC = PC + 1; fetch; goto Main1`, advancing PC past the last byte of
 *     the instruction and pre-fetching the next opcode into MBR.
 *   - Main1 (at MPC=0x000) is a pure dispatch: \`goto (MBR)\`. By the time
 *     we re-enter it, MBR holds the next opcode (fetched at the end of the
 *     previous handler).
 *   - HALT (0xFF) jumps to a self-loop microinstruction; the simulator
 *     detects mpcAfter === mpcBefore and treats the machine as halted.
 *
 * Layout: each multi-instruction handler has its *first* microinstruction
 * at MPC=opcode (so \`goto (MBR)\` dispatches correctly), then jumps to a
 * continuation block in the upper half of the control store (0x100..0x1FF),
 * which is otherwise unused. This avoids collisions between adjacent
 * opcode handlers (e.g. POP @ 0x57..0x59 vs. DUP @ 0x59).
 */

export const DEFAULT_MICROCODE = `
// ──────────────────────────────────────────────────────────────────────
// Main1 — dispatch on the opcode already in MBR.
// NOP (0x00) shares this address: NOP is "do nothing and dispatch next".
// ──────────────────────────────────────────────────────────────────────
Main1 = 0x000   goto (MBR)

// ──────────────────────────────────────────────────────────────────────
// First microinstruction of each multi-cycle handler lives at MPC=opcode.
// Subsequent microinstructions live in the upper half of the control store
// (block per handler, 16 slots each — far more than any handler needs).
// ──────────────────────────────────────────────────────────────────────

bipush1 = 0x010   SP = MAR = SP + 1;            goto bipush2
pop1    = 0x057   MAR = SP = SP - 1; rd;        goto pop2
dup1    = 0x059   MAR = SP = SP + 1;            goto dup2
swap1   = 0x05F   MAR = SP - 1; rd;             goto swap2
iadd1   = 0x060   MAR = SP = SP - 1; rd;        goto iadd2
isub1   = 0x064   MAR = SP = SP - 1; rd;        goto isub2
iand1   = 0x07E   MAR = SP = SP - 1; rd;        goto iand2
ior1    = 0x0B0   MAR = SP = SP - 1; rd;        goto ior2
halt1   = 0x0FF   goto halt1

// ──────────────────────────────────────────────────────────────────────
// Continuation blocks (upper half of the control store).
// ──────────────────────────────────────────────────────────────────────

// BIPUSH b — push sign-extended byte b onto the stack.
bipush2 = 0x100   PC = PC + 1; fetch
bipush3           MDR = TOS = MBR; wr
bipush4           PC = PC + 1; fetch; goto Main1

// POP — discard top.
pop2 = 0x110      PC = PC + 1; fetch
pop3              TOS = MDR; goto Main1

// DUP — duplicate the top word.
dup2 = 0x120      MDR = TOS; wr
dup3              PC = PC + 1; fetch; goto Main1

// SWAP — swap the top two stack words.
swap2 = 0x130     MAR = SP
swap3             H = MDR; wr
swap4             MDR = TOS
swap5             MAR = SP - 1; wr
swap6             TOS = H
swap7             PC = PC + 1; fetch; goto Main1

// IADD — pop a, b ; push a + b.
iadd2 = 0x140     H = TOS
iadd3             MDR = TOS = MDR + H; wr
iadd4             PC = PC + 1; fetch; goto Main1

// ISUB — pop a, b ; push a − b. Stack convention: TOS=b (cached), MDR=a
// (just read). MDR − H = a − b.
isub2 = 0x150     H = TOS
isub3             MDR = TOS = MDR - H; wr
isub4             PC = PC + 1; fetch; goto Main1

// IAND — pop a, b ; push a AND b.
iand2 = 0x160     H = TOS
iand3             MDR = TOS = MDR AND H; wr
iand4             PC = PC + 1; fetch; goto Main1

// IOR — pop a, b ; push a OR b.
ior2 = 0x170      H = TOS
ior3              MDR = TOS = MDR OR H; wr
ior4              PC = PC + 1; fetch; goto Main1
`.trim();
