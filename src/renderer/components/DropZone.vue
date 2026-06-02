<script setup lang="ts">
import { ref } from 'vue';

const emit = defineEmits<{ (e: 'file', path: string): void }>();
const props = defineProps<{ disabled?: boolean }>();

const isDragging = ref(false);

function isDocx(name: string): boolean {
  return name.toLowerCase().endsWith('.docx');
}

async function onClick(): Promise<void> {
  if (props.disabled) return;
  const path = await window.api.pickFile();
  if (path) emit('file', path);
}

function onDragOver(e: DragEvent): void {
  if (props.disabled) return;
  e.preventDefault();
  isDragging.value = true;
}

function onDragLeave(): void {
  isDragging.value = false;
}

function onDrop(e: DragEvent): void {
  e.preventDefault();
  isDragging.value = false;
  if (props.disabled) return;
  const file = e.dataTransfer?.files[0];
  if (!file) return;
  if (!isDocx(file.name)) return;
  const path = window.api.getPathForFile(file);
  if (path) emit('file', path);
}
</script>

<template>
  <button
    type="button"
    class="drop-zone"
    :class="{ dragging: isDragging, disabled: props.disabled }"
    :disabled="props.disabled"
    @click="onClick"
    @dragover="onDragOver"
    @dragleave="onDragLeave"
    @drop="onDrop"
  >
    <div class="content">
      <div class="icon" aria-hidden="true">📄</div>
      <div class="primary">Drop a .docx here</div>
      <div class="secondary">or click to browse</div>
    </div>
  </button>
</template>

<style scoped>
.drop-zone {
  width: 100%;
  min-height: 220px;
  border: 2px dashed #cfd8dc;
  border-radius: 12px;
  background: #ffffff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: inherit;
  font-size: 1rem;
  color: inherit;
  transition: border-color 0.15s, background 0.15s;
  padding: 1rem;
}
.drop-zone:hover:not(.disabled) {
  border-color: #009b48;
  background: #f6fbf8;
}
.drop-zone.dragging {
  border-color: #009b48;
  background: #ecf7f0;
}
.drop-zone.disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
.content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  pointer-events: none;
}
.icon {
  font-size: 2.25rem;
  line-height: 1;
}
.primary {
  font-size: 1rem;
  font-weight: 500;
  color: #1f1f1f;
}
.secondary {
  font-size: 0.875rem;
  color: #6b6b6b;
}
</style>
