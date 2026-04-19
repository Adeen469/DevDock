import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

const monacoHost = typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined' ? window : self);

function buildWorker(label) {
  if (label === 'json') {
    return new Worker(new URL('monaco-editor/esm/vs/language/json/json.worker.js', import.meta.url), { type: 'module' });
  }

  if (label === 'css' || label === 'scss' || label === 'less') {
    return new Worker(new URL('monaco-editor/esm/vs/language/css/css.worker.js', import.meta.url), { type: 'module' });
  }

  if (label === 'html' || label === 'handlebars' || label === 'razor') {
    return new Worker(new URL('monaco-editor/esm/vs/language/html/html.worker.js', import.meta.url), { type: 'module' });
  }

  if (label === 'typescript' || label === 'javascript') {
    return new Worker(new URL('monaco-editor/esm/vs/language/typescript/ts.worker.js', import.meta.url), { type: 'module' });
  }

  return new Worker(new URL('monaco-editor/esm/vs/editor/editor.worker.js', import.meta.url), { type: 'module' });
}

export function ensureMonacoEnvironment() {
  monacoHost.MonacoEnvironment = {
    getWorker(_, label) {
      return buildWorker(label);
    }
  };
}

ensureMonacoEnvironment();

loader.config({ monaco });
