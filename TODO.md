# TODO

The big foundational pieces — full IJVM opcode set, assembler directives,
memory-mapped console I/O, sample programs, bit-level control-store views,
the µinstruction inspector, editor gutters with µaddress / breakpoints,
hover info, autocomplete, snippets, and step-back/undo — are all shipped.
What remains is language-tool polish and stretch goals.

## MAL parser / encoder

- [ ] **Two-label conditional `if (Z) goto T; else goto F`.** Tanenbaum's
  textbook MAL uses this form; the current parser only accepts a single
  target. The two-label form lets the assembler validate
  `T = F | 0x100` (the bit-8 invariant) explicitly rather than relying on
  placement convention. See
  [src/engine/mal/parser.ts](src/engine/mal/parser.ts) (`parseIfStatement`)
  and [src/engine/mal/encoder.ts](src/engine/mal/encoder.ts).
- [ ] **Negated conditions (`if (~N)` / `if (!Z)`).** Useful for handlers
  whose taken-branch is the less-common case.
- [ ] **Better diagnostics for unsupported ALU expressions.** The encoder
  rejects e.g. `H - 1` with a plain "not expressible" error. Suggest the
  equivalent supported form (`-1 + H`, etc.) where possible.
- [ ] **Round-trip tests.** Disassemble an encoded `Microinstruction`
  back to MAL, re-assemble, assert byte-equivalence — catches encoder
  bugs the current expression-shape tests miss.

## Editor polish

- [ ] **Goto-definition / find-references** for IJVM labels, methods,
  vars, and constants. The hover provider already shows the resolved
  address / index; this would add navigation in
  [MacrocodeEditor](src/components/MacrocodeEditor.tsx) (and the MAL
  equivalent for goto labels).
- [ ] **Format button for column-aligned MAL.** Walk parsed lines,
  compute column widths for label / assignments / mem-ops / goto, re-emit
  with whitespace padding.

## Stretch

- [ ] **Import / export `.mal` and `.ijvm` files** (File System Access
  API with a download/upload fallback for browsers without it).
- [ ] **Light theme.**
- [ ] **PWA / service-worker offline mode.**
- [ ] **MIC-2 / MIC-3 / MIC-4 variants** — instruction prefetch,
  scoreboarding, pipelining. A natural extension once MIC-1 polish is
  wrapped.

## Documentation

- [ ] **Tutorial / walkthrough** for new students: trace one IJVM
  instruction end-to-end through Main1 → handler → memory → datapath.
  Could live as a Markdown page or as guided tooltips inside the app.
