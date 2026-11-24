<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{ tabs: { id: string; label: string; title?: string }[]; modelValue: string; prefix: string; label: string; controls?: string; disabled?: boolean; closable?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [id: string]; remove: [id: string] }>();
const list = ref<HTMLElement | null>(null);

watch(() => props.modelValue, () => {
  if (list.value && list.value.scrollWidth > list.value.clientWidth) {
    list.value.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}, { flush: 'post' });

function select(id: string) {
  if (id !== props.modelValue) emit('update:modelValue', id);
}

async function remove(id: string) {
  if (!props.closable || props.disabled || props.tabs.length <= 1) return;
  emit('remove', id);
  await nextTick();
  list.value?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
}

function navigate(event: KeyboardEvent, index: number) {
  const count = props.tabs.length;
  if (event.key === 'Delete' && props.closable) {
    event.preventDefault();
    if (!event.repeat) remove(props.tabs[index].id);
    return;
  }
  let target;
  if (event.key === 'ArrowRight') target = (index + 1) % count;
  else if (event.key === 'ArrowLeft') target = (index + count - 1) % count;
  else if (event.key === 'Home') target = 0;
  else if (event.key === 'End') target = count - 1;
  else return;
  event.preventDefault();
  const id = props.tabs[target].id;
  document.getElementById(`${props.prefix}-tab-${id}`)?.focus({ preventScroll: true });
  select(id);
}
</script>

<template>
  <div ref="list" class="panel-tabs" role="tablist" :aria-label="label">
    <div v-for="(tab, index) in tabs" :key="tab.id" class="tab-item" role="presentation">
      <button :id="`${prefix}-tab-${tab.id}`" class="panel-tab"
        type="button" role="tab" :aria-controls="controls || `${prefix}-page-${tab.id}`" :disabled="disabled"
        :title="tab.title" :aria-selected="modelValue === tab.id" :tabindex="modelValue === tab.id ? 0 : -1"
        @click="select(tab.id)" @keydown="navigate($event, index)">{{ tab.label }}</button>
      <button v-if="closable && tabs.length > 1" type="button" class="tab-close" :disabled="disabled"
        :aria-label="`删除${tab.label}`" :title="`删除${tab.label}`" :tabindex="modelValue === tab.id ? 0 : -1"
        @click="remove(tab.id)">×</button>
    </div>
  </div>
</template>
