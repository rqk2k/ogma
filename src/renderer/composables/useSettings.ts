import { ref } from 'vue';
import type { Formality, SaveApiKeyResult, UsageInfo } from '../../shared/types';

const hasKey = ref<boolean | null>(null);
const usage = ref<UsageInfo | null>(null);
const lastError = ref<string | null>(null);
const formality = ref<Formality | null>(null);

async function refresh(): Promise<void> {
  const has = await window.api.hasApiKey();
  hasKey.value = has;
  usage.value = has ? await window.api.getUsage() : null;
  formality.value = await window.api.getFormality();
}

async function saveKey(key: string): Promise<SaveApiKeyResult> {
  const result = await window.api.saveApiKey(key);
  if (result.ok) {
    hasKey.value = true;
    usage.value = result.usage;
    lastError.value = null;
  } else {
    lastError.value = result.message;
  }
  return result;
}

async function saveFormality(value: Formality): Promise<void> {
  formality.value = value;
  await window.api.setFormality(value);
}

export function useSettings() {
  return { hasKey, usage, lastError, formality, refresh, saveKey, saveFormality };
}
