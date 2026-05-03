# Architecture

The application is a **single-page, client-side React app**. There is no server, no persistence beyond the browser (localStorage for user programs), and no build-time code generation. All assembly, simulation, and rendering happen in the user's browser.

## Layered overview

```
┌──────────────────────────────────────────────────────────────┐
│  UI Layer (React components)                                 │
│  ─ DataPathView  ─ RegisterPanel  ─ MemoryView  ─ StackView  │
│  ─ MicrocodeEditor  ─ MacrocodeEditor  ─ ControlStoreView    │
│  ─ MicroInspector  ─ Console  ─ Toolbar (File / View menus)  │
│  ─ Docs  ─ Layout (DockviewReact)                            │
└────────────────┬─────────────────────────────────────────────┘
                 │ reads state, dispatches actions
┌────────────────┴─────────────────────────────────────────────┐
│  State Layer (Zustand store)                                 │
│  ─ machine state (registers, memory, MPC)                    │
│  ─ source code (microcode, macrocode)                        │
│  ─ assembled artifacts (control store, IJVM bytes)           │
│  ─ execution state (running, speed, breakpoints)             │
│  ─ trace of last microcycle (for animation overlays)         │
└────────────────┬─────────────────────────────────────────────┘
                 │ pure function calls
┌────────────────┴─────────────────────────────────────────────┐
│  Core Engine (plain TypeScript, no React)                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │ MAL Assembler│  │IJVM Assembler│  │   Simulator      │    │
│  │  text → 36b  │  │ text → bytes │  │ executes 1 step  │    │
│  │  microinstr  │  │              │  │ returns trace    │    │
│  └──────────────┘  └──────────────┘  └──────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

The split is deliberate: the **core engine is pure and testable**. Given a machine state and a control store, `step(state) → {state, trace}` is a pure function. The UI never reaches into the engine; it only observes state and dispatches actions.

## Core Engine

### Machine state

A plain object, fully serializable:

```ts
interface MachineState {
  // 32-bit registers
  MAR: number; MDR: number; PC: number; MBR: number;
  SP: number;  LV: number; CPP: number; TOS: number;
  OPC: number; H: number;
  // microprogram counter (9 bits)
  MPC: number;
  // main memory: a Uint8Array (default 4 MiB, configurable)
  memory: Uint8Array;
  // control store: 512 microinstructions
  controlStore: Microinstruction[];
  // pending memory ops scheduled by previous microcycle
  pendingRead: boolean;
  pendingWrite: boolean;
  pendingFetch: boolean;
  // halted flag
  halted: boolean;
}
```

### Microinstruction format

Decoded into a struct (the engine never touches raw 36-bit words at runtime — assembly happens once):

```ts
interface Microinstruction {
  nextAddress: number;        // 9 bits
  jam: { JMPC: bool; JAMN: bool; JAMZ: bool };
  alu: { F0: bool; F1: bool; ENA: bool; ENB: bool; INVA: bool; INC: bool };
  shifter: 'NONE' | 'SLL8' | 'SRA1';
  cBus: Set<RegisterName>;    // which registers receive C-bus
  mem: { read: bool; write: bool; fetch: bool };
  bBus: BBusSource;           // 4-bit selector → register
  // for tooling, not execution:
  sourceLine?: number;
  label?: string;
}
```

### `step(state) → trace`

One call = one microcycle. **Mutates `state` in place** and returns a trace of what happened so the UI can animate it. We deviate from a pure return-new-state design here on purpose: memory is multi-MiB and turbo mode runs ~10⁵ microsteps/sec, so copying memory every cycle would be untenable. For step-back / time-travel we expose `snapshotMachineState(state)` (deep-copies memory) — callers snapshot only when they actually want a checkpoint.

The trace records *what happened* so the UI can animate it:

```ts
interface MicroTrace {
  bBusSource: RegisterName | 'MBR'| 'MBRU' | null;
  bBusValue: number;
  aBusValue: number;          // always H
  aluOutput: number;
  aluFlags: { N: bool; Z: bool };
  shifterOutput: number;
  cBusTargets: RegisterName[];
  cBusValue: number;
  memoryOps: ('read' | 'write' | 'fetch')[];
  mpcBefore: number;
  mpcAfter: number;
}
```

The UI uses `trace` to drive the data-path animation overlay (which bus segments to highlight, which registers to flash) for the most recently executed microcycle.

### Assemblers

Two pure functions:

- `assembleMicrocode(text: string) → { controlStore, errors, sourceMap }`
- `assembleIJVM(text: string) → { bytes, errors, symbolTable, sourceMap }`

`sourceMap` lets the UI highlight the line of source corresponding to the currently executing microinstruction or IJVM byte.

## State Layer

A single Zustand store. Why Zustand over Redux/Context:

- The state graph is small and tightly-coupled (everything lives together: code, machine, UI flags). One store fits.
- Avoiding React Context re-render storms matters here — the data-path view reads many registers but should only re-render when *its* registers change. Zustand's selector-based subscriptions make this easy.
- No middleware or thunks needed; the simulator step is synchronous.

Key slices:

- `machine` — the `MachineState` above.
- `sources` — `{ microcode: string, macrocode: string }`, persisted to localStorage.
- `assembled` — derived from sources; recomputed on edit (debounced).
- `execution` — `{ mode: 'paused'|'running', speed, breakpoints, lastTrace }`.
- `console` — `{ input: string, output: string }`.
- `layout` — the serialised Dockview layout (an opaque JSON blob). Persisted under a separate localStorage key so layout drift can't corrupt machine state and vice versa. Read once on app boot to seed Dockview, then written on every layout change (debounced ~250 ms).

## Execution loop

Three modes triggered from the toolbar:

1. **Microstep** — `dispatch(step)` once.
2. **Macrostep** — call `step` until `MPC == 0` (start of `Main1` in the standard microprogram), so one IJVM instruction completes.
3. **Run** — `setInterval`/`requestAnimationFrame` calls `step` at the configured speed; pauses on breakpoint hit, halt, or user click.

When running fast (>200 microsteps/s), animation is disabled and only register values update — animating every cycle would be both pointless and slow. There's a clear UI affordance for this ("turbo" mode).

## Rendering the data path

The data-path diagram is **SVG**, not Canvas. Reasons:

- Buses, registers, and the ALU are a small, mostly-static graph — SVG handles that with zero per-frame work for the static parts.
- Animating bus highlights = toggling CSS classes on `<path>` elements. No rendering loop required.
- It scales cleanly and remains crisp on zoom.
- It is inspectable in DevTools, which is good for debugging the visualization itself.

The SVG is hand-authored as a React component (`<DataPathView>`) with named elements (`#b-bus`, `#alu-out`, `#reg-pc`, etc.). The component subscribes to `lastTrace` and toggles classes accordingly. CSS `transition` handles the fade.

## Data flow on a single microcycle

```
   user clicks "Step"
          │
          ▼
   store.step()
          │
          ├─► simulator.step(machine) ──► mutates machine, returns trace
          │
          ▼
   store re-derives selectors and stores lastTrace
          │
          ├─► RegisterPanel re-renders changed registers
          ├─► MemoryView re-renders if memory changed
          ├─► ControlStoreView highlights new MPC
          └─► DataPathView animates trace.bBusSource → ALU → cBusTargets
```

## Persistence

- Source code (`microcode`, `macrocode`) is autosaved to `localStorage` on a debounce (currently 400 ms — see `REASSEMBLE_DEBOUNCE_MS`).
- "Reset to defaults" reloads the textbook microprogram and the **Recursive sum** sample (the first entry of `IJVM_SAMPLES` in `src/engine/ijvm/samples.ts`).
- UI preferences (theme, tab-bar visibility, editor word-wrap, follow-execution, control-store toggles, hidden-panel list) are persisted alongside the source under the same store key.
- Optional: import/export as `.mal` and `.ijvm` files via the File System Access API where available, falling back to download/upload.

## Module layout

```
src/
  engine/
    types.ts                  MachineState, Microinstruction, Trace
    simulator.ts              step(), snapshotMachineState()
    mal/                      MAL (microcode) assembler + formatter
      assembler.ts, formatter.ts, …
    ijvm/                     IJVM assembler + opcode table + bundled samples
      assembler.ts, opcodes.ts, samples.ts
    defaultMicrocode.ts       the textbook microprogram as a string
    defaultMacrocode.ts       re-exports the default sample (Recursive sum)
  store/
    index.ts                  Zustand store + UI preferences
    bootstrap.ts              fresh-machine factory
    share.ts                  share-via-URL hash codec
  components/
    Toolbar.tsx               run / pause / step controls + status pill
    FileMenu.tsx              File menu — samples, share, defaults
    ViewMenu.tsx              View menu — theme, layout, tab bars, editor toggles, panel visibility
    Dropdown.tsx              shared portal-rendered toolbar dropdown
    Layout.tsx, Layout.css    DockviewReact wrapper, default layout,
    defaultLayout.ts          tab-bar visibility application,
    layoutApi.ts              persistence, tab-bar reconciliation
    panels.ts                 single source of truth for dockable panels
    DataPathView.tsx          hand-authored SVG of the MIC-1 data path
    RegisterPanel.tsx         hex/dec/bin register table
    MemoryView.tsx            hex view with region overlays
    StackView.tsx             operand-stack list view
    ControlStoreView.tsx      virtualized 512-row control-store table
    BitView.tsx               36-bit-word visualization (used by Control Store + Inspector)
    MicroInspector.tsx        live current-µinstruction inspector
    MicrocodeEditor.tsx       Monaco editor for MAL
    MacrocodeEditor.tsx       Monaco editor for IJVM
    monacoLanguages.ts, monacoProviders.ts, monacoSetup.ts
    Console.tsx               IN/OUT console
    Tooltip.tsx, Tooltip.module.css   portal-rendered tooltip for dense surfaces
    Docs.tsx                  in-app guided tour
    useKeyboardShortcuts.ts   F5 / F10 / F11 / Ctrl+S, etc.
  App.tsx, main.tsx, index.html, index.css
```

### Layout component

`Layout.tsx` owns the dockable area:

- Maps panel IDs (`microcode`, `macrocode`, `dataPath`, `memory`, `registers`, `stack`, `controlStore`, `microInspector`, `console`) to their rendering components. The canonical list lives in `panels.ts` so the View menu, the default-layout helper, and the Layout component all read from the same source.
- On first mount: seeds the layout from localStorage if present, falling back to a hardcoded default arrangement (`defaultLayout.ts`).
- Subscribes to Dockview's layout-change event and writes the serialised layout back to localStorage (debounced).
- Reconciles the dock against `uiPrefs.hiddenPanels` so hiding a panel via the View menu removes its tab; re-checking it adds the panel back at the end of the dock.
- Applies `uiPrefs.tabBarVisibility` (`'all' | 'multi' | 'none'`) by toggling classes on the dock root and on each group's container.
- Provides a custom tab component with no close button, since per-tab close-buttons would let students lose panels by accident; visibility is mediated by the View menu instead.
- Exposes a `resetLayout()` imperative method that clears persisted layout and re-seeds from defaults — wired to the **View ▸ Reset layout** affordance. The layout-storage key (`LAYOUT_STORAGE_KEY` in `layoutApi.ts`) is bumped whenever the default layout shape changes, so existing users don't get a stale arrangement re-applied.

The rest of the components are unchanged: each renders a `<div className="panel">…</div>` with its own internal toolbar header. Dockview wraps each in its tab + content frame and handles all dragging, splitting, and resizing.

## Testing strategy

- **Engine** is unit-tested with Vitest. Golden tests: assemble the textbook microprogram, run a known IJVM program (`a + b`, fibonacci), assert final register/memory state.
- **Assemblers** are tested round-trip where possible (assemble → disassemble → compare).
- **UI** is mostly visual — covered by Storybook stories for each component (paused state, running state, error state) and a couple of Playwright smoke tests (load app, press Step, verify PC advances).
