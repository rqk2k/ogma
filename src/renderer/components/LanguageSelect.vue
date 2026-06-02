<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { NSelect } from 'naive-ui';
import { TARGET_LANGUAGES } from '../../shared/targetLanguages';
import type { TargetLang } from '../../shared/types';

const props = defineProps<{ disabled?: boolean }>();
const value = defineModel<TargetLang | null>({ default: null });

const options = computed(() =>
  TARGET_LANGUAGES.map((l) => ({ label: l.label, value: l.code })),
);

const loaded = ref(false);

onMounted(async () => {
  if (value.value == null) {
    const stored = await window.api.getLastTargetLang();
    value.value = stored ?? 'FR';
  }
  loaded.value = true;
});

async function onChange(v: TargetLang): Promise<void> {
  value.value = v;
  await window.api.setLastTargetLang(v);
}
</script>

<template>
  <div class="lang-select">
    <label class="label">Target language</label>
    <NSelect
      :value="value"
      :options="options"
      :disabled="props.disabled || !loaded"
      :consistent-menu-width="false"
      @update:value="onChange"
    />
  </div>
</template>

<style scoped>
.lang-select {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 220px;
}
.label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: #6b6b6b;
}
</style>
