<script setup lang="ts">
import type { ProjectInfo, ModelParameters, PresetId, SurfaceFinishKey } from '../design-types.ts';
import { isSurfaceFinishKey } from '../design-types.ts';
import { SURFACE_FINISH_BY_CORROSIVITY, SURFACE_FINISH_OPTIONS } from '../config.ts';
import { limits, PARAMS } from '../parameter-fields.ts';
import { useEditableSelects, type SelectChoice } from '../select-input.ts';
import { TinyOption, TinySelect } from '@opentiny/vue';
import FieldInput from './FieldInput.vue';
import FieldSelect from './FieldSelect.vue';
import HelpHint from './HelpHint.vue';
import ParameterField from './ParameterField.vue';

type SlopeKey = 'slopeEW' | 'slopeNS';
type NumericKey = { [K in keyof ProjectInfo]: ProjectInfo[K] extends number ? K : never }[keyof ProjectInfo];
type TextKey = Exclude<keyof ProjectInfo, NumericKey>;
interface FieldOptions {
  label: string;
  hint?: string;
  min?: number; max?: number; step?: number; unit?: string;
}
type Field = FieldOptions & (
  | { key: NumericKey; type: 'number'; parameter?: false; options?: never }
  | { key: TextKey; type?: undefined; parameter?: false; options?: SelectChoice[]; fixedOptions?: false }
  | { key: TextKey; type?: undefined; parameter?: false; options: string[]; fixedOptions: true }
  | { key: SlopeKey; type: 'number'; parameter: true; options?: never }
);
type SurfaceFinishField = FieldOptions & {
  key: SurfaceFinishKey; options: SelectChoice[]; fixedOptions?: false;
};

const props = defineProps<{ modelValue: ProjectInfo; parameters: ModelParameters; preset: PresetId; disabled?: boolean }>();
const emit = defineEmits<{
  'update:modelValue': [value: ProjectInfo];
  parameter: [key: SlopeKey | SurfaceFinishKey | 'alongSlope', value: string | boolean, field?: HTMLInputElement];
}>();
const projectSelect = useEditableSelects<TextKey | SurfaceFinishKey>('project',
  key => isSurfaceFinishKey(key) ? props.parameters[key] : props.modelValue[key],
  (key, value) => {
    if (isSurfaceFinishKey(key)) emit('parameter', key, value);
    else emit('update:modelValue', { ...props.modelValue, [key]: value });
  }, key => isSurfaceFinishKey(key) ? props.preset : undefined);

const fields: Field[] = [
  { key: 'number', label: '项目编号' },
  { key: 'version', label: '版本' },
  { key: 'name', label: '项目名称' },
  { key: 'customer', label: '客户', options: ['0'] },
  { key: 'productType', label: '产品类型', options: ['双立柱'], fixedOptions: true },
  { key: 'tradeTerm', label: '交易方式', options: ['DDP'] },
  { key: 'country', label: '国家', options: ['Romania'] },
  { key: 'longitude', label: '经度', type: 'number', min: -180, max: 180, unit: '°' },
  { key: 'latitude', label: '纬度', type: 'number', min: -90, max: 90, unit: '°' },
];

function slopeField(key: SlopeKey, label: string): Field {
  const [min, max, step] = limits(key);
  return { key, label, type: 'number', parameter: true, min, max, step, unit: '%' };
}

const alongSlopeField = PARAMS.find(field => field.key === 'alongSlope')!;
const environmentFields: Field[] = [
  { key: 'designStandard', label: '参考规范', options: ['US2010(ASCE 7-10)'] },
  { key: 'designMethod', label: '设计条文', options: ['ASD'] },
  { key: 'terrainCategory', label: '地面粗糙度', options: ['3'] },
  { key: 'buildingCategory', label: '建筑类型', options: ['Ⅱ'] },
  { key: 'windSpeed', label: '风速', type: 'number', min: 0, unit: 'm/s' },
  { key: 'snowPressure', label: '雪压', type: 'number', min: 0, unit: 'kN/m²' },
  { key: 'elevation', label: '海拔高度', type: 'number', unit: 'm' },
  { key: 'airDensity', label: '空气密度', type: 'number', min: 0.001, unit: 'kg/m³' },
  slopeField('slopeEW', '东西坡度'),
  slopeField('slopeNS', '南北坡度'),
  { key: 'designLife', label: '设计年限', type: 'number', min: 1, step: 1, unit: '年' },
];
const corrosionFields: Field[] = [
  { key: 'corrosivityCategory', label: '大气腐蚀等级', options: Object.keys(SURFACE_FINISH_BY_CORROSIVITY), fixedOptions: true },
];
const surfaceFinishFields: SurfaceFinishField[] = [
  { key: 'moduleFastenerFinish', label: '组件紧固件', options: SURFACE_FINISH_OPTIONS },
  { key: 'otherFastenerFinish', label: '其他紧固件', options: SURFACE_FINISH_OPTIONS },
  { key: 'postFinish', label: '立柱', options: SURFACE_FINISH_OPTIONS },
  { key: 'otherFinish', label: '其他大件', hint: '适用于立柱以外的大件，例如斜梁和檩条。', options: SURFACE_FINISH_OPTIONS },
  { key: 'zamSmallPartFinish', label: '锌铝镁小件', hint: '厚度小于等于 3.5 mm 的小件使用锌铝镁小件表面处理。', options: SURFACE_FINISH_OPTIONS },
  { key: 'smallPartFinish', label: '其他小件', hint: '适用于锌铝镁小件以外的小件。', options: SURFACE_FINISH_OPTIONS },
  { key: 'pileFinish', label: '桩', options: SURFACE_FINISH_OPTIONS },
  { key: 'roundRodFinish', label: '圆钢拉杆', options: SURFACE_FINISH_OPTIONS },
];
const groups = [
  { id: 'basic', title: '项目信息', fields },
  { id: 'environment', title: '规范与环境', fields: environmentFields },
  { id: 'corrosion', title: '腐蚀', fields: corrosionFields },
  { id: 'surface-finish', title: '表面处理', fields: surfaceFinishFields },
];

function fieldValue(field: Field) {
  return field.parameter ? props.parameters[field.key] : props.modelValue[field.key];
}

function changeField(field: Field, input: HTMLInputElement) {
  if (field.parameter) {
    emit('parameter', field.key, input.value, input);
    return;
  }
  let value: string | number = input.value;
  if (field.type === 'number') {
    const number = Number(value);
    if (value.trim() !== '' && Number.isFinite(number)) {
      const rounded = field.step ? Math.round(number / field.step) * field.step : number;
      value = Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, rounded));
    } else value = fieldValue(field);
    input.value = String(value);
  }
  emit('update:modelValue', { ...props.modelValue, [field.key]: value });
}
</script>

<template>
  <section v-for="group in groups" :key="group.id" class="project-info" :data-project-group="group.id">
    <h3>{{ group.title }}</h3>
    <div v-for="field in group.fields" :key="field.key" class="prow">
      <div class="pl field-label">
        <label :for="`project-${field.key}`">{{ field.label }}</label>
        <help-hint v-if="field.hint" :label="field.label" :text="field.hint" />
      </div>
      <div class="project-value">
        <field-select v-if="field.options && field.fixedOptions" :id="`project-${field.key}`" :value="String(fieldValue(field))"
          :label="field.label" :disabled="disabled" @change="emit('update:modelValue', { ...modelValue, [field.key]: $event })">
          <tiny-option v-for="option in field.options" :key="option" :value="option" :label="option" />
        </field-select>
        <tiny-select v-else-if="field.options" v-bind="projectSelect(field.key, field.label, field.options)"
          size="mini" tabindex="0" filterable allow-create default-first-option clearable :disabled="disabled" />
        <field-input v-else :id="`project-${field.key}`" :type="field.type || 'text'"
          :value="fieldValue(field)" :title="String(fieldValue(field))"
          :min="field.min" :max="field.max" :step="field.type === 'number' ? (field.step ?? 'any') : undefined"
          @commit="changeField(field, $event)" />
        <span v-if="field.unit" class="project-unit">{{ field.unit }}</span>
      </div>
      <parameter-field v-if="field.key === 'slopeNS' && parameters.slopeNS !== 0" class="slope-option"
        :definition="alongSlopeField" :parameters="parameters" :disabled="disabled"
        @change="(_, value, input) => emit('parameter', 'alongSlope', value, input)" />
    </div>
  </section>
</template>

<style scoped>
.project-info .prow { grid-template-columns: 72px minmax(0, 1fr); }
.project-info .slope-option { grid-column: 2; grid-template-columns: 1fr; margin: 2px 0 0; }
.project-info[data-project-group="corrosion"] .prow {
  grid-template-columns: 80px minmax(0, 1fr);
}
.project-info[data-project-group="surface-finish"] .prow {
  grid-template-columns: 96px minmax(0, 1fr);
}
.project-info[data-project-group="surface-finish"] .field-label { white-space: nowrap; }
.project-value { display: flex; align-items: center; gap: 6px; min-width: 0; }
.project-value > .tiny-input, .project-value > .tiny-select { width: 100%; min-width: 0; }
.project-unit { flex: none; min-width: 12px; white-space: nowrap; color: var(--muted); font-size: 12px; }
</style>
