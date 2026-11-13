<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { createDesigner, getSnapshot } from './designer.js';
import ParameterPanel from './components/ParameterPanel.vue';
import ViewToolbar from './components/ViewToolbar.vue';

const canvas = ref(null);
const stage = ref(null);
const editor = ref(null);
const snapshot = shallowRef(getSnapshot());
const ready = ref(false);
const rendered = ref(false);
const failed = ref(false);
const panelCollapsed = ref(false);
const animatePanel = ref(false);
const sheetOpen = ref(false);
const panelTitle = computed(() => panelCollapsed.value ? '展开参数面板' : '收起参数面板');
const storageKey = 'pv3d.panelCollapsed';
let designer;

try {
  panelCollapsed.value = localStorage.getItem(storageKey) === '1';
} catch { /* Storage can be unavailable in private browsing. */ }

function handleError(error) {
  console.error(error);
  failed.value = true;
  ready.value = false;
}

onMounted(() => {
  try {
    designer = createDesigner({
      canvas: canvas.value,
      stage: stage.value,
      editor: editor.value,
      onUpdate: value => { snapshot.value = value; },
      onReady: () => { rendered.value = true; },
      onError: handleError,
    });
    ready.value = true;
  } catch (error) {
    handleError(error);
  }
});

onBeforeUnmount(() => {
  designer?.dispose();
  designer = null;
});

function changeParameter(key, value, input) {
  const normalized = designer.changeParameter(key, value);
  if (input.type === 'checkbox') input.checked = !!normalized;
  else input.value = normalized;
}

function changeSection(key, value, input) {
  input.value = designer.changeSection(key, value);
}

function togglePanel() {
  animatePanel.value = true;
  panelCollapsed.value = !panelCollapsed.value;
  try {
    localStorage.setItem(storageKey, panelCollapsed.value ? '1' : '0');
  } catch { /* The current session still keeps the selected state. */ }
}

async function toggleSheet() {
  sheetOpen.value = !sheetOpen.value;
  await nextTick();
  if (ready.value && designer) {
    designer.fitCanvas();
    designer.selectView(snapshot.value.view);
  }
}
</script>

<template>
  <div id="app" :class="{ pcollapsed: panelCollapsed, anim: animatePanel }">
    <main id="stage" ref="stage">
      <canvas id="c" ref="canvas"></canvas>
      <div id="loading" role="status" :class="{ done: rendered && !failed, fail: failed }">
        <i></i><span>{{ failed ? '3D 模型加载失败，请用最新版 Chrome / Edge 打开后刷新' : '正在加载 3D 模型…' }}</span>
      </div>
      <ViewToolbar :snapshot="snapshot" :ready="ready" @view="name => designer.selectView(name)"
        @joint="(...args) => designer.selectJoint(...args)" />
      <input id="dimEdit" ref="editor" type="text" inputmode="decimal" autocomplete="off" spellcheck="false"
        aria-label="修改尺寸" hidden>
      <div id="legend">
        <span><i class="sw in"></i>蓝字 = 输入参数（点击可改）</span>
        <span><i class="sw out"></i>黑字 = 推算值</span>
        <span id="hint" class="hint">{{ snapshot.viewLocked ? '视图已锁定：拖动平移 · 滚轮/双指缩放' : '拖动旋转 · 滚轮/双指缩放 · 右键/双指平移' }}</span>
      </div>
      <button id="panelToggle" type="button" aria-controls="panel" :aria-expanded="!panelCollapsed"
        :title="panelTitle" :aria-label="panelTitle" @click="togglePanel">
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </main>
    <ParameterPanel :snapshot="snapshot" :ready="ready" :open="sheetOpen"
      @parameter="changeParameter" @section="changeSection" @preset="preset => designer.applyPreset(preset)"
      @post-mode="(...args) => designer.changePostTieMode(...args)" @post-bay="(...args) => designer.changePostTieBay(...args)"
      @purlin-bay="(...args) => designer.changePurlinTieBay(...args)" @display="(...args) => designer.changeDisplay(...args)"
      @toggle-sheet="toggleSheet" />
  </div>
</template>
