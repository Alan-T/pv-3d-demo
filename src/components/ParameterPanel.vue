<script setup>
import { computed, ref } from 'vue';
import { TIE_SECTION_LIB, PARAMS, SECTION_LABEL, SECTION_LIB } from '../config.js';
import ParameterField from './ParameterField.vue';
import HelpHint from './HelpHint.vue';
import ProjectInfo from './ProjectInfo.vue';
import DesignNotes from './DesignNotes.vue';
import TabList from './TabList.vue';

const props = defineProps({
  projectInfo: { type: Object, required: true },
  snapshot: { type: Object, required: true },
  ready: Boolean,
  open: Boolean,
});
defineEmits(['update:projectInfo', 'parameter', 'section', 'reset-preset', 'layout-quantity', 'post-mode', 'post-bay', 'purlin-bay', 'display', 'toggle-sheet']);

const tabs = [
  { id: 'project', label: '项目信息' },
  { id: 'parameters', label: '设计参数' },
  { id: 'members', label: '构件规格' },
  { id: 'results', label: '结果' },
];
const activeTab = ref(tabs[0].id);
const currentLayout = computed(() => props.snapshot.layouts.find(layout => layout.id === props.snapshot.activeLayoutId));

const layoutKeys = ['cols', 'pitchEnd', 'pitch'];
const layoutFields = layoutKeys.map(key => PARAMS.find(item => item.key === key));
const otherFields = ['purlinTies', 'purlinClip', 'purlinConnector', 'slopeEW', 'slopeNS', ...layoutKeys];
const commonFields = PARAMS.filter(item => !otherFields.includes(item.key));
const purlinTieField = { ...PARAMS.find(item => item.key === 'purlinTies'), label: '檩条拉杆' };
const purlinClipField = PARAMS.find(item => item.key === 'purlinClip');
const purlinConnectorField = PARAMS.find(item => item.key === 'purlinConnector');
const postTieModes = [['none', '无'], ['ends', '首末跨'], ['all', '全部跨'], ['custom', '自定义']];
const displays = [
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
                  @change="$emit('display', key, $event.target.checked)">{{ label }}
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

          <section aria-labelledby="layout-parameters-heading">
            <h4 id="layout-parameters-heading">排布参数 <small>{{ currentLayout.label }}</small></h4>
            <div class="prow">
              <label class="pl" for="layout-quantity">排布套数</label>
              <div class="pv">
                <input id="layout-quantity" type="number" min="1" step="1" :value="currentLayout.quantity"
                  @change="$emit('layout-quantity', $event.currentTarget)">
                <i>套</i>
              </div>
            </div>
            <ParameterField v-for="field in layoutFields" :key="field.key" :definition="field"
              :parameters="snapshot.parameters" @change="(...args) => $emit('parameter', ...args)" />
            <dl class="layout-counts">
              <div><dt>每套榀数</dt><dd id="layout-frame-count">{{ ready ? snapshot.frameCount + ' 榀' : '—' }}</dd></div>
              <div><dt>每套檩条拉杆</dt><dd id="layout-purlin-tie-count">{{ ready ? snapshot.purlinTieCount + ' 套' : '—' }}</dd></div>
            </dl>

            <h5>立柱拉杆布置</h5>
            <div id="post-tie-controls">
              <template v-for="row in snapshot.postTies" :key="row.key">
                <div class="prow">
                  <div class="pl field-label">
                    <label :for="`post-tie-${row.key}`">{{ row.label }}立柱拉杆</label>
                    <HelpHint :label="`${row.label}立柱拉杆`" :text="`上孔距柱顶 ${row.topOffset}，上下孔高差 ${row.holeRise} mm`" />
                  </div>
                  <select :id="`post-tie-${row.key}`" :data-tie-row="row.key" :value="snapshot.parameters['postTie' + row.key]"
                    @change="$emit('post-mode', row.key, $event.target.value)">
                    <option v-for="[value, label] in postTieModes" :key="value" :value="value">{{ label }}</option>
                  </select>
                </div>
                <div v-if="snapshot.parameters['postTie' + row.key] === 'custom'" class="tie-spans">
                  <label v-for="(enabled, index) in row.enabled" :key="index">
                    <input type="checkbox" :data-tie-row="row.key" :data-tie-bay="index" :checked="!!enabled"
                      @change="$emit('post-bay', row.key, index, $event.target.checked)">第 {{ index + 1 }} 跨
                  </label>
                </div>
              </template>
            </div>

            <h5>檩条拉杆布置</h5>
            <div id="purlin-tie-controls">
              <ParameterField :definition="purlinTieField" :parameters="snapshot.parameters"
                @change="(...args) => $emit('parameter', ...args)" />
              <div id="purlin-tie-spans" class="tie-spans" :hidden="snapshot.parameters.purlinTies !== 'custom'">
                <template v-if="snapshot.parameters.purlinTies === 'custom'">
                  <label v-for="bay in snapshot.bayCount" :key="bay">
                    <input type="checkbox" :data-purlin-tie-bay="bay - 1" :checked="snapshot.parameters.purlinTieSpans[bay - 1] === 1"
                      @change="$emit('purlin-bay', bay - 1, $event.target.checked)">第 {{ bay }} 跨
                  </label>
                </template>
              </div>
            </div>
          </section>
        </fieldset>
      </div>

      <div v-show="activeTab === 'members'" id="panel-page-members" class="panel-page" role="tabpanel"
        aria-labelledby="panel-tab-members" tabindex="0">
        <fieldset class="pbody panel-fields" :disabled="!ready" aria-label="构件设置">
          <section>
            <h3>构件截面 <small>{{ currentLayout.label }}</small></h3>
            <div id="sections">
              <datalist id="sectionLib"><option v-for="section in SECTION_LIB" :key="section.name" :value="section.name" /></datalist>
              <div v-for="(label, key) in SECTION_LABEL" v-show="!['braceOF', 'braceOR'].includes(key) || !!snapshot.parameters.outer" :key="key" class="prow">
                <label class="pl" :for="`section-${key}`">{{ label }}</label>
                <select v-if="key === 'postTie' || key === 'purlinTie'" :id="`section-${key}`" :value="snapshot.sections[key]" :aria-label="`${label}截面`"
                  @change="$emit('section', key, $event.target.value, $event.target)">
                  <option v-for="section in TIE_SECTION_LIB" :key="section.name" :value="section.name">{{ section.name }}</option>
                </select>
                <input v-else :id="`section-${key}`" class="psec" type="text" list="sectionLib"
                  placeholder="如 C80*40" :value="snapshot.sections[key]"
                  autocomplete="off" spellcheck="false" :aria-label="`${label}截面`"
                  title="输入关键字过滤，回车确认；分隔符 x / × / * 都可以" @focus="$event.target.select()"
                  @change="$emit('section', key, $event.target.value, $event.target)">
              </div>
            </div>
          </section>

          <section>
            <h3>檩托</h3>
            <ParameterField :definition="purlinClipField" :parameters="snapshot.parameters"
              @change="(...args) => $emit('parameter', ...args)" />
          </section>

          <section>
            <h3>檩条连接件</h3>
            <ParameterField :definition="purlinConnectorField" :parameters="snapshot.parameters"
              @change="(...args) => $emit('parameter', ...args)" />
          </section>

          <section id="brace-connector-specs">
            <h3>斜撑连接件 <small>（宽 × 高 × 厚，mm）</small></h3>
            <div v-for="connector in snapshot.braceConnectors" :key="connector.key" class="prow">
              <label class="pl" :for="`brace-connector-${connector.key}`">{{ connector.label }}</label>
              <output :id="`brace-connector-${connector.key}`" class="brace-connector-spec">{{ connector.type }} {{ connector.spec }}</output>
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
.design-parameters h4 { margin: 0 0 10px; font-size: 14px; }
.design-parameters h4 small { margin-left: 4px; color: var(--muted); font-size: 12px; font-weight: normal; }
.design-parameters h5 { margin: 16px 0 8px; font-size: 14px; }
.brace-connector-spec { font-size: 13px; color: var(--blue); text-align: right; }
.layout-counts { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 4px 0 0; font-size: 12px; }
.layout-counts > div { display: flex; align-items: baseline; gap: 5px; }
.layout-counts dt { color: var(--muted); }
.layout-counts dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
