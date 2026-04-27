# Technology Stack

## Constraints that shaped these choices

- **Client-only.** Must run from a static host (GitHub Pages, Cloudflare Pages, plain `file://` is a stretch goal). No backend services.
- **Snappy install/dev loop.** Students will fork this. Anything that takes 5 minutes to `npm install` is wrong.
- **Long-lived.** No framework-of-the-month picks. Boring, well-maintained tools.
- **TypeScript everywhere.** The engine has many easily-confused 32-bit fields; types catch the obvious bugs early.

## Stack at a glance

| Layer            | Choice                          | Rationale (short)                           |
|------------------|---------------------------------|---------------------------------------------|
| Language         | TypeScript 5.x                  | Type safety for the engine; first-class.    |
| Build / dev      | Vite 5                          | Instant HMR, ESM-native, near-zero config.  |
| UI framework     | React 18                        | Familiar, ecosystem, fine-grained renders.  |
| State            | Zustand                         | Tiny, selector-based, no boilerplate.       |
| Code editors     | Monaco Editor (`@monaco-editor/react`) | Best-in-class language support; the VS Code editor. |
| Window manager   | `dockview-react`                | VS Code-style dockable panels: drag, split, tab.   |
| SVG animation    | Plain SVG + CSS transitions     | The data path is small and mostly static.   |
| Styling          | CSS Modules + CSS variables     | Theming via custom properties; no runtime cost. |
| Icons            | Lucide-react                    | Lightweight, tree-shakable, consistent.     |
| Hex/memory grid  | `react-window`                  | Virtualization for the memory + control store views. |
| Tests (engine)   | Vitest                          | Same config as Vite; fast.                  |
| Tests (UI smoke) | Playwright                      | One-time install, runs headless in CI.      |
| Component dev    | Storybook 8 (optional)          | For developing the data-path view in isolation. |
| Linting          | ESLint + `@typescript-eslint`   | Standard.                                   |
| Formatting       | Prettier                        | Standard.                                   |
| Hosting          | GitHub Pages or Cloudflare Pages| Static; both free.                          |

## Per-decision notes

### Why Vite, not Next.js / CRA / Webpack

Vite gives us a static-export SPA with zero config. Next.js's server features are unused; CRA is unmaintained; raw Webpack is too much config for a project this size. Vite's `vite build` produces hash-versioned static files ready to drop on any CDN.

### Why React, not Svelte / Solid / vanilla

This is judgement-call territory. React was chosen for **ecosystem inertia**: Monaco's React wrapper is solid, `react-window` is the go-to virtualizer, Zustand is a known quantity, and 9/10 students forking the project will already know React. Svelte/Solid would render slightly faster but bring a smaller ecosystem and unfamiliar idioms. The hot path here is animation (CSS) and one virtualized table (handled by `react-window`); React's reconciliation cost is negligible.

### Why Zustand, not Redux / Jotai / Context

The state is one tightly-related blob: code, machine, UI flags. Redux is overkill (no time-travel needed; the engine itself is replayable from the source). Context alone would re-render every consumer on every microcycle. Jotai's atom granularity could work but adds friction to "I need to read 8 registers in one place." Zustand's `useStore(selector)` gives selective subscriptions for free, with one store and no providers.

**Considered but rejected: time-travel via Redux DevTools.** A more useful "time-travel" already falls out of the engine: capture `MachineState` snapshots in a ring buffer and add a "Step Back" button. That's a future feature, not a reason to pick Redux.

### Why Monaco, not CodeMirror 6

CodeMirror 6 is lighter and more modern, and would also work well. Monaco wins here because:

- Students recognise it (it's the VS Code editor).
- Custom languages with our level of complexity (MAL is column-sensitive in places; IJVM has labels and macros) are well-supported via `monaco.languages.register` and `setMonarchTokensProvider`.
- Marker API for assembler errors is straightforward.

The size cost (~2 MB gzipped) is acceptable for a tool whose audience is on a desktop browser. We lazy-load it so the initial paint is fast.

### Why Dockview, not Golden Layout / FlexLayout / react-mosaic / hand-rolled

The UI demands VS Code-style panel docking: drag tabs between groups, split horizontally / vertically, persist layout. Building this by hand would be weeks of fiddly drag-and-drop work — split-resizing alone is a project. We considered:

- **Golden Layout** — long-standing, popular, but its React bindings have always been an afterthought; the API is awkward and the docs are stale.
- **FlexLayout** — works, but rendering perf is noticeably worse and the styling hooks are limited.
- **react-mosaic** — only does splits, no real tabs / drag-between-groups.
- **rc-dock** — comparable feature set; somewhat heavier and less polished tabs.
- **Dockview** — TypeScript-native, React-first, well-maintained, the tab/split UX is the closest match to VS Code itself, and the API is pleasant (`api.addPanel`, `api.toJSON()`/`fromJSON()` for persistence, custom tab components for hiding the close button).

Dockview wins on UX fidelity, type quality, and ergonomics. ~70 KB gzipped — a fair price for what would otherwise be a multi-week implementation.

### Why SVG, not Canvas / WebGL / Konva

The data path has on the order of 50 visible elements. SVG is the right tool: declarative, CSS-animatable, accessible, and trivially editable (the diagram is literally a `.tsx` file with `<path>` elements). Canvas would force us to write a render loop for what is essentially a static diagram with class-toggle highlights. WebGL/Konva are massive overkill.

### Why CSS Modules + variables, not Tailwind / styled-components

Two reasons:

1. **Theming.** CSS variables (`--bus-active`, `--reg-flash`, `--bg-1`) make dark/light themes a matter of swapping a single root class. Tailwind's theming is more elaborate than we need.
2. **The data path is hand-tuned.** Position, color, glow filters live in CSS that's tightly coupled to the SVG. Co-locating that CSS with the SVG component as a `.module.css` is clearer than an explosion of utility classes.

Tailwind would still be reasonable for the surrounding UI; the choice not to use it is mostly to keep one styling approach across the app.

### Why a single-page app, not multiple pages / multiple routes

There are no separable views. Code, simulation, and observation are the same activity. URL routing buys nothing.

We may add **shareable URL state**: serialize the source code (LZ-compressed, base64'd) into the hash, so users can share programs as links. That's a small addition, not a routing requirement.

## Dependencies (production)

```
react                   ^18.3.0
react-dom               ^18.3.0
zustand                 ^4.5.0
@monaco-editor/react    ^4.6.0
monaco-editor           ^0.50.0
dockview-react          ^4.0.0    // VS Code-style dockable panels
react-window            ^1.8.0
lucide-react            ^0.400.0
lz-string               ^1.5.0    // for shareable URL state
```

That's it for runtime deps. Total transferred (gzipped, lazy-load Monaco): ~150 KB initial + ~600 KB on first editor open.

## Dependencies (dev)

```
typescript              ^5.4.0
vite                    ^5.2.0
@vitejs/plugin-react    ^4.3.0
vitest                  ^1.6.0
@testing-library/react  ^16.0.0
playwright              ^1.45.0
eslint                  ^9.0.0
@typescript-eslint/*    ^7.0.0
prettier                ^3.3.0
```

Optional (Storybook): added later if/when the data-path component grows complex enough to warrant isolated development.

## Project initialization

```bash
npm create vite@latest mic1-visualizer -- --template react-ts
cd mic1-visualizer
npm install zustand @monaco-editor/react monaco-editor react-window lucide-react lz-string
npm install -D vitest @testing-library/react playwright @types/react-window
```

That's the entire bootstrap.

## CI / deployment

- GitHub Actions: two jobs.
  - `test`: `npm ci && npm run lint && npm run typecheck && npm run test`.
  - `deploy`: on `main`, `npm run build` and publish `dist/` to GitHub Pages.
- Optional Playwright job for smoke tests; runs on PRs only, not on every push.

## What we explicitly are *not* using and why

- **No backend, no database, no auth.** No need; programs persist in localStorage. Sharing is via URL hash.
- **No SSR / Next.js.** Nothing to render server-side; the simulator is the application.
- **No PWA / service worker** in v1. Could add later for offline use.
- **No WASM** core. The simulator is fast enough in plain TypeScript at the speeds we care about (animation tops out at ~5 microcycles/sec; turbo runs hundreds of thousands per second, still fine in JS for memory sizes ≤ 64 MiB).
- **No state machine library** (XState etc.). The execution mode (`paused | running | waiting-for-input | halted | error`) is small enough that a tagged union and one reducer in the store are clearer than an external library.
- **No GraphQL, tRPC, REST client.** No network.
