<script setup lang="ts">
import { ref, watch } from 'vue';
import { NAlert, NButton, NCard, NSpace, useDialog } from 'naive-ui';
import { useRouter } from 'vue-router';
import logoUrl from '../../assets/images/logo.png';
import settingsIconUrl from '../../assets/images/settings.svg';
import DropZone from '../components/DropZone.vue';
import LanguageSelect from '../components/LanguageSelect.vue';
import ProgressPanel from '../components/ProgressPanel.vue';
import RevealButton from '../components/RevealButton.vue';
import { useTranslation } from '../composables/useTranslation';
import { useSettings } from '../composables/useSettings';
import type { TargetLang } from '../../shared/types';

const router = useRouter();
const dialog = useDialog();
const { state, start, cancel, reset, dismissError } = useTranslation();
const { refresh: refreshSettings } = useSettings();

const targetLang = ref<TargetLang | null>(null);
const lastInputPath = ref<string | null>(null);

async function onFile(path: string): Promise<void> {
  if (!targetLang.value) return;
  lastInputPath.value = path;
  await start(path, targetLang.value);
  // Refresh quota after a translation completes
  void refreshSettings();
}

async function onRetry(): Promise<void> {
  if (lastInputPath.value && targetLang.value) {
    dismissError();
    await start(lastInputPath.value, targetLang.value);
    void refreshSettings();
  }
}

// Show modals for terminal account-state errors
watch(
  () => state.value,
  (s) => {
    if (s.status !== 'error') return;
    if (s.kind === 'invalid_key') {
      dialog.warning({
        title: 'API key was rejected',
        content: 'Update your API key in Settings and try again.',
        positiveText: 'Open Settings',
        negativeText: 'Dismiss',
        onPositiveClick: () => {
          dismissError();
          router.push({ name: 'settings' });
        },
        onNegativeClick: () => dismissError(),
        onClose: () => dismissError(),
        onMaskClick: () => dismissError(),
      });
    } else if (s.kind === 'quota_exceeded') {
      dialog.warning({
        title: 'Monthly translation quota exceeded',
        content: 'Wait until your quota resets or upgrade your plan.',
        positiveText: 'OK',
        onPositiveClick: () => dismissError(),
        onClose: () => dismissError(),
        onMaskClick: () => dismissError(),
      });
    } else if (s.kind === 'no_key') {
      router.push({ name: 'settings' });
      dismissError();
    }
  },
);

</script>

<template>
  <main class="main-view">
    <header class="header">
      <img class="logo" :src="logoUrl" alt="Ogma" />
      <button
        type="button"
        class="settings-btn"
        aria-label="Settings"
        @click="router.push({ name: 'settings' })"
      >
        <img :src="settingsIconUrl" alt="" />
      </button>
    </header>

    <NAlert
      v-if="
        state.status === 'error' &&
        state.kind !== 'invalid_key' &&
        state.kind !== 'quota_exceeded' &&
        state.kind !== 'no_key'
      "
      type="error"
      closable
      :title="state.message"
      class="banner"
      @close="dismissError"
    >
      <template #default>
        <NButton size="small" type="primary" @click="onRetry" :disabled="!lastInputPath">
          Retry
        </NButton>
      </template>
    </NAlert>

    <section class="body">
      <DropZone
        v-if="state.status === 'idle' || state.status === 'error'"
        :disabled="!targetLang"
        @file="onFile"
      />

      <ProgressPanel
        v-else-if="state.status === 'running'"
        :state="state"
        @cancel="cancel"
      />

      <NCard v-else-if="state.status === 'success'" size="small" class="success-card">
        <NSpace vertical :size="12" align="center">
          <div class="success-title">✓ Saved</div>
          <div class="success-path">{{ state.outputPath }}</div>
          <NSpace>
            <RevealButton :path="state.outputPath" />
            <NButton type="primary" @click="reset">Translate another</NButton>
          </NSpace>
        </NSpace>
      </NCard>
    </section>

    <section class="controls">
      <LanguageSelect v-model="targetLang" :disabled="state.status === 'running'" />
    </section>

    <footer class="footer">
      © {{ new Date().getFullYear() }} Secretariat of the Convention on Biological Diversity · Internal use only
    </footer>
  </main>
</template>

<style scoped>
.main-view {
  min-height: 100vh;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  gap: 1rem;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.logo {
  height: 32px;
  width: auto;
  display: block;
}
.settings-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 4px;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s;
}
.settings-btn:hover {
  background: #ecf7f0;
}
.settings-btn img {
  width: 22px;
  height: 22px;
  display: block;
}
.controls {
  display: flex;
  justify-content: center;
}
.banner {
  flex-shrink: 0;
}
.footer {
  text-align: center;
  font-size: 0.75rem;
  color: #6b6b6b;
}
.body {
  flex: 1;
  display: flex;
  align-items: stretch;
  justify-content: stretch;
  min-height: 0;
}
.body > * {
  width: 100%;
}
.success-card {
  align-self: center;
  max-width: 480px;
  margin: auto;
}
.success-title {
  font-size: 1.125rem;
  font-weight: 600;
  color: #009b48;
}
.success-path {
  font-size: 0.875rem;
  color: #6b6b6b;
  word-break: break-all;
  text-align: center;
}
</style>
