/**
 * Application state — Zustand store covering machine, source code, assembled
 * artifacts, execution mode, and console.
 *
 * Reactivity note: `step()` mutates the `MachineState` object in place
 * (memory is multi-MiB; cloning per cycle is not viable). After each step we
 * replace `machine` with a shallow clone, sharing the same `memory`
 * Uint8Array. Components subscribing to specific fields (`machine.MAR`, etc.)
 * receive correct re-renders. Memory-viewing components should additionally
 * subscribe to `tick`, which increments on every state change, since the
 * memory array reference does not.
 */

import { create } from 'zustand';
import { persist, subscribeWithSelector } from 'zustand/middleware';
import { step } from '../engine/simulator';
import type { MachineState, MicroTrace } from '../engine/types';
import type { AssembleResult } from '../engine/mal';
import type { IJVMAssembleResult } from '../engine/ijvm';
import { DEFAULT_MICROCODE } from '../engine/defaultMicrocode';
import { DEFAULT_MACROCODE } from '../engine/defaultMacrocode';
import { bootstrap } from './bootstrap';
import { decodeShareFromHash, clearShareHash, encodeShareUrl } from './share';

export type ExecutionMode = 'paused' | 'running' | 'halted' | 'error' | 'waiting-for-input';

/** Speed (microsteps per second) above which we suppress data-path animation. */
export const TURBO_THRESHOLD = 200;

export interface AppState {
  // Source (persisted).
  microcode: string;
  macrocode: string;

  // Assembled artifacts (derived from sources).
  microAssembly: AssembleResult | null;
  ijvmAssembly: IJVMAssembleResult | null;

  // Machine.
  machine: MachineState;

  // Execution.
  mode: ExecutionMode;
  speed: number; // microsteps per second
  breakpoints: ReadonlySet<number>;
  lastTrace: MicroTrace | null;
  errorMessage: string | null;

  // Console.
  consoleOutput: string;
  consoleInput: string;

  /**
   * Byte address of the IJVM opcode whose handler is currently active.
   * Updated whenever Main1 dispatches a new opcode (i.e. the just-executed
   * microcycle had mpcBefore == 0 and mpcAfter != 0). Used by the macrocode
   * editor to highlight the IJVM instruction being processed, rather than
   * `PC` directly — `PC` ratchets forward mid-handler and would mis-highlight.
   */
  currentOpcodeAddress: number;

  // Reactivity counter — bump on every step so memory-view subscribers can
  // detect changes despite the Uint8Array reference being stable.
  tick: number;

  // Actions.
  setMicrocode: (text: string) => void;
  setMacrocode: (text: string) => void;
  reset: () => void;
  microstep: () => void;
  macrostep: () => void;
  run: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  toggleBreakpoint: (addr: number) => void;
  clearConsoleOutput: () => void;
  appendConsoleInput: (s: string) => void;
  resetToDefaults: () => void;
  copyShareUrl: () => Promise<string>;
}

let runIntervalHandle: ReturnType<typeof setInterval> | null = null;

const stopInterval = (): void => {
  if (runIntervalHandle !== null) {
    clearInterval(runIntervalHandle);
    runIntervalHandle = null;
  }
};

const initial = bootstrap(DEFAULT_MICROCODE, DEFAULT_MACROCODE);

export const useAppStore = create<AppState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        microcode: DEFAULT_MICROCODE,
        macrocode: DEFAULT_MACROCODE,
        microAssembly: initial.microAssembly,
        ijvmAssembly: initial.ijvmAssembly,
        machine: initial.machine,
        mode: 'paused',
        speed: 4,
        breakpoints: new Set<number>(),
        lastTrace: null,
        errorMessage: null,
        consoleOutput: '',
        consoleInput: '',
        currentOpcodeAddress: 0,
        tick: 0,

        setMicrocode: (text) => {
          set({ microcode: text });
        },
        setMacrocode: (text) => {
          set({ macrocode: text });
        },

        reset: () => {
          stopInterval();
          const { microcode, macrocode } = get();
          const fresh = bootstrap(microcode, macrocode);
          set({
            machine: fresh.machine,
            microAssembly: fresh.microAssembly,
            ijvmAssembly: fresh.ijvmAssembly,
            mode: 'paused',
            lastTrace: null,
            errorMessage: null,
            consoleOutput: '',
            consoleInput: '',
            currentOpcodeAddress: fresh.machine.PC,
            tick: get().tick + 1,
          });
        },

        microstep: () => {
          const { machine, breakpoints } = get();
          if (machine.halted) {
            set({ mode: 'halted' });
            return;
          }
          try {
            const trace = step(machine);
            const newMode: ExecutionMode =
              machine.halted || trace.mpcAfter === trace.mpcBefore
                ? 'halted'
                : breakpoints.has(trace.mpcAfter)
                  ? 'paused'
                  : get().mode === 'running'
                    ? 'running'
                    : 'paused';
            // A Main1 dispatch (MPC 0 → opcode handler) means a new IJVM
            // instruction is about to be processed; PC at this moment is the
            // byte address of that opcode.
            const dispatchedNew = trace.mpcBefore === 0 && trace.mpcAfter !== 0;
            set({
              machine: { ...machine },
              lastTrace: trace,
              mode: newMode,
              tick: get().tick + 1,
              ...(dispatchedNew ? { currentOpcodeAddress: machine.PC } : {}),
              ...(machine.halted && machine.error ? { errorMessage: machine.error } : {}),
            });
          } catch (err) {
            set({
              mode: 'error',
              errorMessage: err instanceof Error ? err.message : String(err),
              machine: { ...machine },
              tick: get().tick + 1,
            });
          }
        },

        macrostep: () => {
          const stepFn = get().microstep;
          // Step until MPC returns to 0 (Main1) — which fires once per IJVM
          // instruction completion. Cap at 1000 to defend against bugs.
          for (let i = 0; i < 1000; i++) {
            stepFn();
            const { machine, mode } = get();
            if (machine.halted || mode !== 'paused' && mode !== 'running') break;
            if (machine.MPC === 0) break;
          }
        },

        run: () => {
          stopInterval();
          set({ mode: 'running' });
          const tick = (): void => {
            const { mode } = get();
            if (mode !== 'running') {
              stopInterval();
              return;
            }
            get().microstep();
          };
          const speed = get().speed;
          const intervalMs = Math.max(1, 1000 / speed);
          runIntervalHandle = setInterval(tick, intervalMs);
        },

        pause: () => {
          stopInterval();
          set((s) => (s.mode === 'running' ? { mode: 'paused' } : {}));
        },

        setSpeed: (speed) => {
          const wasRunning = get().mode === 'running';
          stopInterval();
          set({ speed });
          if (wasRunning) get().run();
        },

        toggleBreakpoint: (addr) => {
          const next = new Set(get().breakpoints);
          if (next.has(addr)) next.delete(addr);
          else next.add(addr);
          set({ breakpoints: next });
        },

        clearConsoleOutput: () => set({ consoleOutput: '' }),
        appendConsoleInput: (s) => set({ consoleInput: get().consoleInput + s }),

        resetToDefaults: () => {
          set({ microcode: DEFAULT_MICROCODE, macrocode: DEFAULT_MACROCODE });
          // The subscription below re-bootstraps after the debounce.
        },

        copyShareUrl: async () => {
          const { microcode, macrocode } = get();
          const url = encodeShareUrl({ microcode, macrocode });
          try {
            await navigator.clipboard.writeText(url);
          } catch {
            // Clipboard unavailable; caller can fall back to manual copy.
          }
          return url;
        },
      }),
      {
        name: 'mic1-visualizer:v1',
        // Only persist user-editable sources. Re-bootstrap derives everything
        // else on load.
        partialize: (s) => ({ microcode: s.microcode, macrocode: s.macrocode }),
        // After hydration, run a fresh bootstrap so the machine reflects the
        // restored sources.
        onRehydrateStorage: () => (state) => {
          if (!state) return;
          const fresh = bootstrap(state.microcode, state.macrocode);
          state.machine = fresh.machine;
          state.microAssembly = fresh.microAssembly;
          state.ijvmAssembly = fresh.ijvmAssembly;
          state.tick = state.tick + 1;
        },
      },
    ),
  ),
);

// Re-assemble whenever sources change (debounced). We can't do this inside
// the action setters because we want to debounce; subscribing once at module
// scope is the simplest approach.
let reassembleTimer: ReturnType<typeof setTimeout> | null = null;
const REASSEMBLE_DEBOUNCE_MS = 400;

useAppStore.subscribe(
  (s) => [s.microcode, s.macrocode] as const,
  () => {
    if (reassembleTimer !== null) clearTimeout(reassembleTimer);
    reassembleTimer = setTimeout(() => {
      useAppStore.getState().reset();
    }, REASSEMBLE_DEBOUNCE_MS);
  },
  { equalityFn: (a, b) => a[0] === b[0] && a[1] === b[1] },
);

// If the URL hash contains shared code, apply it now (after persist
// hydration). The hash takes priority over localStorage so a shared link
// always shows the shared program. We then clear the hash so a refresh
// doesn't keep clobbering localStorage edits.
{
  const shared = decodeShareFromHash();
  if (shared) {
    useAppStore.setState({ microcode: shared.microcode, macrocode: shared.macrocode });
    clearShareHash();
  }
}
