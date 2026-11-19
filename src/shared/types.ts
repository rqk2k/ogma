export interface UsageInfo {
  charactersUsed: number;
  characterLimit: number;
}

export type SaveApiKeyResult =
  | { ok: true; usage: UsageInfo }
  | {
      ok: false;
      error: 'invalid_key' | 'network' | 'encryption_unavailable' | 'unknown';
      message: string;
    };

export type TargetLang = 'EN-GB' | 'FR' | 'ES' | 'RU' | 'ZH-HANS' | 'AR';

export type Formality = 'default' | 'prefer_more' | 'prefer_less';

export interface TranslateOptions {
  filePath: string;
  targetLang: TargetLang;
}

export type TranslateErrorKind =
  | 'invalid_key'
  | 'quota_exceeded'
  | 'network'
  | 'cancelled'
  | 'parse'
  | 'fs'
  | 'no_key'
  | 'busy'
  | 'unknown';

export type TranslateResult =
  | { ok: true; outputPath: string }
  | { ok: false; error: TranslateErrorKind; message: string };

export type ProgressEvent =
  | { phase: 'extracting' }
  | { phase: 'translating'; current?: number; total?: number }
  | { phase: 'rebuilding' };

export type Platform = 'darwin' | 'win32' | 'linux';
