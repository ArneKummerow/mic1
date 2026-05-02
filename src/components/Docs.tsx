/**
 * In-app documentation overlay. Provides a tutorial, a MIC-1 reference,
 * and syntax docs for MAL microcode and IJVM macrocode. Reuses live
 * components from the simulator (the µinstruction inspector + bit-field
 * row) so what students read in the docs matches what they see in the
 * panels.
 */
import { useEffect, useRef, useState } from 'react';
import { X, BookOpen, Cpu, Code2, GraduationCap } from 'lucide-react';
import { MicroInspector } from './MicroInspector';
import { BitFieldRow, BIT_FIELDS_WIDTH, bitRowHeight } from './BitView';
import type { Microinstruction } from '../engine/types';
import styles from './Docs.module.css';

type SectionId =
  | 'tutorial'
  | 'cpu-basics'
  | 'datapath'
  | 'alu'
  | 'memory'
  | 'microinstruction'
  | 'control-flow'
  | 'iadd-walkthrough'
  | 'stack-methods'
  | 'reference'
  | 'mal'
  | 'ijvm';

interface SectionDef {
  id: SectionId;
  title: string;
  group: string;
  icon: JSX.Element;
}

const SECTIONS: readonly SectionDef[] = [
  { id: 'tutorial', title: '1. Getting started', group: 'Learn', icon: <GraduationCap size={14} /> },
  { id: 'cpu-basics', title: '2. What a CPU does', group: 'Learn', icon: <GraduationCap size={14} /> },
  { id: 'datapath', title: '3. Registers & buses', group: 'Learn', icon: <GraduationCap size={14} /> },
  { id: 'alu', title: '4. The ALU & flags', group: 'Learn', icon: <GraduationCap size={14} /> },
  { id: 'memory', title: '5. Memory & the fetch dance', group: 'Learn', icon: <GraduationCap size={14} /> },
  { id: 'microinstruction', title: '6. Inside a microinstruction', group: 'Learn', icon: <GraduationCap size={14} /> },
  { id: 'control-flow', title: '7. Branching & dispatch', group: 'Learn', icon: <GraduationCap size={14} /> },
  { id: 'iadd-walkthrough', title: '8. Walkthrough: IADD', group: 'Learn', icon: <GraduationCap size={14} /> },
  { id: 'stack-methods', title: '9. Stack & method calls', group: 'Learn', icon: <GraduationCap size={14} /> },
  { id: 'reference', title: 'MIC-1 reference', group: 'Reference', icon: <Cpu size={14} /> },
  { id: 'mal', title: 'MAL (microcode)', group: 'Reference', icon: <Code2 size={14} /> },
  { id: 'ijvm', title: 'IJVM (macrocode)', group: 'Reference', icon: <Code2 size={14} /> },
];

export function Docs({ onClose }: { onClose: () => void }): JSX.Element {
  const [section, setSection] = useState<SectionId>('tutorial');
  const contentRef = useRef<HTMLElement>(null);

  // Scroll back to the top whenever the user switches sections — both via
  // the sidebar and via the prev/next nav at the bottom of Learn pages.
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [section]);

  // Group nav items by their group label, preserving order.
  const groups: { name: string; items: SectionDef[] }[] = [];
  for (const s of SECTIONS) {
    let g = groups.find((g) => g.name === s.group);
    if (!g) {
      g = { name: s.group, items: [] };
      groups.push(g);
    }
    g.items.push(s);
  }

  return (
    <div className={styles.overlay} role="dialog" aria-label="Documentation">
      <div className={styles.header}>
        <BookOpen size={16} />
        <span className={styles.title}>MIC-1 Documentation</span>
        <button className={styles.closeBtn} onClick={onClose} title="Close (Esc)">
          <X size={14} />
          <span>Close</span>
        </button>
      </div>
      <div className={styles.body}>
        <nav className={styles.sidebar}>
          {groups.map((g) => (
            <div key={g.name}>
              <div className={styles.navGroup}>{g.name}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  className={
                    section === it.id
                      ? `${styles.navItem} ${styles.navItemActive}`
                      : styles.navItem
                  }
                  onClick={() => setSection(it.id)}
                >
                  {it.title}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <main className={styles.content} ref={contentRef}>
          <div className={styles.contentInner} key={section}>
            {section === 'tutorial' && <TutorialSection />}
            {section === 'cpu-basics' && <CpuBasicsSection />}
            {section === 'datapath' && <DatapathSection />}
            {section === 'alu' && <AluSection />}
            {section === 'memory' && <MemorySection />}
            {section === 'microinstruction' && <MicroinstructionSection />}
            {section === 'control-flow' && <ControlFlowSection />}
            {section === 'iadd-walkthrough' && <IaddWalkthroughSection />}
            {section === 'stack-methods' && <StackMethodsSection />}
            {section === 'reference' && <ReferenceSection />}
            {section === 'mal' && <MalSection />}
            {section === 'ijvm' && <IjvmSection />}
            <LearnNav current={section} onNavigate={setSection} />
          </div>
        </main>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tutorial
// ----------------------------------------------------------------------------

function TutorialSection(): JSX.Element {
  return (
    <>
      <h1>Getting started with MIC-1</h1>
      <p className={styles.lead}>
        A guided tour of the simulator. By the end you'll know what each
        panel shows, how a microinstruction drives the data path, and how
        IJVM bytecode dispatches to microcode.
      </p>

      <h2>1. What is MIC-1?</h2>
      <p>
        <strong>MIC-1</strong> is the microarchitecture from Andrew Tanenbaum's{' '}
        <em>Structured Computer Organization</em>. It's a teaching CPU built from
        a handful of registers and a single 36-bit-wide control word. The control
        word steers data through the ALU, the buses, and memory — once per clock
        cycle.
      </p>
      <p>
        Layered on top of MIC-1 is <strong>IJVM</strong>, a stripped-down Java
        Virtual Machine bytecode. Each IJVM instruction (an opcode byte plus
        operands) is implemented by a sequence of microinstructions stored in the{' '}
        <em>control store</em>. So MIC-1 is the engine, and IJVM is the language
        the engine interprets.
      </p>

      <h2>2. The two editors</h2>
      <p>The app has two editors:</p>
      <ul>
        <li>
          <strong>Microcode (MAL)</strong> — the firmware. One line per
          microinstruction. Edit only if you want to change how IJVM
          opcodes are decoded; the bundled default already implements the
          textbook IJVM subset.
        </li>
        <li>
          <strong>Macrocode (IJVM)</strong> — the program. This is what
          most students will write. Push values, do arithmetic, branch,
          call methods, print to the console.
        </li>
      </ul>
      <p>
        Use <span className={styles.kbd}>File ▸ Load sample</span> to drop in a
        ready-made program (recursive sum, echo loop, WIDE demo, …) so you have
        something to step through.
      </p>

      <h2>3. Step through one microcycle</h2>
      <p>
        Press <span className={styles.kbd}>µStep</span> (or{' '}
        <span className={styles.kbd}>F11</span>) to advance the machine by{' '}
        <em>one</em> microinstruction. Watch what happens in three panels at
        once:
      </p>
      <ol>
        <li>
          <strong>Data path</strong> — the SVG diagram lights up the buses
          (A, B, C) carrying values into and out of the ALU. Registers
          flash yellow when they're written.
        </li>
        <li>
          <strong>Registers</strong> — the values themselves change. The
          panel highlights the deltas.
        </li>
        <li>
          <strong>µinstruction inspector</strong> — shows the 36 control
          bits of the line that just executed, grouped by field.
        </li>
      </ol>

      <h2>4. The current microinstruction, live</h2>
      <p>
        Below is the actual µinstruction inspector — the same component
        embedded in the main UI. As you step the machine, this updates in
        real time:
      </p>
      <Embed label="Live µinstruction inspector">
        <MicroInspector />
        <p className={styles.embedNote}>
          Hover any field to see what it controls. Coloured groups match
          the data-path bus colours.
        </p>
      </Embed>

      <h2>5. Step a whole IJVM instruction</h2>
      <p>
        Each IJVM opcode takes several microinstructions to execute (a
        fetch, some ALU work, sometimes a memory access). Press{' '}
        <span className={styles.kbd}>Step IJVM</span> (
        <span className={styles.kbd}>F10</span>) to run microcycles until
        the next IJVM dispatch boundary. The opcode boundary is detected
        when the control unit jumps back to the <code>Main1</code> label.
      </p>

      <h2>6. Watch dispatch happen</h2>
      <p>
        At <code>Main1</code>, the microcode does <code>fetch</code>{' '}
        followed by <code>goto (MBR)</code>. That's the magic: the next
        opcode byte is loaded into <code>MBR</code>, and{' '}
        <code>JMPC</code> ORs it into the next-MPC, jumping straight to
        the microcode for that opcode. Each opcode mnemonic in the control
        store is at an address whose low byte equals the opcode value.
      </p>

      <div className={styles.tip}>
        <span className={styles.tipTitle}>Try this</span>
        Set a breakpoint on the line for the opcode you care about
        (toggle in the gutter of the microcode editor). Run the program
        — the machine pauses at exactly the dispatch entry, and you can
        single-step through the implementation.
      </div>

      <h2>7. Step back</h2>
      <p>
        The simulator keeps a ring buffer of recent snapshots. Press{' '}
        <span className={styles.kbd}>µ ←</span> to undo a microstep, or{' '}
        <span className={styles.kbd}>IJVM ←</span> to rewind to the start of
        the previous IJVM instruction. Useful when you blow past the bug.
      </p>

      <h2>8. Console I/O</h2>
      <p>
        IJVM has two I/O opcodes: <code>IN</code> (push a byte from the
        keyboard) and <code>OUT</code> (pop a byte and emit it). Both go
        through a memory-mapped port at <code>MAR = -1</code>. The Console
        panel is the user-facing terminal: type to feed input, watch
        output appear.
      </p>

      <h2>Where to next</h2>
      <p>
        The rest of the <strong>Learn</strong> chapters teach how a CPU
        actually works, using MIC-1 as the worked example. They build
        on each other:
      </p>
      <ol>
        <li><strong>What a CPU does</strong> — the fetch–decode–execute loop, and the two layers MIC-1 splits it into.</li>
        <li><strong>Registers &amp; buses</strong> — how data moves around inside the chip.</li>
        <li><strong>The ALU &amp; flags</strong> — how one circuit computes many functions.</li>
        <li><strong>Memory &amp; the fetch dance</strong> — why MAR/MDR and PC/MBR are split.</li>
        <li><strong>Inside a microinstruction</strong> — what the 36 control bits actually mean.</li>
        <li><strong>Branching &amp; dispatch</strong> — the JAM trick and how opcode dispatch works.</li>
        <li><strong>Walkthrough: IADD</strong> — a complete IJVM instruction, cycle by cycle.</li>
        <li><strong>Stack &amp; method calls</strong> — the stack-machine model and how INVOKEVIRTUAL works.</li>
      </ol>
      <p>
        For lookup, the <strong>Reference</strong> sections at the bottom
        of the sidebar are the authoritative listings of registers,
        ALU functions, MAL syntax, and IJVM opcodes.
      </p>
    </>
  );
}

// ----------------------------------------------------------------------------
// Learn — what a CPU does
// ----------------------------------------------------------------------------

function CpuBasicsSection(): JSX.Element {
  return (
    <>
      <h1>What a CPU does</h1>
      <p className={styles.lead}>
        A CPU is, at its heart, a state machine that runs the same
        loop forever: <em>fetch an instruction, decode it, execute it,
        repeat</em>. Everything else is engineering detail.
      </p>

      <h2>The fetch–decode–execute loop</h2>
      <p>
        Imagine the simplest possible computer. Memory holds a list of
        instructions. The CPU has a register called the <em>program
        counter</em> (<code>PC</code>) that points at the next one. Each
        clock cycle, the CPU:
      </p>
      <pre className={styles.diagram}>{`     ┌──────────────────┐
     │  1. FETCH        │  read memory[PC] → instruction
     └────────┬─────────┘
              ↓
     ┌──────────────────┐
     │  2. DECODE       │  figure out which operation it is
     └────────┬─────────┘
              ↓
     ┌──────────────────┐
     │  3. EXECUTE      │  do the operation; update registers/memory
     └────────┬─────────┘
              ↓
        PC = PC + size
              ↑
              └────── repeat`}</pre>
      <p>
        That's the whole story for almost every CPU ever built. The
        differences between architectures are about <em>how</em> each step
        is implemented: how wide the ALU is, how memory is addressed,
        how decode picks an action, how branches work.
      </p>

      <h2>The two-layer trick</h2>
      <p>
        MIC-1 implements that loop using <strong>two stacked
        layers</strong>:
      </p>
      <ul>
        <li>
          <strong>The microarchitecture (MIC-1).</strong> The actual
          hardware. Each clock cycle it executes one{' '}
          <em>microinstruction</em> — a 36-bit control word stored in a
          small ROM called the <em>control store</em>. The hardware is
          extremely regular: registers, one ALU, one shifter, one
          memory port.
        </li>
        <li>
          <strong>The instruction set (IJVM).</strong> The language a
          programmer writes. Each IJVM <em>opcode</em> (one byte:{' '}
          <code>IADD</code>, <code>BIPUSH</code>, …) is implemented by a
          short sequence of microinstructions. The microcode is itself a
          tiny interpreter for IJVM.
        </li>
      </ul>
      <p>
        Why two layers? Because the two audiences want different
        things:
      </p>
      <ul>
        <li>
          <strong>Hardware</strong> wants regularity. A single-cycle
          execution unit, with no exotic instructions, is cheap and
          fast to build.
        </li>
        <li>
          <strong>Compilers and humans</strong> want a richer language.
          Push/pop, branch by name, call methods, use locals.
        </li>
      </ul>
      <p>
        The microprogram bridges the gap. Replace the control store and
        you have a different ISA running on the same hardware. (This is
        roughly how 1970s minicomputers were built — and how Intel
        still implements complex x86 instructions today.)
      </p>

      <h2>Where the loop lives in MIC-1</h2>
      <p>
        Open the microcode editor and look at the very first line of the
        default microcode:
      </p>
      <pre><code>{`Main1 = 0x000   goto (MBR)`}</code></pre>
      <p>
        That single line is the heart of the fetch–decode–execute loop.
        At <code>Main1</code>, <code>MBR</code> already holds the next
        IJVM opcode (the previous handler pre-fetched it). The{' '}
        <code>goto (MBR)</code> jumps to a microaddress equal to that
        opcode, which is where its handler lives. The handler does the
        work, advances <code>PC</code> past its operands, pre-fetches the
        following opcode, and jumps back to <code>Main1</code>. Lather,
        rinse, repeat.
      </p>

      <h2>What you'll learn next</h2>
      <p>
        The next chapters open up each piece of that loop:
      </p>
      <ul>
        <li>What hardware is needed to fetch and execute (registers, buses, ALU, shifter, memory)?</li>
        <li>How is one microinstruction encoded?</li>
        <li>How does a 9-bit microaddress decide where to go next, including for branches and dispatch?</li>
        <li>How do these primitives compose into a real ISA like IJVM?</li>
      </ul>
    </>
  );
}

// ----------------------------------------------------------------------------
// Learn — registers and buses (the data path)
// ----------------------------------------------------------------------------

function DatapathSection(): JSX.Element {
  return (
    <>
      <h1>Registers &amp; buses</h1>
      <p className={styles.lead}>
        Registers are the CPU's working memory: tiny, fast, on-chip
        slots that the ALU can read and write in a single clock cycle.
        Buses are the wires connecting them. Together they form the{' '}
        <em>data path</em>.
      </p>

      <h2>Why registers exist</h2>
      <p>
        Main memory is large but slow — far too slow to access on every
        gate-level step. Registers are small (each holds one 32-bit
        word in MIC-1) and fast enough that the ALU can read two of
        them, compute a result, and write the result back, all within
        one clock cycle. Almost every CPU ever built has a small file
        of registers for this reason.
      </p>

      <h2>The ten MIC-1 registers</h2>
      <p>
        Some registers exist because the ALU needs them; others exist
        because the IJVM machine model needs them. MIC-1 has both.
      </p>
      <table>
        <thead><tr><th>Register</th><th>Why it exists</th></tr></thead>
        <tbody>
          <tr><td><code>H</code></td><td>The ALU's "A" input. Always whatever you want to combine with another register.</td></tr>
          <tr><td><code>MAR</code> / <code>MDR</code></td><td>Memory interface. <code>MAR</code> says <em>where</em> in memory; <code>MDR</code> holds the word that's read or about to be written.</td></tr>
          <tr><td><code>PC</code> / <code>MBR</code></td><td>Instruction-fetch interface. <code>PC</code> says which byte to fetch; <code>MBR</code> receives that byte.</td></tr>
          <tr><td><code>SP</code></td><td>Stack pointer — the IJVM operand stack lives in memory; <code>SP</code> tracks the top.</td></tr>
          <tr><td><code>LV</code></td><td>Local-variable frame base — points at the start of the current method's locals.</td></tr>
          <tr><td><code>CPP</code></td><td>Constant-pool pointer — base of the read-only constants area.</td></tr>
          <tr><td><code>TOS</code></td><td>Cached copy of <code>memory[SP]</code> — the value at the top of the stack, ready in a register so most operations don't need an extra memory read.</td></tr>
          <tr><td><code>OPC</code></td><td>"Old PC" / scratch — used by handlers that need a temporary, e.g. while computing a branch target.</td></tr>
        </tbody>
      </table>

      <h2>The three buses</h2>
      <p>
        Inside MIC-1, data moves between the registers and the ALU on{' '}
        three buses. The data-path SVG in the main app colour-codes
        them:
      </p>
      <pre className={styles.diagram}>{`               ┌────── A-bus (only H) ──────┐
               │                            ↓
   [registers] ─┐                          ┌────┐
               ├──── B-bus (one of 9) ───→ │    │
               │                           │ALU │── shifter ─┐
               │                           │    │            │
               └──── C-bus (subset) ←──────┴────┘            │
                          ↑                                  │
                          └──────────────────────────────────┘`}</pre>
      <ul>
        <li>
          <strong>A-bus</strong> is hardwired: <code>H</code> drives the
          ALU's A input, period. There's no selector — that's why{' '}
          <code>H</code> is special. To get a value into the A side
          of an ALU operation, you stage it in <code>H</code> first.
        </li>
        <li>
          <strong>B-bus</strong> has a 4-bit selector. Each cycle, the
          microinstruction picks one register (or the special "none"
          encoding, producing 0) to feed into the ALU's B input.
        </li>
        <li>
          <strong>C-bus</strong> carries the ALU/shifter output back to
          the registers. A 9-bit field — one bit per writable register
          — says which register(s) latch the result. <em>You can
          broadcast to several at once</em>; that's why an assignment
          chain like <code>MAR = SP = SP + 1</code> works in a single
          cycle.
        </li>
      </ul>

      <h2>Why H is special</h2>
      <p>
        Building a 4-bit selector for the A-bus too would double the
        wiring. Tanenbaum's design instead notices that you almost
        never need <em>both</em> ALU operands to be selectable — you
        usually have one "accumulator-like" value you want to combine
        with various others. So one input gets the full multiplexer
        (B-bus), and the other gets a hardwired latch (<code>H</code>).
      </p>
      <p>
        Practical consequence: a typical "compute X op Y" sequence
        takes <em>two</em> microinstructions:
      </p>
      <pre><code>{`cycle 1:    H = X        // stage one operand in H
cycle 2:    target = H + Y`}</code></pre>

      <h2>Multi-target writes pay off</h2>
      <p>
        Stack pops show the C-bus parallelism beautifully:
      </p>
      <pre><code>{`MAR = SP = SP - 1; rd`}</code></pre>
      <p>
        In one cycle, the ALU computes <code>SP - 1</code>; both{' '}
        <code>SP</code> and <code>MAR</code> latch the result; and a
        memory read is started using the new <code>MAR</code>. Three
        side-effects, one cycle.
      </p>

      <div className={styles.tip}>
        <span className={styles.tipTitle}>Try it</span>
        Open the <strong>Data path</strong> panel in the main app, then
        single-step the simulator. Each cycle the buses light up: A
        (magenta) when something flows from <code>H</code>, B (cyan) for
        whatever the B-bus picked, C (lime) for the registers being
        written. The colours match the field-group colours in the bit
        view.
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Learn — the ALU
// ----------------------------------------------------------------------------

function AluSection(): JSX.Element {
  return (
    <>
      <h1>The ALU &amp; flags</h1>
      <p className={styles.lead}>
        The arithmetic-logic unit is a single combinational circuit
        that, given two 32-bit inputs and six control bits, produces
        a 32-bit output. The same hardware computes addition,
        subtraction, AND, OR, negation, and constants.
      </p>

      <h2>Six control bits, many functions</h2>
      <p>
        The ALU's behaviour is selected by:
      </p>
      <ul>
        <li><code>F0</code>, <code>F1</code> — pick a base function: AND, OR, NOT B, or "B plus carry" (an adder).</li>
        <li><code>ENA</code> — gate the A input. If 0, the A-bus value is forced to 0 inside the ALU.</li>
        <li><code>ENB</code> — gate the B input. Same idea.</li>
        <li><code>INVA</code> — invert the A input <em>after</em> gating. Lets you compute <code>~A</code>, <code>B - A</code>, etc.</li>
        <li><code>INC</code> — when the base function is "add," carry in 1. Lets you compute <code>+1</code> increments and turn{' '}
          <code>~A + B</code> into proper two's-complement <code>B - A</code>.
        </li>
      </ul>
      <p>
        The truth table is in the Reference section. The point isn't to
        memorise it — it's that one circuit, controlled by a handful of
        switches, gives you everything an integer ALU needs to do.
      </p>

      <h2>Why this matters in software</h2>
      <p>
        The microcode you write in MAL never sets <code>F0</code>{' '}
        directly. You write something like:
      </p>
      <pre><code>{`MDR = MDR + H
TOS = MDR - 1
H = TOS AND H`}</code></pre>
      <p>
        The MAL encoder reads each expression and figures out which
        ALU control bits make the circuit produce that result. Anything
        that <em>doesn't</em> map onto a one-cycle ALU function is a
        compile error — e.g. you can't write{' '}
        <code>MDR + H + TOS</code> (three operands) or{' '}
        <code>H * 2</code> (no multiplier).
      </p>

      <h2>The N and Z flags</h2>
      <p>
        After every ALU computation, two extra bits are exported:
      </p>
      <ul>
        <li><code>N</code> — the sign bit of the result (1 if negative).</li>
        <li><code>Z</code> — set if the result is exactly zero.</li>
      </ul>
      <p>
        These are <em>not</em> stored anywhere persistent. They're
        computed combinationally each cycle and feed the JAM unit,
        which decides what microaddress to use next. So a typical
        conditional-branch handler computes a value, observes <code>N</code>{' '}
        or <code>Z</code>, and branches in the <em>same</em> cycle.
      </p>
      <pre><code>{`OPC = TOS              // also produces N/Z flags from the value
if (Z) goto T; else goto F`}</code></pre>
      <p>
        That's the whole IJVM <code>IFEQ</code> condition test in two
        cycles: the assignment exposes the flags; the conditional goto
        consumes them on the next cycle.
      </p>

      <h2>The shifter — a free post-ALU step</h2>
      <p>
        After the ALU, the result optionally passes through a shifter:
      </p>
      <ul>
        <li><code>SLL8</code> — shift left by 8. Used to shift the high byte of a 16-bit operand into place after the second <code>fetch</code>.</li>
        <li><code>SRA1</code> — arithmetic shift right by 1. A divide-by-2 building block.</li>
        <li>Or pass-through.</li>
      </ul>
      <p>
        Why a separate shifter? Because shifts are common, and adding
        them at the ALU output is a few gates of multiplexing — much
        cheaper than expanding the ALU's function set. You compose with
        any expression:
      </p>
      <pre><code>{`H = MBR << 8        // build the high byte of a 16-bit operand
TOS = TOS >> 1      // signed divide by 2`}</code></pre>

      <div className={styles.tip}>
        <span className={styles.tipTitle}>See it on the bits</span>
        Open <strong>Inside a microinstruction</strong> next: the bit
        view groups the six ALU bits and the two shifter bits into
        coloured cells. As you step the simulator, watch which ones
        light up for each handler.
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Learn — memory and the fetch dance
// ----------------------------------------------------------------------------

function MemorySection(): JSX.Element {
  return (
    <>
      <h1>Memory &amp; the fetch dance</h1>
      <p className={styles.lead}>
        Main memory is much bigger than the register file but much
        slower. MIC-1 hides this with two pairs of registers — one for
        word-sized data, one for instruction bytes — and a one-cycle
        latency you have to plan around.
      </p>

      <h2>Two memory ports, two register pairs</h2>
      <p>
        The MIC-1 memory subsystem exposes two ways to talk to memory:
      </p>
      <table>
        <thead><tr><th>Port</th><th>Address register</th><th>Data register</th><th>Granularity</th></tr></thead>
        <tbody>
          <tr><td>Word read/write</td><td><code>MAR</code></td><td><code>MDR</code></td><td>32-bit word</td></tr>
          <tr><td>Instruction fetch</td><td><code>PC</code></td><td><code>MBR</code></td><td>8-bit byte</td></tr>
        </tbody>
      </table>
      <p>
        Why two ports? Because the IJVM interpreter needs to read
        instruction bytes (forward, byte-at-a-time) <em>and</em> push or
        pop word-sized values from the stack — often in the same
        microinstruction. With separate ports, both can happen in one
        cycle.
      </p>

      <h2>Word vs. byte addressing</h2>
      <p>
        <code>MAR</code> is a <em>word</em> index: <code>MAR = 5</code>{' '}
        means "memory bytes 20..23". <code>PC</code> is a <em>byte</em>{' '}
        index. The 4× factor matters when microcode crosses between the
        two: assembling a constant-pool pointer from a 16-bit operand,
        for instance, requires shifting before <code>MAR</code> latches
        it.
      </p>

      <h2>The one-cycle latency</h2>
      <p>
        You can't read a word and use it in the same microinstruction.
        Memory needs a cycle. The dance is:
      </p>
      <pre className={styles.diagram}>{`cycle N      MAR = address; rd       ← request the read
cycle N+1    (MDR is updating...)    ← read in flight
cycle N+1    H = MDR                 ← MDR is now valid; you can use it`}</pre>
      <p>
        Same for <code>fetch</code>: cycle N issues the fetch, cycle
        N+1 sees the byte in <code>MBR</code>.
      </p>
      <p>
        For writes, the rule is similar: <code>MAR</code> and{' '}
        <code>MDR</code> must hold the right values when you say{' '}
        <code>wr</code>. The hardware latches them and completes the
        write in the next cycle.
      </p>

      <h2>Why ILOAD takes several cycles</h2>
      <p>
        Putting the latency rule together with the bus model, here's
        why even a "simple" stack push takes multiple microinstructions.
        Look at how <code>ILOAD i</code> (push local <code>i</code>) is
        microcoded:
      </p>
      <pre><code>{`iload1   PC = PC + 1; fetch;           goto iload2   // fetch operand byte
iload2   H = LV;                       goto iload3   // stage LV in H
iload3   MAR = MBRU + H; rd;           goto iload4   // address = LV + i
iload4   MAR = SP = SP + 1;            goto iload5   // bump SP, target the new top
iload5   PC = PC + 1; fetch;           goto iload6   // pre-fetch next opcode
iload6   TOS = MDR; wr;                goto Main1    // store value, update TOS, dispatch`}</code></pre>
      <p>
        Notice the structure: every cycle does as many things as the
        data path allows in parallel (a fetch, an ALU op, a memory
        write, …), and the dispatch back to <code>Main1</code> happens
        only after the next opcode byte is already on its way. That's
        how the interpreter overlaps instruction fetch with execution.
      </p>

      <h2>The console I/O port</h2>
      <p>
        One memory address is special. <code>MAR = -1</code> (the
        constant <code>IO_PORT_MAR</code>) is a memory-mapped console
        port:
      </p>
      <ul>
        <li>A <code>rd</code> drains one byte from the input queue into <code>MDR</code>.</li>
        <li>A <code>wr</code> appends the low byte of <code>MDR</code> to the output stream.</li>
      </ul>
      <p>
        If the input queue is empty, the simulator <em>parks</em> the
        microinstruction: the cycle is repeated each step (no progress)
        until input arrives. The toolbar status pill switches to
        "Waiting for input" so you know what's happening.
      </p>

      <div className={styles.tip}>
        <span className={styles.tipTitle}>Watch it happen</span>
        Open the <strong>Memory</strong> and <strong>Stack</strong>{' '}
        panels, load the "Sum loop" sample, and step through. The
        memory panel highlights the cell currently being read or
        written; the stack view shows the words above <code>LV</code>{' '}
        as they push and pop.
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Learn — anatomy of a microinstruction
// ----------------------------------------------------------------------------

function MicroinstructionSection(): JSX.Element {
  return (
    <>
      <h1>Inside a microinstruction</h1>
      <p className={styles.lead}>
        Every clock cycle, MIC-1 reads one 36-bit word from the control
        store and uses it to drive every wire on the data path. This
        page opens that word up.
      </p>

      <h2>The 36-bit control word</h2>
      <p>
        A microinstruction is divided into seven field groups, each
        controlling a specific part of the data path:
      </p>
      <Embed label="Empty microinstruction (all bits cleared)">
        <div className={styles.embedScroll}>
          <div
            style={{
              width: BIT_FIELDS_WIDTH,
              height: bitRowHeight(),
              display: 'flex',
              alignItems: 'stretch',
            }}
          >
            <BitFieldRow instr={EMPTY_MICRO} />
          </div>
        </div>
        <p className={styles.embedNote}>
          Hover any field for its long-form description.
        </p>
      </Embed>
      <table>
        <thead><tr><th>Group</th><th>Bits</th><th>Controls</th></tr></thead>
        <tbody>
          <tr><td><strong>NEXT_ADDR</strong></td><td>9</td><td>Default microaddress to jump to next cycle.</td></tr>
          <tr><td><strong>JAM</strong></td><td>3</td><td>Modifiers that can flip bit 8 of the next address based on flags or <code>MBR</code>.</td></tr>
          <tr><td><strong>SHIFTER</strong></td><td>2</td><td><code>SLL8</code>, <code>SRA1</code>, or pass-through.</td></tr>
          <tr><td><strong>ALU</strong></td><td>6</td><td><code>F0 F1 ENA ENB INVA INC</code>.</td></tr>
          <tr><td><strong>C-bus</strong></td><td>9</td><td>Which registers latch the C-bus value (one bit each).</td></tr>
          <tr><td><strong>MEM</strong></td><td>3</td><td><code>rd</code>, <code>wr</code>, <code>fetch</code>.</td></tr>
          <tr><td><strong>B-bus</strong></td><td>4</td><td>Which register drives the B input.</td></tr>
        </tbody>
      </table>

      <h2>Each field is a switch on the data path</h2>
      <p>
        It's tempting to think of a microinstruction as
        "instructions" — but it isn't a sequence at all. Every bit
        is a parallel switch that's either on or off this cycle. Set
        <code>{' '}rd</code> and <code>SP = SP - 1</code> and the C-bus
        H bit all at once, and the hardware does all of those things
        in the same cycle, because they touch independent parts of the
        circuit.
      </p>

      <h2>The live inspector</h2>
      <p>
        The same bit-row you just saw above is also embedded inside the
        main app. As you step the simulator, it shows the{' '}
        <em>actual</em> control word for the current cycle:
      </p>
      <Embed label="Live µinstruction inspector">
        <MicroInspector />
        <p className={styles.embedNote}>
          Step the machine (with this page open!) and watch which field
          cells light up. That's exactly what the data path is doing.
        </p>
      </Embed>

      <h2>How a MAL line becomes bits</h2>
      <p>
        The MAL assembler turns each line into one of these 36-bit
        words. As an example, take:
      </p>
      <pre><code>MDR = TOS = MDR + H; wr; goto Main1</code></pre>
      <p>The encoder fills the fields like this:</p>
      <ul>
        <li><strong>B-bus</strong> = <code>MDR</code> (the second operand of the addition).</li>
        <li><strong>ALU</strong> = the bits that mean <code>A + B</code> (i.e. <code>H + MDR</code>).</li>
        <li><strong>SHIFTER</strong> = pass-through.</li>
        <li><strong>C-bus</strong> = <code>MDR</code> bit set, <code>TOS</code> bit set (both latch the result).</li>
        <li><strong>MEM</strong> = <code>wr</code> bit set.</li>
        <li><strong>NEXT_ADDR</strong> = address of <code>Main1</code> (i.e. <code>0x000</code>).</li>
        <li><strong>JAM</strong> = all clear (no conditional, no dispatch).</li>
      </ul>
      <p>
        That's it. One row of bits. Every cycle the hardware reads one
        such row and acts on it.
      </p>

      <h2>The control store</h2>
      <p>
        The full microprogram is 512 such rows (because <code>MPC</code>{' '}
        is 9 bits). Many of those slots are empty in the default
        microcode — only opcode entry points and continuation rows are
        used. The <strong>Control Store</strong> panel in the main app
        shows the whole thing; the bit-view toggle decomposes each row
        into the same field cells you see here.
      </p>
    </>
  );
}

// ----------------------------------------------------------------------------
// Learn — branching and dispatch (JAM + JMPC)
// ----------------------------------------------------------------------------

function ControlFlowSection(): JSX.Element {
  return (
    <>
      <h1>Branching &amp; dispatch</h1>
      <p className={styles.lead}>
        The microprogram counter <code>MPC</code> is only 9 bits, and
        the JAM unit can OR a single bit into it. From those two
        modest primitives MIC-1 builds conditional branches and
        full opcode dispatch.
      </p>

      <h2>How the next MPC is computed</h2>
      <p>
        Every cycle, the control unit picks the next <code>MPC</code>{' '}
        with this rule:
      </p>
      <pre><code>{`MPC_next = NEXT_ADDR
           | (JMPC ? MBR : 0)              // JMPC: opcode dispatch
           | (((JAMN & N) | (JAMZ & Z)) << 8)  // JAM: conditional bit-flip`}</code></pre>
      <p>
        The two JAM mechanisms use the bits in different ways. Both
        modify a base address (<code>NEXT_ADDR</code>); JAMN/JAMZ flip
        bit 8 only, JMPC OR's all 8 bits of <code>MBR</code>.
      </p>

      <h2>Conditional branches: the JAM trick</h2>
      <p>
        Suppose you write:
      </p>
      <pre><code>{`if (Z) goto Taken`}</code></pre>
      <p>
        The assembler sets <code>JAMZ = 1</code> and{' '}
        <code>NEXT_ADDR = Taken &amp; 0xFF</code>. Then:
      </p>
      <ul>
        <li>
          If <code>Z = 0</code>, <code>MPC_next = NEXT_ADDR</code> — the
          fall-through address (low byte of <code>Taken</code>).
        </li>
        <li>
          If <code>Z = 1</code>, bit 8 is OR'd in, so{' '}
          <code>MPC_next = NEXT_ADDR | 0x100 = Taken</code>.
        </li>
      </ul>
      <p>
        The whole mechanism is just a single OR'd bit, but it's enough
        for a two-way branch. The constraint: <code>Taken</code> must
        live in <code>0x100..0x1FF</code>, and the fall-through has to
        sit at <code>Taken &amp; 0xFF</code>. The MAL assembler enforces
        this and complains if your labels don't line up.
      </p>
      <pre className={styles.diagram}>{`MPC bit 8 →   0x100 ┌──────────────┐
                    │  upper half  │   ← taken targets live here
                    │  (Z=1 / N=1) │
                    │              │
              0x000 ├──────────────┤
                    │  lower half  │   ← fall-throughs live here
                    │  (default)   │
                    └──────────────┘`}</pre>
      <p>
        Two-way targets share the same low byte. <code>Taken = 0x1A0</code>{' '}
        and the fall-through at <code>0x0A0</code> are a partner pair.
      </p>

      <h2>Opcode dispatch: JMPC and MBR</h2>
      <p>
        Now look at the very heart of the IJVM interpreter:
      </p>
      <pre><code>{`Main1 = 0x000   goto (MBR)`}</code></pre>
      <p>
        That single line uses <code>JMPC = 1</code> with{' '}
        <code>NEXT_ADDR = 0x000</code>. The next-MPC formula becomes:
      </p>
      <pre><code>MPC_next = 0x000 | MBR = MBR</code></pre>
      <p>
        Whatever opcode byte just landed in <code>MBR</code>, the
        microprogram jumps to the address that <em>equals</em> that
        opcode value. This is why every IJVM handler's first
        microinstruction is placed at an explicit address matching its
        opcode:
      </p>
      <pre><code>{`bipush1     = 0x010   ...    // BIPUSH = 0x10
iload1      = 0x015   ...    // ILOAD  = 0x15
iadd1       = 0x060   ...    // IADD   = 0x60
ireturn1    = 0x0AC   ...    // IRETURN= 0xAC
halt1       = 0x0FF   ...    // HALT   = 0xFF`}</code></pre>
      <p>
        It's a 256-entry jump table built directly into the control
        store. No decoder logic — just OR the opcode into{' '}
        <code>MPC</code>.
      </p>

      <h2>Secondary dispatch: WIDE</h2>
      <p>
        For the rare opcodes prefixed by <code>WIDE</code>, MIC-1 uses
        a clever variant. The <code>wide1</code> handler sets up:
      </p>
      <pre><code>{`goto (MBR OR 0x100)`}</code></pre>
      <p>
        Same JMPC trick, but with <code>NEXT_ADDR = 0x100</code>. So
        wide-prefixed handlers live at <code>0x100 + opcode</code>:
        wide ILOAD at <code>0x115</code>, wide ISTORE at{' '}
        <code>0x136</code>, wide IINC at <code>0x184</code>. A second
        256-entry table, in the upper half of the control store.
      </p>

      <h2>Three primitives. That's it.</h2>
      <p>
        Everything the microprogram does for control flow boils down
        to three patterns:
      </p>
      <ol>
        <li><code>goto Label</code> — sequential, set <code>NEXT_ADDR</code>.</li>
        <li><code>if (N|Z) goto T</code> — JAMN/JAMZ, with the upper-half address constraint.</li>
        <li><code>goto (MBR ...)</code> — JMPC, dispatch by byte value.</li>
      </ol>
      <p>
        No call/return at the microcode level (IJVM-level method
        calls are explicit register manipulation, covered in the
        Stack &amp; method calls chapter). No subroutines. The whole
        microprogram is one big jump table and a handful of branches.
      </p>
    </>
  );
}

// ----------------------------------------------------------------------------
// Learn — IADD walkthrough
// ----------------------------------------------------------------------------

function IaddWalkthroughSection(): JSX.Element {
  return (
    <>
      <h1>Walkthrough: IADD</h1>
      <p className={styles.lead}>
        Time to put it all together. Watch a single IJVM
        instruction — <code>IADD</code> — execute end to end, cycle by
        cycle, on the actual MIC-1 data path.
      </p>

      <h2>What IADD does</h2>
      <p>
        IJVM is stack-based. <code>IADD</code> pops the two top
        operand-stack words, adds them, and pushes the result. In
        our register model:
      </p>
      <pre className={styles.diagram}>{`Before:                     After IADD:
   ┌─────────┐                  ┌─────────┐
   │   a     │ ← TOS, SP        │  a + b  │ ← TOS, SP - 1
   ├─────────┤                  ├─────────┤
   │   b     │                  │   ...   │
   ├─────────┤                  └─────────┘
   │   ...   │
   └─────────┘`}</pre>
      <p>
        Note that <code>TOS</code> caches the top word — so before
        IADD, <code>TOS = a</code>. The operand <code>b</code> is in
        memory at <code>memory[SP - 1]</code> (or in word terms,
        <code>{' '}memory[SP - 1]</code> — recall MAR is word-indexed).
      </p>

      <h2>The four microinstructions</h2>
      <p>
        Open the microcode editor and look at the IADD handler:
      </p>
      <pre><code>{`iadd1 = 0x060    MAR = SP = SP - 1; rd
iadd2 = 0x140    H = TOS
iadd3            MDR = TOS = MDR + H; wr
iadd4            PC = PC + 1; fetch; goto Main1`}</code></pre>
      <p>
        The address <code>0x060</code> matches the IADD opcode (0x60),
        so dispatch from <code>Main1</code> via <code>goto (MBR)</code>{' '}
        lands here. Let's walk each cycle.
      </p>

      <h3>Cycle 1 — <code>iadd1</code></h3>
      <table className={styles.cycleTable}>
        <tbody>
          <tr><td><strong>What it does</strong></td><td>Drop SP by 1 (so it now points at <code>b</code>); start a memory read of <code>b</code>.</td></tr>
          <tr><td><strong>B-bus</strong></td><td><code>SP</code></td></tr>
          <tr><td><strong>ALU</strong></td><td><code>B - 1</code> (i.e. <code>SP - 1</code>; uses the <code>R - 1</code> encoding)</td></tr>
          <tr><td><strong>C-bus</strong></td><td>Both <code>SP</code> and <code>MAR</code> latch the result.</td></tr>
          <tr><td><strong>Memory</strong></td><td><code>rd</code> issued (will deliver <code>b</code> into <code>MDR</code> next cycle).</td></tr>
        </tbody>
      </table>
      <p>
        Three side-effects in one cycle, plus a read kicked off. This
        is what the C-bus broadcast buys you.
      </p>

      <h3>Cycle 2 — <code>iadd2</code></h3>
      <table className={styles.cycleTable}>
        <tbody>
          <tr><td><strong>What it does</strong></td><td>Stage <code>a</code> (currently in <code>TOS</code>) into <code>H</code>, ready for the addition.</td></tr>
          <tr><td><strong>B-bus</strong></td><td><code>TOS</code></td></tr>
          <tr><td><strong>ALU</strong></td><td>Pass-through B (<code>= TOS</code>)</td></tr>
          <tr><td><strong>C-bus</strong></td><td><code>H</code></td></tr>
        </tbody>
      </table>
      <p>
        Why is <code>iadd2</code> at <code>0x140</code> and not the
        next sequential address? Look at the opcode dispatch table —
        many opcodes' first cycles cluster in the lower half, and
        their continuations are placed in the upper half so they
        don't collide. <code>iadd2</code>'s exact address doesn't
        matter; it's reached by the explicit <code>goto iadd2</code>{' '}
        from <code>iadd1</code>.
      </p>
      <p>
        Also note: the memory read kicked off in cycle 1 is{' '}
        <em>still in flight</em>. <code>MDR</code> isn't valid yet. We
        carefully avoid reading <code>MDR</code> this cycle.
      </p>

      <h3>Cycle 3 — <code>iadd3</code></h3>
      <table className={styles.cycleTable}>
        <tbody>
          <tr><td><strong>What it does</strong></td><td>Add the two operands; broadcast the sum to both <code>MDR</code> and <code>TOS</code>; start writing it back to memory.</td></tr>
          <tr><td><strong>B-bus</strong></td><td><code>MDR</code> (now valid: holds <code>b</code>)</td></tr>
          <tr><td><strong>ALU</strong></td><td><code>A + B</code> (= <code>H + MDR</code> = <code>a + b</code>)</td></tr>
          <tr><td><strong>C-bus</strong></td><td><code>MDR</code> and <code>TOS</code> both latch the sum.</td></tr>
          <tr><td><strong>Memory</strong></td><td><code>wr</code> issued — writes <code>MDR</code> (the new sum) to <code>memory[MAR]</code> (which is the new <code>SP</code>).</td></tr>
        </tbody>
      </table>
      <p>
        Notice the elegance: the same C-bus value updates the cached{' '}
        <code>TOS</code> register <em>and</em> the in-flight write to
        memory, in one cycle.
      </p>

      <h3>Cycle 4 — <code>iadd4</code></h3>
      <table className={styles.cycleTable}>
        <tbody>
          <tr><td><strong>What it does</strong></td><td>Advance PC past the IADD opcode; pre-fetch the next opcode byte; jump back to <code>Main1</code> for dispatch.</td></tr>
          <tr><td><strong>B-bus</strong></td><td><code>PC</code></td></tr>
          <tr><td><strong>ALU</strong></td><td><code>B + 1</code> (<code>PC + 1</code>)</td></tr>
          <tr><td><strong>C-bus</strong></td><td><code>PC</code></td></tr>
          <tr><td><strong>Memory</strong></td><td><code>fetch</code> issued — next opcode byte will arrive in <code>MBR</code>.</td></tr>
          <tr><td><strong>Goto</strong></td><td><code>Main1</code> (so the next cycle's <code>goto (MBR)</code> dispatches).</td></tr>
        </tbody>
      </table>
      <p>
        Crucial: when <code>Main1</code> runs next cycle, the fetched
        byte must already be in <code>MBR</code>. This is the
        invariant every handler maintains — pre-fetch the next opcode
        before transferring back to <code>Main1</code>.
      </p>

      <h2>Try it yourself</h2>
      <p>
        Now go run it:
      </p>
      <ol>
        <li>Open <span className={styles.kbd}>File ▸ Load sample ▸ Sum loop</span>.</li>
        <li>In the microcode editor, click the gutter beside <code>iadd1</code> to set a breakpoint.</li>
        <li>Press <span className={styles.kbd}>Run</span>. The machine pauses at <code>iadd1</code>.</li>
        <li>Press <span className={styles.kbd}>µStep</span> (F11) and follow along. Watch the data path light up; watch <code>SP</code>, <code>TOS</code>, <code>MDR</code> change in the register panel; watch the µinstruction inspector decompose each cycle into bits.</li>
      </ol>

      <div className={styles.tip}>
        <span className={styles.tipTitle}>Step back if you miss it</span>
        Press <span className={styles.kbd}>µ ←</span> to undo a
        microstep. The simulator keeps a ring buffer of recent
        snapshots, so you can replay the same cycle as many times as
        you want.
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Learn — stack and method calls
// ----------------------------------------------------------------------------

function StackMethodsSection(): JSX.Element {
  return (
    <>
      <h1>Stack &amp; method calls</h1>
      <p className={styles.lead}>
        IJVM is a <strong>stack machine</strong>: operands and results
        flow through a stack rather than named registers. This page
        shows how the stack is laid out in memory, how <code>TOS</code>{' '}
        caches its top, and how method calls weave together the stack,
        local variables, and link information.
      </p>

      <h2>Why a stack-based ISA?</h2>
      <p>
        Compilers for stack machines are simple: every expression
        compiles to a postorder traversal that pushes operands and runs
        the operator. There's no register allocation, no naming. The
        cost is more memory traffic, but at the ISA layer that's hidden
        — and a microarchitecture like MIC-1 can cache the top of the
        stack to keep most operations fast.
      </p>
      <pre><code>{`// Source:    a + b * c
// Postorder push:
ILOAD a       // stack: [a]
ILOAD b       // stack: [a, b]
ILOAD c       // stack: [a, b, c]
IMUL          // stack: [a, b*c]      (not in IJVM, but the idea)
IADD          // stack: [a + b*c]`}</code></pre>

      <h2>The stack lives in memory</h2>
      <p>
        MIC-1 doesn't have a hardware stack. Instead, the stack is just
        a region of main memory, and <code>SP</code> is a register
        pointing at its top word.
      </p>
      <pre className={styles.diagram}>{`high addresses    ┌─────────────┐
                  │     ...     │  (free)
                  ├─────────────┤
                  │     a       │ ← SP, TOS = a
                  ├─────────────┤
                  │     b       │
                  ├─────────────┤
                  │     v2      │ ← LV + 2  (named local)
                  ├─────────────┤
                  │     v1      │ ← LV + 1
                  ├─────────────┤
                  │   OBJREF    │ ← LV      (or saved old-LV during a call)
low addresses     └─────────────┘`}</pre>

      <h2>The TOS cache</h2>
      <p>
        Reading <code>memory[SP]</code> takes a cycle of latency.
        Reading the register <code>TOS</code> doesn't. So MIC-1 keeps
        an invariant: <code>TOS</code> always equals the word at the
        current top of stack.
      </p>
      <p>
        Maintaining the invariant takes care, but it pays off
        constantly. Every IJVM op that touches the top of the stack
        uses <code>TOS</code> directly without a memory read; only the{' '}
        <em>second-from-top</em> word ever needs a load.
      </p>
      <p>
        That's why the IADD handler in the previous chapter only
        reads memory once (for the second operand), even though it
        consumes two stack words.
      </p>

      <h2>Local variables</h2>
      <p>
        A method's locals (its named arguments and <code>.var</code>{' '}
        slots) live below the operand stack, addressed relative to
        <code>{' '}LV</code>:
      </p>
      <ul>
        <li><code>memory[LV + 0]</code> = OBJREF (the implicit "this" slot)</li>
        <li><code>memory[LV + 1]</code> = first named arg</li>
        <li><code>memory[LV + 2]</code> = second named arg, …</li>
        <li>then the <code>.var</code> slots</li>
      </ul>
      <p>
        <code>ILOAD i</code> computes <code>MAR = LV + i</code> (where{' '}
        <code>i</code> is the operand byte), reads, and pushes. That's
        why the ILOAD handler needs both <code>MBR</code> (the operand
        byte for <code>i</code>) and <code>LV</code> within the same
        few cycles.
      </p>

      <h2>Method calls — INVOKEVIRTUAL</h2>
      <p>
        Method calls have to do four things at once: find the method,
        save where to come back to, set up new locals for the callee,
        and start running it.
      </p>
      <p>
        <strong>The prologue.</strong> Every method begins, in
        memory, with a 4-byte prologue:
      </p>
      <pre className={styles.diagram}>{`+0  argsCount    (hi byte)   ─┐  total slots consumed by the call
+1  argsCount    (lo byte)   ─┘  (1 for OBJREF + each named arg)
+2  localsCount  (hi byte)   ─┐  additional .var slots
+3  localsCount  (lo byte)   ─┘
+4  first instruction byte`}</pre>
      <p>
        The constant-pool entry that names the method holds the
        <em>byte address</em> of this prologue.{' '}
        <code>INVOKEVIRTUAL i</code> reads the prologue to learn how
        much room the callee's frame needs, then:
      </p>
      <ol>
        <li>Saves the caller's <code>PC</code> (the return address) and old <code>LV</code> as link words.</li>
        <li>Sets <code>LV</code> to point at the OBJREF slot of the new frame.</li>
        <li>Writes the link words into <code>memory[LV + 0]</code> and <code>memory[LV + 1]</code>, overwriting OBJREF and the first arg slot.</li>
        <li>Bumps <code>SP</code> past the locals to make room for the callee's operand stack.</li>
        <li>Sets <code>PC</code> to the first byte after the prologue and dispatches.</li>
      </ol>
      <p>
        <strong>Why overwrite OBJREF?</strong> Because we don't need
        it during the call (it's just a placeholder, since this
        simulator's IJVM has no objects). Reusing the slot for the
        return address keeps the layout compact and matches
        Tanenbaum's textbook calling convention.
      </p>

      <h2>Method returns — IRETURN</h2>
      <p>
        <code>IRETURN</code> reverses the steps:
      </p>
      <ol>
        <li>Reads the saved <code>PC</code> and old <code>LV</code> from the link words.</li>
        <li>Pops the callee's return value (it's in <code>TOS</code>).</li>
        <li>Restores caller's <code>PC</code> and <code>LV</code>.</li>
        <li>Writes the return value into <code>memory[old SP]</code> — i.e. the slot in the caller's stack where the OBJREF used to be. So when the caller resumes, the return value is sitting at its top of stack.</li>
      </ol>
      <p>
        That's the entire calling convention. No registers reserved
        for return values, no stack-frame metadata beyond the two link
        words. Everything happens by repointing <code>LV</code> and
        <code>{' '}SP</code>.
      </p>

      <h2>See it run</h2>
      <p>
        Load <span className={styles.kbd}>File ▸ Load sample ▸
        Recursive sum</span>. It computes <code>1 + 2 + … + N</code>{' '}
        recursively, exercising INVOKEVIRTUAL/IRETURN deeply enough
        that you can watch <code>LV</code>, <code>SP</code>, and the
        memory stack grow and shrink.
      </p>

      <h2>You've finished the tour</h2>
      <p>
        Congratulations — you now have a working mental model of how a
        CPU executes instructions, all the way from the gates to the
        ISA. From here:
      </p>
      <ul>
        <li>Use the <strong>Reference</strong> sections for lookup.</li>
        <li>Try writing your own IJVM program. Start by modifying a sample.</li>
        <li>For an extra challenge, edit the microcode and add a new opcode.</li>
      </ul>
    </>
  );
}

// ----------------------------------------------------------------------------
// Learn navigation (prev/next)
// ----------------------------------------------------------------------------

const LEARN_ORDER: SectionId[] = [
  'tutorial',
  'cpu-basics',
  'datapath',
  'alu',
  'memory',
  'microinstruction',
  'control-flow',
  'iadd-walkthrough',
  'stack-methods',
];

function LearnNav({
  current,
  onNavigate,
}: {
  current: SectionId;
  onNavigate: (id: SectionId) => void;
}): JSX.Element | null {
  const idx = LEARN_ORDER.indexOf(current);
  if (idx === -1) return null;
  const prev = idx > 0 ? LEARN_ORDER[idx - 1] : null;
  const next = idx < LEARN_ORDER.length - 1 ? LEARN_ORDER[idx + 1] : null;
  const titleOf = (id: SectionId): string =>
    SECTIONS.find((s) => s.id === id)?.title ?? id;

  return (
    <div className={styles.learnNav}>
      {prev ? (
        <button className={styles.learnNavBtn} onClick={() => onNavigate(prev)}>
          <span className={styles.learnNavLabel}>← Previous</span>
          <span className={styles.learnNavTitle}>{titleOf(prev)}</span>
        </button>
      ) : (
        <span className={styles.learnNavSpacer} />
      )}
      {next ? (
        <button
          className={`${styles.learnNavBtn} ${styles.learnNavBtnNext}`}
          onClick={() => onNavigate(next)}
        >
          <span className={styles.learnNavLabel}>Next →</span>
          <span className={styles.learnNavTitle}>{titleOf(next)}</span>
        </button>
      ) : (
        <span className={styles.learnNavSpacer} />
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// MIC-1 reference
// ----------------------------------------------------------------------------

function ReferenceSection(): JSX.Element {
  return (
    <>
      <h1>MIC-1 reference</h1>
      <p className={styles.lead}>
        Everything the simulator implements, conforming to Tanenbaum's{' '}
        <em>Structured Computer Organization</em> (5th–6th ed., Appendix B
        / Chapter 4).
      </p>

      <h2>Registers (all 32-bit)</h2>
      <table>
        <thead>
          <tr>
            <th>Register</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>MAR</code></td><td>Memory Address Register (word-addressed for <code>rd</code>/<code>wr</code>)</td></tr>
          <tr><td><code>MDR</code></td><td>Memory Data Register</td></tr>
          <tr><td><code>PC</code></td><td>Program Counter (byte-addressed for <code>fetch</code>)</td></tr>
          <tr><td><code>MBR</code></td><td>Memory Buffer Register (8-bit, sign-extended on B-bus; <code>MBRU</code> for unsigned)</td></tr>
          <tr><td><code>SP</code></td><td>Stack Pointer — top of operand stack (word index)</td></tr>
          <tr><td><code>LV</code></td><td>Local Variable frame base (word index)</td></tr>
          <tr><td><code>CPP</code></td><td>Constant Pool Pointer (word index)</td></tr>
          <tr><td><code>TOS</code></td><td>Top Of Stack — caches the word at <code>SP</code></td></tr>
          <tr><td><code>OPC</code></td><td>Old PC / scratch</td></tr>
          <tr><td><code>H</code></td><td>ALU's A-input register (only register on A-bus)</td></tr>
        </tbody>
      </table>
      <p>
        <code>MPC</code> is a 9-bit microprogram counter internal to the
        control unit; it isn't on the data path.
      </p>

      <h2>Buses</h2>
      <ul>
        <li><strong>A-bus</strong> — drives <code>H</code> only into the ALU's A input.</li>
        <li>
          <strong>B-bus</strong> — a 4-bit selector picks one of{' '}
          <code>MDR, PC, MBR, MBRU, SP, LV, CPP, TOS, OPC</code> (and a "none"
          / 0 encoding). This value goes to the ALU's B input.
        </li>
        <li>
          <strong>C-bus</strong> — ALU/shifter output. A 9-bit field selects
          which subset of <code>{'{MAR, MDR, PC, SP, LV, CPP, TOS, OPC, H}'}</code>{' '}
          receives it.
        </li>
      </ul>
      <p>
        <strong><code>MBR</code> vs <code>MBRU</code>.</strong> Both refer
        to the same 8-bit register, but read it through different
        gates: <code>MBR</code> sign-extends the byte to 32 bits when
        placing it on the B-bus (used for signed offsets, e.g.{' '}
        <code>BIPUSH</code>), while <code>MBRU</code> zero-extends (used
        when assembling unsigned operand bytes — the high half of an
        index, opcode dispatch, etc.).
      </p>

      <h2>ALU</h2>
      <p>
        Six control bits — <code>F0, F1, ENA, ENB, INVA, INC</code> — yield
        the standard six useful functions plus combinations:
      </p>
      <table>
        <thead>
          <tr>
            <th><code>F0 F1 ENA ENB INVA INC</code></th>
            <th>Function</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>0 1 1 1 0 0</code></td><td><code>A + B</code></td></tr>
          <tr><td><code>0 1 1 1 0 1</code></td><td><code>A + B + 1</code></td></tr>
          <tr><td><code>0 1 1 0 0 0</code></td><td><code>A</code></td></tr>
          <tr><td><code>0 1 0 1 0 0</code></td><td><code>B</code></td></tr>
          <tr><td><code>0 1 0 0 0 0</code></td><td><code>0</code></td></tr>
          <tr><td><code>0 1 1 1 1 1</code></td><td><code>B − A</code></td></tr>
          <tr><td><code>1 1 0 0 0 0</code></td><td><code>−1</code></td></tr>
          <tr><td><code>1 0 1 1 0 0</code></td><td><code>A AND B</code></td></tr>
          <tr><td><code>1 1 1 1 0 0</code></td><td><code>A OR B</code></td></tr>
        </tbody>
      </table>
      <p>
        The ALU exports two flags: <code>N</code> (sign of result) and{' '}
        <code>Z</code> (result is zero). They feed the JAM logic that
        picks the next MPC.
      </p>

      <h2>Shifter</h2>
      <ul>
        <li><code>SLL8</code> — shift left by 8 (used for assembling 16-bit operands from two 8-bit <code>MBR</code> fetches).</li>
        <li><code>SRA1</code> — arithmetic shift right by 1.</li>
        <li>Or pass-through.</li>
      </ul>

      <h2>Memory operations</h2>
      <p>Issued during a microcycle; completed before the next-but-one cycle.</p>
      <table>
        <thead><tr><th>Op</th><th>Operation</th></tr></thead>
        <tbody>
          <tr><td><code>rd</code></td><td>Read word at <code>[MAR]</code> into <code>MDR</code></td></tr>
          <tr><td><code>wr</code></td><td>Write <code>MDR</code> to <code>[MAR]</code></td></tr>
          <tr><td><code>fetch</code></td><td>Read byte at <code>[PC]</code> into <code>MBR</code></td></tr>
        </tbody>
      </table>

      <h2>JAM field — next-MPC selection</h2>
      <pre><code>{`MPC_next = (NEXT_ADDR | (JMPC ? MBR : 0))
            with bit 8 OR'd from (JAMN & N) | (JAMZ & Z)`}</code></pre>
      <p>
        So <code>JMPC</code> is how IJVM dispatch happens —{' '}
        <code>MBR</code> holds the opcode after a fetch, OR'd into{' '}
        <code>NEXT_ADDR = 0x000</code>.
      </p>

      <h2>The 36-bit control word</h2>
      <p>
        Each microinstruction is a single 36-bit word laid out, in
        Tanenbaum's order, as:
      </p>
      <pre><code>NEXT_ADDR (9, hex) | JAM (3) | shifter (2) | ALU (6) | C-bus (9) | mem (3) | B-bus (4)</code></pre>
      <p>
        Below is the <em>actual bit-row component</em> the app uses to render
        microinstructions, with all fields zeroed so you can read the
        layout. Hover a cell for the long-form description:
      </p>
      <Embed label="Empty microinstruction (all bits cleared)">
        <div className={styles.embedScroll}>
          <div
            style={{
              width: BIT_FIELDS_WIDTH,
              height: bitRowHeight(),
              display: 'flex',
              alignItems: 'stretch',
            }}
          >
            <BitFieldRow instr={EMPTY_MICRO} />
          </div>
        </div>
        <p className={styles.embedNote}>
          The same row appears in the Control Store panel (when "bit
          view" is on) and in the µinstruction inspector — single source
          of truth for "what does this field mean."
        </p>
      </Embed>

      <h2>Conditional-branch layout (the JAM trick)</h2>
      <p>
        Because the JAM mechanism only ORs bit 8 into MPC, the
        taken-branch target of any{' '}
        <code>if (N|Z) goto T</code> must live in <code>0x100..0x1FF</code>,
        and a fall-through microinstruction must be placed at{' '}
        <code>T &amp; 0xFF</code> in the lower half. The MAL assembler
        enforces this and stores <code>NEXT_ADDR = T &amp; 0xFF</code>.
      </p>

      <h2>Memory layout (default)</h2>
      <pre><code>{`0x00000000 ┌───────────────────┐ ← PC starts here
           │   Method area     │
           │   (IJVM bytecode) │
           ├───────────────────┤
           │   Constant pool   │ ← CPP
           ├───────────────────┤
           │   Local variables │ ← LV
           │   ↑ Operand stack │ ← SP (grows up)
           │                   │
           │      ...          │
0x003FFFFF └───────────────────┘`}</code></pre>
      <p>
        Memory is word-addressed for <code>MAR</code>/<code>MDR</code> (so{' '}
        <code>MAR = 5</code> reads bytes 20..23) and byte-addressed for{' '}
        <code>PC</code>/<code>MBR</code>.
      </p>

      <h2>Console I/O</h2>
      <p>
        <code>IN</code> / <code>OUT</code> are wired through a memory-mapped
        I/O port at <code>MAR = -1</code> (the constant{' '}
        <code>IO_PORT_MAR</code> in <code>engine/types.ts</code>):
      </p>
      <ul>
        <li>
          A <code>rd</code> to that address drains a byte from the input
          buffer into <code>MDR</code>.
        </li>
        <li>
          A <code>wr</code> appends the low byte of <code>MDR</code> to the
          output buffer (drained into the Console panel).
        </li>
      </ul>
      <p>
        <strong>Blocking semantics.</strong> If <code>IN</code> hits an
        empty input buffer, the simulator sets <code>waitingForInput =
        true</code>, leaves <code>MDR</code> unchanged, and leaves the
        read pending. On the next <code>step()</code> call the cycle is
        re-run as a no-op (MPC unchanged, no trace) until input arrives.
        The toolbar status pill switches to "Waiting for input" so the
        user knows execution is parked.
      </p>

      <h2>Method calling convention</h2>
      <p>
        A method is laid out in the bytecode area as a 4-byte prologue
        followed by its body. The prologue is two big-endian 16-bit
        words:
      </p>
      <pre><code>{`+0  argsCount    (hi byte)   ─┐  total stack slots consumed by the call
+1  argsCount    (lo byte)   ─┘  (1 OBJREF + named args)
+2  localsCount  (hi byte)   ─┐  additional .var slots beyond the args
+3  localsCount  (lo byte)   ─┘`}</code></pre>
      <p>
        The constant pool entry that names the method holds the byte
        address of this prologue. <code>INVOKEVIRTUAL</code> reads the
        prologue to know how much stack to set up, advances{' '}
        <code>PC</code> past the prologue, parks the caller's{' '}
        <code>PC</code> and old <code>LV</code> at <code>LV[0]</code> and{' '}
        <code>LV[1]</code> (overwriting OBJREF and the first arg slot
        with link info), and dispatches to the method body.
      </p>
      <p>
        <code>IRETURN</code> pops the callee's <code>TOS</code>, restores
        the caller's <code>PC</code> and <code>LV</code> from the saved
        link words, and writes the return value into{' '}
        <code>memory[old SP]</code> — i.e. the caller's stack now holds
        the return value where the method's OBJREF used to be.
      </p>

      <h2>Bundled IJVM samples</h2>
      <p>
        Open <span className={styles.kbd}>File ▸ Load sample</span> for
        worked programs:
      </p>
      <ul>
        <li>
          <strong>Recursive sum</strong> (default) — recursion via{' '}
          <code>INVOKEVIRTUAL</code> / <code>IRETURN</code>.
        </li>
        <li>
          <strong>Sum loop</strong> — iterative counted loop, no method
          calls.
        </li>
        <li>
          <strong>Echo</strong> — <code>IN</code> / <code>OUT</code> until
          a null byte.
        </li>
        <li>
          <strong>WIDE prefix</strong> — locals beyond index 0xFF.
        </li>
      </ul>

      <h2>What this simulator does <em>not</em> do</h2>
      <ul>
        <li>No interrupts; no I/O beyond the console <code>IN</code>/<code>OUT</code>.</li>
        <li>No floating point.</li>
        <li>No method linking beyond the textbook calling convention.</li>
        <li>No MIC-2/3/4 optimizations (instruction prefetch, scoreboarding, pipelining).</li>
      </ul>
    </>
  );
}

// ----------------------------------------------------------------------------
// MAL syntax
// ----------------------------------------------------------------------------

function MalSection(): JSX.Element {
  return (
    <>
      <h1>MAL — microcode syntax</h1>
      <p className={styles.lead}>
        MAL ("Micro Assembly Language") is the source form for
        microinstructions. One line = one 36-bit control word.
      </p>

      <h2>Anatomy of a line</h2>
      <pre><code>{`Label1   MAR = SP - 1; rd
Label2   H = TOS
Label3   MDR = TOS = MDR + H; wr; goto Main1`}</code></pre>
      <p>
        A label (optional) is followed by a sequence of clauses separated
        by <code>;</code>. Order of clauses on a line does not matter — they
        all happen in the same cycle.
      </p>

      <h3>Labels</h3>
      <p>
        A label is any identifier that isn't a register or a reserved
        keyword. The trailing <code>:</code> is optional and purely
        cosmetic — both <code>Main1 ...</code> and <code>Main1: ...</code>{' '}
        are equivalent. The assembler picks a free microaddress for each
        label, packing fall-throughs into adjacent slots.
      </p>
      <p>
        To pin a label to a specific microaddress (e.g. to place
        opcode dispatch entries at the address whose low byte equals
        the opcode value, or to push a fall-through into the upper
        half), append <code>= &lt;number&gt;</code>:
      </p>
      <pre><code>{`iadd1     = 0x060   MAR = SP = SP - 1; rd
ifeq3     = 0x199   OPC = TOS                  // upper-half target
goto1     = 0x0A7   OPC = PC - 1; fetch        // fall-through partner`}</code></pre>

      <h3>Comments</h3>
      <p>
        <code>{'//'}</code> starts a line comment that runs to the next
        newline. Comments may appear after any clause:
      </p>
      <pre><code>Main1    PC = PC + 1; fetch; goto (MBR)   // top of dispatch loop</code></pre>

      <h2>Assignment chains</h2>
      <p>
        <code>dest1 = dest2 = ... = &lt;expr&gt;</code> evaluates the
        right-most expression on the C-bus and writes it into <em>every</em>{' '}
        listed register at the end of the cycle.
      </p>
      <pre><code>MDR = TOS = MDR + H</code></pre>
      <p>
        Both <code>MDR</code> and <code>TOS</code> are added to the C-bus
        target set; the ALU is set up to compute <code>MDR + H</code>.
      </p>

      <h2>Registers in expressions</h2>
      <p>
        Two register sets matter:
      </p>
      <ul>
        <li>
          <strong>Readable</strong> (may appear in expressions):{' '}
          <code>H</code>, <code>MDR</code>, <code>PC</code>, <code>MBR</code>,{' '}
          <code>MBRU</code>, <code>SP</code>, <code>LV</code>, <code>CPP</code>,{' '}
          <code>TOS</code>, <code>OPC</code>. Of these, only{' '}
          <code>H</code> rides the A-bus; the others all come in via the B-bus.
        </li>
        <li>
          <strong>Writable</strong> (may appear on the left of <code>=</code>):{' '}
          <code>MAR</code>, <code>MDR</code>, <code>PC</code>, <code>SP</code>,{' '}
          <code>LV</code>, <code>CPP</code>, <code>TOS</code>, <code>OPC</code>,{' '}
          <code>H</code>. <code>MBR</code> is read-only (the memory unit
          drives it).
        </li>
      </ul>

      <h2>Allowed expressions</h2>
      <p>
        Expressions are restricted to what the ALU + shifter can do in
        one cycle. The encoder accepts any of the forms below
        (<code>R</code> = any non-<code>H</code> readable register).
      </p>
      <table>
        <thead><tr><th>Expression</th><th>Notes</th></tr></thead>
        <tbody>
          <tr><td><code>0</code>, <code>1</code>, <code>-1</code></td><td>Constants the ALU produces directly</td></tr>
          <tr><td><code>H</code>, <code>R</code></td><td>Pass-through (A-bus or B-bus)</td></tr>
          <tr><td><code>~H</code>, <code>~R</code></td><td>Bitwise complement (one-operand inversion)</td></tr>
          <tr><td><code>-H</code>, <code>-R</code></td><td>Two's-complement negation</td></tr>
          <tr><td><code>H + R</code> (or <code>R + H</code>)</td><td>Addition; commutative</td></tr>
          <tr><td><code>H + R + 1</code></td><td>Addition with carry-in (any operand order)</td></tr>
          <tr><td><code>H + 1</code>, <code>R + 1</code>, <code>R - 1</code></td><td>Increment / decrement</td></tr>
          <tr><td><code>R - H</code></td><td>Subtraction — always written B − A (the ALU has no A − B form)</td></tr>
          <tr><td><code>H AND R</code>, <code>H OR R</code></td><td>Bitwise; commutative</td></tr>
          <tr><td><code>... &lt;&lt; 8</code></td><td>Shift left by 8 (only legal shift count). Composes with any of the above.</td></tr>
          <tr><td><code>... &gt;&gt; 1</code></td><td>Arithmetic shift right by 1 (only legal shift count).</td></tr>
        </tbody>
      </table>
      <p>
        The assembler maps each expression to the appropriate{' '}
        <code>F0/F1/ENA/ENB/INVA/INC</code> bits and shifter bits. If your
        expression doesn't correspond to any one-cycle ALU function, you
        get a precise error message — e.g. you can't write{' '}
        <code>H + ~R</code> or <code>A - B</code>; the ALU has no
        encoding.
      </p>
      <p>
        Numeric literals other than <code>0</code>, <code>1</code>, and{' '}
        <code>-1</code> aren't allowed inside an expression — there is
        no immediate operand on the data path. To use a constant, load
        it from the constant pool with an IJVM <code>LDC_W</code>, or
        synthesize it across multiple cycles.
      </p>

      <h2>Memory operations</h2>
      <ul>
        <li><code>rd</code> — read word at <code>[MAR]</code> into <code>MDR</code> (completes during the next cycle).</li>
        <li><code>wr</code> — write <code>MDR</code> to <code>[MAR]</code>.</li>
        <li><code>fetch</code> — read one byte at <code>[PC]</code> into <code>MBR</code>.</li>
      </ul>

      <h2>Control flow</h2>
      <table>
        <thead><tr><th>Form</th><th>Effect</th></tr></thead>
        <tbody>
          <tr>
            <td><code>goto Label</code></td>
            <td>Unconditional jump — sets <code>NEXT_ADDR = addr(Label)</code>.</td>
          </tr>
          <tr>
            <td><code>if (Z) goto T</code> / <code>if (N) goto T</code></td>
            <td>Sets <code>JAMZ</code> / <code>JAMN</code>. Requires <code>T</code> in <code>0x100..0x1FF</code> with a fall-through entry at <code>T &amp; 0xFF</code>.</td>
          </tr>
          <tr>
            <td><code>if (~N) goto T</code> / <code>if (!Z) goto T</code></td>
            <td>Negated condition — assembler swaps T and the fall-through label.</td>
          </tr>
          <tr>
            <td><code>if (Z) goto T; else goto F</code></td>
            <td>
              Two-target form. The JAM mechanism picks <code>T</code> when
              the condition is true and <code>F</code> when false.
              <code>T</code> must live in <code>0x100..0x1FF</code> and{' '}
              <code>F</code> in <code>0x000..0x0FF</code>, with{' '}
              <code>T &amp; 0xFF == F &amp; 0xFF</code>; the assembler picks
              an aligned address pair for you when this is satisfiable.
            </td>
          </tr>
          <tr>
            <td><code>goto (MBR)</code></td>
            <td>Sets <code>JMPC</code> with <code>NEXT_ADDR = 0</code> — opcode dispatch.</td>
          </tr>
          <tr>
            <td><code>goto (MBR OR Label)</code></td>
            <td>Sets <code>JMPC</code> with <code>NEXT_ADDR = addr(Label)</code> — secondary dispatch tables (e.g. <code>WIDE</code> through <code>0x100</code>). The base also accepts a numeric literal.</td>
          </tr>
        </tbody>
      </table>

      <h2>Mini example</h2>
      <pre><code>{`Main1    PC = PC + 1; fetch; goto (MBR)

iadd1    MAR = SP = SP - 1; rd
iadd2    H = TOS
iadd3    MDR = TOS = MDR + H; wr; goto Main1`}</code></pre>
      <p>
        Read line by line: <code>iadd1</code> drops <code>SP</code> and starts
        a read of the new top word; <code>iadd2</code> stashes the cached{' '}
        <code>TOS</code> into <code>H</code>; <code>iadd3</code> sums them,
        writes the result back to memory, updates <code>TOS</code>, and
        dispatches the next opcode.
      </p>

      <div className={styles.tip}>
        <span className={styles.tipTitle}>Tools that help</span>
        Hover any token in the microcode editor for inline docs. Press{' '}
        <span className={styles.kbd}>Shift+Alt+F</span> to format the file
        with column-aligned columns. Goto-definition and find-references
        work for labels.
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// IJVM syntax
// ----------------------------------------------------------------------------

function IjvmSection(): JSX.Element {
  return (
    <>
      <h1>IJVM — macrocode syntax</h1>
      <p className={styles.lead}>
        IJVM is a stack-based bytecode. Word size is 32 bits; bytes
        following the opcode are operands. Stack and locals are word-indexed.
      </p>

      <h2>Instruction set (subset implemented)</h2>
      <table>
        <thead>
          <tr>
            <th>Opcode</th>
            <th>Mnemonic</th>
            <th>Operand bytes</th>
            <th>Effect</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><code>0x00</code></td><td><code>NOP</code></td><td>0</td><td>nothing</td></tr>
          <tr><td><code>0x10</code></td><td><code>BIPUSH b</code></td><td>1</td><td>push sign-ext byte</td></tr>
          <tr><td><code>0x13</code></td><td><code>LDC_W i</code></td><td>2</td><td>push word from constant pool</td></tr>
          <tr><td><code>0x15</code></td><td><code>ILOAD i</code></td><td>1</td><td>push local var <code>i</code></td></tr>
          <tr><td><code>0x36</code></td><td><code>ISTORE i</code></td><td>1</td><td>pop into local var <code>i</code></td></tr>
          <tr><td><code>0x57</code></td><td><code>POP</code></td><td>0</td><td>discard top</td></tr>
          <tr><td><code>0x59</code></td><td><code>DUP</code></td><td>0</td><td>duplicate top</td></tr>
          <tr><td><code>0x5F</code></td><td><code>SWAP</code></td><td>0</td><td>swap top two</td></tr>
          <tr><td><code>0x60</code></td><td><code>IADD</code></td><td>0</td><td>pop a,b; push a+b</td></tr>
          <tr><td><code>0x64</code></td><td><code>ISUB</code></td><td>0</td><td>pop a,b; push b-a</td></tr>
          <tr><td><code>0x7E</code></td><td><code>IAND</code></td><td>0</td><td>pop a,b; push a AND b</td></tr>
          <tr><td><code>0xB0</code></td><td><code>IOR</code></td><td>0</td><td>pop a,b; push a OR b</td></tr>
          <tr><td><code>0x99</code></td><td><code>IFEQ off</code></td><td>2</td><td>pop; branch if 0</td></tr>
          <tr><td><code>0x9B</code></td><td><code>IFLT off</code></td><td>2</td><td>pop; branch if &lt; 0</td></tr>
          <tr><td><code>0x9F</code></td><td><code>IF_ICMPEQ off</code></td><td>2</td><td>pop a,b; branch if a==b</td></tr>
          <tr><td><code>0xA7</code></td><td><code>GOTO off</code></td><td>2</td><td>unconditional branch</td></tr>
          <tr><td><code>0x84</code></td><td><code>IINC i,c</code></td><td>2</td><td>local var <code>i</code> += sign-ext byte <code>c</code></td></tr>
          <tr><td><code>0xB6</code></td><td><code>INVOKEVIRTUAL i</code></td><td>2</td><td>call method named by constant-pool index <code>i</code></td></tr>
          <tr><td><code>0xAC</code></td><td><code>IRETURN</code></td><td>0</td><td>method return: pop value, restore caller's PC/LV, push value onto caller's stack</td></tr>
          <tr><td><code>0xC4</code></td><td><code>WIDE</code></td><td>0</td><td>next instr's index is 16-bit</td></tr>
          <tr><td><code>0xFC</code></td><td><code>IN</code></td><td>0</td><td>push byte from console (0 if empty)</td></tr>
          <tr><td><code>0xFD</code></td><td><code>OUT</code></td><td>0</td><td>pop and emit to console</td></tr>
          <tr><td><code>0xFE</code></td><td><code>ERR</code></td><td>0</td><td>error halt — terminates the whole program with an error flag</td></tr>
          <tr><td><code>0xFF</code></td><td><code>HALT</code></td><td>0</td><td>normal halt — terminates the whole program (use <code>IRETURN</code> to return from a method)</td></tr>
        </tbody>
      </table>

      <h2>Assembler directives</h2>
      <pre><code>{`.constant NAME <int32>          ; 32-bit constant pool entry, named NAME
.const    NAME <int32>          ;   (alias)

.method foo(p1, p2, ...)        ; start a method body. Lays out a 4-byte
  .args 3                       ;   prologue (argsCount big-endian,
  .var v1                       ;   localsCount big-endian) and binds \`foo\`
  .var v2                       ;   as a constant-pool entry whose value is
  ILOAD p1                      ;   the prologue's byte address.
  ...
.end-method`}</code></pre>
      <p>
        <strong><code>.args</code> is optional.</strong> If omitted, the
        assembler defaults <code>argsCount</code> to{' '}
        <code>1 + (number of declared parameters)</code> — i.e. the
        OBJREF slot plus each named arg. Set <code>.args N</code>{' '}
        explicitly only when you want a sanity check that the prologue
        matches; the assembler errors if the declared value disagrees
        with the method header.
      </p>

      <h3>Labels</h3>
      <p>
        A line of the form <code>name:</code> declares a label bound to
        the address of the next byte emitted. Labels may appear on their
        own line or before an instruction. Forward references work — the
        assembler runs in two passes, so <code>GOTO loop_end</code>{' '}
        before <code>loop_end:</code> is declared is fine.
      </p>
      <pre><code>{`    BIPUSH 0
loop:
    DUP
    BIPUSH 10
    IF_ICMPEQ done
    BIPUSH 1
    IADD
    GOTO loop
done:
    POP
    HALT`}</code></pre>

      <h3>Integer literals</h3>
      <p>
        Numeric operands accept decimal, hex (<code>0x</code> prefix), and a
        leading minus for negatives — the same syntax everywhere a
        literal is allowed:
      </p>
      <ul>
        <li><code>BIPUSH 42</code>, <code>BIPUSH -5</code>, <code>BIPUSH 0x7F</code></li>
        <li><code>.constant N 1000000</code>, <code>.constant MASK 0xFF00</code>, <code>.constant NEG -1</code></li>
        <li><code>IINC counter, -1</code></li>
      </ul>
      <p>
        Range checks are mnemonic-specific: <code>BIPUSH</code> takes a
        signed byte (-128..127), the <code>IINC</code> step is a signed
        byte, branch offsets fit in a signed 16-bit field, etc.
      </p>

      <h3>Constant-pool indexing</h3>
      <p>
        Constant-pool entries are <strong>0-based</strong>. The first{' '}
        <code>.constant</code> or <code>.method</code> declared has
        index 0, the next index 1, and so on. <code>LDC_W</code> and{' '}
        <code>INVOKEVIRTUAL</code> normally take a <em>name</em> (resolved
        through the symbol table), but they also accept a literal index if
        you want to hand-craft an entry.
      </p>

      <h3>Local-variable layout</h3>
      <p>
        For <code>.method foo(p1, p2)</code> with{' '}
        <code>.var v1; .var v2</code>:
      </p>
      <table>
        <thead><tr><th>Slot</th><th>Holds</th></tr></thead>
        <tbody>
          <tr><td><code>LV[0]</code></td><td>OBJREF (the implicit <code>this</code> slot)</td></tr>
          <tr><td><code>LV[1]</code></td><td><code>p1</code></td></tr>
          <tr><td><code>LV[2]</code></td><td><code>p2</code></td></tr>
          <tr><td><code>LV[3]</code></td><td><code>v1</code></td></tr>
          <tr><td><code>LV[4]</code></td><td><code>v2</code></td></tr>
        </tbody>
      </table>
      <p>
        <code>argsCount</code> in the prologue is the number of stack slots
        consumed (1 OBJREF + named args). <code>localsCount</code> is the
        additional <code>.var</code>s.
      </p>

      <h2>Operand resolution</h2>
      <ul>
        <li>
          <code>ILOAD</code> / <code>ISTORE</code> /{' '}
          <code>IINC &lt;name&gt;</code> → local index (named arg or{' '}
          <code>.var</code>).
        </li>
        <li>
          <code>LDC_W</code> / <code>INVOKEVIRTUAL &lt;name&gt;</code> →
          constant-pool index.
        </li>
        <li>
          <code>GOTO</code> / <code>IFEQ</code> / <code>IFLT</code> /{' '}
          <code>IF_ICMPEQ &lt;name&gt;</code> → branch label (PC-relative).
        </li>
      </ul>

      <h2>WIDE</h2>
      <p>
        The assembler folds <code>WIDE</code> followed by{' '}
        <code>ILOAD</code> / <code>ISTORE</code> / <code>IINC</code> (on
        consecutive lines) into a single wide-encoded instruction. Only
        the local-index operand widens — from an unsigned byte
        (0..0xFF) to an unsigned 16-bit word (0..0xFFFF):
      </p>
      <ul>
        <li>
          <code>WIDE ILOAD i</code> — accepts <code>i</code> up to 0xFFFF.
        </li>
        <li>
          <code>WIDE ISTORE i</code> — same.
        </li>
        <li>
          <code>WIDE IINC i, c</code> — <code>i</code> widens to a
          uword; <code>c</code> stays a signed byte.
        </li>
      </ul>
      <p>
        Without <code>WIDE</code>, named-local references whose index
        exceeds 0xFF produce an error suggesting you add the prefix.
        Other mnemonics after <code>WIDE</code> are an error.
      </p>

      <h2>Mini example</h2>
      <pre><code>{`.constant FORTY_TWO 42

.method main()
    LDC_W FORTY_TWO   // push 42
    BIPUSH 8          // push 8
    IADD              // pop 42, 8 -> push 50
    HALT
.end-method`}</code></pre>

      <div className={styles.tip}>
        <span className={styles.tipTitle}>Sample programs</span>
        Open <span className={styles.kbd}>File ▸ Load sample</span> for
        worked examples: recursive sum, iterative loop, console echo,
        and WIDE demo.
      </div>
    </>
  );
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function Embed({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className={styles.embed}>
      <div className={styles.embedLabel}>{label}</div>
      {children}
    </div>
  );
}

// All-zero microinstruction used for the static field-layout demo. The
// BitFieldRow happily renders this — every group cell shows up with its
// header, but no bits are lit.
const EMPTY_MICRO: Microinstruction = {
  nextAddress: 0,
  jam: { JMPC: false, JAMN: false, JAMZ: false },
  shifter: 'NONE',
  alu: { F0: false, F1: false, ENA: false, ENB: false, INVA: false, INC: false },
  cBus: new Set(),
  mem: { read: false, write: false, fetch: false },
  bBus: 'NONE',
};
