# UI Design

## Design principles

1. **Everything visible at once.** The whole point is to correlate microcode with what the data path does and what registers change. Hiding any of those behind tabs defeats the purpose. The default layout shows code, data path, registers, memory, and console simultaneously.
2. **One source of truth on screen.** The currently executing microinstruction is highlighted in *both* the editor and the control-store view. The currently executing IJVM instruction is highlighted in *both* the macrocode editor and the memory view.
3. **Animations are pedagogical, not decorative.** A microcycle's animation lasts long enough (200–400 ms at default speed) to be read, and shorter at faster speeds; it is suppressed entirely in "turbo" mode.
4. **Dark theme by default.** Saturated colors on a dark background make active bus segments and changed registers pop. A light theme is provided but secondary.

## Top-level layout

The toolbar is a fixed strip at the top. Below it sits a **dockable panel area** (powered by [Dockview](https://dockview.dev/)) that hosts every other surface — microcode editor, macrocode editor, data path, memory view, registers, control store, console.

Each surface is a **panel** rendered as a tab inside a **tab group**. Users can:

- **Drag a tab** to a different group, or to one of the four edge zones of an existing group to **split** that group horizontally / vertically.
- **Reorder tabs** within a group.
- **Resize splits** by dragging the dividers between groups.

Constraints:

- Panels **cannot be closed**. Every one of the seven surfaces is always present somewhere in the layout. The custom tab component therefore has no `×` close button — only a title and a drag handle. This is intentional pedagogy: students can rearrange to suit their screen, but they can't accidentally lose a panel.
- The toolbar is **not** part of the dockable area; it always lives at the top.
- Layout state (which tabs in which groups, in what order, with what sizes) is persisted to localStorage and restored on reload.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ Toolbar  [▶ Run] [⏭ µStep] [⏩ IJVM] [⟲ Reset]  speed [───●──]   [Share] [Defaults]  ◉ Halted │
├──────────────────────────┬──────────────────────────┬───────────────────────┤
│ ┌── Microcode (MAL) ──┐  │ ┌── Data Path ─────────┐ │ ┌── Registers │ Ctrl Store ── ┐│
│ │                      │  │ │                       │ │ │                              ││
│ │  (Monaco)            │  │ │  (SVG)                │ │ │  (registers active)          ││
│ │                      │  │ │                       │ │ │                              ││
│ └──────────────────────┘  │ └───────────────────────┘ │ └──────────────────────────────┘│
├──────────────────────────┼──────────────────────────┼───────────────────────┤
│ ┌── Macrocode (IJVM) ─┐  │ ┌── Memory ────────────┐ │ ┌── Console ────────────────────┐│
│ │                      │  │ │                       │ │ │                              ││
│ └──────────────────────┘  │ └───────────────────────┘ │ └──────────────────────────────┘│
└──────────────────────────┴──────────────────────────┴───────────────────────┘
```

Default layout (used on first load and after **Reset Layout**):

| Cell    | Group contains              |
|---------|-----------------------------|
| top-L   | Microcode editor            |
| top-C   | Data Path                   |
| top-R   | Registers + Control Store (two tabs in one group; Registers is the active tab) |
| bot-L   | Macrocode editor            |
| bot-C   | Memory                      |
| bot-R   | Console                     |

Resizable splitters between every pair of adjacent groups; sizes persist.

A **Reset Layout** affordance lives in the toolbar's settings menu (or as a keyboard shortcut) so users who get lost in a custom arrangement can recover the default with one click.

On narrow screens (<1024 px) Dockview gracefully falls back to a vertical scroll of stacked groups; users can also drag everything into a single group of stacked tabs if they want a maximum-area "focus mode" for any one panel.

## Toolbar

Compact, single-line. Left-aligned execution controls; right-aligned utilities.

- **Run / Pause** — single toggle button (icon swaps).
- **µStep** — execute one microinstruction.
- **Step IJVM** — run until next IJVM fetch (i.e. one full macroinstruction).
- **Reset** — restart with current code; confirmation only if running.
- **Speed slider** — logarithmic, 1 µs/s to 100 000 µs/s. Marker at "turbo" threshold (~200/s) where animations switch off.
- **Settings** — memory size, theme, animation toggle, "show internal labels" toggle.
- **Help / About** — opens a modal with key bindings and a short MIC-1 primer.
- **Status pill** — shows `Halted`, `Running`, `Paused at MPC=0x023`, or assembler error count.

Keyboard:

| Key       | Action            |
|-----------|-------------------|
| `F5`      | Run / Pause       |
| `F10`     | Step IJVM         |
| `F11`     | µStep             |
| `Shift+F5`| Reset             |
| `Ctrl+S`  | Save (download)   |
| `Ctrl+B`  | Toggle breakpoint |

## Microcode Editor

- Monaco editor with a custom MAL language definition.
- Syntax highlighting for register names, ALU ops (`AND`, `OR`, `+`, `-`, `1`, `0`, etc.), shifter (`<<8`, `>>1`), goto (`goto Label`, `if (N) goto …`), memory ops (`rd`, `wr`, `fetch`), labels (`Label1:`).
- **Gutter markers**:
  - Red dot = breakpoint.
  - Yellow arrow = currently executing microinstruction (synced with control-store view).
  - Red squiggle on assembler errors with hover for the message.
- A small "address column" on the left shows the assembled microaddress for each line.
- "Format" button reflows columns into a fixed-width view (MAL is traditionally column-aligned).
- Errors panel below the editor (collapsible) lists all assembler diagnostics with click-to-jump.

## Macrocode Editor

- Same Monaco component, separate language definition for IJVM.
- Highlights mnemonics (`BIPUSH`, `IADD`, `INVOKEVIRTUAL`, …), labels, constants.
- **Gutter** shows the byte address of each instruction once assembled.
- Yellow arrow tracks `PC` so the user can see which IJVM instruction is currently in flight.
- Method declarations (`.method`) and constant pool entries (`.const`) are folded by default.

## Data Path View

This is the centerpiece. A hand-drawn SVG of the MIC-1 data path, faithful to Tanenbaum's diagram:

- The 10 registers (MAR, MDR, PC, MBR, SP, LV, CPP, TOS, OPC, H) drawn as boxes with their current value displayed in hex.
- The **B-bus** (vertical, on the left side of the registers) with one tap per register; only one tap is "lit" per cycle, indicating the B-bus source.
- The **A-bus** (single wire from H into the ALU's A input).
- The **ALU** drawn as a trapezoid; below it the **shifter**.
- The **C-bus** (horizontal, runs across the tops of the registers); the destinations selected by the C decoder are lit.
- The **memory interface** on the right: MAR/MDR pair labeled "word", PC/MBR pair labeled "byte", with arrows into a small memory icon. Memory ops (`rd`/`wr`/`fetch`) light those arrows.

### Animation per microcycle

Driven by `trace`:

1. **Frame 1 (0 → 30%)** — B-bus source lights up; A-bus (H) lights up; values appear next to each bus segment as floating labels.
2. **Frame 2 (30 → 60%)** — ALU body glows; ALU output value appears at its output; if shifter is active, shifter glows and shows shifted value.
3. **Frame 3 (60 → 90%)** — C-bus path fills in toward the targeted register(s); targeted register boxes flash.
4. **Frame 4 (90 → 100%)** — register values update to their new contents; memory arrows pulse if a memory op was issued.

At default speed each frame is ~80 ms (≈ 320 ms total per microcycle). At higher speeds frames overlap and shorten; in turbo mode the animation is replaced by a single instantaneous flash on changed registers.

### Visual encoding

| Element            | Idle color    | Active color          |
|--------------------|---------------|-----------------------|
| Buses (paths)      | dim gray      | bright cyan (B), magenta (A), lime (C) |
| Registers          | dark fill     | yellow border + flash on write |
| ALU                | dark fill     | orange glow when computing |
| Shifter            | dark fill     | orange glow when active |
| Memory arrows      | dim gray      | red (write), green (read), blue (fetch) |

Color choices respect a colorblind-safe palette (Okabe-Ito) — verified for both deuteranopia and protanopia.

Hovering any register or bus shows a tooltip with its current value in hex / decimal / binary.

## Register Panel

A compact, always-visible table of all registers.

- Columns: Name, Hex, Decimal (signed), Binary (collapsible).
- The most recently written register is highlighted for one cycle.
- SP, LV, CPP, PC have a small indicator that links to the corresponding region in the Memory View when clicked.
- The MPC value is shown at the top with the symbolic label of the current microinstruction (if any).

## Control Store View

A virtualized table (rows are microinstructions). Columns:

| Addr | Label | NEXT | JAM | ALU | C-targets | Mem | B |
|------|-------|------|-----|-----|-----------|-----|---|

- The current MPC row is highlighted and auto-scrolled into view.
- Filter box for label / address.
- Click a row to jump the microcode editor to the corresponding source line.

## Memory View

A hex view, but augmented for IJVM:

- 16 bytes per row, hex + ASCII gutter, addresses on the left.
- **Region overlays** drawn as colored vertical bars on the left:
  - Method area (red) — contains IJVM bytecode, anchored at PC.
  - Constant pool (purple) — anchored at CPP.
  - Local variable frame (blue) — from LV up to SP-stackBase.
  - Operand stack (green) — from frame top up to SP, drawn growing upward.
- A "Follow" dropdown to auto-center the view on PC, SP, LV, or a fixed address.
- The byte at PC and the word at MAR are highlighted distinctly.
- Recently changed bytes briefly flash.
- A separate **Stack panel** (toggleable as either a sidebar or a tab) draws the operand stack as a labeled list of 32-bit words from SP downward, since "stack" is conceptually a list, not a hex grid. This is what students usually want to see.

## Console

Two stacked sub-panels:

- **Output** — append-only text buffer fed by the IJVM `OUT` instruction. Monospace, scrollable, with a "clear" button.
- **Input** — single-line text field. When IJVM `IN` is executed and the input buffer is empty, the simulator pauses with a visible "waiting for input" indicator; typing a character + Enter resumes execution and feeds the bytes to `IN`.

## Error and edge-case states

- **Assembler errors**: editor shows squiggles, errors panel lists them, run/step buttons are disabled with a tooltip explaining why.
- **Halt**: status pill turns gray, all execution buttons except Reset are disabled, a banner at the top of the data-path view says "Halted". 
- **Out-of-bounds memory access / illegal microinstruction**: simulator pauses, banner shows the cause, the offending µinstr is highlighted in red.
- **Empty memory at PC**: treated as `NOP` with a non-fatal warning; common when the user is just exploring without loading code.

## Onboarding

On first load:

1. Default microprogram and a small sample IJVM program (`OUT "Hello"` + a loop) are pre-loaded.
2. A non-blocking tooltip on the toolbar points to the µStep button.
3. The first time the user steps, a one-line caption appears under the data-path view explaining what the highlighted bus segments mean. Dismissible, doesn't return.

No tutorial overlay, no modal walkthrough — the textbook is the tutorial; this app is the lab.

## Responsive / accessibility

- Minimum supported viewport: 1280 × 720. Below that, the layout collapses to tabs and a banner suggests using a larger window.
- All interactive elements reachable by keyboard; focus styles visible on dark theme.
- Animations respect `prefers-reduced-motion`: replaced by instantaneous transitions and a brief flash, same as turbo mode.
- Color is never the only carrier of information — every animated bus/register also has an icon or text label change.
