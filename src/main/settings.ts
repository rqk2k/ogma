import Store from 'electron-store';
import { safeStorage } from 'electron';
import type { Formality, TargetLang } from '../shared/types';

interface SettingsSchema {
  apiKeyEncrypted?: string;
  lastTargetLang?: TargetLang;
  formality?: Formality;
}

const DEFAULT_FORMALITY: Formality = 'prefer_more';

const store = new Store<SettingsSchema>({ name: 'settings' });

export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

export function hasApiKey(): boolean {
  return Boolean(store.get('apiKeyEncrypted'));
}

export function getApiKey(): string | null {
  const blob = store.get('apiKeyEncrypted');
  if (!blob) return null;
  try {
    return safeStorage.decryptString(Buffer.from(blob, 'base64'));
  } catch {
    return null;
  }
}

export function saveApiKey(plain: string): void {
  const encrypted = safeStorage.encryptString(plain);
  store.set('apiKeyEncrypted', encrypted.toString('base64'));
}

export function clearApiKey(): void {
  store.delete('apiKeyEncrypted');
}

export function getLastTargetLang(): TargetLang | null {
  return store.get('lastTargetLang') ?? null;
}

export function setLastTargetLang(lang: TargetLang): void {
  store.set('lastTargetLang', lang);
}

export function getFormality(): Formality {
  return store.get('formality') ?? DEFAULT_FORMALITY;
}

export function setFormality(formality: Formality): void {
  store.set('formality', formality);
}
