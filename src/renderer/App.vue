<script setup lang="ts">
import { NConfigProvider, NMessageProvider, NDialogProvider } from 'naive-ui';
import { RouterView } from 'vue-router';
</script>

<template>
  <NConfigProvider>
    <NDialogProvider>
      <NMessageProvider>
        <RouterView />
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
