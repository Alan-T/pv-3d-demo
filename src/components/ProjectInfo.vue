<script setup>
import { limits } from '../config.js';

const props = defineProps({
  modelValue: { type: Object, required: true },
  parameters: { type: Object, required: true },
});
const emit = defineEmits(['update:modelValue', 'parameter']);

const fields = [
  { key: 'number', label: '项目编号' },
  { key: 'version', label: '版本' },
  { key: 'name', label: '项目名称' },
  { key: 'customer', label: '客户', suggestions: ['0'] },
  { key: 'productType', label: '产品类型', options: ['双立柱'] },
  { key: 'tradeTerm', label: '交易方式', suggestions: ['DDP'] },
  { key: 'country', label: '国家', suggestions: ['Romania'] },
  { key: 'longitude', label: '经度', type: 'number', min: -180, max: 180, unit: '°' },
  { key: 'latitude', label: '纬度', type: 'number', min: -90, max: 90, unit: '°' },
];

function slopeField(key, label) {
  const [min, max, step] = limits(key);
  return { key, label, type: 'number', parameter: true, min, max, step, unit: '%' };
}

const environmentFields = [
  { key: 'designStandard', label: '参考规范', suggestions: ['US2010(ASCE 7-10)'] },
  { key: 'designMethod', label: '设计条文', suggestions: ['ASD'] },
  { key: 'terrainCategory', label: '地面粗糙度', suggestions: ['3'] },
  { key: 'buildingCategory', label: '建筑类型', suggestions: ['Ⅱ'] },
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

function fieldValue(field) {
  return (field.parameter ? props.parameters : props.modelValue)[field.key];
}

function changeField(field, event) {
  const input = event.target;
  if (field.parameter) {
    emit('parameter', field.key, input.value, input);
    return;
  }
  let value = input.value;
  if (field.type === 'number') {
    const number = Number(value);
    if (value.trim() !== '' && Number.isFinite(number)) {
      const rounded = field.step ? Math.round(number / field.step) * field.step : number;
      value = Math.max(field.min ?? -Infinity, Math.min(field.max ?? Infinity, rounded));
    } else value = fieldValue(field);
    input.value = value;
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
        <select v-if="field.options" :id="`project-${field.key}`" :value="fieldValue(field)"
          @change="changeField(field, $event)">
          <option v-for="option in field.options" :key="option" :value="option">{{ option }}</option>
        </select>
        <input v-else :id="`project-${field.key}`" :type="field.type || 'text'"
          :value="fieldValue(field)" :title="String(fieldValue(field))"
          :list="field.suggestions ? `project-options-${field.key}` : undefined"
          :min="field.min" :max="field.max" :step="field.type === 'number' ? (field.step ?? 'any') : undefined"
          @change="changeField(field, $event)">
        <datalist v-if="field.suggestions" :id="`project-options-${field.key}`">
          <option v-for="option in field.suggestions" :key="option" :value="option" />
        </datalist>
        <span v-if="field.unit" class="project-unit">{{ field.unit }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.project-info .prow { grid-template-columns: 72px minmax(0, 1fr); }
.project-value { display: flex; align-items: center; gap: 6px; min-width: 0; }
.project-value input, .project-value select {
  width: 100%; min-width: 0; padding: 4px 6px; font: inherit; font-size: 13px;
  border: 1px solid var(--line); border-radius: 6px; background: var(--panel); color: var(--blue);
}
.project-unit { flex: none; min-width: 12px; white-space: nowrap; color: var(--muted); font-size: 12px; }
</style>
