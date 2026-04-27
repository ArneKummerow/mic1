# Contributing / Development Setup

This document is the source of truth for getting a working dev environment, building the project, and running it locally.

## Prerequisites

You need exactly two things on your machine:

1. **Node.js 20.11+** (the LTS line known as *Iron*). The required version is pinned in [.nvmrc](.nvmrc) and [.node-version](.node-version), and enforced by `engines.node` in [package.json](package.json).
2. **Git** (any recent version).

Anything else — TypeScript, Vite, the test runner — is installed locally into `node_modules` by `npm install`. Nothing global, nothing system-wide.

### Installing Node.js

Pick one of these. We recommend a Node version manager (option A or B) so you can have different Node versions per project; package-manager installs (option C) are simpler but lock you to one version system-wide.

> **Important: pick one — don't combine.** If you install Node via a version manager *and* via your system package manager, the system Node will likely shadow the version manager's Node and silently give you the wrong version. If you've already done both, uninstall the system Node (`sudo pacman -Rns nodejs npm`, `sudo apt remove nodejs npm`, `brew uninstall node`, etc.).

#### Option A — `fnm` (recommended; fast, written in Rust)

**Install** — pick whichever you prefer; the binary is identical.

| Method                    | Command                                                                                  |
|---------------------------|------------------------------------------------------------------------------------------|
| Upstream installer (any OS) | `curl -fsSL https://fnm.vercel.app/install \| bash`                                    |
| Manjaro / Arch            | `sudo pacman -S fnm`                                                                     |
| Ubuntu / Debian           | `sudo apt install fnm` (24.04+) — otherwise use the upstream installer                   |
| Fedora                    | `sudo dnf install fnm`                                                                   |
| macOS (Homebrew)          | `brew install fnm`                                                                       |
| Windows (winget)          | `winget install Schniz.fnm`                                                              |
| Windows (Chocolatey)      | `choco install fnm`                                                                      |

**Shell setup — REQUIRED.** fnm needs your shell to evaluate `fnm env` on startup so it can put its shim on `PATH`. The upstream installer appends this line for you; package-manager installs do not (distro packages don't touch your dotfiles), so you must add it yourself. **Without this, `fnm use` reports success but `node --version` will fall back to the system Node — or fail outright.**

Append the matching line to your shell profile:

| Shell        | Profile file               | Line to append                                       |
|--------------|----------------------------|------------------------------------------------------|
| zsh          | `~/.zshrc`                 | `eval "$(fnm env --use-on-cd --shell zsh)"`          |
| bash         | `~/.bashrc`                | `eval "$(fnm env --use-on-cd --shell bash)"`         |
| fish         | `~/.config/fish/config.fish` | `fnm env --use-on-cd --shell fish \| source`       |
| PowerShell   | `$PROFILE`                 | `fnm env --use-on-cd --shell powershell \| Out-String \| Invoke-Expression` |

Put it at the **end** of the profile, after any other tool that touches `PATH` (e.g. conda, asdf, mise) — whichever runs last wins, and fnm's shim must come first on `PATH`.

Then reload your shell and use it:

```bash
exec $SHELL                          # or open a new terminal
cd <project>
fnm use --install-if-missing         # reads .nvmrc, installs if needed
node --version                       # should print v20.x.x
```

`--use-on-cd` makes fnm switch automatically when you `cd` into any directory with a `.nvmrc` / `.node-version` / `package.json#engines.node`.

#### Option B — `nvm`

**Install** — `nvm` is a shell function, not a binary, so the upstream installer is the canonical path. Some distros package it, but the package usually just drops the script and still requires a profile line.

| Method                    | Command                                                                                  |
|---------------------------|------------------------------------------------------------------------------------------|
| Upstream installer (any OS) | `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh \| bash`     |
| Manjaro / Arch (AUR)      | `yay -S nvm` then add the source line below                                              |
| macOS (Homebrew)          | `brew install nvm` then add the source line below                                        |

**Shell setup — REQUIRED.** The upstream installer appends the source lines for you; package-manager installs do not. Append to `~/.zshrc` / `~/.bashrc`:

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
```

(For Homebrew, replace `$HOME/.nvm` with the path printed at the end of `brew install nvm`.)

Reload, then use it:

```bash
exec $SHELL
cd <project>
nvm install                          # reads .nvmrc
nvm use
node --version
```

Unlike fnm, nvm does *not* auto-switch on `cd` out of the box — you re-run `nvm use` per shell, or [add a hook](https://github.com/nvm-sh/nvm#zsh).

#### Option C — System package manager (no version manager)

Simplest, but locks you to one Node version system-wide. Fine if you only work on this project.

| OS / Distro            | Command                                |
|------------------------|----------------------------------------|
| Manjaro / Arch         | `sudo pacman -S nodejs npm`            |
| Ubuntu / Debian        | See [nodesource.com](https://github.com/nodesource/distributions) for current LTS instructions. |
| Fedora                 | `sudo dnf install nodejs npm`          |
| macOS (Homebrew)       | `brew install node@20`                 |
| Windows (winget)       | `winget install OpenJS.NodeJS.LTS`     |
| Windows (Chocolatey)   | `choco install nodejs-lts`             |

No shell setup needed; the package puts `node` and `npm` directly on `PATH`.

#### Verify

In a new shell, in the project directory:

```bash
node --version   # should print v20.11.x or higher
npm --version    # comes bundled with Node
```

If `node --version` prints something other than what you expected (e.g. you installed v20 but see v25), see [Troubleshooting → wrong Node version](#troubleshooting).

> **Why npm and not pnpm/yarn?** No strong reason — npm ships with Node, has no extra install step, and is fast enough for a project this size. `pnpm` works too if you prefer it; just use `pnpm install` / `pnpm dev` / etc. Don't commit a second lockfile.

## First-time setup

```bash
git clone <this repo>
cd mic1
npm install
```

`npm install` will create `node_modules/` (~250 MB) and `package-lock.json` (commit it). On a fresh laptop this takes 30–60 seconds.

## Running the dev server

```bash
npm run dev
```

Vite starts on [http://localhost:5173](http://localhost:5173) with hot-module reload. Edits to anything under `src/` reflect in the browser within ~50 ms; no restart needed.

Stop with `Ctrl+C`.

## Building for production

```bash
npm run build
```

Output goes to `dist/`. The build is fully static — every file is a hashed asset, the entry HTML references them by relative paths (`base: './'` in [vite.config.ts](vite.config.ts)), so you can drop `dist/` onto any static host (GitHub Pages, Cloudflare Pages, S3, even `file://`).

To preview the production build locally:

```bash
npm run preview
```

This serves `dist/` on [http://localhost:4173](http://localhost:4173) — useful to verify the build before deploying.

## Tests

```bash
npm run test         # one-shot, suitable for CI
npm run test:watch   # re-runs on file save
npm run test:ui      # opens Vitest's browser UI on http://localhost:51204
```

Tests live next to the code: `src/foo.ts` → `src/foo.test.ts`. The convention is one test file per implementation file, with the engine being the most thoroughly tested area (it's a pure function over plain data — no excuse not to).

## Linting, formatting, type-checking

```bash
npm run lint          # ESLint, errors fail the run
npm run lint:fix      # ESLint with auto-fix
npm run format        # Prettier, writes
npm run format:check  # Prettier, fails if anything would be rewritten
npm run typecheck     # tsc -b --noEmit, strict mode
```

If you use VS Code with the recommended extensions ([.vscode/extensions.json](.vscode/extensions.json)), formatting runs on save and ESLint fixes apply automatically — you should rarely need to run these by hand.

## All the scripts in one place

| Script             | What it does                                          |
|--------------------|-------------------------------------------------------|
| `npm run dev`      | Vite dev server on `:5173` with HMR                   |
| `npm run build`    | Type-check, then produce static bundle in `dist/`     |
| `npm run preview`  | Serve `dist/` on `:4173`                              |
| `npm run test`     | Run all tests once                                    |
| `npm run test:watch` | Re-run tests on save                                |
| `npm run test:ui`  | Vitest browser UI                                     |
| `npm run lint`     | ESLint check                                          |
| `npm run lint:fix` | ESLint check + auto-fix                               |
| `npm run format`   | Prettier write                                        |
| `npm run format:check` | Prettier check (no write)                         |
| `npm run typecheck`| TypeScript project-references type check             |

## Editor / IDE setup

### VS Code (recommended)

Install the workspace-recommended extensions when prompted, or run *Extensions: Show Recommended Extensions* and install all from the workspace:

- **ESLint** — flat-config aware (we use `eslint.config.js`).
- **Prettier** — formatter on save.
- **Vitest Explorer** — run/debug tests from the gutter.
- **EditorConfig** — picks up `.editorconfig` for consistent indentation.

Workspace settings ([.vscode/settings.json](.vscode/settings.json)) enable format-on-save and ESLint auto-fix.

### Other editors

The project follows [.editorconfig](.editorconfig); any editor with EditorConfig support will respect indentation. ESLint and Prettier are standard CLIs — Neovim, JetBrains, Sublime, etc. all have integrations.

## Project layout

```
mic1/
├── docs/                  Design documents
├── src/
│   ├── engine/            Pure simulator core (no React)
│   ├── store/             Zustand store
│   ├── components/        React components
│   ├── styles/
│   ├── test/              Test setup files (not the tests themselves)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── public/                Static assets copied verbatim
├── index.html             Vite entry
├── vite.config.ts
├── tsconfig*.json
├── eslint.config.js
├── package.json
└── README.md
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for what goes where and why.

## Adding dependencies

```bash
npm install --save <pkg>           # runtime dep
npm install --save-dev <pkg>       # dev/build/test dep
```

Commit both `package.json` and `package-lock.json` in the same commit. Don't hand-edit the lockfile.

When adding a runtime dep, also update [docs/TECH_STACK.md](docs/TECH_STACK.md) with a one-line rationale — future-you will want to know.

## Deployment

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) lints, type-checks, tests, builds, and — on `main` — deploys to GitHub Pages. There is no manual deployment step. To deploy elsewhere, copy `dist/` after `npm run build`.

## Troubleshooting

**`fnm use` succeeds but `node --version` shows the wrong version** — your `PATH` has a system Node ahead of fnm's shim. Two ways this happens: (1) you installed Node both via fnm *and* via your system package manager — uninstall the system one (`sudo pacman -Rns nodejs npm` etc.); (2) the `eval "$(fnm env ...)"` line is missing from your shell profile or is sourced *before* something else that prepends to `PATH`. Move it to the end of `~/.zshrc` / `~/.bashrc` and `exec $SHELL`. Verify with `which -a node` — fnm's shim path (under `~/.local/state/fnm_multishells/...`) should be the first entry.

**`fnm use` says "We can't find the necessary environment variables"** — you skipped the shell setup step. Add the `eval "$(fnm env --use-on-cd --shell <shell>)"` line to your shell profile (see [Option A](#option-a--fnm-recommended-fast-written-in-rust)) and `exec $SHELL`.

**`npm install` fails with `EACCES`** — you're probably running into root-owned files in `node_modules` from an earlier `sudo`. Delete `node_modules` and `package-lock.json`, then `npm install` *without* sudo.

**`npm run dev` says "port 5173 is in use"** — another Vite is running, or pass `-- --port 5174`.

**TypeScript can't find `vite/client` / module errors after pulling** — run `npm install` again. New deps were probably added.

**ESLint says "Cannot find module 'eslint-plugin-react-hooks'"** — flat-config support requires `eslint-plugin-react-hooks@^5`. Your `node_modules` is stale; reinstall.

**Tests fail with "document is not defined"** — make sure `vite.config.ts` still has `test.environment: 'jsdom'`. JSDOM is what gives tests a `document`.

**Hot reload not working** — close the browser tab, hard-reload (Ctrl+Shift+R), and reopen. If the file you're editing is outside `src/`, HMR won't pick it up; only `src/` and `index.html` are watched.

**On Windows: line-ending warnings in git** — `git config core.autocrlf input` once, then `git rm --cached -r .` and re-stage. Our `.editorconfig` and `.gitignore` are LF-clean.

## Conventions in this repo

- **TypeScript strict mode.** Don't disable rules per-file unless you have a real reason; prefer fixing the type.
- **Pure engine.** Anything in `src/engine/` must not import React, Zustand, or browser APIs. Engine code should be runnable from a Node script (helpful for repro tests).
- **No comments unless they explain *why*.** Names should carry the *what*. See [README.md](README.md) for the project's pedagogical tone — code reads alongside docs.
- **Commits**: small, focused, present tense. PRs welcome but not required for solo contributors.
