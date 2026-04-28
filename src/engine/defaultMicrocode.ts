/**
 * Default MIC-1 microprogram — IJVM interpreter.
 *
 * Implements the textbook IJVM subset (Tanenbaum, *Structured Computer
 * Organization*, Fig. 4-17), adapted to this simulator's 1-cycle memory
 * timing. Tanenbaum's published microcode assumes a 2-cycle fetch delay (the
 * byte read in cycle N is reliable in MBR by cycle N+2); this simulator
 * delivers fetch results to MBR at the start of cycle N+1, so individual
 * handlers carry one fewer "wait" cycle but more importantly the dispatch
 * convention is shifted: the previous handler is responsible for pre-fetching
 * the *next* opcode into MBR before transferring back to Main1.
 *
 * Conventions
 * -----------
 *   - PC points at the byte currently in MBR. At Main1 entry MBR holds the
 *     opcode we are about to dispatch and PC holds that opcode's address.
 *   - Main1 is pure dispatch: `goto (MBR)`. Each handler is responsible for
 *     advancing PC past the last byte of its instruction and pre-fetching
 *     the next opcode into MBR before transferring control back to Main1.
 *   - First microinstruction of every multi-cycle handler lives at MPC =
 *     opcode (so `goto (MBR)` lands there). Continuation lives in the upper
 *     half of the control store (0x100..0x1FF).
 *
 * Conditional branch (`if (N|Z) goto Taken`) layout
 * --------------------------------------------------
 * The JAM mechanism only OR's bit 8 into MPC, so the taken-branch label must
 * live in 0x100..0x1FF and the fall-through microinstruction must sit at
 * (Taken & 0xFF) in the lower half. IFEQ/IFLT/IF_ICMPEQ all converge on a
 * single shared T (0x1C0) / F (0x0C0) pair after popping & flag-setting.
 *
 * Memory layout this microprogram expects (set up by bootstrap.ts)
 * -----------------------------------------------------------------
 *   - Method area (IJVM bytecode) starts at byte 0, with PC = 0.
 *   - LV points at a word offset clear of the method area.
 *   - SP starts one below the operand-stack base; first push lands above LV.
 *   - CPP defaults to 0 (LDC_W reads relative to CPP).
 */

export const DEFAULT_MICROCODE = `
// ──────────────────────────────────────────────────────────────────────
// Main1 — dispatch on the opcode already in MBR. NOP (0x00) shares this
// address: NOP is "do nothing and dispatch next" — but to actually advance
// past the NOP byte we still need a one-byte fetch sequence. We give NOP a
// dedicated entry below; Main1 itself is pure dispatch.
// ──────────────────────────────────────────────────────────────────────
Main1 = 0x000   goto (MBR)

// ──────────────────────────────────────────────────────────────────────
// First microinstruction of each multi-cycle handler lives at MPC=opcode.
// (Since dispatch is JMPC into NEXT_ADDR=0, the opcode byte is the literal
// microaddress entered.)
// ──────────────────────────────────────────────────────────────────────

bipush1     = 0x010   SP = MAR = SP + 1;            goto bipush2
ldc_w1      = 0x013   PC = PC + 1; fetch;           goto ldc_w2
iload1      = 0x015   PC = PC + 1; fetch;           goto iload2
istore1     = 0x036   PC = PC + 1; fetch;           goto istore2
pop1        = 0x057   MAR = SP = SP - 1; rd;        goto pop2
dup1        = 0x059   MAR = SP = SP + 1;            goto dup2
swap1       = 0x05F   MAR = SP - 1; rd;             goto swap2
iadd1       = 0x060   MAR = SP = SP - 1; rd;        goto iadd2
isub1       = 0x064   MAR = SP = SP - 1; rd;        goto isub2
iand1       = 0x07E   MAR = SP = SP - 1; rd;        goto iand2
iinc1       = 0x084   PC = PC + 1; fetch;           goto iinc2
ifeq1       = 0x099   MAR = SP = SP - 1; rd;        goto ifeq2
iflt1       = 0x09B   MAR = SP = SP - 1; rd;        goto iflt2
if_icmpeq1  = 0x09F   MAR = SP = SP - 1; rd;        goto if_icmpeq2
goto1       = 0x0A7   OPC = PC;                     goto goto2
ior1        = 0x0B0   MAR = SP = SP - 1; rd;        goto ior2
err1        = 0x0FE   goto err1
halt1       = 0x0FF   goto halt1

// ──────────────────────────────────────────────────────────────────────
// Continuation blocks (upper half of the control store).
// ──────────────────────────────────────────────────────────────────────

// BIPUSH b — push sign-extended byte b onto the stack.
//   bipush2 fetches the operand byte; bipush3 reads MBR (sign-extended on
//   the B-bus) and writes it to the new top-of-stack; bipush4 pre-fetches
//   the next opcode while advancing PC past the operand byte.
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

// IADD/ISUB/IAND/IOR — pop a, b ; push a∘b. TOS=b (cached), MDR=a (just read).
iadd2 = 0x140     H = TOS
iadd3             MDR = TOS = MDR + H; wr
iadd4             PC = PC + 1; fetch; goto Main1

isub2 = 0x150     H = TOS
isub3             MDR = TOS = MDR - H; wr
isub4             PC = PC + 1; fetch; goto Main1

iand2 = 0x160     H = TOS
iand3             MDR = TOS = MDR AND H; wr
iand4             PC = PC + 1; fetch; goto Main1

ior2 = 0x170      H = TOS
ior3              MDR = TOS = MDR OR H; wr
ior4              PC = PC + 1; fetch; goto Main1

// ILOAD i — push local variable LV[i] (i is an unsigned byte).
//   iload1 issued PC++; fetch (loads the index byte into MBR by iload2).
//   iload5 simultaneously writes the loaded value to the new TOS slot AND
//   pre-fetches the next opcode — 1-cycle fetch delay means MBR=next-opcode
//   by Main1's dispatch.
iload2 = 0x180    H = LV
iload3            MAR = MBRU + H; rd
iload4            MAR = SP = SP + 1
iload5            PC = PC + 1; fetch; wr
iload6            TOS = MDR; goto Main1

// ISTORE i — pop into local variable LV[i].
//   istore1 issued PC++; fetch (loads the index byte). istore3 forms the
//   destination address; istore4 writes the popped TOS there. istore5 then
//   re-reads the new top from memory while decrementing SP.
istore2 = 0x188   H = LV
istore3           MAR = MBRU + H
istore4           MDR = TOS; wr
istore5           MAR = SP = SP - 1; rd
istore6           PC = PC + 1; fetch
istore7           TOS = MDR; goto Main1

// LDC_W i — push word from constant pool[i] (i is a 16-bit unsigned index).
//   Two fetches assemble the high and low operand bytes; H accumulates the
//   16-bit unsigned offset, then we read CPP+H to get the constant value.
ldc_w2 = 0x190    H = MBRU << 8
ldc_w3            PC = PC + 1; fetch
ldc_w4            H = MBRU OR H
ldc_w5            MAR = H + CPP; rd
ldc_w6            MAR = SP = SP + 1
ldc_w7            PC = PC + 1; fetch; wr
ldc_w8            TOS = MDR; goto Main1

// IINC i, c — LV[i] += sign-extended byte c. Read-modify-write of one local.
iinc2 = 0x1A0     H = LV
iinc3             MAR = MBRU + H; rd
iinc4             PC = PC + 1; fetch
iinc5             H = MDR
iinc6             MDR = MBR + H; wr
iinc7             PC = PC + 1; fetch; goto Main1

// IFEQ off — pop v ; branch if v == 0.
//   Pop into MDR via SP--/rd, save v in OPC, restore the value below as
//   the new TOS, then test v through the ALU (passthrough latches Z) and
//   if-Z to the shared T target. Fall-through goes to F (= T & 0xFF).
ifeq2 = 0x1A8     OPC = TOS
ifeq3             TOS = MDR
ifeq4             H = OPC; if (Z) goto T

// IFLT off — pop v ; branch if v < 0. Same pattern, JAM on N.
iflt2 = 0x1AC     OPC = TOS
iflt3             TOS = MDR
iflt4             H = OPC; if (N) goto T

// IF_ICMPEQ off — pop a, b ; branch if a == b.
//   Two pops into the ALU's A/B inputs (b → OPC, a → H), then test b - a
//   for zero. Stack is restored to its state two below the original TOS.
if_icmpeq2 = 0x1B0   MAR = SP = SP - 1
if_icmpeq3           H = MDR; rd
if_icmpeq4           OPC = TOS
if_icmpeq5           TOS = MDR
if_icmpeq6           H = OPC - H; if (Z) goto T

// Conditional-branch convergence
//   T (taken): mirror goto1 — save the if-instruction's PC in OPC, then
//   funnel into goto2 to read the 16-bit offset and compute target =
//   opcode_addr + offset.
//   F (not taken): skip past the 2 offset bytes (PC += 3 total: opcode
//   byte + 2 operand bytes) and pre-fetch the next opcode.
T = 0x1C0   OPC = PC; goto goto2

F  = 0x0C0   PC = PC + 1
F2           PC = PC + 1
F3           PC = PC + 1; fetch; goto Main1

// GOTO off — unconditional 16-bit signed PC-relative branch.
//   goto1 saved OPC = PC (= opcode_addr). goto2..5 read the two operand
//   bytes and assemble the signed 16-bit offset in H. goto6 sets PC =
//   opcode_addr + offset, fetches the byte at the new PC into MBR, and
//   transfers to Main1; the 1-cycle fetch delay means MBR is ready by
//   the time Main1 dispatches.
goto2 = 0x1D0   PC = PC + 1; fetch
goto3           H = MBR << 8
goto4           PC = PC + 1; fetch
goto5           H = MBRU OR H
goto6           PC = OPC + H; fetch; goto Main1
`.trim();
