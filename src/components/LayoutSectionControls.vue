<script setup lang="ts">
import type { DesignerSnapshot } from '../app/designer-snapshot.ts';
import type { DrawingLayout } from '../domain/layout-variants.ts';
import type { Designer } from '../app/designer.ts';
import type { ParameterKey } from '../domain/design-types.ts';
import { findParameterField } from '../domain/parameter-fields.ts';
import { TinyOption } from '@opentiny/vue';
import ParameterField from './ParameterField.vue';
import FieldInput from './FieldInput.vue';
import FieldSelect from './FieldSelect.vue';
import PurlinCutEditor from './PurlinCutEditor.vue';
import HelpHint from './HelpHint.vue';

defineProps<{ snapshot: DesignerSnapshot; currentLayout: DrawingLayout; ready?: boolean }>();
defineEmits<{
  parameter: [key: ParameterKey, value: string | boolean, input?: HTMLInputElement];
  'layout-quantity': [input: HTMLInputElement];
  'purlin-cut-lengths': [lengths: number[], done: (error: string) => void];
  'reset-purlin-cut': [done: (result: ReturnType<Designer['resetPurlinCutLengths']>) => void];
  'post-mode': Parameters<Designer['changePostTieMode']>;
  'post-bay': Parameters<Designer['changePostTieBay']>;
  'purlin-bay': Parameters<Designer['changePurlinTieBay']>;
}>();

const layoutKeys: ParameterKey[] = ['cols', 'pitchEnd', 'pitch'];
const layoutFields = layoutKeys.map(key => findParameterField(key)!);
const purlinCutModeField = findParameterField('purlinCutMode')!;
const purlinTieField = { ...findParameterField('purlinTies')!, label: '檩条拉杆' };
const postTieModes = [['none', '无'], ['ends', '首末跨'], ['all', '全部跨'], ['custom', '自定义']];
</script>

<template>
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
</template>

<style scoped>
.design-parameters h4 { margin: 0 0 10px; font-size: 14px; }
.design-parameters h4 small { margin-left: 4px; color: var(--muted); font-size: 12px; font-weight: normal; }
.design-parameters h5 { margin: 16px 0 8px; font-size: 14px; }
.layout-counts { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 4px 0 0; font-size: 12px; }
.layout-counts > div { display: flex; align-items: baseline; gap: 5px; }
.layout-counts dt { color: var(--muted); }
.layout-counts dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
</style>
