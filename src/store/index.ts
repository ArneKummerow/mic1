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
import { step, snapshotMachineState } from '../engine/simulator';
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

/**
 * Maximum number of micro-cycle snapshots retained for step-back/undo.
 * Each snapshot deep-copies `machine.memory` (default 64 KiB), so the
 * cap also bounds the persistent footprint.
 */
export const STEP_BACK_HISTORY_SIZE = 128;

interface HistoryEntry {
  machine: MachineState;
  consoleOutput: string;
  consoleInput: string;
  currentOpcodeAddress: number;
  lastTrace: MicroTrace | null;
}

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

  /** Number of step-back snapshots currently retained. */
  historyDepth: number;

  /**
   * Persisted UI preferences (rendering toggles etc.). Kept here rather
   * than in component state so they survive a reload alongside the
   * editor sources.
   */
  uiPrefs: UiPrefs;

  // Actions.
  setMicrocode: (text: string) => void;
  setMacrocode: (text: string) => void;
  reset: () => void;
  microstep: () => void;
  macrostep: () => void;
  /** Pop the latest snapshot and restore the machine to that state. */
  stepBack: () => void;
  /** Pop snapshots until the most-recent Main1 dispatch boundary. */
  macrostepBack: () => void;
  run: () => void;
  pause: () => void;
  setSpeed: (speed: number) => void;
  toggleBreakpoint: (addr: number) => void;
  clearConsoleOutput: () => void;
  appendConsoleInput: (s: string) => void;
  resetToDefaults: () => void;
  copyShareUrl: () => Promise<string>;

  setControlStoreBitView: (v: boolean) => void;
  setControlStoreHideEmpty: (v: boolean) => void;
}

export interface UiPrefs {
  /** Render the Control Store rows in 36-bit-word-decomposed layout. */
  controlStoreBitView: boolean;
  /** Hide unused control-store slots (with placeholder span markers). */
  controlStoreHideEmpty: boolean;
}

const DEFAULT_UI_PREFS: UiPrefs = {
  controlStoreBitView: false,
  controlStoreHideEmpty: false,
};

let runIntervalHandle: ReturnType<typeof setInterval> | null = null;

const stopInterval = (): void => {
  if (runIntervalHandle !== null) {
    clearInterval(runIntervalHandle);
    runIntervalHandle = null;
  }
};

/**
 * Ring buffer of pre-step snapshots. Module-scoped (rather than living in
 * the store) so the (potentially-large) deep-copied memory arrays don't
 * trigger Zustand subscribers on every step.
 */
const history: HistoryEntry[] = [];

function pushHistory(entry: HistoryEntry): void {
  history.push(entry);
  if (history.length > STEP_BACK_HISTORY_SIZE) {
    history.shift();
  }
}

function clearHistory(): void {
  history.length = 0;
}

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
        historyDepth: 0,
        uiPrefs: { ...DEFAULT_UI_PREFS },

        setMicrocode: (text) => {
          set({ microcode: text });
        },
        setMacrocode: (text) => {
          set({ macrocode: text });
        },

        reset: () => {
          stopInterval();
          clearHistory();
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
            historyDepth: 0,
          });
        },

        microstep: () => {
          const { machine, breakpoints } = get();
          if (machine.halted) {
            set({ mode: 'halted' });
            return;
          }
          // Snapshot before mutating, so step-back can rewind one cycle.
          // The deep-copy is bounded by STEP_BACK_HISTORY_SIZE entries.
          pushHistory({
            machine: snapshotMachineState(machine),
            consoleOutput: get().consoleOutput,
            consoleInput: get().consoleInput,
            currentOpcodeAddress: get().currentOpcodeAddress,
            lastTrace: get().lastTrace,
          });
          try {
            const trace = step(machine);
            // Drain any bytes emitted by OUT into the UI-facing string.
            let appendedOutput = '';
            if (machine.consoleOutputBuffer.length > 0) {
              appendedOutput = String.fromCharCode(...machine.consoleOutputBuffer);
              machine.consoleOutputBuffer.length = 0;
            }
            const wasStalled = trace.mpcAfter === trace.mpcBefore && machine.waitingForInput;
            const newMode: ExecutionMode = machine.halted
              ? 'halted'
              : machine.waitingForInput
                ? 'waiting-for-input'
                : trace.mpcAfter === trace.mpcBefore
                  ? 'halted'
                  : breakpoints.has(trace.mpcAfter)
                    ? 'paused'
                    : get().mode === 'running' || get().mode === 'waiting-for-input'
                      ? 'running'
                      : 'paused';
            // A Main1 dispatch (MPC 0 → opcode handler) means a new IJVM
            // instruction is about to be processed; PC at this moment is the
            // byte address of that opcode.
            const dispatchedNew = trace.mpcBefore === 0 && trace.mpcAfter !== 0;
            // Mirror the post-step input buffer back to the UI-facing
            // string. The simulator may have drained bytes from it.
            const inputView = String.fromCharCode(...machine.consoleInputBuffer);
            set({
              machine: { ...machine },
              lastTrace: trace,
              mode: newMode,
              tick: get().tick + 1,
              historyDepth: history.length,
              consoleInput: inputView,
              ...(appendedOutput && { consoleOutput: get().consoleOutput + appendedOutput }),
              ...(dispatchedNew ? { currentOpcodeAddress: machine.PC } : {}),
              ...(machine.halted && machine.error ? { errorMessage: machine.error } : {}),
            });
            // If we just transitioned into a stall, the run-loop callback
            // will see `mode !== 'running'` next tick and stop itself; no
            // explicit cleanup needed here.
            void wasStalled;
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

        stepBack: () => {
          stopInterval();
          const entry = history.pop();
          if (entry === undefined) return;
          // The popped MachineState is itself a snapshot; reuse its memory
          // directly (no further clone needed — the entry is now consumed).
          set({
            machine: entry.machine,
            lastTrace: entry.lastTrace,
            consoleOutput: entry.consoleOutput,
            consoleInput: entry.consoleInput,
            currentOpcodeAddress: entry.currentOpcodeAddress,
            mode: entry.machine.halted
              ? 'halted'
              : entry.machine.waitingForInput
                ? 'waiting-for-input'
                : 'paused',
            errorMessage: entry.machine.error,
            tick: get().tick + 1,
            historyDepth: history.length,
          });
        },

        macrostepBack: () => {
          stopInterval();
          // Pop one snapshot at a time; stop when we land on a state where
          // MPC == 0 (i.e. just before a Main1 dispatch — the start of an
          // IJVM instruction).
          let entry = history.pop();
          while (entry !== undefined && entry.machine.MPC !== 0) {
            entry = history.pop();
          }
          if (entry === undefined) return;
          set({
            machine: entry.machine,
            lastTrace: entry.lastTrace,
            consoleOutput: entry.consoleOutput,
            consoleInput: entry.consoleInput,
            currentOpcodeAddress: entry.currentOpcodeAddress,
            mode: entry.machine.halted
              ? 'halted'
              : entry.machine.waitingForInput
                ? 'waiting-for-input'
                : 'paused',
            errorMessage: entry.machine.error,
            tick: get().tick + 1,
            historyDepth: history.length,
          });
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
        appendConsoleInput: (s) => {
          // Push char codes into the machine's input buffer so `IN`'s
          // memory-mapped read can drain them. The store's `consoleInput`
          // string mirrors the buffer (bytes still pending consumption).
          const machine = get().machine;
          for (let i = 0; i < s.length; i++) {
            machine.consoleInputBuffer.push(s.charCodeAt(i) & 0xff);
          }
          const wasWaiting = get().mode === 'waiting-for-input';
          set({
            consoleInput: String.fromCharCode(...machine.consoleInputBuffer),
            machine: { ...machine },
            tick: get().tick + 1,
          });
          // If we were stalled in IN, resume the run-loop so the rd cycle
          // gets retried with the now-non-empty buffer.
          if (wasWaiting) {
            get().run();
          }
        },

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

        setControlStoreBitView: (v) => {
          set({ uiPrefs: { ...get().uiPrefs, controlStoreBitView: v } });
        },
        setControlStoreHideEmpty: (v) => {
          set({ uiPrefs: { ...get().uiPrefs, controlStoreHideEmpty: v } });
        },
      }),
      {
        name: 'mic1-visualizer:v1',
        // Only persist user-editable sources + UI prefs. Re-bootstrap derives
        // everything else on load.
        partialize: (s) => ({
          microcode: s.microcode,
          macrocode: s.macrocode,
          uiPrefs: s.uiPrefs,
        }),
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
