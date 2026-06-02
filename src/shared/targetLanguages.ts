import type { TargetLang } from './types';

export interface TargetLanguageOption {
  code: TargetLang;
  label: string;
}

export const TARGET_LANGUAGES: TargetLanguageOption[] = [
  { code: 'EN-GB', label: 'English (UK)' },
  { code: 'FR', label: 'French' },
  { code: 'ES', label: 'Spanish' },
  { code: 'RU', label: 'Russian' },
  { code: 'ZH-HANS', label: 'Chinese (Simplified)' },
];
