# TODO

The big foundational pieces — full IJVM opcode set, assembler directives,
memory-mapped console I/O, sample programs, bit-level control-store views,
the µinstruction inspector, editor gutters with µaddress / breakpoints,
hover info, autocomplete, snippets, and step-back/undo — are all shipped.
What remains is language-tool polish and stretch goals.

## MAL parser / encoder

- [x] **Two-label conditional `if (Z) goto T; else goto F`.**
- [x] **Negated conditions (`if (~N)` / `if (!Z)`).**
- [x] **Better diagnostics for unsupported ALU expressions.**
- [x] **Round-trip tests** via [src/engine/mal/disassembler.ts](src/engine/mal/disassembler.ts).

## Editor polish

- [x] **Goto-definition / find-references** for IJVM labels, methods,
      vars, and constants (and MAL goto labels). Wired via Monaco's standard
      `registerDefinitionProvider` / `registerReferenceProvider`.
- [x] **Format button for column-aligned MAL.**
      [src/engine/mal/formatter.ts](src/engine/mal/formatter.ts) drives both
      the toolbar button and Monaco's "Format Document" action (Shift+Alt+F).

## Stretch

- [x] **Import / export `.mal` and `.ijvm` files** (File System Access
      API with a download/upload fallback for browsers without it).
      [src/utils/fileIO.ts](src/utils/fileIO.ts) drives the toolbar's
      Import / Export controls.
- [x] **Light theme.** Toggle in the toolbar; CSS-variable swap on
      `:root[data-theme]`, Monaco's `mic1-light` theme defined alongside
      `mic1-dark` in [src/components/monacoSetup.ts](src/components/monacoSetup.ts),
      and Dockview swapped between `themeAbyss` and `themeLight`.
- [x] **Options to show/hide tabs.** [src/components/ViewMenu.tsx](src/components/ViewMenu.tsx)
      lists every dockable panel from
      [src/components/panels.ts](src/components/panels.ts); the Layout
      reconciles the dock against `uiPrefs.hiddenPanels`.
- [x] **Option to show/hide all tab bars (when hidden, not possible to
      switch tabs in a tab group, but that ok).** Same View menu; CSS
      class hides the tab containers.
- [x] **PWA / service-worker offline mode.** Wired via `vite-plugin-pwa`
      with `autoUpdate` + Workbox. After first load the simulator is
      fully cached and runs offline.

## Documentation

- [ ] **Tutorial / walkthrough** for new students: trace one IJVM
      instruction end-to-end through Main1 → handler → memory → datapath.
      Could live as a Markdown page or as guided tooltips inside the app.

## Other MICs

- [ ] **MIC-2 / MIC-3 / MIC-4 variants** — instruction prefetch,
      scoreboarding, pipelining. A natural extension once MIC-1 polish is
      wrapped.
