<script setup lang="ts">
import type { ModelParameters, ParameterKey } from '../domain/design-types.ts';
import { PARAMS } from '../domain/parameter-fields.ts';
import ParameterField from './ParameterField.vue';

defineProps<{ parameters: ModelParameters; ready?: boolean }>();
defineEmits<{
  parameter: [key: ParameterKey, value: string | boolean, input?: HTMLInputElement];
}>();

const otherFields = ['purlinTies', 'purlinClip', 'purlinConnector', 'purlinCutMode', 'slopeEW', 'slopeNS', 'alongSlope', 'cols', 'pitchEnd', 'pitch'];
const commonFields = PARAMS.filter(item => !item.key || !otherFields.includes(item.key));
</script>

<template>
  <fieldset class="pbody panel-fields design-parameters" :disabled="!ready" aria-label="设计参数">
    <h3 id="design-parameters-heading">设计参数</h3>
    <section id="params" aria-labelledby="design-parameters-heading">
      <parameter-field v-for="field in commonFields" :key="field.key || field.keys[0]" :definition="field"
        :parameters="parameters" :disabled="!ready" @change="(...args) => $emit('parameter', ...args)" />
    </section>
    <slot />
  </fieldset>
</template>

<style scoped>
.design-parameters > h3 { margin: 14px 0 0; }
.design-parameters > section:first-of-type { border-bottom: 0; }
</style>
