<script setup lang="ts">
import { computed } from 'vue';
import { NButton } from 'naive-ui';

const props = defineProps<{ path: string }>();

const label = computed(() => {
  switch (window.api.platform) {
    case 'darwin':
      return 'Reveal in Finder';
    case 'win32':
      return 'Show in Explorer';
    default:
      return 'Show in folder';
  }
});

async function onClick(): Promise<void> {
  await window.api.revealInFolder(props.path);
}
</script>

<template>
  <NButton @click="onClick">{{ label }}</NButton>
</template>
