<script setup lang="ts">
import type { ProjectInfo, ModelParameters } from '../config.ts';
import { limits } from '../config.ts';
import { useEditableSelects } from '../select-input.ts';
import { TinyOption, TinySelect } from '@opentiny/vue';
import FieldInput from './FieldInput.vue';
import FieldSelect from './FieldSelect.vue';

type SlopeKey = 'slopeEW' | 'slopeNS';
type NumericKey = { [K in keyof ProjectInfo]: ProjectInfo[K] extends number ? K : never }[keyof ProjectInfo];
type TextKey = Exclude<keyof ProjectInfo, NumericKey>;
interface FieldOptions {
  label: string;
  min?: number; max?: number; step?: number; unit?: string;
}
type Field = FieldOptions & (
  | { key: NumericKey; type: 'number'; parameter?: false; options?: never }
  | { key: TextKey; type?: undefined; parameter?: false; options?: string[]; fixedOptions?: boolean }
  | { key: SlopeKey; type: 'number'; parameter: true; options?: never }
);

const props = defineProps<{ modelValue: ProjectInfo; parameters: ModelParameters; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: ProjectInfo]; parameter: [key: SlopeKey, value: string, field: HTMLInputElement] }>();
const projectSelect = useEditableSelects<TextKey>('project', key => props.modelValue[key],
  (key, value) => emit('update:modelValue', { ...props.modelValue, [key]: value }));

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
const groups = [
  { id: 'basic', title: '项目信息', fields },
  { id: 'environment', title: '规范与环境', fields: environmentFields },
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
      <label class="pl" :for="`project-${field.key}`">{{ field.label }}</label>
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
    </div>
  </section>
</template>

<style scoped>
.project-info .prow { grid-template-columns: 72px minmax(0, 1fr); }
.project-value { display: flex; align-items: center; gap: 6px; min-width: 0; }
.project-value > .tiny-input, .project-value > .tiny-select { width: 100%; min-width: 0; }
.project-unit { flex: none; min-width: 12px; white-space: nowrap; color: var(--muted); font-size: 12px; }
</style>
