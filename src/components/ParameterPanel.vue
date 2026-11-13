<script setup>
import { TIE_SECTION_LIB, PARAMS, SECTION_LABEL, SECTION_LIB } from '../config.js';
import ParameterField from './ParameterField.vue';
import DesignNotes from './DesignNotes.vue';

defineProps({
  snapshot: { type: Object, required: true },
  ready: Boolean,
  open: Boolean,
});
defineEmits(['parameter', 'section', 'preset', 'post-mode', 'post-bay', 'purlin-bay', 'display', 'toggle-sheet']);

const fields = PARAMS.filter(item => item.key !== 'purlinTies');
const purlinTieField = { ...PARAMS.find(item => item.key === 'purlinTies'), label: '檩条拉杆' };
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
      参数 · 结果 · 图纸核对 <span>▲</span>
    </button>
    <fieldset class="pbody panel-fields" :disabled="!ready" aria-label="设计参数">
      <section>
        <h3>参数 <button id="reset" type="button" class="link" @click="$emit('preset', snapshot.preset)">恢复图纸参数</button></h3>
        <label class="preset">图纸方案
          <select id="preset" :value="snapshot.preset" @change="$emit('preset', $event.target.value)">
            <option value="A">图纸一：2 排组件（25°，2900，12 榀 × 2800）</option>
            <option value="B">图纸二：3 排压块 + 外斜撑（14°，柱距3700，10榀）</option>
          </select>
        </label>
        <div id="params">
          <ParameterField v-for="field in fields" :key="field.key || field.keys[0]" :definition="field"
            :parameters="snapshot.parameters" @change="(...args) => $emit('parameter', ...args)" />
        </div>
      </section>

      <section>
        <h3>立柱拉杆布置</h3>
        <div id="post-tie-controls">
          <template v-for="row in snapshot.postTies" :key="row.key">
            <div class="prow">
              <label class="pl" :for="`post-tie-${row.key}`">{{ row.label }}立柱拉杆</label>
              <select :id="`post-tie-${row.key}`" :data-tie-row="row.key" :value="snapshot.parameters['postTie' + row.key]"
                @change="$emit('post-mode', row.key, $event.target.value)">
                <option v-for="[value, label] in postTieModes" :key="value" :value="value">{{ label }}</option>
              </select>
              <small>上孔距柱顶 {{ row.topOffset }}，上下孔高差 {{ row.holeRise }} mm</small>
            </div>
            <div v-if="snapshot.parameters['postTie' + row.key] === 'custom'" class="tie-spans">
              <label v-for="(enabled, index) in row.enabled" :key="index">
                <input type="checkbox" :data-tie-row="row.key" :data-tie-bay="index" :checked="!!enabled"
                  @change="$emit('post-bay', row.key, index, $event.target.checked)">第 {{ index + 1 }} 跨
              </label>
            </div>
          </template>
        </div>
      </section>

      <section>
        <h3>檩条拉杆布置</h3>
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

      <section>
        <h3>构件截面</h3>
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
        <h3>显示</h3>
        <div class="toggles">
          <label v-for="[key, label, title] in displays" :key="key" :title="title">
            <input type="checkbox" :data-k="key" :checked="snapshot.display[key]"
              @change="$emit('display', key, $event.target.checked)">{{ label }}
          </label>
        </div>
      </section>
    </fieldset>

    <div class="pbody report-body">
      <section>
        <h3>计算结果</h3>
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
  </aside>
</template>
