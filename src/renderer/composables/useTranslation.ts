import { ref } from 'vue';
import type {
  ProgressEvent,
  TargetLang,
  TranslateErrorKind,
} from '../../shared/types';

export type TranslationState =
  | { status: 'idle' }
  | {
      status: 'running';
      filePath: string;
      fileName: string;
      targetLang: TargetLang;
      phase: 'extracting' | 'translating' | 'rebuilding';
      current?: number;
      total?: number;
    }
  | { status: 'success'; outputPath: string; outputName: string }
  | { status: 'error'; kind: TranslateErrorKind; message: string };

const state = ref<TranslationState>({ status: 'idle' });
let unsubscribeProgress: (() => void) | null = null;

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return idx >= 0 ? p.slice(idx + 1) : p;
}

async function start(filePath: string, targetLang: TargetLang): Promise<void> {
  state.value = {
    status: 'running',
    filePath,
    fileName: basename(filePath),
    targetLang,
    phase: 'extracting',
  };

  unsubscribeProgress?.();
  unsubscribeProgress = window.api.onProgress((event: ProgressEvent) => {
    if (state.value.status !== 'running') return;
    state.value = {
      ...state.value,
      phase: event.phase,
      current: 'current' in event ? event.current : undefined,
      total: 'total' in event ? event.total : undefined,
    };
  });

  const result = await window.api.translate({ filePath, targetLang });

  unsubscribeProgress?.();
  unsubscribeProgress = null;

  if (result.ok) {
    state.value = {
      status: 'success',
      outputPath: result.outputPath,
      outputName: basename(result.outputPath),
    };
  } else if (result.error === 'cancelled') {
    state.value = { status: 'idle' };
  } else {
    state.value = { status: 'error', kind: result.error, message: result.message };
  }
}

async function cancel(): Promise<void> {
  await window.api.cancelTranslation();
}

function reset(): void {
  state.value = { status: 'idle' };
}

function dismissError(): void {
  if (state.value.status === 'error') {
    state.value = { status: 'idle' };
  }
}

export function useTranslation() {
  return { state, start, cancel, reset, dismissError };
}
