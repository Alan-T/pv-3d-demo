<script setup lang="ts">
import type { Designer } from '../app/designer.ts';
import type { DesignerSnapshot } from '../app/designer-snapshot.ts';
import type { MaterialKey, MemberKey, ParameterKey, ProjectInfo as ProjectData } from '../domain/design-types.ts';
import { computed, ref } from 'vue';
import ProjectInfoTab from './ProjectInfoTab.vue';
import DesignParametersTab from './DesignParametersTab.vue';
import LayoutSectionControls from './LayoutSectionControls.vue';
import ResultsReportTab from './ResultsReportTab.vue';
import MemberSpecifications from './MemberSpecifications.vue';
import TabList from './TabList.vue';

const props = defineProps<{ projectInfo: ProjectData; snapshot: DesignerSnapshot; ready?: boolean; open?: boolean }>();
defineEmits<{
  'update:projectInfo': [value: ProjectData];
  parameter: [key: ParameterKey, value: string | boolean, input?: HTMLInputElement];
  section: [key: MemberKey, value: string];
  'material-grade': [key: MaterialKey, value: string];
  'reset-preset': [];
  'layout-quantity': [input: HTMLInputElement];
  'purlin-cut-lengths': [lengths: number[], done: (error: string) => void];
  'reset-purlin-cut': [done: (result: ReturnType<Designer['resetPurlinCutLengths']>) => void];
  'post-mode': Parameters<Designer['changePostTieMode']>;
  'post-bay': Parameters<Designer['changePostTieBay']>;
  'purlin-bay': Parameters<Designer['changePurlinTieBay']>;
  display: Parameters<Designer['changeDisplay']>;
  'toggle-sheet': [];
}>();

const tabs = [
  { id: 'project', label: '项目信息' },
  { id: 'parameters', label: '设计参数' },
  { id: 'members', label: '构件规格' },
  { id: 'results', label: '结果' },
];
const activeTab = ref(tabs[0].id);
const currentLayout = computed(() => props.snapshot.layouts.find(layout => layout.id === props.snapshot.activeLayoutId)!);
</script>

<template>
  <aside id="panel" :class="{ open }">
    <button id="sheetHandle" type="button" :aria-expanded="open" @click="$emit('toggle-sheet')">
      项目信息 · 设计参数 · 结果 <span>▲</span>
    </button>
    <div class="panel-pages">
      <div v-show="activeTab === 'project'" id="panel-page-project" class="panel-page" role="tabpanel"
        aria-labelledby="panel-tab-project" tabindex="0">
        <project-info-tab :project-info="projectInfo" :snapshot="snapshot" :ready="ready"
          @update:project-info="$emit('update:projectInfo', $event)" @parameter="(...args) => $emit('parameter', ...args)"
          @display="(...args) => $emit('display', ...args)" @reset-preset="$emit('reset-preset')" />
      </div>

      <div v-show="activeTab === 'parameters'" id="panel-page-parameters" class="panel-page" role="tabpanel"
        aria-labelledby="panel-tab-parameters" tabindex="0">
        <design-parameters-tab :parameters="snapshot.parameters" :ready="ready" @parameter="(...args) => $emit('parameter', ...args)">
          <layout-section-controls :snapshot="snapshot" :current-layout="currentLayout" :ready="ready"
            @parameter="(...args) => $emit('parameter', ...args)"
            @layout-quantity="(...args) => $emit('layout-quantity', ...args)"
            @purlin-cut-lengths="(...args) => $emit('purlin-cut-lengths', ...args)"
            @reset-purlin-cut="(...args) => $emit('reset-purlin-cut', ...args)"
            @post-mode="(...args) => $emit('post-mode', ...args)"
            @post-bay="(...args) => $emit('post-bay', ...args)"
            @purlin-bay="(...args) => $emit('purlin-bay', ...args)" />
        </design-parameters-tab>
      </div>

      <div v-show="activeTab === 'members'" id="panel-page-members" class="panel-page" role="tabpanel"
        aria-labelledby="panel-tab-members" tabindex="0">
        <fieldset class="pbody panel-fields" :disabled="!ready" aria-label="构件规格">
          <member-specifications :key="`${snapshot.preset}-${snapshot.activeLayoutId}`" :snapshot="snapshot" :layout="currentLayout"
            :disabled="!ready" @parameter="(...args) => $emit('parameter', ...args)" @section="(...args) => $emit('section', ...args)"
            @material-grade="(...args) => $emit('material-grade', ...args)" />
        </fieldset>
      </div>

      <div v-show="activeTab === 'results'" id="panel-page-results" class="panel-page" role="tabpanel"
        aria-labelledby="panel-tab-results" tabindex="0">
        <results-report-tab :snapshot="snapshot" :layout-label="currentLayout.label" />
      </div>
    </div>

    <tab-list v-model="activeTab" prefix="panel" label="参数面板分类" :tabs="tabs" />
  </aside>
</template>

<style scoped>
:deep(.layout-parameters) {
  margin-inline: -10px;
  padding: 12px 9px;
  border: 1px solid #d4e1f1;
  border-radius: 8px;
  background: #f1f6fd;
}
:deep(.layout-parameters .field-description) { color: #636f7d; }
</style>
