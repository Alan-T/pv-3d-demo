<script setup lang="ts">
import { ref, watch, watchPostEffect } from 'vue';
import { TinyInput } from '@opentiny/vue';
import { PURLIN_CUT_GAP } from '../domain/purlin-cut.ts';
import HelpHint from './HelpHint.vue';

const props = defineProps<{ lengths: number[]; total: number; error?: string }>();
const emit = defineEmits<{
  apply: [lengths: number[], done: (error: string) => void];
  reset: [done: (result: { lengths?: number[]; error: string }) => void];
}>();
const draft = ref('');
const inputError = ref('');
const lengthsInput = ref<{ getInput(): HTMLTextAreaElement } | null>(null);

watchPostEffect(() => {
  const textarea = lengthsInput.value?.getInput();
  if (!textarea) return;
  // TinyInput 将 id 和 aria-invalid 放在外层，标签与校验状态需要关联到实际编辑区。
  textarea.id = 'purlin-cut-lengths';
  textarea.setAttribute('aria-invalid', String(!!(inputError.value || props.error)));
});

watch(() => props.lengths.join(', '), text => {
  draft.value = text;
  inputError.value = '';
}, { immediate: true });

function apply() {
  const tokens = draft.value.trim().split(/\s*[,，/]\s*|\s+/);
  const lengths = tokens.map(Number);
  const invalid = tokens.findIndex((token, i) => !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) || !Number.isFinite(lengths[i]) || lengths[i] <= 0);
  if (invalid !== -1) {
    inputError.value = `请输入第 ${invalid + 1} 段的净长，单位为 mm，数值须大于 0。`;
    return;
  }
  emit('apply', lengths, error => {
    inputError.value = error;
    if (!error) draft.value = lengths.join(', ');
  });
}

function submitOnEnter(event: KeyboardEvent) {
  if (event.isComposing) return;
  event.preventDefault();
  apply();
}

function reset() {
  emit('reset', ({ lengths, error }) => {
    inputError.value = error;
    if (!error && lengths) draft.value = lengths.join(', ');
  });
}
</script>

<template>
  <form class="cut-editor" @submit.prevent="apply">
    <div class="cut-heading">
      <div class="field-label">
        <label for="purlin-cut-lengths">各段净长</label>
        <help-hint label="各段净长" text="用逗号、空格、斜杠或换行分隔段长。回车应用，Shift + 回车换行。段长总和加上接缝宽度应等于檩条总长。" />
      </div>
      <span id="purlin-cut-order">从西到东 · mm</span>
    </div>
    <div class="cut-lengths" :data-draft="draft">
      <tiny-input ref="lengthsInput" v-model="draft" type="textarea" rows="2" resize="none"
        label="各段净长" tabindex="0" autocomplete="off" spellcheck="false" placeholder="用逗号或换行分隔段长"
        :aria-describedby="`purlin-cut-order purlin-cut-info${inputError || error ? ' purlin-cut-error' : ''}`"
        @input="inputError = ''" @keydown.enter.exact="submitOnEnter" />
    </div>
    <p v-if="inputError || error" id="purlin-cut-error" role="alert">{{ inputError || error }}</p>
    <div class="cut-footer">
      <p id="purlin-cut-info"><span>檩条总长 {{ total }} mm</span><span>接缝 {{ PURLIN_CUT_GAP }} mm</span></p>
      <div class="cut-actions">
        <button id="reset-purlin-cut" type="button" title="按当前参数自动切割并应用" @click="reset">重置</button>
        <button id="apply-purlin-cut" type="submit">应用</button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.cut-editor { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; font-size: var(--field-label-size); }
.cut-heading, .cut-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 10px; }
#purlin-cut-order { font-size: 12px; color: var(--muted); }
.cut-lengths { display: grid; grid-template-columns: minmax(0, 1fr); }
/* 镜像文本参与排版，让编辑框随换行增高，也能在面板宽度变化时自动收缩。 */
.cut-lengths > .tiny-textarea, .cut-lengths::after { grid-area: 1 / 1; min-width: 0; }
.cut-lengths::after, .cut-lengths :deep(textarea) {
  padding: 6px 9px; border-width: 1px;
  font: inherit; font-size: var(--field-value-size); font-variant-numeric: tabular-nums; line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere;
}
.cut-lengths::after { content: attr(data-draft) ' '; visibility: hidden; border: 1px solid transparent; }
.cut-lengths :deep(textarea) { height: 100%; overflow: hidden; color: var(--blue); }
.cut-lengths :deep(textarea[aria-invalid=true]) { border-color: var(--bad); }
.cut-actions { display: flex; gap: 6px; margin-left: auto; }
.cut-actions button { padding: 4px 10px; min-height: 30px; border: 1px solid var(--line); border-radius: 6px; font: inherit; background: var(--panel); color: var(--blue); cursor: pointer; }
#reset-purlin-cut { color: var(--muted); }
.cut-editor button:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
.cut-editor p { margin: 0; color: var(--muted); font-size: 12px; }
#purlin-cut-info { display: flex; flex-wrap: wrap; gap: 2px 10px; font-variant-numeric: tabular-nums; }
#purlin-cut-info span { white-space: nowrap; }
#purlin-cut-error { color: var(--bad); }
</style>
