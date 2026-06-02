<script setup lang="ts">
import { onMounted } from 'vue';
import { NButton, NCard, NSelect, NSpace } from 'naive-ui';
import { useRouter } from 'vue-router';
import ApiKeyInput from '../components/ApiKeyInput.vue';
import { useSettings } from '../composables/useSettings';
import type { Formality } from '../../shared/types';

const router = useRouter();
const { hasKey, usage, formality, refresh, saveFormality } = useSettings();

onMounted(refresh);

const formalityOptions: Array<{ label: string; value: Formality }> = [
  { label: 'Neutral', value: 'default' },
  { label: 'Formal', value: 'prefer_more' },
  { label: 'Informal', value: 'prefer_less' },
];

function fmt(n: number): string {
  return new Intl.NumberFormat().format(n);
}

function onFormalityChange(value: Formality): void {
  void saveFormality(value);
}
</script>

<template>
  <main class="settings-view">
    <header class="header">
      <NButton v-if="hasKey" text @click="router.push({ name: 'main' })">← Back</NButton>
      <span v-else />
      <h1>Settings</h1>
      <span />
    </header>

    <section class="body">
      <NSpace vertical :size="16" class="cards">
        <NCard size="small" class="card">
          <NSpace vertical :size="16">
            <ApiKeyInput />
            <p v-if="usage" class="status">
              ✓ Connected — {{ fmt(usage.charactersUsed) }} / {{ fmt(usage.characterLimit) }}
              characters used
            </p>
          </NSpace>
        </NCard>

        <NCard size="small" class="card" title="Translation preferences">
          <NSpace vertical :size="6">
            <label class="label">Formality</label>
            <NSelect
              :value="formality"
              :options="formalityOptions"
              :disabled="formality == null"
              :consistent-menu-width="false"
              @update:value="onFormalityChange"
            />
          </NSpace>
        </NCard>
      </NSpace>
    </section>
  </main>
</template>

<style scoped>
.settings-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  gap: 1rem;
}
.header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
}
.header h1 {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
}
.body {
  flex: 1;
  display: flex;
  justify-content: center;
}
.cards {
  width: 100%;
  max-width: 420px;
  align-self: flex-start;
}
.card {
  width: 100%;
}
.status {
  margin: 0;
  font-size: 0.875rem;
  color: #1f7a3d;
}
.label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #6b6b6b;
}
</style>
