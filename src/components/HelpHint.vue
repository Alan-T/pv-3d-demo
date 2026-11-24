<script setup lang="ts">
import type { CSSProperties } from 'vue';
import { nextTick, onBeforeUnmount, ref, useId, watch } from 'vue';

defineProps({ text: { type: String, required: true }, label: { type: String, required: true } });
const id = useId(), trigger = ref<HTMLButtonElement | null>(null), tooltip = ref<HTMLElement | null>(null), visible = ref(false);
const position = ref<CSSProperties>({ visibility: 'hidden' });
let hideTimer: ReturnType<typeof setTimeout>;

function cancelClose() { clearTimeout(hideTimer); }
function close() { cancelClose(); visible.value = false; }
function leave() {
  cancelClose();
  hideTimer = setTimeout(() => { if (document.activeElement !== trigger.value) close(); }, 120);
}
async function open() {
  cancelClose();
  if (!visible.value) position.value = { visibility: 'hidden' };
  visible.value = true;
  await nextTick();
  if (!visible.value || !tooltip.value) return;
  if (!trigger.value?.getClientRects().length) return close();
  const anchor = trigger.value.getBoundingClientRect(), box = tooltip.value.getBoundingClientRect();
  const width = document.documentElement.clientWidth, height = window.innerHeight;
  const left = Math.max(12, Math.min(anchor.left, width - box.width - 12));
  const top = anchor.bottom + 8 + box.height <= height - 12 ? anchor.bottom + 8 : Math.max(12, anchor.top - box.height - 8);
  position.value = { left: `${left}px`, top: `${top}px` };
}
function outside(event: Event) {
  if (event.target instanceof Node && !trigger.value?.contains(event.target) && !tooltip.value?.contains(event.target)) close();
}
function keydown(event: Event) { if (event instanceof KeyboardEvent && event.key === 'Escape') close(); }
function listen(enabled: boolean) {
  const method = enabled ? 'addEventListener' : 'removeEventListener';
  document[method]('pointerdown', outside);
  document[method]('keydown', keydown);
  document[method]('scroll', close, true);
  window[method]('resize', close);
}
watch(visible, listen);
onBeforeUnmount(() => { cancelClose(); listen(false); });
</script>

<template>
  <button ref="trigger" class="help-hint" type="button" :aria-label="`${label}说明`"
    :aria-describedby="visible ? id : undefined"
    @pointerenter="event => { if (event.pointerType === 'mouse') open(); }" @pointerleave="leave"
    @focus="open" @blur="close" @click.stop="open">
    <span aria-hidden="true">?</span>
  </button>
  <Teleport to="body">
    <div v-if="visible" :id="id" ref="tooltip" class="help-tooltip" role="tooltip" :style="position"
      @pointerenter="cancelClose" @pointerleave="leave">{{ text }}</div>
  </Teleport>
</template>

<style scoped>
.help-hint {
  flex: none; display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; padding: 0; border: 1px solid #a8b4c4; border-radius: 50%;
  background: transparent; color: #758398; font: 600 10px/1 sans-serif; cursor: help;
}
.help-hint:hover, .help-hint:focus-visible { color: var(--blue); border-color: var(--blue); background: #edf3ff; }
.help-hint:focus-visible { outline: 2px solid #b8cffd; outline-offset: 2px; }
.help-tooltip {
  position: fixed; z-index: 100; width: max-content; max-width: min(300px, calc(100vw - 24px));
  padding: 9px 11px; border: 1px solid #d7e0ec; border-radius: 7px;
  background: #fff; color: #39485b; box-shadow: 0 4px 18px #1c324126;
  font-size: 12px; font-weight: normal; line-height: 1.6; overflow-wrap: anywhere;
}
</style>
