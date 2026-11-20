<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { createDesigner, getSnapshot } from './designer.js';
import { PRESETS } from './config.js';
import ParameterPanel from './components/ParameterPanel.vue';
import ViewToolbar from './components/ViewToolbar.vue';
import TabList from './components/TabList.vue';

const canvas = ref(null);
const stage = ref(null);
const editor = ref(null);
const snapshot = shallowRef(getSnapshot());
const projectInfo = ref({ ...PRESETS[snapshot.value.preset].projectInfo });
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

function changeLayoutQuantity(input) {
  input.value = designer.changeLayoutQuantity(input.value);
}

function scrollLayouts(event) {
  const list = event.currentTarget;
  if (event.ctrlKey || event.shiftKey || event.deltaX || list.scrollWidth <= list.clientWidth) return;
  event.preventDefault();
  list.scrollLeft += event.deltaY * (event.deltaMode === 1 ? 16 : 1);
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
  <main id="app" :class="{ pcollapsed: panelCollapsed, anim: animatePanel }">
    <div id="stage" ref="stage" role="tabpanel" :aria-labelledby="`layout-tab-${snapshot.activeLayoutId}`" tabindex="0">
      <canvas id="c" ref="canvas"></canvas>
      <div id="loading" role="status" :class="{ done: rendered && !failed, fail: failed }">
        <i></i><span>{{ failed ? '3D 模型加载失败，请用最新版 Chrome / Edge 打开后刷新' : '正在加载 3D 模型…' }}</span>
      </div>
      <ViewToolbar :snapshot="snapshot" :ready="ready" @view="name => designer.selectView(name)"
        @joint="(...args) => designer.selectJoint(...args)" @preset="preset => designer.applyPreset(preset)" />
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
    </div>
    <ParameterPanel v-model:project-info="projectInfo" :snapshot="snapshot" :ready="ready" :open="sheetOpen"
      @parameter="changeParameter" @section="changeSection" @reset-preset="designer.resetPreset()"
      @layout-quantity="changeLayoutQuantity"
      @post-mode="(...args) => designer.changePostTieMode(...args)" @post-bay="(...args) => designer.changePostTieBay(...args)"
      @purlin-bay="(...args) => designer.changePurlinTieBay(...args)" @display="(...args) => designer.changeDisplay(...args)"
      @toggle-sheet="toggleSheet" />
    <div class="layout-bar">
      <span class="drawing-label" aria-hidden="true">排布方案</span>
      <TabList class="drawing-tabs" prefix="layout" label="排布方案" controls="stage" closable
        :model-value="snapshot.activeLayoutId" :tabs="snapshot.layouts" :disabled="!ready"
        @update:model-value="id => designer.selectLayout(id)" @remove="id => designer.removeLayout(id)" @wheel="scrollLayouts" />
      <div class="layout-actions">
        <button id="add-layout" type="button" aria-label="新增排布" title="复制当前排布并新增" :disabled="!ready"
          @click="designer.addLayout()">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
          </svg>
        </button>
      </div>
    </div>
  </main>
</template>
