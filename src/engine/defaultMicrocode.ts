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
 * WIDE prefix dispatch
 * --------------------
 * `WIDE` (0xC4) advances PC over its byte, fetches the next byte (the wide-
 * prefixed opcode), and dispatches via JMPC OR with NEXT_ADDR=0x100 so that
 * the wide-variant handlers sit at `(opcode | 0x100)` — i.e. wide_iload at
 * 0x115, wide_istore at 0x136, wide_iinc at 0x184. These read a 16-bit index
 * across two operand bytes instead of one. To leave 0x184 free for the wide
 * IINC entry, the regular ILOAD continuation (iload2..iload6) lives at
 * 0x148..0x14C rather than 0x180; wide IINC's continuation lives at
 * 0x1B5..0x1BC because 0x185..0x18C overlaps ISTORE's continuation.
 *
 * Memory layout this microprogram expects (set up by bootstrap.ts)
 * -----------------------------------------------------------------
 *   - Method area (IJVM bytecode + method prologues) starts at byte 0.
 *   - Constant pool starts at word `CPP` (default 0x80 → byte 0x200).
 *   - LV points at a word offset clear of the method area.
 *   - SP starts one below the operand-stack base; first push lands above LV.
 */

export const DEFAULT_MICROCODE = `
// ──────────────────────────────────────────────────────────────────────
// Main1 — dispatch on the opcode already in MBR.
// ──────────────────────────────────────────────────────────────────────
Main1 = 0x000   goto (MBR)

// ──────────────────────────────────────────────────────────────────────
// First microinstruction of each multi-cycle handler lives at MPC=opcode.
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
ireturn1    = 0x0AC   MAR = LV; rd;                 goto ireturn2
ior1        = 0x0B0   MAR = SP = SP - 1; rd;        goto ior2
invokev1    = 0x0B6   PC = PC + 1; fetch;           goto invokev2
wide1       = 0x0C4   PC = PC + 1; fetch;           goto wide2
in1         = 0x0FC   MAR = -1; rd;                 goto in2
out1        = 0x0FD   MDR = TOS;                    goto out2
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

// ILOAD i — push local variable LV[i] (i is an unsigned byte).
//   Continuation parked at 0x148 (rather than 0x180) so the wide IINC entry
//   has room at 0x184 — see the WIDE section below.
iload2 = 0x148    H = LV
iload3            MAR = MBRU + H; rd
iload4            MAR = SP = SP + 1
iload5            PC = PC + 1; fetch; wr
iload6            TOS = MDR; goto Main1

isub2 = 0x150     H = TOS
isub3             MDR = TOS = MDR - H; wr
isub4             PC = PC + 1; fetch; goto Main1

iand2 = 0x160     H = TOS
iand3             MDR = TOS = MDR AND H; wr
iand4             PC = PC + 1; fetch; goto Main1

ior2 = 0x170      H = TOS
ior3              MDR = TOS = MDR OR H; wr
ior4              PC = PC + 1; fetch; goto Main1

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

// Wide IINC continuation (entry at 0x184, see WIDE block below).
wide_iinc2 = 0x1B5   H = MBRU << 8
wide_iinc3           PC = PC + 1; fetch
wide_iinc4           H = MBRU OR H
wide_iinc5           MAR = H + LV; rd
wide_iinc6           PC = PC + 1; fetch
wide_iinc7           H = MDR
wide_iinc8           MDR = MBR + H; wr
wide_iinc9           PC = PC + 1; fetch; goto Main1

// Conditional-branch convergence
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

// INVOKEVIRTUAL idx — call method whose constant-pool entry idx holds the
// byte address of its 4-byte prologue (argsCount hi/lo, localsCount hi/lo).
// Caller's stack: ... OBJREF arg1 ... argN-1   (TOS = argN-1, SP = its slot)
// where N = argsCount (includes OBJREF). After the call:
//   new_LV   = SP - N + 1                (= word index of OBJREF slot)
//   sav_PC   at word (SP + locals + 1)   = saved return PC (P0+3)
//   sav_LV   at word (SP + locals + 2)   = caller's old LV
//   new_SP   = sav_LV slot
//   link_ptr stored at memory[new_LV*4] = sav_PC slot index (= SP+locals+1)
//   PC       = method_addr + 4           (advanced past the prologue while
//                                          assembling argsCount/localsCount)
//   first opcode of method body pre-fetched into MBR
invokev2 = 0x1D6   H = MBRU << 8                  // idx high
invokev3           PC = PC + 1; fetch              // → idx low
invokev4           H = MBRU OR H                   // H = idx (16-bit)
invokev5           MAR = H + CPP; rd               // → MDR = method address
invokev6           OPC = PC + 1                     // OPC = return PC = P0+3
invokev7           PC = MDR; fetch                  // PC = method addr; → byte 0 (argsHi)
invokev8           H = MBRU << 8                    // H = argsHi << 8
invokev9           PC = PC + 1; fetch              // → byte 1 (argsLo)
invokev10          H = MBRU OR H                    // H = argsCount
invokev11          TOS = SP + 1                     // TOS = SP + 1 (scratch)
invokev12          TOS = TOS - H                    // TOS = SP + 1 - argsCount = new_LV
invokev13          PC = PC + 1; fetch              // → byte 2 (localsHi)
invokev14          H = MBRU << 8
invokev15          PC = PC + 1; fetch              // → byte 3 (localsLo)
invokev16          H = MBRU OR H                    // H = localsCount
invokev17          MDR = OPC                        // MDR = return PC, ready to write
invokev18          H = H + 1                        // H = localsCount + 1
invokev19          MAR = SP + H; wr                 // write return PC at saved_PC slot
invokev20          MDR = LV                         // MDR = caller's old LV
invokev21          H = H + 1                        // H = localsCount + 2
invokev22          LV = TOS                         // LV ← new_LV (overwrite caller LV)
invokev23          MAR = SP = SP + H; wr            // write old LV at saved_LV slot; SP = new_SP
invokev24          MAR = LV                         // MAR = new_LV (link_ptr destination)
invokev25          MDR = SP - 1; wr                 // MDR = SP - 1 = link_ptr value;
                                                    // write to memory[new_LV*4]
invokev26          PC = PC + 1; fetch; goto Main1   // PC = method_addr + 4; fetch first opcode

// IRETURN — pop return value from callee's TOS, restore caller's PC and LV
// from the link area, and place the return value where OBJREF used to sit
// (which becomes caller's new TOS).
//   At entry: TOS = return value, LV[0] = link_ptr.
ireturn2 = 0x1F0   H = MDR                          // save link_ptr (= MDR from rd in ireturn1)
ireturn3           MAR = MDR; rd                    // → MDR = saved PC
ireturn4           PC = MDR                          // PC = saved PC
ireturn5           MAR = LV                          // MAR = old LV (= return-value slot)
ireturn6           MDR = TOS; wr                    // write return value
ireturn7           MAR = H + 1; rd                   // → MDR = saved LV
ireturn8           SP = LV; fetch                    // SP = old LV (= return-value slot); fetch first opcode of caller
ireturn9           LV = MDR; goto Main1              // restore caller's LV

// WIDE prefix — see the WIDE block above; the entry at 0x0C4 advances PC
// past the WIDE byte, fetches the next byte (the wide-prefixed opcode), and
// dispatches to (opcode | 0x100). The 16-bit-index variants follow.

// WIDE ILOAD — push LV[idx] where idx is a 16-bit unsigned index.
wide_iload1 = 0x115   PC = PC + 1; fetch              // → idx high
wide_iload2           H = MBRU << 8
wide_iload3           PC = PC + 1; fetch              // → idx low
wide_iload4           H = MBRU OR H                    // H = idx
wide_iload5           MAR = H + LV; rd                 // → MDR = LV[idx]
wide_iload6           MAR = SP = SP + 1
wide_iload7           PC = PC + 1; fetch; wr           // advance, fetch next opcode, write to TOS slot
wide_iload8           TOS = MDR; goto Main1

// WIDE ISTORE — pop into LV[idx] where idx is 16 bits.
wide_istore1 = 0x136   PC = PC + 1; fetch              // → idx high
wide_istore2           H = MBRU << 8
wide_istore3           PC = PC + 1; fetch              // → idx low
wide_istore4           H = MBRU OR H                    // H = idx
wide_istore5           MAR = H + LV
wide_istore6           MDR = TOS; wr                    // write TOS at LV[idx]
wide_istore7           MAR = SP = SP - 1; rd            // pop, fetch new top
wide_istore8           PC = PC + 1; fetch
wide_istore9           TOS = MDR; goto Main1

// WIDE IINC — LV[idx] += sign-ext byte c, idx is 16 bits.
//   Entry at 0x184; continuation parked at 0x1B5..0x1BC because the
//   sequential block 0x185..0x18C overlaps the regular ISTORE handler.
wide_iinc1 = 0x184    PC = PC + 1; fetch;             goto wide_iinc2

// WIDE second-stage dispatch. The 1-cycle fetch delay means the byte
// fetched at wide1 is in MBR by this cycle; we dispatch on it now.
wide2 = 0x185         goto (MBR OR 0x100)

// IN — read a byte from the memory-mapped console input port (MAR = -1)
// and push it as a 32-bit word. If the input buffer is empty, the
// simulator stalls (sets waitingForInput) until input arrives, then
// re-runs the rd-completion cycle.
in2 = 0x1F8           MAR = SP = SP + 1            // alloc TOS slot
in3                   wr                            // write input byte to TOS slot
in4                   PC = PC + 1; fetch            // advance, fetch next opcode
in5                   TOS = MDR; goto Main1         // cache new TOS

// OUT — pop the top byte and append it to the console output buffer via
// the memory-mapped output port (also MAR = -1; write side).
out2 = 0x1FC          MAR = -1; wr                  // write MDR's low byte to output port
out3                  MAR = SP = SP - 1; rd          // pop, fetch new top
out4                  PC = PC + 1; fetch
out5                  TOS = MDR; goto Main1
`.trim();
