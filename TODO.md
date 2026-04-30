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
- [x] **`IN` (0xFC).** Reads a byte from the memory-mapped input port at
  `MAR = -1`. If the input buffer is empty, the simulator sets
  `waitingForInput=true` and leaves `pendingRead` in place, stalling MPC
  until input arrives. Entry at `0x0FC`, continuation at `0x1F8..0x1FB`.
- [x] **`OUT` (0xFD).** Pops a byte and writes it to the memory-mapped
  output port (also `MAR = -1`); the simulator drains
  `consoleOutputBuffer` into the store's `consoleOutput` string. Entry at
  `0x0FD`, continuation at `0x1FC..0x1FF`.

## Simulator — I/O and other gaps

- [x] **Memory-mapped console I/O.** Implemented at the single sentinel
  word address `MAR = -1` (`IO_PORT_MAR`): `rd` drains a byte from
  `machine.consoleInputBuffer`, `wr` appends the low byte of `MDR` to
  `machine.consoleOutputBuffer`. `completePendingMemoryOps` in
  [src/engine/simulator.ts](src/engine/simulator.ts) intercepts both
  before the bounds check. The store mirrors the buffers into its
  UI-facing `consoleInput` / `consoleOutput` strings on each microstep.
- [x] **`waiting-for-input` mode entered on empty IN.** When the input
  buffer is empty, `completePendingMemoryOps` sets
  `state.waitingForInput=true`, leaves `pendingRead` in place, and the
  outer `step()` returns a no-op trace at the same MPC. The store
  transitions the mode and pauses the run-loop; `appendConsoleInput`
  pushes bytes and re-arms `run()` so the rd cycle is retried.
- [x] **Step-back / undo.** The store keeps a 128-deep ring buffer of
  pre-microstep snapshots (`STEP_BACK_HISTORY_SIZE` in
  [src/store/index.ts](src/store/index.ts)). `stepBack` pops one snapshot;
  `macrostepBack` pops until a `MPC = 0` (Main1 dispatch) boundary. Wired
  into the Toolbar as ◀ µ / ◀ IJVM buttons. `historyDepth` is exposed in
  the store so UI can show / disable the buttons.

## Default microcode / macrocode samples

A bundled sample registry lives in
[src/engine/ijvm/samples.ts](src/engine/ijvm/samples.ts) and the Toolbar
exposes a "Sample…" dropdown that loads any of them into the macrocode
editor (with a confirmation prompt before replacing existing code). The
default macrocode at first launch is `SAMPLE_RECURSIVE_SUM`.

- [x] **Recursive call/return sample** using `INVOKEVIRTUAL` / `IRETURN`.
  `SAMPLE_RECURSIVE_SUM` (`recsum(n) = n + recsum(n-1)`, base case 0). Set
  as `DEFAULT_MACROCODE`. (A true factorial is left as a follow-on since
  IJVM has no `IMUL`; the recursive-sum sample exercises the same control
  path with shorter execution time.)
- [x] **Echo sample** using `IN` / `OUT`. `SAMPLE_ECHO` reads bytes via
  `IN` and writes them via `OUT` until a null byte arrives, transparently
  stalling on the empty input buffer.
- [x] **WIDE example.** `SAMPLE_WIDE` exercises the wide-prefix dispatch
  through 16-bit-indexed `ILOAD` / `ISTORE` / `IINC`. The assembler now
  folds `WIDE` + `ILOAD` / `ISTORE` / `IINC` on consecutive lines into the
  4-byte wide-encoded instruction (with idx widened to a `uword`); no
  hand-emitted bytes required.

## Control store view & microinstruction inspector

The shared bit-level renderer lives in
[src/components/BitView.tsx](src/components/BitView.tsx) — a single
`BIT_FIELDS` table drives both the per-row decomposition in the Control
Store and the dedicated Inspector panel. Each cell carries a tooltip
describing what the bit does.

- [x] **Detailed bit-level view toggle in [ControlStoreView](src/components/ControlStoreView.tsx).**
  "Bit view" checkbox in the panel toolbar swaps the row rendering from
  the textual ALU/C/Mem/Next/Jam columns to the 36-bit decomposition
  (`NEXT_ADDR` as hex, JAM / shifter / ALU / C-bus / memory as individual
  bit cells, B-bus as register name). Set bits get a group-coloured
  background; cleared bits are dim. Toggle state lives on
  `uiPrefs.controlStoreBitView` in the store and is persisted alongside
  source code via Zustand `persist`.
- [x] **Hide-empty-rows toggle in [ControlStoreView](src/components/ControlStoreView.tsx).**
  "Hide empty rows" checkbox in the same toolbar collapses contiguous
  empty-slot spans into a single "… N empty rows hidden …" marker. Slots
  with breakpoints are excluded from the collapse so the user can never
  lose track of where a breakpoint is set. Composes with the bit view.
- [x] **Microinstruction inspector panel
  ([src/components/MicroInspector.tsx](src/components/MicroInspector.tsx)).**
  New `microInspector` panel placed below the Data Path in the default
  layout (`mic1-visualizer:layout:v6`) showing the bit-level decomposition
  of the *current* control word (at `lastTrace.mpcBefore`, falling back to
  `machine.MPC`). Reuses the same `BitFieldHeader` / `BitFieldRow` shared
  with the Control Store, so cleaning up that component keeps both views
  in sync. Hover tooltips on each cell describe the bit (the cross-linked
  hover-info TODO in the MAL editor section is the natural next step).

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
