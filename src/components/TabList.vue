<script setup>
import { nextTick, ref, watch } from 'vue';

const props = defineProps({
  tabs: { type: Array, required: true },
  modelValue: { type: String, required: true },
  prefix: { type: String, required: true },
  label: { type: String, required: true },
  controls: String,
  disabled: Boolean,
  closable: Boolean,
});
const emit = defineEmits(['update:modelValue', 'remove']);
const list = ref(null);

watch(() => props.modelValue, () => {
  if (list.value.scrollWidth > list.value.clientWidth) {
    list.value.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}, { flush: 'post' });

function select(id) {
  if (id !== props.modelValue) emit('update:modelValue', id);
}

async function remove(id) {
  if (!props.closable || props.disabled || props.tabs.length <= 1) return;
  emit('remove', id);
  await nextTick();
  list.value?.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
}

function navigate(event, index) {
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
  document.getElementById(`${props.prefix}-tab-${id}`).focus({ preventScroll: true });
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
