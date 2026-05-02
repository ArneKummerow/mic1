/**
 * Monaco bootstrap. By default `@monaco-editor/react` loads Monaco from a
 * CDN (jsdelivr) at runtime — convenient, but it means a network hit and a
 * silent blank editor when the CDN is slow or blocked. We have the
 * `monaco-editor` package installed locally, so we point the loader at it
 * and ship Monaco in our own bundle.
 *
 * Also wires up the Vite-friendly web-worker pattern so Monaco's tokenizer
 * and language workers load correctly.
 */

import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';

let initialized = false;

export const MIC1_DARK_THEME = 'mic1-dark';
export const MIC1_LIGHT_THEME = 'mic1-light';

const DARK_THEME_DATA: monaco.editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6b7480', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'f0883e' },
    { token: 'keyword.operator', foreground: 'f0883e' },
    { token: 'variable.predefined', foreground: '58a6ff' },
    { token: 'constant', foreground: 'f0e442' },
    { token: 'number', foreground: '94de4a' },
    { token: 'number.hex', foreground: '94de4a' },
    { token: 'type.identifier', foreground: 'cc79a7', fontStyle: 'bold' },
    { token: 'operator', foreground: 'e6edf3' },
  ],
  colors: {
    'editor.background': '#161b22',
    'editor.foreground': '#e6edf3',
    'editorLineNumber.foreground': '#6b7480',
    'editorLineNumber.activeForeground': '#9da7b0',
    'editor.selectionBackground': '#2a313a',
    'editor.lineHighlightBackground': '#1f242c',
  },
};

const LIGHT_THEME_DATA: monaco.editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6e7781', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'cf222e' },
    { token: 'keyword.operator', foreground: 'cf222e' },
    { token: 'variable.predefined', foreground: '0969da' },
    { token: 'constant', foreground: '8250df' },
    { token: 'number', foreground: '0550ae' },
    { token: 'number.hex', foreground: '0550ae' },
    { token: 'type.identifier', foreground: 'a83289', fontStyle: 'bold' },
    { token: 'operator', foreground: '24292f' },
  ],
  colors: {
    'editor.background': '#ffffff',
    'editor.foreground': '#1f2328',
    'editorLineNumber.foreground': '#8b949e',
    'editorLineNumber.activeForeground': '#57606a',
    'editor.selectionBackground': '#dbe7ff',
    'editor.lineHighlightBackground': '#f6f8fa',
  },
};

export function setupMonaco(): void {
  if (initialized) return;
  initialized = true;

  // Our two languages are Monarch-only, so the editor worker is sufficient
  // — no JSON / TS / CSS / HTML workers are needed.
  self.MonacoEnvironment = {
    getWorker() {
      return new editorWorker();
    },
  };

  loader.config({ monaco });

  // Pre-define both themes so any editor can switch via `setTheme()` alone.
  monaco.editor.defineTheme(MIC1_DARK_THEME, DARK_THEME_DATA);
  monaco.editor.defineTheme(MIC1_LIGHT_THEME, LIGHT_THEME_DATA);
}

export function monacoThemeName(theme: 'dark' | 'light'): string {
  return theme === 'light' ? MIC1_LIGHT_THEME : MIC1_DARK_THEME;
}

/**
 * Read a CSS custom property (e.g. `--fs-md`) off the document root and
 * return it as a number of pixels. Lets components that need a numeric
 * font size — like Monaco's `fontSize` option, which doesn't accept a
 * CSS value — track the same type scale as the rest of the app.
 */
export function cssFontSize(name: string, fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
}
