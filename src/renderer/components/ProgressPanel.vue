<script setup lang="ts">
import { computed } from 'vue';
import { NButton, NProgress, NSpin } from 'naive-ui';
import type { TranslationState } from '../composables/useTranslation';

const props = defineProps<{
  state: Extract<TranslationState, { status: 'running' }>;
}>();

const emit = defineEmits<{ (e: 'cancel'): void }>();

const phaseLabel = computed(() => {
  switch (props.state.phase) {
    case 'extracting':
      return 'Extracting…';
    case 'translating':
      return 'Translating…';
    case 'rebuilding':
      return 'Rebuilding…';
  }
});

const showCounter = computed(
  () =>
    props.state.phase === 'translating' &&
    props.state.total != null &&
    props.state.total > 0 &&
    props.state.current != null,
);

const percent = computed(() => {
  if (!showCounter.value) return null;
  const c = props.state.current ?? 0;
  const t = props.state.total ?? 0;
  return t === 0 ? 0 : Math.round((c / t) * 100);
});

function fmt(n: number): string {
  return new Intl.NumberFormat().format(n);
}
</script>

<template>
  <div class="progress-panel">
    <div class="header">
      <strong>{{ props.state.fileName }}</strong>
      <span class="lang">→ {{ props.state.targetLang }}</span>
    </div>

    <div class="phase">
      <NSpin v-if="!showCounter" size="small" />
      <span>{{ phaseLabel }}</span>
    </div>

    <NProgress
      v-if="showCounter"
      :percentage="percent ?? 0"
      :show-indicator="false"
      :height="8"
    />

    <div v-if="showCounter && props.state.current != null && props.state.total != null" class="counter">
      Paragraph {{ fmt(props.state.current) }} of {{ fmt(props.state.total) }}
    </div>

    <div class="actions">
      <NButton size="small" @click="emit('cancel')">Cancel</NButton>
    </div>
  </div>
</template>

<style scoped>
.progress-panel {
  width: 100%;
  background: #ffffff;
  border: 1px solid #e6e6e6;
  border-radius: 12px;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.header {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.9375rem;
}
.lang {
  color: #6b6b6b;
  font-size: 0.875rem;
}
.phase {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.875rem;
  color: #6b6b6b;
}
.counter {
  font-size: 0.8125rem;
  color: #6b6b6b;
}
.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.25rem;
}
</style>
