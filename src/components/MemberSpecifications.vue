<script setup lang="ts">
import { TinySelect } from '@opentiny/vue';
import type { DesignerSnapshot } from '../app/designer-snapshot.ts';
import type { MaterialKey, MemberKey, ParameterKey } from '../domain/design-types.ts';
import type { DrawingLayout } from '../domain/layout-variants.ts';
import { MATERIAL_GRADE_OPTIONS, SECTION_LABEL } from '../config/catalogs.ts';
import { findParameterField } from '../domain/parameter-fields.ts';
import { useEditableSelects } from './select-input.ts';
import ParameterField from './ParameterField.vue';
import SectionSelect from './SectionSelect.vue';

const props = defineProps<{ snapshot: DesignerSnapshot; layout: DrawingLayout; disabled: boolean }>();
const emit = defineEmits<{
  parameter: [key: ParameterKey, value: string | boolean, input?: HTMLInputElement];
  section: [key: MemberKey, value: string];
  'material-grade': [key: MaterialKey, value: string];
}>();
const accessoryFields = [findParameterField('purlinClip')!, findParameterField('purlinConnector')!];
const materialSelect = useEditableSelects<MaterialKey>('grade', key => props.layout.materials[key],
  (key, value) => emit('material-grade', key, value.trim()));
</script>

<template>
  <section class="layout-parameters layout-member-specs" aria-labelledby="layout-member-heading">
    <h3 id="layout-member-heading">排布规格 <small>{{ layout.label }}</small></h3>
    <div class="spec-row spec-heading">
      <h4>构件截面</h4><span title="可选择或直接输入材质牌号">材质</span>
    </div>
    <div id="sections">
      <div v-for="(label, key) in SECTION_LABEL" v-show="!['braceOF', 'braceOR'].includes(key) || !!snapshot.parameters.outer" :key="key" class="prow spec-row">
        <label class="pl" :for="`section-${key}`">{{ label }}</label>
        <section-select :member="key" :value="snapshot.sections[key]" :label="label" :disabled="disabled"
          @change="$emit('section', key, $event)" />
        <tiny-select v-bind="materialSelect(key, `${label}材质`, MATERIAL_GRADE_OPTIONS)" :disabled="disabled"
          :title="layout.materials[key] || '输入材质牌号'" size="mini" tabindex="0" placeholder="未指定"
          filterable allow-create default-first-option clearable placement="bottom-end" />
      </div>
    </div>
    <div class="spec-row spec-heading spec-divider">
      <h4>檩条附件</h4><span>材质</span>
    </div>
    <parameter-field v-for="field in accessoryFields" :key="field.key"
      class="spec-row" :definition="field" :parameters="snapshot.parameters" :disabled="disabled" @change="(...args) => $emit('parameter', ...args)">
      <template #label>{{ field.key === 'purlinClip' ? '檩托' : '连接件' }}</template>
      <template #after-select>
        <tiny-select v-bind="materialSelect(field.key, `${field.label}材质`, MATERIAL_GRADE_OPTIONS)" :disabled="disabled"
          :title="layout.materials[field.key] || '输入材质牌号'" size="mini" tabindex="0" placeholder="未指定"
          filterable allow-create default-first-option clearable placement="bottom-end" />
      </template>
    </parameter-field>
    <div id="brace-connector-specs">
      <div class="spec-row spec-heading spec-divider">
        <h4>斜撑连接件</h4><span>材质</span>
      </div>
      <div class="prow spec-row">
        <label class="pl" for="brace-connector">前后共用</label>
        <output id="brace-connector" class="brace-connector-spec" aria-describedby="brace-connector-note">{{ snapshot.braceConnectorSpec || '—' }}</output>
        <tiny-select v-bind="materialSelect('braceConnector', '斜撑连接件材质', MATERIAL_GRADE_OPTIONS)" :disabled="disabled"
          :title="layout.materials.braceConnector || '输入材质牌号'" size="mini" tabindex="0" placeholder="未指定"
          filterable allow-create default-first-option clearable placement="bottom-end" />
        <small id="brace-connector-note" class="field-description">自动匹配 · 宽 × 高 × 厚（mm）</small>
      </div>
    </div>
  </section>
</template>

<style scoped>
.layout-member-specs { margin-block: 10px 4px; }
.spec-row {
  display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2.28fr) clamp(96px, 31%, 112px);
  align-items: center; column-gap: 4px;
}
.spec-row > :deep(.tiny-select) { width: 100%; min-width: 0; }
.spec-row > :deep(.tiny-select .tiny-input) {
  --tv-Input-suffix-padding-left: 4px;
  --tv-Input-suffix-padding-right: 22px;
  --tv-Input-suffix-right: 2px;
}
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
.brace-connector-spec { font-size: 12px; color: var(--ink); }
</style>
