<script setup lang="ts">
import type { DesignerSnapshot } from '../app/designer-snapshot.ts';
import DesignNotes from './DesignNotes.vue';

defineProps<{ snapshot: DesignerSnapshot; layoutLabel: string }>();
</script>

<template>
  <div class="pbody report-body">
    <section>
      <h3>计算结果 <small>{{ layoutLabel }} · 单套</small></h3>
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
    <design-notes :module-thickness="snapshot.parameters.modT" :clamp-length="snapshot.parameters.clampL" />
  </div>
</template>
