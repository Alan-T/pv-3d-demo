<script setup lang="ts">
import type { Designer, DesignerSnapshot } from '../designer.ts';
import type { MaterialKey, MemberKey, ParameterKey, ProjectInfo as ProjectData } from '../design-types.ts';
import { computed, ref } from 'vue';
import { TinyButton, TinyOption } from '@opentiny/vue';
import { PARAMS, findParameterField } from '../parameter-fields.ts';
import ParameterField from './ParameterField.vue';
import FieldInput from './FieldInput.vue';
import FieldSelect from './FieldSelect.vue';
import MemberSpecifications from './MemberSpecifications.vue';
import PurlinCutEditor from './PurlinCutEditor.vue';
import HelpHint from './HelpHint.vue';
import ProjectInfo from './ProjectInfo.vue';
import DesignNotes from './DesignNotes.vue';
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

const layoutKeys: ParameterKey[] = ['cols', 'pitchEnd', 'pitch'];
const layoutFields = layoutKeys.map(key => findParameterField(key)!);
const otherFields = ['purlinTies', 'purlinClip', 'purlinConnector', 'purlinCutMode', 'slopeEW', 'slopeNS', 'alongSlope', ...layoutKeys];
const commonFields = PARAMS.filter(item => !item.key || !otherFields.includes(item.key));
const purlinCutModeField = findParameterField('purlinCutMode')!;
const purlinTieField = { ...findParameterField('purlinTies')!, label: '檩条拉杆' };
const postTieModes = [['none', '无'], ['ends', '首末跨'], ['all', '全部跨'], ['custom', '自定义']];
const displays: [keyof DesignerSnapshot['display'], string, string?][] = [
  ['dims', '尺寸标注'], ['buried', '埋地部分'], ['modules', '光伏组件'],
  ['postTies', '立柱拉杆'], ['purlinTies', '檩条拉杆'],
  ['shadows', '显示投影', '显示模型在地面和构件上的投影阴影'],
  ['bolts', '连接件', '螺栓、斜撑连接板、檩托、压块'], ['drawingColors', '按图纸配色'],
];
</script>

<template>
  <aside id="panel" :class="{ open }">
    <button id="sheetHandle" type="button" :aria-expanded="open" @click="$emit('toggle-sheet')">
      项目信息 · 设计参数 · 结果 <span>▲</span>
    </button>
    <div class="panel-pages">
      <div v-show="activeTab === 'project'" id="panel-page-project" class="panel-page" role="tabpanel"
        aria-labelledby="panel-tab-project" tabindex="0">
        <fieldset class="pbody panel-fields" :disabled="!ready" aria-label="项目信息">
          <project-info :preset="snapshot.preset" :model-value="projectInfo" :parameters="snapshot.parameters" :disabled="!ready"
            @update:model-value="$emit('update:projectInfo', $event)"
            @parameter="(...args) => $emit('parameter', ...args)">
            <template #title-action>
              <tiny-button id="reset" type="text" native-type="button" size="mini" :reset-time="0"
                title="按当前图纸模板重置项目信息、设计参数和全部排布" aria-label="按当前图纸模板重置项目信息、设计参数和全部排布" :disabled="!ready" @click="$emit('reset-preset')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />
                </svg>
              </tiny-button>
            </template>
          </project-info>
          <section>
            <h3>显示设置</h3>
            <div class="toggles">
              <label v-for="[key, label, title] in displays" :key="key" :title="title">
                <input type="checkbox" :data-k="key" :checked="snapshot.display[key]"
                  @change="$emit('display', key, ($event.currentTarget as HTMLInputElement).checked)">{{ label }}
              </label>
            </div>
          </section>
        </fieldset>
      </div>

      <div v-show="activeTab === 'parameters'" id="panel-page-parameters" class="panel-page" role="tabpanel"
        aria-labelledby="panel-tab-parameters" tabindex="0">
        <fieldset class="pbody panel-fields design-parameters" :disabled="!ready" aria-label="设计参数">
          <h3 id="design-parameters-heading">设计参数</h3>
          <section id="params" aria-labelledby="design-parameters-heading">
            <parameter-field v-for="field in commonFields" :key="field.key || field.keys[0]" :definition="field"
              :parameters="snapshot.parameters" :disabled="!ready" @change="(...args) => $emit('parameter', ...args)" />
          </section>

          <section class="layout-parameters" aria-labelledby="layout-parameters-heading">
            <h4 id="layout-parameters-heading">排布参数 <small>{{ currentLayout.label }}</small></h4>
            <div class="prow">
              <label class="pl" for="layout-quantity">排布套数</label>
              <div class="pv">
                <field-input id="layout-quantity" type="number" min="1" step="1" :value="currentLayout.quantity"
                  @commit="$emit('layout-quantity', $event)" />
                <i>套</i>
              </div>
            </div>
            <parameter-field v-for="field in layoutFields" :key="field.key" :definition="field"
              :parameters="snapshot.parameters" @change="(...args) => $emit('parameter', ...args)" />
            <dl class="layout-counts">
              <div><dt>每套榀数</dt><dd id="layout-frame-count">{{ ready ? snapshot.frameCount + ' 榀' : '—' }}</dd></div>
              <div><dt>每套檩条拉杆</dt><dd id="layout-purlin-tie-count">{{ ready ? snapshot.purlinTieCount + ' 套' : '—' }}</dd></div>
            </dl>

            <h5>檩条分段</h5>
            <parameter-field :definition="purlinCutModeField" :parameters="snapshot.parameters" :disabled="!ready"
              @change="(...args) => $emit('parameter', ...args)" />
            <purlin-cut-editor v-if="snapshot.parameters.purlinCutMode === 'custom'" :key="`${snapshot.preset}-${currentLayout.id}`"
              :lengths="snapshot.parameters.purlinCutLengths" :total="snapshot.purlinLength" :error="snapshot.purlinCutError"
              @apply="(...args) => $emit('purlin-cut-lengths', ...args)" @reset="done => $emit('reset-purlin-cut', done)" />

            <h5>立柱拉杆布置</h5>
            <div id="post-tie-controls">
              <template v-for="row in snapshot.postTies" :key="row.key">
                <div class="prow">
                  <div class="pl field-label">
                    <label :for="`post-tie-${row.key}`">{{ row.label }}立柱拉杆</label>
                    <help-hint :label="`${row.label}立柱拉杆`" :text="`上孔距柱顶 ${row.topOffset}，上下孔高差 ${row.holeRise} mm`" />
                  </div>
                  <field-select :id="`post-tie-${row.key}`" :data-tie-row="row.key" :value="snapshot.parameters[`postTie${row.key}`]"
                    :label="`${row.label}立柱拉杆`" :disabled="!ready"
                    :description="row.lengthDescription ? `post-tie-${row.key}-length` : undefined"
                    @change="$emit('post-mode', row.key, $event)">
                    <tiny-option v-for="[value, label] in postTieModes" :key="value" :value="value" :label="label" />
                  </field-select>
                  <small v-if="row.lengthDescription" :id="`post-tie-${row.key}-length`" class="field-description">{{ row.lengthDescription }}</small>
                </div>
                <div v-if="snapshot.parameters[`postTie${row.key}`] === 'custom'" class="tie-spans">
                  <label v-for="(enabled, index) in row.enabled" :key="index">
                    <input type="checkbox" :data-tie-row="row.key" :data-tie-bay="index" :checked="!!enabled"
                      @change="$emit('post-bay', row.key, index, ($event.currentTarget as HTMLInputElement).checked)">第 {{ index + 1 }} 跨
                  </label>
                </div>
              </template>
            </div>

            <h5>檩条拉杆布置</h5>
            <div id="purlin-tie-controls">
              <parameter-field :definition="purlinTieField" :parameters="snapshot.parameters" :disabled="!ready"
                :select-description="snapshot.purlinTieLength != null ? `长度 ${snapshot.purlinTieLength} mm` : undefined"
                @change="(...args) => $emit('parameter', ...args)" />
              <div id="purlin-tie-spans" class="tie-spans" :hidden="snapshot.parameters.purlinTies !== 'custom'">
                <template v-if="snapshot.parameters.purlinTies === 'custom'">
                  <label v-for="bay in snapshot.bayCount" :key="bay">
                    <input type="checkbox" :data-purlin-tie-bay="bay - 1" :checked="snapshot.parameters.purlinTieSpans[bay - 1] === 1"
                      @change="$emit('purlin-bay', bay - 1, ($event.currentTarget as HTMLInputElement).checked)">第 {{ bay }} 跨
                  </label>
                </template>
              </div>
            </div>
          </section>
        </fieldset>
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
        <div class="pbody report-body">
          <section>
            <h3>计算结果 <small>{{ currentLayout.label }} · 单套</small></h3>
            <ul id="warnings"><li v-for="(warning, index) in snapshot.report?.warnings" :key="index">{{ warning }}</li></ul>
            <dl id="results">
              <template v-for="[label, value] in snapshot.report?.rows" :key="label"><dt>{{ label }}</dt><dd>{{ value }}</dd></template>
            </dl>
          </section>

          <section>
            <h3>与图纸核对 <small>（图纸值对应所选方案的默认参数）</small></h3>
            <table id="check">
              <thead><tr><th>项目</th><th>图纸</th><th>模型</th><th>差</th></tr></thead>
              <tbody>
                <tr v-for="row in snapshot.report?.checks" :key="row.label">
                  <td>{{ row.label }}</td><td>{{ row.expected }}</td><td>{{ row.actual ?? '—' }}</td>
                  <td :class="row.matches ? 'ok' : 'bad'">{{ row.delta === null ? '—' : row.delta > 0 ? `+${row.delta}` : row.delta }}</td>
                </tr>
              </tbody>
            </table>
          </section>
          <design-notes :module-thickness="snapshot.parameters.modT" :clamp-length="snapshot.parameters.clampL" />
        </div>
      </div>
    </div>

    <tab-list v-model="activeTab" prefix="panel" label="参数面板分类" :tabs="tabs" />
  </aside>
</template>

<style scoped>
.design-parameters > h3 { margin: 14px 0 0; }
#reset {
  display: inline-grid; place-items: center; width: 26px; height: 26px; min-width: 26px;
  margin-left: auto; padding: 0; border-radius: 4px; color: var(--blue);
}
#reset svg { display: block; }
#reset:hover:enabled { background: #e8f0ff; }
#reset:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
.design-parameters > section:first-of-type { border-bottom: 0; }
.layout-parameters {
  margin-inline: -10px;
  padding: 12px 9px;
  border: 1px solid #d4e1f1;
  border-radius: 8px;
  background: #f1f6fd;
}
.layout-parameters :deep(.field-description) { color: #636f7d; }
.design-parameters h4 { margin: 0 0 10px; font-size: 14px; }
.design-parameters h4 small { margin-left: 4px; color: var(--muted); font-size: 12px; font-weight: normal; }
.design-parameters h5 { margin: 16px 0 8px; font-size: 14px; }
.layout-counts { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 4px 0 0; font-size: 12px; }
.layout-counts > div { display: flex; align-items: baseline; gap: 5px; }
.layout-counts dt { color: var(--muted); }
.layout-counts dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
