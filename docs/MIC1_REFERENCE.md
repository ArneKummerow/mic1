# MIC-1 / IJVM Reference

A condensed reference for the model the simulator implements. Conforms to Tanenbaum, *Structured Computer Organization* (5th–6th ed., Appendix B / Chapter 4).

## Registers (all 32-bit)

| Register | Purpose                                             |
|----------|-----------------------------------------------------|
| `MAR`    | Memory Address Register (word-addressed for `rd`/`wr`) |
| `MDR`    | Memory Data Register                                |
| `PC`     | Program Counter (byte-addressed for `fetch`)        |
| `MBR`    | Memory Buffer Register (8-bit, sign-extended on B-bus; `MBRU` for unsigned) |
| `SP`     | Stack Pointer — top of operand stack (word index)   |
| `LV`     | Local Variable frame base (word index)              |
| `CPP`    | Constant Pool Pointer (word index)                  |
| `TOS`    | Top Of Stack — caches the word at `SP`              |
| `OPC`    | Old PC / scratch                                    |
| `H`      | ALU's A-input register (only register on A-bus)     |

`MPC` (9-bit microprogram counter) is internal to the control unit, not on the data path.

## Buses

- **A-bus**: drives `H` only into the ALU's A input.
- **B-bus**: a 4-bit selector picks one of: `MDR, PC, MBR, MBRU, SP, LV, CPP, TOS, OPC` (and a "none" / 0 encoding). This value goes to the ALU's B input.
- **C-bus**: ALU/shifter output. A 9-bit field selects which subset of `{MAR, MDR, PC, SP, LV, CPP, TOS, OPC, H}` receives it.

## ALU

6 control bits — `F0, F1, ENA, ENB, INVA, INC` — yield the standard 6 useful functions plus combinations:

| `F0 F1 ENA ENB INVA INC` | Function     |
|--------------------------|--------------|
| `0 1 1 1 0 0`            | `A + B`      |
| `0 1 1 1 0 1`            | `A + B + 1`  |
| `0 1 1 0 0 0`            | `A`          |
| `0 1 0 1 0 0`            | `B`          |
| `0 1 0 0 0 0`            | `0`          |
| `0 1 1 1 1 1`            | `B − A`      |
| `1 1 0 0 0 0`            | `−1`         |
| `1 0 1 1 0 0`            | `A AND B`    |
| `1 1 1 1 0 0`            | `A OR B`     |
| ...                      | (and similar)|

The ALU exports two flags: `N` (sign of result) and `Z` (result is zero). They feed the JAM logic.

## Shifter

- `SLL8`: shift left by 8 (used for assembling 16-bit operands from two 8-bit `MBR` fetches).
- `SRA1`: arithmetic shift right by 1.
- Or pass-through.

## Memory operations (issued during a microcycle, completed before the next-but-one cycle)

| Op      | Operation                                                  |
|---------|------------------------------------------------------------|
| `rd`    | Read word at `[MAR]` into `MDR`                            |
| `wr`    | Write `MDR` to `[MAR]`                                     |
| `fetch` | Read byte at `[PC]` into `MBR`                             |

## JAM field — next-MPC selection

```
MPC_next = (NEXT_ADDR | (JMPC ? MBR : 0))
            with bit 8 OR'd from (JAMN & N) | (JAMZ & Z)
```

So `JMPC` is how IJVM dispatch happens (`MBR` holds the opcode after a fetch, OR'd into `NEXT_ADDR = 0x000`).

## MAL syntax (the assembler accepts)

One microinstruction per line, with semi-free-form syntax:

```
Label1   MAR = SP - 1; rd
Label2   H = TOS
Label3   MDR = TOS = MDR + H; wr; goto Main1
```

Permitted constructs in any order, separated by `;`:

- Assignment chains: `dest1 = dest2 = ... = <expr>` — the expression is the C-bus value, and each `dest` is added to the C-bus target set.
- Expressions are restricted to what the ALU can compute in one cycle: `H + MDR`, `MDR - 1`, `MDR AND H`, `H << 8`, `MDR >> 1`, `0`, `1`, `-1`, register name alone, etc. The assembler maps each to the appropriate `F0/F1/ENA/ENB/INVA/INC` and shifter bits.
- `rd`, `wr`, `fetch` — memory ops.
- `goto Label` — sets `NEXT_ADDR`.
- `if (N) goto Label` / `if (Z) goto Label` — sets `JAMN`/`JAMZ`. Requires `Label` and `Label - 0x100` to share their low 8 bits, per the standard JAM trick.
- `goto (MBR)` — sets `JMPC`, `NEXT_ADDR = 0`.
- `goto (MBR OR Label)` — sets `JMPC`, `NEXT_ADDR = Label`.

The default microprogram implements the IJVM control-flow + locals subset:
NOP, BIPUSH, LDC_W, ILOAD, ISTORE, IINC, POP, DUP, SWAP, IADD, ISUB, IAND,
IOR, IFEQ, IFLT, IF_ICMPEQ, GOTO, ERR, HALT. INVOKEVIRTUAL / IRETURN /
WIDE / IN / OUT are not yet wired up — they require constant-pool /
method-prologue plumbing (the IJVM assembler doesn't have `.method` /
`.const` directives) and, for IN/OUT, memory-mapped console I/O hooks in
the simulator.

**Conditional-branch layout convention (MIC-1 JAM trick).** Because the
JAM mechanism only OR's bit 8 into MPC, the taken-branch target of any
\`if (N|Z) goto T\` must live in 0x100..0x1FF, and a fall-through
microinstruction must be placed at \`T & 0xFF\` in the lower half. The
assembler enforces this and stores NEXT_ADDR = T & 0xFF.

## IJVM instruction set (subset implemented)

Stack-based, word size = 32 bits. Bytes following the opcode are operands.

| Opcode | Mnemonic        | Operand bytes | Effect                                   |
|--------|-----------------|---------------|------------------------------------------|
| `0x00` | `NOP`           | 0             | nothing                                  |
| `0x10` | `BIPUSH b`      | 1             | push sign-ext byte                       |
| `0x13` | `LDC_W i`       | 2             | push word from constant pool             |
| `0x15` | `ILOAD i`       | 1             | push local var `i`                       |
| `0x36` | `ISTORE i`      | 1             | pop into local var `i`                   |
| `0x57` | `POP`           | 0             | discard top                              |
| `0x59` | `DUP`           | 0             | duplicate top                            |
| `0x5F` | `SWAP`          | 0             | swap top two                             |
| `0x60` | `IADD`          | 0             | pop a,b; push a+b                        |
| `0x64` | `ISUB`          | 0             | pop a,b; push b-a                        |
| `0x7E` | `IAND`          | 0             | pop a,b; push a AND b                    |
| `0xB0` | `IOR`           | 0             | pop a,b; push a OR b                     |
| `0x99` | `IFEQ off`      | 2             | pop; branch if 0                         |
| `0x9B` | `IFLT off`      | 2             | pop; branch if <0                        |
| `0x9F` | `IF_ICMPEQ off` | 2             | pop a,b; branch if a==b                  |
| `0xA7` | `GOTO off`      | 2             | unconditional branch                     |
| `0x84` | `IINC i,c`      | 2             | local var `i` += sign-ext byte `c`       |
| `0xB6` | `INVOKEVIRTUAL i`| 2            | call method                              |
| `0xAC` | `IRETURN`       | 0             | return word                              |
| `0xC4` | `WIDE`          | 0             | next instr's index is 16-bit             |
| `0xFC` | `IN`            | 0             | push byte from console (0 if empty)      |
| `0xFD` | `OUT`           | 0             | pop and emit to console                  |
| `0xFE` | `ERR`           | 0             | error halt                               |
| `0xFF` | `HALT`          | 0             | normal halt                              |

The assembler also accepts pseudo-directives: `.method`, `.var`, `.args`, `.end-method`, `.const`, `.constant`.

## Memory layout (default)

```
0x00000000 ┌───────────────────┐ ← PC starts here
           │   Method area     │
           │   (IJVM bytecode) │
           ├───────────────────┤
           │   Constant pool   │ ← CPP
           ├───────────────────┤
           │   Local variables │ ← LV
           │   ↑ Operand stack │ ← SP (grows up)
           │                   │
           │      ...          │
0x003FFFFF └───────────────────┘
```

Memory is word-addressed for MAR/MDR (so `MAR = 5` reads bytes 20..23) and byte-addressed for PC/MBR.

## What this simulator does *not* do

- No interrupts, no I/O beyond the console `IN`/`OUT`.
- No floating point.
- No method linking beyond the textbook calling convention.
- No MIC-2/3/4 optimizations (instruction prefetch, scoreboarding, pipelining).
