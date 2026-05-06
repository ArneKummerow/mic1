# MIC-1 Visualizer

An interactive, browser-based simulator and visualizer for the **MIC-1** CPU architecture from Andrew S. Tanenbaum's *Structured Computer Organization*.

## What it does

The MIC-1 is a teaching CPU: a microprogrammed machine whose microcode interprets the **IJVM** (Integer Java Virtual Machine) instruction set. Understanding it means understanding three layers at once — the data path, the microinstructions that drive it, and the macroinstructions those microinstructions implement. This tool makes all three visible and editable side-by-side.

You can:

- **Edit microcode** in MAL (Micro Assembly Language) and **macrocode** in IJVM assembly.
- **Assemble** both into binary form in the browser.
- **Simulate** execution one microstep, one IJVM instruction, or freely at adjustable speed.
- **Watch the data path light up** — A-bus, B-bus, C-bus, ALU, shifter, registers, and memory interface — as values flow through it during each microcycle.
- **Inspect** the operand stack, local variable frame, method area, and constant pool as memory regions, with the relevant registers (SP, LV, CPP, PC) annotated.
- **Use the console** for the IJVM `IN` and `OUT` instructions.

## Goals

1. **Pedagogical clarity over performance.** The point is to *see* what happens, not to run fast.
2. **Faithful to the textbook.** Default microprogram and instruction set match Tanenbaum's reference MIC-1 / IJVM so students can follow along.
3. **Zero install.** Pure client-side — open the page, it works. No backend, no account, no toolchain.
4. **Editable everything.** Users can modify microcode to add new IJVM instructions or change semantics, and immediately see the effect.

## Non-goals

- Implementing MIC-2/3/4 variants (could be a future extension).
- A general JVM. Only IJVM (integers, no objects, no GC).
- Multi-file IDE features. One micro program, one macro program, one console.

## Quickstart

Requirements: **Node.js 20.11+** and **git**. Then:

```bash
git clone <this repo>
cd mic1
npm install
npm run dev          # http://localhost:5173
```

Other useful scripts:

```bash
npm run build        # static bundle in dist/
npm run preview      # serve the production build
npm run test         # run unit tests
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
```

Full setup, install options (fnm / nvm / package manager), editor setup, deployment, and troubleshooting are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Documents

- [CONTRIBUTING.md](CONTRIBUTING.md) — install / build / run / dev workflow.
- [TODO.md](TODO.md) — build order and current progress.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — high-level architecture of the application.
- [docs/UI_DESIGN.md](docs/UI_DESIGN.md) — layout, panels, and interaction design.
- [docs/TECH_STACK.md](docs/TECH_STACK.md) — chosen technologies and dependencies.
- [docs/MIC1_REFERENCE.md](docs/MIC1_REFERENCE.md) — short summary of the MIC-1/IJVM model the simulator implements.

## License

Copyright (C) 2026 Arne Kummerow

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, version 3.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

See [LICENSE](LICENSE) for the full text.
