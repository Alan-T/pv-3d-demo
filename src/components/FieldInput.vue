<script setup lang="ts">
import { ref, watch, watchPostEffect } from 'vue';
import { TinyInput } from '@opentiny/vue';

const props = defineProps<{ id: string; value: string | number }>();
const emit = defineEmits<{ commit: [input: HTMLInputElement] }>();
const control = ref<{ getInput(): HTMLInputElement } | null>(null);
const draft = ref(String(props.value));

watch(() => props.value, value => { draft.value = String(value); });
// TinyVue 将 id 放在外层，label 的 for 需要指向实际的输入框。
watchPostEffect(() => {
  const input = control.value?.getInput();
  if (input) input.id = props.id;
});

function commit() {
  const input = control.value?.getInput();
  if (!input) return;
  emit('commit', input);
  // 提交时可能修正超限值或材质，把修正后的值同步回草稿。
  draft.value = input.value;
}
</script>

<template>
  <tiny-input ref="control" v-model="draft" size="mini" tabindex="0" @change="commit" />
</template>
