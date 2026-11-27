<script setup lang="ts">
import { ref, watchPostEffect } from 'vue';
import { TinySelect } from '@opentiny/vue';
import { setSelectExpanded } from './select-input.ts';

const props = defineProps<{
  id: string;
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  filterable?: boolean;
  activeOptionId?: string;
}>();
const emit = defineEmits<{ change: [value: string] }>();
const select = ref<{ $el: HTMLElement; blur(): void } | null>(null);
defineExpose({ blur: () => select.value?.blur() });
const expanded = ref(false);
let focusOnOpen = false;

function trackTrigger(event: KeyboardEvent | PointerEvent) {
  const opensWithKeyboard = event instanceof KeyboardEvent && ['Enter', 'ArrowUp', 'ArrowDown'].includes(event.key);
  focusOnOpen = !expanded.value && opensWithKeyboard;
}

function onVisibleChange(visible: boolean) {
  expanded.value = visible;
  const input = select.value?.$el.querySelector<HTMLInputElement>('input[role="combobox"]') ?? null;
  setSelectExpanded(input, visible, !!props.filterable || focusOnOpen);
  focusOnOpen = false;
}

// TinySelect 的 id 属于容器，label 的 for 需要关联到实际接收焦点的输入框。
watchPostEffect(() => {
  const input = select.value?.$el.querySelector<HTMLInputElement>('input[role="combobox"]');
  if (!input) return;
  input.id = props.id;
  input.setAttribute('aria-label', props.label);
  input.setAttribute('aria-expanded', String(expanded.value));
  if (props.description) input.setAttribute('aria-describedby', props.description);
  else input.removeAttribute('aria-describedby');
  if (props.activeOptionId) input.setAttribute('aria-activedescendant', props.activeOptionId);
  else input.removeAttribute('aria-activedescendant');
});
</script>

<template>
  <tiny-select ref="select" class="field-select" size="mini" tabindex="0"
    :model-value="value" :disabled="disabled" :filterable="filterable" @update:model-value="emit('change', $event)"
    @keydown.capture="trackTrigger" @pointerdown.capture="trackTrigger"
    @visible-change="onVisibleChange">
    <slot />
  </tiny-select>
</template>
