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
  BookOpen,
  Github,
} from 'lucide-react';

const REPO_URL = 'https://github.com/ArneKummerow/mic1';
import { useAppStore, type ExecutionMode, TURBO_THRESHOLD } from '../store';
import { ViewMenu } from './ViewMenu';
import { FileMenu } from './FileMenu';
import styles from './Toolbar.module.css';

const SPEED_PRESETS = [1, 2, 4, 10, 50, 200, 1000, 10000];

// Open the docs in a new browser tab so students can keep the simulator
// visible alongside. Resolved against the current location so the build's
// base path (and any `?query`) is preserved.
function openDocsTab(): void {
  const url = `${window.location.pathname}${window.location.search}#docs`;
  window.open(url, '_blank', 'noopener');
}

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
          <span>IJVM</span>
        </button>
        <button
          onClick={stepBack}
          disabled={!canStepBack}
          title="Microstep back"
          aria-label="Microstep back"
        >
          <StepBack size={14} />
          <span>µ</span>
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
        <FileMenu />
        <ViewMenu />
        <button onClick={openDocsTab} title="Open documentation in a new tab" aria-label="Open documentation in a new tab">
          <BookOpen size={14} />
          <span>Docs</span>
        </button>
        <button
          onClick={() => window.open(REPO_URL, '_blank', 'noopener')}
          title="View source on GitHub"
          aria-label="View source on GitHub"
        >
          <Github size={14} />
          <span>GitHub</span>
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
