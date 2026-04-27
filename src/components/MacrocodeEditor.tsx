import { useEffect, useRef } from 'react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useAppStore } from '../store';
import { registerMonacoLanguages } from './monacoLanguages';
import styles from './CodeEditor.module.css';

const MONACO_THEME = 'mic1-dark';

export function MacrocodeEditor(): JSX.Element {
  const macrocode = useAppStore((s) => s.macrocode);
  const setMacrocode = useAppStore((s) => s.setMacrocode);
  const ijvmAssembly = useAppStore((s) => s.ijvmAssembly);
  // Highlight the IJVM instruction whose handler is currently active. This is
  // pinned at the address of the last opcode dispatched by Main1 — using
  // `machine.PC` directly would mis-highlight mid-handler when PC walks past
  // the operand bytes.
  const currentPc = useAppStore((s) => s.currentOpcodeAddress);

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<editor.IEditorDecorationsCollection | null>(null);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !ijvmAssembly) return;
    const model = editor.getModel();
    if (!model) return;
    const markers: editor.IMarkerData[] = ijvmAssembly.errors.map((e) => ({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: e.line,
      startColumn: e.column,
      endLineNumber: e.line,
      endColumn: e.column + 1,
      message: e.message,
    }));
    monaco.editor.setModelMarkers(model, 'ijvm', markers);
  }, [ijvmAssembly]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !ijvmAssembly) return;
    const line = ijvmAssembly.lineByAddress.get(currentPc);
    const decorations = decorationsRef.current;
    if (!decorations) return;
    if (line === undefined) {
      decorations.set([]);
      return;
    }
    decorations.set([
      {
        range: {
          startLineNumber: line,
          startColumn: 1,
          endLineNumber: line,
          endColumn: 1,
        },
        options: {
          isWholeLine: true,
          className: 'mic1-current-line',
          glyphMarginClassName: 'mic1-current-glyph',
        },
      },
    ]);
    editor.revealLineInCenterIfOutsideViewport(line);
  }, [currentPc, ijvmAssembly]);

  const handleMount: React.ComponentProps<typeof Editor>['onMount'] = (ed, monaco) => {
    editorRef.current = ed;
    monacoRef.current = monaco;
    registerMonacoLanguages(monaco);
    monaco.editor.setTheme(MONACO_THEME);
    decorationsRef.current = ed.createDecorationsCollection();
  };

  return (
    <div className="panel">
      <div className={styles.editorWrap}>
        {ijvmAssembly && ijvmAssembly.errors.length > 0 && (
          <span className={styles.errorBadge}>
            {ijvmAssembly.errors.length} error{ijvmAssembly.errors.length === 1 ? '' : 's'}
          </span>
        )}
        <Editor
          language="ijvm"
          value={macrocode}
          onChange={(v) => setMacrocode(v ?? '')}
          onMount={handleMount}
          options={{
            minimap: { enabled: false },
            fontSize: 12,
            lineNumbers: 'on',
            glyphMargin: true,
            folding: false,
            scrollBeyondLastLine: false,
            renderLineHighlight: 'line',
            tabSize: 2,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
