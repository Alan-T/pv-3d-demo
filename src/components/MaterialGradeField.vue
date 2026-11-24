<script setup lang="ts">
import type { MaterialKey } from '../config.ts';
import { MATERIAL_GRADE_OPTIONS } from '../config.ts';

const { member, label, value = '' } = defineProps<{
  member: MaterialKey;
  label: string;
  value?: string;
}>();

const emit = defineEmits<{
  change: [member: MaterialKey, value: string, field: HTMLInputElement | HTMLSelectElement];
}>();

function changeGrade(event: Event) {
  const field = event.currentTarget;
  if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
    emit('change', member, field.value, field);
  }
}
</script>

<template>
  <div class="grade-field">
    <input :id="`grade-${member}`" type="text" :value="value" :aria-label="`${label}材质`"
      :title="value || '输入材质牌号'" placeholder="未指定" autocomplete="off" spellcheck="false"
      @focus="($event.currentTarget as HTMLInputElement).select()" @change="changeGrade">
    <span class="grade-picker">
      <select :id="`grade-picker-${member}`" :value="value" :aria-label="`选择${label}材质`" title="选择材质"
        @change="changeGrade">
        <option value="">未指定</option>
        <option v-if="value && !MATERIAL_GRADE_OPTIONS.includes(value)" :value="value">{{ value }}</option>
        <option v-for="grade in MATERIAL_GRADE_OPTIONS" :key="grade" :value="grade">{{ grade }}</option>
      </select>
    </span>
  </div>
</template>

<style scoped>
.grade-field {
  display: flex; min-width: 0; align-items: stretch; overflow: hidden;
  border: 1px solid var(--line); border-radius: 6px; background: var(--panel);
}
.grade-field:focus-within { outline: 2px solid var(--blue); outline-offset: 1px; }
.grade-field input {
  flex: 1; min-width: 0; width: 0; padding: 3px 0 3px 5px; border: 0; outline: 0;
  font: inherit; font-size: var(--field-value-size); line-height: 1.5; color: var(--blue); background: transparent;
}
.grade-field input::placeholder { color: var(--muted); }
.grade-picker { position: relative; display: grid; place-items: center; width: 22px; flex: none; }
.grade-picker::before {
  content: ''; width: 5px; height: 5px; border: solid var(--blue); border-width: 0 1.5px 1.5px 0;
  transform: translateY(-1px) rotate(45deg);
}
.grade-picker:hover, .grade-picker:focus-within { background: #e8f0ff; }
.grade-picker select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
</style>
