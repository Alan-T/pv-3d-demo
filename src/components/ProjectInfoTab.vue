<script setup lang="ts">
import type { DesignerSnapshot } from '../app/designer-snapshot.ts';
import type { ProjectInfo as ProjectData, ParameterKey } from '../domain/design-types.ts';
import type { Designer } from '../app/designer.ts';
import { TinyButton } from '@opentiny/vue';
import ProjectInfo from './ProjectInfo.vue';

defineProps<{ projectInfo: ProjectData; snapshot: DesignerSnapshot; ready?: boolean }>();
defineEmits<{
  'update:projectInfo': [value: ProjectData];
  parameter: [key: ParameterKey, value: string | boolean, input?: HTMLInputElement];
  'reset-preset': [];
  display: Parameters<Designer['changeDisplay']>;
}>();

const displays: [keyof DesignerSnapshot['display'], string, string?][] = [
  ['dims', '尺寸标注'], ['buried', '埋地部分'], ['modules', '光伏组件'],
  ['postTies', '立柱拉杆'], ['purlinTies', '檩条拉杆'],
  ['shadows', '显示投影', '显示模型在地面和构件上的投影阴影'],
  ['bolts', '连接件', '螺栓、斜撑连接板、檩托、压块'], ['drawingColors', '按图纸配色'],
];
</script>

<template>
  <fieldset class="pbody panel-fields" :disabled="!ready" aria-label="项目信息">
    <project-info :preset="snapshot.preset" :model-value="projectInfo" :parameters="snapshot.parameters" :disabled="!ready"
      @update:model-value="$emit('update:projectInfo', $event)"
      @parameter="(...args) => $emit('parameter', ...args)">
      <template #title-action>
        <tiny-button id="reset" type="text" native-type="button" size="mini" :reset-time="0"
          title="按当前图纸模板重置项目信息、设计参数和全部排布" aria-label="按当前图纸模板重置项目信息、设计参数和全部排布" :disabled="!ready" @click="$emit('reset-preset')">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M3 10a9 9 0 1 1 2 8M3 4v6h6" />
          </svg>
        </tiny-button>
      </template>
    </project-info>
    <section>
      <h3>显示设置</h3>
      <div class="toggles">
        <label v-for="[key, label, title] in displays" :key="key" :title="title">
          <input type="checkbox" :data-k="key" :checked="snapshot.display[key]"
            @change="$emit('display', key, ($event.currentTarget as HTMLInputElement).checked)">{{ label }}
        </label>
      </div>
    </section>
  </fieldset>
</template>

<style scoped>
#reset {
  display: inline-grid; place-items: center; width: 26px; height: 26px; min-width: 26px;
  margin-left: auto; padding: 0; border-radius: 4px; color: var(--blue);
}
#reset svg { display: block; }
#reset:hover:enabled { background: #e8f0ff; }
#reset:focus-visible { outline: 2px solid var(--blue); outline-offset: 1px; }
</style>
