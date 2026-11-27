<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { TinyOption } from '@opentiny/vue';
import type { MemberKey } from '../domain/design-types.ts';
import { findSection, getSectionLibrary, normalizeSection } from '../domain/specs/section-spec.ts';
import FieldSelect from './FieldSelect.vue';

const props = defineProps<{ member: MemberKey; value: string; label: string; disabled?: boolean }>();
const emit = defineEmits<{ change: [value: string] }>();
const searchable = computed(() => props.member !== 'postTie' && props.member !== 'purlinTie');
const select = ref<InstanceType<typeof FieldSelect> | null>(null);
const expanded = ref(false);
const query = ref('');
const highlighted = ref('');
const options = computed(() => {
  const library = getSectionLibrary(props.member);
  if (!searchable.value) return library;
  if (!expanded.value) return library.filter(section => section.name === props.value);
  const filter = normalizeSection(query.value);
  return filter ? library.filter(section => normalizeSection(section.name).includes(filter)) : library;
});

function onVisibleChange(visible: boolean) {
  const match = !visible && findSection(props.member, query.value);
  if (match && match.name !== props.value) emit('change', match.name);
  expanded.value = visible;
  query.value = '';
  highlighted.value = '';
}

function choose(value: string) {
  query.value = '';
  emit('change', value);
}

function onInput(event: Event) {
  if (event.target instanceof HTMLInputElement) query.value = event.target.value;
  highlighted.value = '';
}

const optionId = (name: string) => `section-${props.member}-option-${name}`;

function onKeydown(event: KeyboardEvent) {
  if (!expanded.value || !searchable.value || event.isComposing || !(event.target instanceof HTMLInputElement)) return;
  if (event.key === 'Escape') query.value = '';
  if (!['Enter', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
  // TinySelect 异步更新选项索引，快速粘贴和连续按键时按当前候选值导航。
  event.preventDefault();
  event.stopPropagation();
  const typed = event.target.value;
  const choices = options.value;
  const current = highlighted.value || (typed ? findSection(props.member, typed)?.name : props.value);
  if (event.key === 'Enter') {
    if (!current) return;
    choose(current);
    select.value?.blur();
  } else if (choices.length) {
    const index = choices.findIndex(section => section.name === current);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = choices[(index + step + choices.length) % choices.length];
    highlighted.value = next.name;
    nextTick(() => document.getElementById(optionId(next.name))?.scrollIntoView({ block: 'nearest' }));
  }
}
</script>

<template>
  <field-select ref="select" :id="`section-${member}`" :value="value" :label="`${label}截面`" :disabled="disabled"
    :filterable="searchable" :filter-method="(text: string) => query = text"
    :active-option-id="highlighted ? optionId(highlighted) : undefined"
    :title="searchable ? '可输入型号筛选，支持 *、x、× 分隔' : undefined"
    no-match-text="没有匹配的截面" no-data-text="没有匹配的截面"
    @input.capture="onInput" @keydown.capture="onKeydown" @visible-change="onVisibleChange" @change="choose">
    <tiny-option v-for="section in options" :id="optionId(section.name)" :key="section.name"
      :class="{ hover: highlighted === section.name }" :value="section.name" :label="section.name" />
  </field-select>
</template>
