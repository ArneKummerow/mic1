/**
 * Shareable URL state. Sources are LZ-compressed and base64-encoded into the
 * URL hash so that programs can be shared as links without a backend.
 *
 *   #code=<lz-compressed-uri-component>
 *
 * The hash is `#code=` rather than the more common `?code=` so the value
 * never reaches the server (browsers don't send fragments in HTTP requests).
 */

import LZString from 'lz-string';

interface SharedState {
  microcode: string;
  macrocode: string;
}

const HASH_KEY = 'code';

export function encodeShareUrl(state: SharedState): string {
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(state));
  const url = new URL(window.location.href);
  url.hash = `${HASH_KEY}=${compressed}`;
  return url.toString();
}

export function decodeShareFromHash(): SharedState | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const value = params.get(HASH_KEY);
  if (!value) return null;
  try {
    const json = LZString.decompressFromEncodedURIComponent(value);
    if (!json) return null;
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'microcode' in parsed &&
      'macrocode' in parsed &&
      typeof (parsed as SharedState).microcode === 'string' &&
      typeof (parsed as SharedState).macrocode === 'string'
    ) {
      return parsed as SharedState;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearShareHash(): void {
  if (window.location.hash) {
    history.replaceState(null, '', window.location.pathname + window.location.search);
  }
}
