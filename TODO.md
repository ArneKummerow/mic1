# TODO

Build order for the MIC-1 Visualizer. Roughly dependency-ordered: engine → store → UI → polish. Check items off as you go.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design these refer to.

## Setup

- [x] **Install npm dependencies and verify the dev server boots.** `npm install && npm run dev` — placeholder app should appear at http://localhost:5173.

## Engine (pure TypeScript, no React)

- [x] **Core types and `step()` simulator.** Define `MachineState`, `Microinstruction`, `MicroTrace` in [src/engine/types.ts](src/engine/types.ts). Implement `step(state) → {state, trace}` as a pure function in `src/engine/simulator.ts`. Golden tests for ALU op selection, JAM logic, memory ops, MPC update.
- [x] **MAL (microcode) assembler.** Lexer + parser + encoder under `src/engine/mal/`. Accepts the MAL syntax from [docs/MIC1_REFERENCE.md](docs/MIC1_REFERENCE.md#mal-syntax-the-assembler-accepts). Returns `{controlStore, errors, sourceMap}`. Round-trip tests where possible.
- [x] **IJVM assembler.** Lexer + parser + encoder under `src/engine/ijvm/`. Handles opcodes, labels, `.method` / `.var` / `.args` / `.const` directives. Returns `{bytes, errors, symbolTable, sourceMap}`.
- [x] **Default microprogram + sample IJVM program.** Bundle the textbook microprogram (in MAL) and a small sample IJVM program (e.g. fibonacci, hello-world) as the preloaded source. Add an end-to-end integration test: assemble both, run on the simulator, assert final register / memory / output.

## Store

- [x] **Zustand store and run-loop.** Slices: `machine`, `sources` (persisted to localStorage, debounced), `assembled` (derived), `execution` (`paused | running | waiting-for-input | halted | error`, speed, breakpoints, lastTrace), `console`. Implement microstep / macrostep / run-at-speed. Pause on breakpoint, halt, or error.

## UI

- [x] **App shell, toolbar, keyboard shortcuts.** Three-row layout (Toolbar / code+datapath+registers / macrocode+memory+console) per [docs/UI_DESIGN.md](docs/UI_DESIGN.md). Toolbar: run/pause, µstep, macro-step, reset, speed slider, status pill, settings, help. Keymap: F5, F10, F11, Shift+F5, Ctrl+S, Ctrl+B.
- [x] **Register panel, Memory view, Control Store view.** Register panel always visible with most-recently-written highlight. Memory view: hex grid + region overlays (method area / constant pool / LV frame / operand stack) + separate stack-as-list panel. Control store: virtualized table (`react-window`) with current-MPC auto-scroll.
- [x] **Monaco MAL and IJVM editors.** Custom language definitions (Monarch tokens). Gutter shows assembled µaddress / IJVM byte address. Yellow arrow tracks current MPC / PC. Red squiggles for assembler errors with click-to-jump. Format button for column-aligned MAL.
- [x] **Console panel.** Append-only output buffer fed by IJVM `OUT`. Input field; on `IN` with empty buffer, simulator pauses with a "waiting for input" indicator until the user types + Enter.
- [x] **Data Path SVG + trace-driven animation.** Hand-authored SVG of the MIC-1 data path (registers, A/B/C buses, ALU, shifter, memory interface). Animation driven by `lastTrace`: B-source highlight → ALU glow → C-bus fill → register flash. Turbo-mode (>200 µsteps/s) replaces animation with instantaneous flash. Respect `prefers-reduced-motion`.

## Polish

- [x] **Persistence, breakpoints, banners, accessibility, URL sharing.** localStorage autosave for sources (debounced). Breakpoints in microcode + macrocode editors (toggle in gutter, persisted). Halt / assembler-error / illegal-instruction banners with "click to jump to offending line". Colorblind-safe palette verified. Shareable URL hash with LZ-compressed source.

## Stretch (post-v1)

- [ ] Step-back via ring-buffer of `MachineState` snapshots.
- [ ] Import / export `.mal` and `.ijvm` files (File System Access API with download/upload fallback).
- [ ] Light theme.
- [ ] PWA / service worker for offline use.
- [ ] MIC-2 / MIC-3 / MIC-4 variants.
