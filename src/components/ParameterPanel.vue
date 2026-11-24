<script setup lang="ts">
import type { Designer, DesignerSnapshot } from '../designer.ts';
import type { MaterialKey, MemberKey, ParameterDefinition, ParameterKey, ProjectInfo as ProjectData } from '../config.ts';
import { computed, ref } from 'vue';
import { TIE_SECTION_LIB, PARAMS, SECTION_LABEL, SECTION_LIB } from '../config.ts';
import ParameterField from './ParameterField.vue';
import MaterialGradeField from './MaterialGradeField.vue';
import PurlinCutEditor from './PurlinCutEditor.vue';
import HelpHint from './HelpHint.vue';
import ProjectInfo from './ProjectInfo.vue';
import DesignNotes from './DesignNotes.vue';
import TabList from './TabList.vue';

const props = defineProps<{ projectInfo: ProjectData; snapshot: DesignerSnapshot; ready?: boolean; open?: boolean }>();
defineEmits<{
  'update:projectInfo': [value: ProjectData];
  parameter: [key: ParameterKey, value: string | boolean, input: HTMLInputElement | HTMLSelectElement];
  section: [key: MemberKey, value: string, input: HTMLInputElement | HTMLSelectElement];
  'material-grade': [key: MaterialKey, value: string, input: HTMLInputElement | HTMLSelectElement];
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

function fieldFor<K extends ParameterKey>(key: K) {
  return PARAMS.find((field): field is ParameterDefinition & { key: K } => field.key === key)!;
}

const layoutKeys: ParameterKey[] = ['cols', 'pitchEnd', 'pitch'];
const layoutFields = layoutKeys.map(fieldFor);
const otherFields = ['purlinTies', 'purlinClip', 'purlinConnector', 'purlinCutMode', 'slopeEW', 'slopeNS', ...layoutKeys];
const commonFields = PARAMS.filter(item => !item.key || !otherFields.includes(item.key));
const purlinCutModeField = fieldFor('purlinCutMode');
const purlinTieField = { ...fieldFor('purlinTies'), label: '檩条拉杆' };
const purlinClipField = fieldFor('purlinClip');
const purlinConnectorField = fieldFor('purlinConnector');
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
          <ProjectInfo :model-value="projectInfo" :parameters="snapshot.parameters"
            @update:model-value="$emit('update:projectInfo', $event)"
            @parameter="(...args) => $emit('parameter', ...args)" />
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
          <h3>设计参数 <button id="reset" type="button" class="link" @click="$emit('reset-preset')">恢复图纸参数</button></h3>
          <section aria-labelledby="common-parameters-heading">
            <h4 id="common-parameters-heading">通用参数</h4>
            <div id="params">
              <ParameterField v-for="field in commonFields" :key="field.key || field.keys[0]" :definition="field"
                :parameters="snapshot.parameters" @change="(...args) => $emit('parameter', ...args)" />
            </div>
          </section>

          <section class="layout-parameters" aria-labelledby="layout-parameters-heading">
            <h4 id="layout-parameters-heading">排布参数 <small>{{ currentLayout.label }}</small></h4>
            <div class="prow">
              <label class="pl" for="layout-quantity">排布套数</label>
              <div class="pv">
                <input id="layout-quantity" type="number" min="1" step="1" :value="currentLayout.quantity"
                  @change="$emit('layout-quantity', $event.currentTarget as HTMLInputElement)">
                <i>套</i>
              </div>
            </div>
            <ParameterField v-for="field in layoutFields" :key="field.key" :definition="field"
              :parameters="snapshot.parameters" @change="(...args) => $emit('parameter', ...args)" />
            <dl class="layout-counts">
              <div><dt>每套榀数</dt><dd id="layout-frame-count">{{ ready ? snapshot.frameCount + ' 榀' : '—' }}</dd></div>
              <div><dt>每套檩条拉杆</dt><dd id="layout-purlin-tie-count">{{ ready ? snapshot.purlinTieCount + ' 套' : '—' }}</dd></div>
            </dl>

            <h5>檩条分段</h5>
            <ParameterField :definition="purlinCutModeField" :parameters="snapshot.parameters"
              @change="(...args) => $emit('parameter', ...args)" />
            <PurlinCutEditor v-if="snapshot.parameters.purlinCutMode === 'custom'" :key="`${snapshot.preset}-${currentLayout.id}`"
              :lengths="snapshot.parameters.purlinCutLengths" :total="snapshot.purlinLength" :error="snapshot.purlinCutError"
              @apply="(...args) => $emit('purlin-cut-lengths', ...args)" @reset="done => $emit('reset-purlin-cut', done)" />

            <h5>立柱拉杆布置</h5>
            <div id="post-tie-controls">
              <template v-for="row in snapshot.postTies" :key="row.key">
                <div class="prow">
                  <div class="pl field-label">
                    <label :for="`post-tie-${row.key}`">{{ row.label }}立柱拉杆</label>
                    <HelpHint :label="`${row.label}立柱拉杆`" :text="`上孔距柱顶 ${row.topOffset}，上下孔高差 ${row.holeRise} mm`" />
                  </div>
                  <select :id="`post-tie-${row.key}`" :data-tie-row="row.key" :value="snapshot.parameters[`postTie${row.key}`]"
                    :aria-describedby="row.lengthDescription ? `post-tie-${row.key}-length` : undefined"
                    @change="$emit('post-mode', row.key, ($event.currentTarget as HTMLSelectElement).value)">
                    <option v-for="[value, label] in postTieModes" :key="value" :value="value">{{ label }}</option>
                  </select>
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
              <ParameterField :definition="purlinTieField" :parameters="snapshot.parameters"
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
          <section class="layout-parameters layout-member-specs" aria-labelledby="layout-member-heading">
            <h3 id="layout-member-heading">排布规格 <small>{{ currentLayout.label }}</small></h3>
            <div class="spec-row spec-heading">
              <h4>构件截面</h4><span title="可选择或直接输入材质牌号">材质</span>
            </div>
            <div id="sections">
              <datalist id="sectionLib"><option v-for="section in SECTION_LIB" :key="section.name" :value="section.name" /></datalist>
              <div v-for="(label, key) in SECTION_LABEL" v-show="!['braceOF', 'braceOR'].includes(key) || !!snapshot.parameters.outer" :key="key" class="prow spec-row">
                <label class="pl" :for="`section-${key}`">{{ label }}</label>
                <select v-if="key === 'postTie' || key === 'purlinTie'" :id="`section-${key}`" :value="snapshot.sections[key]" :aria-label="`${label}截面`"
                  @change="$emit('section', key, ($event.currentTarget as HTMLSelectElement).value, $event.currentTarget as HTMLSelectElement)">
                  <option v-for="section in TIE_SECTION_LIB" :key="section.name" :value="section.name">{{ section.name }}</option>
                </select>
                <input v-else :id="`section-${key}`" class="psec" type="text" list="sectionLib"
                  placeholder="如 C80*40" :value="snapshot.sections[key]"
                  autocomplete="off" spellcheck="false" :aria-label="`${label}截面`"
                  title="输入关键字过滤，回车确认；分隔符 x / × / * 都可以" @focus="($event.currentTarget as HTMLInputElement).select()"
                  @change="$emit('section', key, ($event.currentTarget as HTMLInputElement).value, $event.currentTarget as HTMLInputElement)">
                <MaterialGradeField :member="key" :label="label" :value="currentLayout.materials[key]"
                  @change="(...args) => $emit('material-grade', ...args)" />
              </div>
            </div>
            <div class="spec-row spec-heading spec-divider">
              <h4>檩条附件</h4><span>材质</span>
            </div>
            <ParameterField v-for="field in [purlinClipField, purlinConnectorField]" :key="field.key"
              class="spec-row" :definition="field" :parameters="snapshot.parameters" @change="(...args) => $emit('parameter', ...args)">
              <template #label>{{ field.key === 'purlinClip' ? '檩托' : '连接件' }}</template>
              <template #after-select>
                <MaterialGradeField :member="field.key" :label="field.label" :value="currentLayout.materials[field.key]"
                  @change="(...args) => $emit('material-grade', ...args)" />
              </template>
            </ParameterField>
            <div id="brace-connector-specs">
              <div class="spec-row spec-heading spec-divider">
                <h4>斜撑连接件</h4><span>材质</span>
              </div>
              <div class="prow spec-row">
                <label class="pl" for="brace-connector">前后共用</label>
                <output id="brace-connector" class="brace-connector-spec" aria-describedby="brace-connector-note">{{ snapshot.braceConnectorSpec || '—' }}</output>
                <MaterialGradeField member="braceConnector" label="斜撑连接件"
                  :value="currentLayout.materials.braceConnector" @change="(...args) => $emit('material-grade', ...args)" />
                <small id="brace-connector-note" class="field-description">自动匹配 · 宽 × 高 × 厚（mm）</small>
              </div>
            </div>
          </section>
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
          <DesignNotes />
        </div>
      </div>
    </div>

    <TabList v-model="activeTab" prefix="panel" label="参数面板分类" :tabs="tabs" />
  </aside>
</template>

<style scoped>
.design-parameters > h3 { margin: 14px 0 0; }
.design-parameters > section:first-of-type { border-bottom: 0; }
.layout-parameters {
  margin-inline: -10px;
  padding: 12px 9px;
  border: 1px solid #d4e1f1;
  border-radius: 8px;
  background: #f1f6fd;
}
.layout-parameters :deep(.field-description) { color: #636f7d; }
.layout-member-specs { margin-block: 10px 4px; }
.spec-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2.28fr) clamp(96px, 31%, 112px);
  align-items: center; column-gap: 4px;
}
.spec-row > :deep(select), .spec-row > input.psec { width: 100%; min-width: 0; padding-inline: 3px; text-align: left; }
.spec-row :deep(.field-label) { gap: 3px; }
.spec-heading { margin: 12px 0 8px; font-size: 12px; color: var(--muted); }
.spec-heading > :first-child { grid-column: 1 / 3; }
.spec-heading h4 { margin: 0; font-size: 14px; color: var(--ink); }
.spec-divider { padding-top: 10px; border-top: 1px solid var(--line); }
#brace-connector-specs .prow { margin-bottom: 0; }
@media (max-width: 340px) {
  .spec-row { grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); }
  .spec-row > :deep(.pl) { grid-column: 1 / -1; }
  .spec-heading > :first-child { grid-column: 1; }
}
.design-parameters h4 { margin: 0 0 10px; font-size: 14px; }
.design-parameters h4 small { margin-left: 4px; color: var(--muted); font-size: 12px; font-weight: normal; }
.design-parameters h5 { margin: 16px 0 8px; font-size: 14px; }
.brace-connector-spec { font-size: 12px; color: var(--ink); }
.layout-counts { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 4px 0 0; font-size: 12px; }
.layout-counts > div { display: flex; align-items: baseline; gap: 5px; }
.layout-counts dt { color: var(--muted); }
.layout-counts dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
