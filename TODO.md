# TODO

Tracks the gaps between what the simulator currently supports and a "complete"
MIC-1 / IJVM teaching environment matching Tanenbaum's *Structured Computer
Organization*.

## IJVM assembler — directive support

The IJVM assembler in [src/engine/ijvm/assembler.ts](src/engine/ijvm/assembler.ts)
now accepts directives so `INVOKEVIRTUAL`/`IRETURN`/`LDC_W`/`WIDE` can be
exercised in source. See [src/engine/ijvm/assembler.test.ts](src/engine/ijvm/assembler.test.ts)
for the supported syntax.

- [x] **`.method name(arg, arg, ...)` … `.end-method`.** Lays out the 4-byte
  method prologue (2-byte arg count, 2-byte locals count) at the method's
  starting offset; binds `name` to a constant-pool entry whose value is the
  byte offset of the first prologue byte. Method entry semantics matching
  Tanenbaum's INVOKEVIRTUAL: caller pushes OBJREF + args; callee's LV is
  set to the OBJREF slot.
- [x] **`.var <name>`.** Inside a `.method`, declares a named local variable.
  Resolves to a `ubyte` index for `ILOAD`/`ISTORE`/`IINC`. Indices
  auto-assigned starting after the implicit `this` slot (LV[0] = OBJREF) and
  the declared parameters. (16-bit `WIDE`-encoded indices not yet folded by
  the assembler — manual byte-construction still required.)
- [x] **`.args <n>`.** Number of arguments (including OBJREF) the method
  consumes from the operand stack. Validates against the count declared in
  the `.method` header; informs the prologue's "args" field.
- [x] **`.const <name> <value>` / `.constant`.** Defines a 32-bit constant
  pool entry; binds `name` to its 16-bit unsigned index (suitable for
  `LDC_W` / `INVOKEVIRTUAL`). Both spellings accepted.
- [x] **Constant pool / method area memory layout.** `IJVMAssembleResult`
  now exposes `bytes` (method area), `constants` (Int32Array), and
  `methods` / `constantEntries` metadata; bootstrap writes the constant
  pool to memory at `CPP * 4` (default `CPP = 0x80`).
- [x] **Validation.** `BIPUSH` operand range was already enforced; new
  checks include numeric `ILOAD`/`ISTORE`/`IINC` indices against the
  declared local count, named operand resolution (locals vs constants),
  duplicate `.method`/`.constant` names, unclosed `.method`, and
  `.args` ↔ method-header consistency.

## Microcode — deferred IJVM opcodes

Implemented in [src/engine/defaultMicrocode.ts](src/engine/defaultMicrocode.ts).
Layout: regular ILOAD continuation moved from `0x180..0x184` to
`0x148..0x14C` so the wide IINC entry has room at `0x184`; wide IINC's
continuation parks at `0x1B5..0x1BC` because the run after `0x184` overlaps
ISTORE.

- [x] **`INVOKEVIRTUAL` (0xB6).** Entry at `0x0B6`, continuation at
  `0x1D6..0x1EE` (25 microinstructions). Reads the 16-bit constant-pool
  index, fetches the method address, walks the 4-byte prologue
  (argsCount/localsCount) while assembling new_LV and new_SP, writes
  return-PC + caller-LV into the link area and the link pointer into the
  OBJREF slot, sets new LV/SP/PC, and pre-fetches the method's first opcode.
- [x] **`IRETURN` (0xAC).** Entry at `0x0AC`, continuation at
  `0x1F0..0x1F7` (8 microinstructions). Reads link_ptr from `LV[0]`,
  pulls saved PC and saved LV from the link area, writes the return
  value at the OBJREF slot, restores caller's `LV`/`PC`/`SP`, pre-fetches
  the next caller opcode.
- [x] **`WIDE` (0xC4).** Two-cycle dispatch (`wide1` at `0x0C4` issues the
  fetch, `wide2` at `0x185` does `goto (MBR OR 0x100)`). Wide variants:
  `wide_iload` (`0x115..0x11C`), `wide_istore` (`0x136..0x13E`),
  `wide_iinc` (entry `0x184`, continuation `0x1B5..0x1BC`). Each reads a
  16-bit index across two operand bytes.
- [ ] **`IN` (0xFC).** Read a byte from the console input buffer; push 0 if
  the buffer is empty (or stall — see simulator section). Needs memory-
  mapped I/O wiring on the simulator side.
- [ ] **`OUT` (0xFD).** Pop a byte and append it to the console output
  buffer. Same I/O wiring.

## Simulator — I/O and other gaps

- [ ] **Memory-mapped console I/O.** Pick reserved word addresses (e.g.
  `0xFFFFFFFC` for input, `0xFFFFFFFE` for output) and special-case them
  in `completePendingMemoryOps` ([src/engine/simulator.ts](src/engine/simulator.ts))
  to drain `consoleInput` / append to `consoleOutput` instead of reading /
  writing main memory. Wire the store so the simulator can call back into
  it when `IN` / `OUT` execute.
- [ ] **`waiting-for-input` mode is declared but never entered.** The
  store has `'waiting-for-input'` as an `ExecutionMode` and the Console
  shows "waiting for input…" when active, but nothing transitions into
  it. When `IN` reads from an empty buffer, microstep should pause the
  run-loop and resume on the next `appendConsoleInput`.
- [ ] **Step-back / undo.** Listed under "Stretch" in the previous TODO —
  ring-buffer of `MachineState` snapshots so the user can rewind one
  micro-cycle (or one macro-instruction) at a time. `snapshotMachineState`
  already exists in [src/engine/simulator.ts](src/engine/simulator.ts).

## Default microcode / macrocode samples

- [ ] **Recursive factorial or Fibonacci sample** using
  `INVOKEVIRTUAL` / `IRETURN`. Directive + microcode work landed — see the
  "recursive sum 1..5" integration test for a working pattern, but the
  default `DEFAULT_MACROCODE` is still the iterative sum-1..N loop.
- [ ] **Echo / hello-world sample** once `IN` / `OUT` work — read bytes
  until newline, push, OUT-loop them.
- [ ] **`WIDE` example** — a method with > 256 locals, or a constant pool
  reference > 0xFF, demonstrating the wide-prefix dispatch. (Microcode is
  in place; the assembler doesn't yet fold `WIDE ILOAD` etc. into a
  wide-encoded instruction, so callers must hand-emit the bytes.)

## Control store view & microinstruction inspector

- [ ] **Detailed bit-level view toggle in [ControlStoreView](src/components/ControlStoreView.tsx).**
  Add a toggle that switches the table from the current row-per-µinstruction
  text rendering to a bit-decomposed layout matching Tanenbaum's textbook
  microinstruction word (36 bits, in this column order):
  - `NEXT_ADDRESS` (9 bits) — rendered in **hex**, not as individual bits
  - `JMPC`, `JAMN`, `JAMZ` (3 bits, JAM)
  - `SLL8`, `SRA1` (2 bits, shifter)
  - `F0`, `F1`, `ENA`, `ENB`, `INVA`, `INC` (6 bits, ALU)
  - `H`, `OPC`, `TOS`, `CPP`, `LV`, `SP`, `PC`, `MDR`, `MAR` (9 bits, C-bus enables)
  - `WRITE`, `READ`, `FETCH` (3 bits, memory ops)
  - B-bus (4-bit field) — shown by **register name** (`MDR` / `PC` / `MBR` /
    `MBRU` / `SP` / `LV` / `CPP` / `TOS` / `OPC` / `NONE`), not as raw bits

  Set bits color-highlighted; cleared bits dim/empty. Column headers are
  the field names. Toggle state persists with the rest of the UI layout
  (so the user's preferred view survives a reload). The data is already
  in [src/engine/types.ts](src/engine/types.ts) — `Microinstruction` carries
  every field above; this is purely a render mode for the existing rows.

- [ ] **Hide-empty-rows toggle in [ControlStoreView](src/components/ControlStoreView.tsx).**
  A second toggle that filters out unused control-store slots
  (`controlStore[addr] === undefined`), but still indicates that rows are
  hidden — either a single dim placeholder row between contiguous spans
  of populated addresses, or a "… N rows hidden …" marker. Composes with
  the bit-level view above. When breakpoints are set on hidden addresses,
  collapse markers should still expose them so they're not invisible.

- [ ] **Microinstruction inspector panel (new tab/pane).** A new layout
  panel that renders only the *current* microinstruction (the one at
  `lastTrace.mpcBefore`, falling back to `machine.MPC` before the first
  step) using the bit-level view above. Default placement: directly
  below the data-path view, occupying ~20% of vertical space — adjust
  [src/components/defaultLayout.ts](src/components/defaultLayout.ts).
  Updates every microcycle as MPC changes. Complements the data-path SVG:
  one view shows flow through registers/buses, the other shows what the
  current control word actually encodes. Useful for hovering over the
  inspector to learn what each control bit does (cross-link to the hover
  TODO under MAL editor).

## MAL editor — missing features in [src/components/MicrocodeEditor.tsx](src/components/MicrocodeEditor.tsx)

The previous TODO marked these "done" but on inspection the wiring isn't
actually present:

- [ ] **Gutter shows assembled µaddress per line.** The previous TODO
  promised "Gutter shows assembled µaddress / IJVM byte address" but the
  current editor only shows Monaco's stock line numbers. Use a custom
  zone or glyph margin populated from `microAssembly.addressByLine`.
- [ ] **Breakpoint toggle in the editor gutter.** The store has
  `breakpoints` / `toggleBreakpoint`, the [ControlStoreView](src/components/ControlStoreView.tsx)
  uses them, and `glyphMargin: true` is set on the MAL editor — but no
  click handler is registered, so users can't add breakpoints from the
  source view. Add `editor.onMouseDown` on the glyph-margin column;
  translate the source line to a microaddress via `addressByLine` and
  call `toggleBreakpoint`. Render existing breakpoints as a glyph.
- [ ] **Format button for column-aligned MAL.** Promised in the original
  TODO; not implemented. Walk parsed lines, compute column widths for
  label / assignments / mem-ops / goto, re-emit with whitespace padding.
- [ ] **Hover info on registers, opcodes, ALU operations.** A
  `monaco.languages.registerHoverProvider` for `mal` that, given a token,
  returns the corresponding row from
  [docs/MIC1_REFERENCE.md](docs/MIC1_REFERENCE.md) (register description,
  ALU truth-table function, etc.).
- [ ] **Autocomplete / IntelliSense.** Register names, mem-op keywords
  (`rd` / `wr` / `fetch`), goto targets pulled from `microAssembly.labels`,
  common patterns (`MAR = SP = SP - 1; rd`).
- [ ] **Snippets.** Common handler skeletons (`opcodeN  ; goto opcodeN+1`),
  pop-and-test prologue, conditional-branch scaffold (since the bit-8
  layout is non-obvious).
- [ ] **Click-to-jump from assembler error to source.** Already partly
  works because errors are emitted as Monaco markers, but a dedicated
  errors panel that lists them and jumps on click would be friendlier.

## MAL parser / encoder — missing language features

- [ ] **Two-label conditional `if (Z) goto T; else goto F`.** Tanenbaum's
  textbook MAL uses this form; the current parser only accepts a single
  target. The two-label form lets the assembler validate `T = F | 0x100`
  (the bit-8 invariant) explicitly rather than relying on convention.
  See [src/engine/mal/parser.ts](src/engine/mal/parser.ts) (parseIfStatement)
  and [src/engine/mal/encoder.ts](src/engine/mal/encoder.ts).
- [ ] **Negated conditions (`if (~N)` / `if (!Z)`).** Useful for handlers
  whose taken-branch is the *less* common case.
- [ ] **Better diagnostics for unsupported ALU expressions.** The encoder
  currently rejects e.g. `H - 1` with a plain "not expressible" error.
  Suggest the equivalent supported form (`-1 + H`, etc.) where possible.
- [ ] **Round-trip tests.** Disassemble an encoded `Microinstruction`
  back to MAL, re-assemble, assert byte-equivalence — catches encoder
  bugs the current expression-shape tests miss.

## IJVM editor — missing features in [src/components/MacrocodeEditor.tsx](src/components/MacrocodeEditor.tsx)

- [ ] **Gutter shows IJVM byte address per line** — symmetric with the MAL
  gutter request above, populated from `ijvmAssembly.addressByLine`.
- [ ] **Breakpoint toggle in gutter.** Same gap as the MAL editor — UI is
  not wired.
- [ ] **Hover info on opcodes.** Show the operand kinds, byte length, and
  effect from [src/engine/ijvm/opcodes.ts](src/engine/ijvm/opcodes.ts).
- [ ] **Autocomplete for opcodes, labels, `.var` / `.method` / `.const`
  names** (after the directive work above).
- [ ] **Goto-definition / find-references for labels and (later) methods,
  vars, constants.**
- [ ] **Operand-range / undefined-label errors highlighted as squiggles**
  with click-to-jump to declaration when the directive infrastructure
  exists.

## Polish / stretch

- [ ] **Import / export `.mal` and `.ijvm` files** (File System Access API
  with download/upload fallback). Listed as stretch in the previous TODO.
- [ ] **Light theme.**
- [ ] **PWA / service-worker offline mode.**
- [ ] **MIC-2 / MIC-3 / MIC-4 variants** — instruction prefetch, scoreboarding,
  pipelining. A natural extension once MIC-1 is feature-complete.

## Documentation

- [ ] **Update [docs/MIC1_REFERENCE.md](docs/MIC1_REFERENCE.md)** as each
  IJVM assembler directive lands, so the "assembler accepts" section
  matches reality. Currently it overstates support.
- [ ] **Tutorial / walkthrough** for new students: trace one IJVM
  instruction end-to-end through Main1 → handler → memory → datapath.
  Could live as a Markdown page or as guided tooltips inside the app.
