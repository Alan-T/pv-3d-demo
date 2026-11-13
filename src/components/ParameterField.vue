<script setup>
import { limits } from '../config.js';

defineProps({
  definition: { type: Object, required: true },
  parameters: { type: Object, required: true },
});
defineEmits(['change']);
const sizeLabels = { modL: '组件长度（沿坡）', modW: '组件宽度（东西向）', modT: '组件厚度' };
</script>

<template>
  <div v-show="!definition.when || definition.when(parameters)" class="prow"
    :class="{ pbool: definition.type === 'bool', psize: definition.type === 'size' }">
    <template v-if="definition.type === 'select'">
      <label class="pl" :for="`param-${definition.key}`">{{ definition.label }}</label>
      <select :id="`param-${definition.key}`" :value="String(parameters[definition.key])"
        :aria-label="definition.label"
        @change="$emit('change', definition.key, $event.target.value, $event.target)">
        <option v-for="[value, label] in definition.options" :key="value" :value="value">{{ label }}</option>
      </select>
    </template>
    <template v-else-if="definition.type === 'size'">
      <span class="pl">{{ definition.label }}</span>
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
    <label v-else-if="definition.type === 'bool'" class="pl">
      <input :id="`param-${definition.key}`" type="checkbox" :checked="!!parameters[definition.key]"
        @change="$emit('change', definition.key, $event.target.checked, $event.target)">
      {{ definition.label }}
    </label>
    <template v-else>
      <label class="pl" :for="`param-${definition.key}`">{{ definition.label }}</label>
      <span class="pv">
        <input :id="`param-${definition.key}`" type="number" :min="definition.min" :max="definition.max"
          :step="definition.step" :value="parameters[definition.key]"
          @change="$emit('change', definition.key, $event.target.value, $event.target)">
        <i>{{ definition.unit }}</i>
      </span>
      <input type="range" :min="definition.min" :max="definition.max" :step="definition.step"
        :value="parameters[definition.key]" :aria-label="definition.label"
        @input="$emit('change', definition.key, $event.target.value, $event.target)">
    </template>
    <small v-if="definition.hint">{{ definition.hint }}</small>
  </div>
</template>
