<script setup lang="ts">
import { ref } from 'vue';
import { NInput, NButton, NSpace, NAlert } from 'naive-ui';
import { useSettings } from '../composables/useSettings';

const { saveKey } = useSettings();

const value = ref('');
const showKey = ref(false);
const saving = ref(false);
const errorMsg = ref<string | null>(null);

async function onSave() {
  if (!value.value.trim()) return;
  saving.value = true;
  errorMsg.value = null;
  const result = await saveKey(value.value);
  saving.value = false;
  if (result.ok) {
    value.value = '';
  } else {
    errorMsg.value = result.message;
  }
}
</script>

<template>
  <NSpace vertical :size="12">
    <label class="label">API Key</label>
    <NInput
      v-model:value="value"
      :type="showKey ? 'text' : 'password'"
      placeholder="Paste your key"
      :show-password-on="undefined"
      :disabled="saving"
      @keydown.enter="onSave"
    >
      <template #suffix>
        <NButton text size="tiny" @click="showKey = !showKey">
          {{ showKey ? 'Hide' : 'Show' }}
        </NButton>
      </template>
    </NInput>

    <NSpace justify="end">
      <NButton type="primary" :loading="saving" :disabled="!value.trim()" @click="onSave">
        Save
      </NButton>
    </NSpace>

    <NAlert v-if="errorMsg" type="error" :show-icon="false" :title="errorMsg" />
  </NSpace>
</template>

<style scoped>
.label {
  font-size: 0.875rem;
  font-weight: 500;
  color: #6b6b6b;
}
</style>
