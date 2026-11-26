<script setup lang="ts">
import { TinyOption } from '@opentiny/vue';
import { computed } from 'vue';
import { getClampSpec } from '../clamp-spec.ts';
import FieldSelect from './FieldSelect.vue';
import type { DesignerSnapshot } from '../designer.ts';
import type { PresetId } from '../design-types.ts';
import type { JointType, ViewName } from '../joint-view-types.ts';
const props = defineProps<{ snapshot: DesignerSnapshot; ready?: boolean }>();
const clampSpec = computed(() => getClampSpec(props.snapshot.parameters.modT, props.snapshot.parameters.clampL));
defineEmits<{ view: [name: ViewName]; joint: [kind: 'side' | 'type', value: JointType | number]; preset: [id: PresetId] }>();

const views: [ViewName, string, string?][] = [
  ['3d', '3D 视图'], ['side', '侧视图'], ['front', '正视图'], ['top', '俯视图'],
  ['normal', '垂直组件', '垂直于组件面看，组件半透明，便于看檩条'],
];
const joints: [JointType, string, string][] = [
  ['foot', '斜撑-立柱', '斜撑下端：连接板 + 3 颗 M12×35'],
  ['top', '立柱-斜梁', '柱顶：斜梁腹板贴立柱腹板，1 颗 M16×40，立柱上竖向长圆孔'],
  ['btop', '斜撑-斜梁', '斜撑上端：斜撑腹板贴斜梁腹板，1 颗 M12×35'],
  ['clip', '檩条-斜梁', 'L 形檩托 + 2 颗 M12×35；组件 M8×22 安装螺栓'],
  ['mod', '檩条-组件', '查看相邻组件与檩条的连接。螺栓固定时缝两侧各用 1 颗 M8×22，压块固定时缝上用 1 个中压块和 1 颗内六角螺栓。'],
  ['splice', '檩条-檩条', '预览实际檩条切割接头'],
  ['postTie', '立柱拉杆', '查看后排拉杆与立柱前后翼缘的连接。M12×35 外六角螺栓，两面平垫，螺母侧加弹垫。'],
  ['purlinTie', '檩条拉杆', '正视查看檩条槽内的螺栓头，轴测查看拉杆下方的螺母。Ø14 通孔，M12×35 外六角螺栓，两面平垫，螺母侧加弹垫。'],
];

function unavailableReason(type: JointType) {
  if (type === 'splice' && !props.snapshot.spliceAvailable) return '当前檩条没有切割接头或未选择有效连接件';
  if (['postTie', 'purlinTie'].includes(type) && !props.snapshot.tieJointAvailable?.[type]?.some(Boolean)) {
    return type === 'postTie' ? '当前后排未布置有效的立柱拉杆' : '当前未布置檩条拉杆';
  }
  return '';
}

function sideAvailable(side: number) {
  const type = props.snapshot.jointType;
  return !['postTie', 'purlinTie'].includes(type) || !!props.snapshot.tieJointAvailable?.[type]?.[side];
}

/** 按节点类型给前后侧按钮显示不同的短标签，与其他节点的"前侧/后侧"保持一致的位置。 */
function sideLabel(side: number) {
  if (props.snapshot.jointType === 'postTie') return side ? '后翼缘' : '前翼缘';
  if (props.snapshot.jointType === 'purlinTie') return side ? '高檩条' : '低檩条';
  return side ? '后侧' : '前侧';
}

function sideTitle(side: number) {
  if (props.snapshot.jointType === 'postTie') {
    return `后排立柱拉杆${side ? '后翼缘' : '前翼缘'}连接${sideAvailable(side) ? '' : '：当前后排未生成有效拉杆'}`;
  }
  if (props.snapshot.jointType === 'purlinTie') {
    return `檩条拉杆与${side ? '最高' : '最低'}一根檩条连接${sideAvailable(side) ? '' : '：当前未布置拉杆'}`;
  }
  return `${side ? '后' : '前'}立柱一侧（檩条-斜梁、檩条-组件：${side ? '最高' : '最低'}一根檩条）`;
}

function elevTitle() {
  if (props.snapshot.jointType === 'postTie') return '正对立柱翼缘，查看拉杆连接位置和尺寸';
  if (props.snapshot.jointType === 'purlinTie') return '正视查看檩条槽内的螺栓头';
  return '正对当前节点连接面，查看连接位置和尺寸';
}

function isoTitle() {
  if (props.snapshot.jointType === 'postTie') return '略偏一侧看，查看拉杆贴柱翼缘的螺栓和垫圈';
  if (props.snapshot.jointType === 'purlinTie') return '从下方轴测查看拉杆螺母和杆端';
  return '略偏一侧、偏上看，看得出螺栓和板厚';
}
</script>

<template>
  <header id="bar">
    <div class="title">
      <div class="title-row">
        <b>光伏固定支架 3D 设计</b>
        <field-select id="drawing-preset" class="drawing-preset" label="切换图纸" title="切换图纸" :value="snapshot.preset"
          :disabled="!ready" @change="$emit('preset', $event as PresetId)">
          <tiny-option value="A" label="图纸一" title="2 排组件 · 螺栓固定" />
          <tiny-option value="B" label="图纸二" title="3 排组件 · 压块固定 · 带外斜撑" />
        </field-select>
      </div>
      <small>{{ snapshot.report?.title ?? `固定倾角 · 双立柱 · 组件竖排 ${snapshot.parameters.rows} 块（单位 mm）` }}</small>
    </div>
    <nav class="views" aria-label="视角">
      <button v-for="[value, label, title] in views" :key="value" :data-view="value" :title="title" :disabled="!ready"
        :class="{ on: snapshot.view === value }" @click="$emit('view', value)">{{ label }}</button>
    </nav>
    <nav class="views vgroup" aria-label="连接节点详图">
      <span class="glabel">连接节点</span>
      <button v-for="[value, label, title] in joints" :key="value" class="chip" :data-jtype="value"
        :class="{ on: (snapshot.jointType === 'side' ? 'mod' : snapshot.jointType) === value }"
        :disabled="!ready || !!unavailableReason(value)"
        :title="unavailableReason(value) || title"
        @click="$emit('joint', 'type', value)">{{ label }}</button>
      <template v-if="snapshot.parameters.fix === 'clamp' && ['mod', 'side'].includes(snapshot.jointType)">
        <span class="sep" data-clampopt></span>
        <button class="chip" data-clamp="mod" data-clampopt :disabled="!ready" :class="{ on: snapshot.jointType === 'mod' }"
          :title="`组件缝上的中压块 ${clampSpec.mid.name}，配 1 颗 ${clampSpec.bolt.name} 内六角螺栓`" @click="$emit('joint', 'type', 'mod')">中压块</button>
        <button class="chip" data-clamp="side" data-clampopt :disabled="!ready" :class="{ on: snapshot.jointType === 'side' }"
          :title="`阵列东端的边压块 ${clampSpec.edge.name}，配 1 颗 ${clampSpec.bolt.name} 内六角螺栓`"
          @click="$emit('joint', 'type', 'side')">边压块</button>
      </template>
      <span class="sep"></span>
      <button class="chip" data-joint="0" :disabled="!ready || !sideAvailable(0)" :class="{ on: snapshot.jointSel === 0 }"
        :title="sideTitle(0)" @click="$emit('joint', 'side', 0)">{{ sideLabel(0) }}</button>
      <button class="chip" data-joint="1" :disabled="!ready || !sideAvailable(1)" :class="{ on: snapshot.jointSel === 1 }"
        :title="sideTitle(1)" @click="$emit('joint', 'side', 1)">{{ sideLabel(1) }}</button>
      <span class="sep"></span>
      <button data-view="joint-elev" :disabled="!ready" :class="{ on: snapshot.view === 'joint-elev' }"
        :title="elevTitle()" @click="$emit('view', 'joint-elev')">正视</button>
      <button data-view="joint-iso" :disabled="!ready" :class="{ on: snapshot.view === 'joint-iso' }"
        :title="isoTitle()" @click="$emit('view', 'joint-iso')">轴测</button>
    </nav>
  </header>
</template>
