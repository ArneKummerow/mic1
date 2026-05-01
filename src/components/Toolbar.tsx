import { useState } from 'react';
import {
  Pause,
  Play,
  RotateCcw,
  StepForward,
  StepBack,
  Rewind,
  FastForward,
  AlertTriangle,
  Square,
  Share2,
  FileText,
  LayoutGrid,
} from 'lucide-react';
import { useAppStore, type ExecutionMode, TURBO_THRESHOLD } from '../store';
import { IJVM_SAMPLES } from '../engine/ijvm';
import { DEFAULT_MICROCODE } from '../engine/defaultMicrocode';
import { resetLayout } from './layoutApi';
import styles from './Toolbar.module.css';

const SPEED_PRESETS = [1, 2, 4, 10, 50, 200, 1000, 10000];

export function Toolbar(): JSX.Element {
  const mode = useAppStore((s) => s.mode);
  const speed = useAppStore((s) => s.speed);
  const errorCount = useAppStore((s) => (s.microAssembly?.errors.length ?? 0) + (s.ijvmAssembly?.errors.length ?? 0));
  const lastTrace = useAppStore((s) => s.lastTrace);
  const machineHalted = useAppStore((s) => s.machine.halted);

  const microstep = useAppStore((s) => s.microstep);
  const macrostep = useAppStore((s) => s.macrostep);
  const stepBack = useAppStore((s) => s.stepBack);
  const macrostepBack = useAppStore((s) => s.macrostepBack);
  const historyDepth = useAppStore((s) => s.historyDepth);
  const run = useAppStore((s) => s.run);
  const pause = useAppStore((s) => s.pause);
  const reset = useAppStore((s) => s.reset);
  const setSpeed = useAppStore((s) => s.setSpeed);
  const resetToDefaults = useAppStore((s) => s.resetToDefaults);
  const copyShareUrl = useAppStore((s) => s.copyShareUrl);

  const [shareFlash, setShareFlash] = useState(false);

  const handleShare = async (): Promise<void> => {
    await copyShareUrl();
    setShareFlash(true);
    setTimeout(() => setShareFlash(false), 1500);
  };

  const handleResetDefaults = (): void => {
    if (confirm('Replace the current microcode and macrocode with the bundled defaults? Your changes will be lost.')) {
      resetToDefaults();
    }
  };

  const handleResetLayout = (): void => {
    resetLayout();
  };

  const handleSampleChoice = (e: React.ChangeEvent<HTMLSelectElement>): void => {
    const id = e.target.value;
    e.target.value = ''; // reset so the same sample can be re-selected later
    if (!id) return;
    const sample = IJVM_SAMPLES.find((s) => s.id === id);
    if (!sample) return;
    const currentMicrocode = useAppStore.getState().microcode;
    const microcodeIsCustom = currentMicrocode !== DEFAULT_MICROCODE;
    const microcodeNote = microcodeIsCustom
      ? '\n\nYour MAL microcode will also be reset to the bundled default ' +
        '(samples are designed to run against it — using stale or stripped-down ' +
        'microcode causes runtime errors when a sample dispatches to an opcode the ' +
        'microcode does not implement).'
      : '';
    if (
      confirm(
        `Load the "${sample.label}" sample?\n\n${sample.description}${microcodeNote}\n\nYour current IJVM source will be replaced.`,
      )
    ) {
      // Atomically swap both source slices, then reset immediately so the
      // user sees the sample running without waiting for the source-change
      // debounce. The debounce subscription will fire a second (idempotent)
      // reset 400ms later; that's harmless.
      useAppStore.setState({
        microcode: DEFAULT_MICROCODE,
        macrocode: sample.source,
      });
      useAppStore.getState().reset();
    }
  };

  const isRunning = mode === 'running';
  const isHalted = mode === 'halted' || machineHalted;
  const hasErrors = errorCount > 0;
  const canStep = !isRunning && !isHalted && !hasErrors;
  const canStepBack = !isRunning && historyDepth > 0;

  const handleRunPause = (): void => {
    if (isRunning) pause();
    else run();
  };

  return (
    <div className={`toolbar ${styles.toolbar}`}>
      <div className={styles.left}>
        <button
          onClick={handleRunPause}
          disabled={isHalted || hasErrors}
          title={isRunning ? 'Pause (F5)' : 'Run (F5)'}
          aria-label={isRunning ? 'Pause' : 'Run'}
        >
          {isRunning ? <Pause size={14} /> : <Play size={14} />}
          <span>{isRunning ? 'Pause' : 'Run'}</span>
        </button>
        <button
          onClick={macrostepBack}
          disabled={!canStepBack}
          title={`Step IJVM instruction back${historyDepth > 0 ? ` (history: ${historyDepth})` : ''}`}
          aria-label="Step IJVM back"
        >
          <Rewind size={14} />
          <span>◀ IJVM</span>
        </button>
        <button
          onClick={stepBack}
          disabled={!canStepBack}
          title="Microstep back"
          aria-label="Microstep back"
        >
          <StepBack size={14} />
          <span>◀ µ</span>
        </button>
        <button onClick={microstep} disabled={!canStep} title="Microstep (F11)">
          <StepForward size={14} />
          <span>µStep</span>
        </button>
        <button onClick={macrostep} disabled={!canStep} title="Step IJVM instruction (F10)">
          <FastForward size={14} />
          <span>Step IJVM</span>
        </button>
        <button onClick={reset} title="Reset machine (Shift+F5)">
          <RotateCcw size={14} />
          <span>Reset</span>
        </button>
      </div>

      <div className={styles.center}>
        <label className={styles.speedLabel}>
          Speed
          <input
            type="range"
            min={0}
            max={SPEED_PRESETS.length - 1}
            value={SPEED_PRESETS.indexOf(speed) === -1 ? 2 : SPEED_PRESETS.indexOf(speed)}
            onChange={(e) => setSpeed(SPEED_PRESETS[Number(e.target.value)])}
            className={styles.speedSlider}
          />
          <span className={`mono ${styles.speedValue}`}>{speed}/s</span>
          {speed >= TURBO_THRESHOLD && <span className={styles.turboBadge}>turbo</span>}
        </label>
      </div>

      <div className={styles.right}>
        <button onClick={handleShare} title="Copy a shareable link to the clipboard">
          <Share2 size={14} />
          <span>{shareFlash ? 'Copied!' : 'Share'}</span>
        </button>
        <select
          className={styles.sampleSelect}
          onChange={handleSampleChoice}
          defaultValue=""
          title="Load a bundled IJVM sample into the macrocode editor"
          aria-label="Load IJVM sample"
        >
          <option value="" disabled>
            Sample…
          </option>
          {IJVM_SAMPLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button onClick={handleResetDefaults} title="Restore the bundled default microcode and macrocode">
          <FileText size={14} />
          <span>Defaults</span>
        </button>
        <button onClick={handleResetLayout} title="Restore the default panel arrangement">
          <LayoutGrid size={14} />
          <span>Layout</span>
        </button>
        <StatusPill mode={mode} hasErrors={hasErrors} errorCount={errorCount} mpc={lastTrace?.mpcAfter ?? 0} />
      </div>
    </div>
  );
}

function StatusPill({
  mode,
  hasErrors,
  errorCount,
  mpc,
}: {
  mode: ExecutionMode;
  hasErrors: boolean;
  errorCount: number;
  mpc: number;
}): JSX.Element {
  if (hasErrors) {
    return (
      <span className={`${styles.pill} ${styles.pillError}`}>
        <AlertTriangle size={12} />
        {errorCount} assembly error{errorCount === 1 ? '' : 's'}
      </span>
    );
  }
  if (mode === 'halted') {
    return (
      <span className={`${styles.pill} ${styles.pillHalted}`}>
        <Square size={10} />
        Halted at MPC=0x{mpc.toString(16).padStart(3, '0')}
      </span>
    );
  }
  if (mode === 'error') {
    return (
      <span className={`${styles.pill} ${styles.pillError}`}>
        <AlertTriangle size={12} />
        Runtime error
      </span>
    );
  }
  if (mode === 'running') {
    return <span className={`${styles.pill} ${styles.pillRunning}`}>Running</span>;
  }
  if (mode === 'waiting-for-input') {
    return <span className={`${styles.pill} ${styles.pillWaiting}`}>Waiting for input</span>;
  }
  return (
    <span className={`${styles.pill} ${styles.pillPaused}`}>
      Paused at MPC=0x{mpc.toString(16).padStart(3, '0')}
    </span>
  );
}
