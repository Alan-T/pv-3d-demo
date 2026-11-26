<script setup lang="ts">
import type { ParameterDefinition, ParameterKey, ModelParameters } from '../design-types.ts';
import { MODULE_THICKNESSES } from '../clamp-spec.ts';
import { limits } from '../parameter-fields.ts';
import { TinyOption } from '@opentiny/vue';
import HelpHint from './HelpHint.vue';
import FieldInput from './FieldInput.vue';
import FieldSelect from './FieldSelect.vue';

defineProps<{ definition: ParameterDefinition; parameters: ModelParameters; selectDescription?: string; disabled?: boolean }>();
const emit = defineEmits<{ change: [key: ParameterKey, value: string | boolean, field?: HTMLInputElement] }>();
const sizeLabels = { modL: '组件长度（沿坡）', modW: '组件宽度（东西向）', modT: '组件厚度' };
function changeField(key: ParameterKey, event: Event) {
  const input = event.currentTarget;
  if (input instanceof HTMLInputElement) {
    const value = input.type === 'checkbox' ? input.checked : input.value;
    emit('change', key, value, input);
  }
}
</script>

<template>
  <div v-show="!definition.when || definition.when(parameters)" class="prow"
    :class="{ pbool: definition.type === 'bool', psize: definition.type === 'size',
      'select-with-unit-column': definition.type === 'select' && (definition.unit || definition.key === 'fix') }">
    <div class="pl field-label">
      <label v-if="definition.type === 'bool'" :for="`param-${definition.key}`">
        <input :id="`param-${definition.key}`" type="checkbox" :checked="!!parameters[definition.key]"
          @change="changeField(definition.key, $event)">
        {{ definition.label }}
      </label>
      <span v-else-if="definition.type === 'size'">{{ definition.label }}</span>
      <label v-else :for="`param-${definition.key}`"><slot name="label">{{ definition.label }}</slot></label>
      <help-hint v-if="definition.hint" :text="definition.hint" :label="definition.label" />
    </div>
    <template v-if="definition.type === 'select'">
      <field-select :id="`param-${definition.key}`" :value="String(parameters[definition.key])"
        :label="definition.unit ? `${definition.label}（${definition.unit}）` : definition.label" :disabled="disabled"
        :description="selectDescription ? `param-${definition.key}-description` : undefined"
        @change="emit('change', definition.key, $event)">
        <template v-if="'numericOptions' in definition">
          <tiny-option v-for="option in definition.numericOptions" :key="option"
            :value="String(option)" :label="String(option)" />
        </template>
        <template v-else>
          <tiny-option v-for="[value, label] in definition.options" :key="value" :value="value" :label="label" />
        </template>
      </field-select>
      <i v-if="definition.unit" class="select-unit">{{ definition.unit }}</i>
      <slot name="after-select" />
      <small v-if="selectDescription" :id="`param-${definition.key}-description`" class="field-description">{{ selectDescription }}</small>
    </template>
    <template v-else-if="definition.type === 'size'">
      <span class="pv">
        <template v-for="(key, index) in definition.keys" :key="key">
          <b v-if="index">×</b>
          <field-select v-if="key === 'modT'" :id="`param-${key}`" :value="String(parameters[key])"
            :label="sizeLabels[key]" :disabled="disabled" @change="emit('change', key, $event)">
            <tiny-option v-for="thickness in MODULE_THICKNESSES" :key="thickness"
              :value="String(thickness)" :label="String(thickness)" />
          </field-select>
          <field-input v-else :id="`param-${key}`" type="number" :data-k="key" :label="sizeLabels[key]"
            :min="limits(key)[0]" :max="limits(key)[1]" step="1" :value="parameters[key]"
            @commit="emit('change', key, $event.value, $event)" />
        </template>
        <i>{{ definition.unit }}</i>
      </span>
    </template>
    <template v-else-if="definition.type !== 'bool'">
      <span class="pv">
        <field-input :id="`param-${definition.key}`" type="number" :min="definition.min" :max="definition.max"
          :step="definition.step" :value="parameters[definition.key]"
          @commit="emit('change', definition.key, $event.value, $event)" />
        <i>{{ definition.unit }}</i>
      </span>
      <input v-if="definition.type !== 'number'" type="range" :min="definition.min" :max="definition.max" :step="definition.step"
        :value="parameters[definition.key]" :aria-label="definition.label"
        @input="changeField(definition.key, $event)">
    </template>
  </div>
</template>
