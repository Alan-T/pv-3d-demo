<script setup>
import { limits } from '../config.js';
import HelpHint from './HelpHint.vue';

defineProps({
  definition: { type: Object, required: true },
  parameters: { type: Object, required: true },
  selectDescription: String,
});
defineEmits(['change']);
const sizeLabels = { modL: '组件长度（沿坡）', modW: '组件宽度（东西向）', modT: '组件厚度' };
</script>

<template>
  <div v-show="!definition.when || definition.when(parameters)" class="prow"
    :class="{ pbool: definition.type === 'bool', psize: definition.type === 'size' }">
    <div class="pl field-label">
      <label v-if="definition.type === 'bool'" :for="`param-${definition.key}`">
        <input :id="`param-${definition.key}`" type="checkbox" :checked="!!parameters[definition.key]"
          @change="$emit('change', definition.key, $event.target.checked, $event.target)">
        {{ definition.label }}
      </label>
      <span v-else-if="definition.type === 'size'">{{ definition.label }}</span>
      <label v-else :for="`param-${definition.key}`">{{ definition.label }}</label>
      <HelpHint v-if="definition.hint" :text="definition.hint" :label="definition.label" />
    </div>
    <template v-if="definition.type === 'select'">
      <select :id="`param-${definition.key}`" :value="String(parameters[definition.key])"
        :aria-label="definition.label"
        :aria-describedby="selectDescription ? `param-${definition.key}-description` : undefined"
        @change="$emit('change', definition.key, $event.target.value, $event.target)">
        <option v-for="[value, label] in definition.options" :key="value" :value="value">{{ label }}</option>
      </select>
      <small v-if="selectDescription" :id="`param-${definition.key}-description`" class="field-description">{{ selectDescription }}</small>
    </template>
    <template v-else-if="definition.type === 'size'">
      <span class="pv">
        <template v-for="(key, index) in definition.keys" :key="key">
          <b v-if="index">×</b>
          <input :id="`param-${key}`" type="number" :data-k="key" :aria-label="sizeLabels[key]"
            :min="limits(key)[0]" :max="limits(key)[1]" step="1" :value="parameters[key]"
            @change="$emit('change', key, $event.target.value, $event.target)">
        </template>
        <i>{{ definition.unit }}</i>
      </span>
    </template>
    <template v-else-if="definition.type !== 'bool'">
      <span class="pv">
        <input :id="`param-${definition.key}`" type="number" :min="definition.min" :max="definition.max"
          :step="definition.step" :value="parameters[definition.key]"
          @change="$emit('change', definition.key, $event.target.value, $event.target)">
        <i>{{ definition.unit }}</i>
      </span>
      <input v-if="definition.type !== 'number'" type="range" :min="definition.min" :max="definition.max" :step="definition.step"
        :value="parameters[definition.key]" :aria-label="definition.label"
        @input="$emit('change', definition.key, $event.target.value, $event.target)">
    </template>
  </div>
</template>
