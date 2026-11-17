<script setup>
const props = defineProps({ snapshot: { type: Object, required: true }, ready: Boolean });
defineEmits(['view', 'joint']);

const views = [
  ['3d', '3D 视图'], ['side', '侧视图'], ['front', '正视图'], ['top', '俯视图'],
  ['normal', '垂直组件', '垂直于组件面看，组件半透明，便于看檩条'],
];
const joints = [
  ['foot', '斜撑-立柱', '斜撑下端：连接板 + 3 颗 M12×35'],
  ['top', '立柱-斜梁', '柱顶：斜梁腹板贴立柱腹板，1 颗 M16×40，立柱上竖向长圆孔'],
  ['btop', '斜撑-斜梁', '斜撑上端：斜撑腹板贴斜梁腹板，1 颗 M12×35'],
  ['clip', '檩条-斜梁', 'L 形檩托 + 2 颗 M12×35；组件 M8×22 安装螺栓'],
  ['mod', '檩条-组件', '相邻两块组件之间（最东一跨中部的一道组件缝）：螺栓固定时缝两侧各 1 颗 M8×22；压块固定时 1 个中压块 + M8×35 内六角螺栓'],
  ['splice', '檩条-檩条', '预览实际檩条切割接头'],
  ['postTie', '立柱拉杆', '实际布置的立柱拉杆与立柱翼缘连接：M12×35 螺栓、垫圈及端距'],
  ['purlinTie', '檩条拉杆', '实际布置的檩条拉杆与檩条下翼缘连接：M12×35 螺栓、Ø14 通孔及端距'],
];

function unavailableReason(type) {
  if (type === 'splice' && !props.snapshot.spliceAvailable) return '当前檩条没有切割接头或未选择有效连接件';
  if (['postTie', 'purlinTie'].includes(type) && !props.snapshot.tieJointAvailable?.[type]?.some(Boolean)) {
    return type === 'postTie' ? '当前未布置有效的立柱拉杆' : '当前未布置檩条拉杆';
  }
  return '';
}

function sideAvailable(side) {
  const type = props.snapshot.jointType;
  return !['postTie', 'purlinTie'].includes(type) || !!props.snapshot.tieJointAvailable?.[type]?.[side];
}

function sideTitle(side) {
  if (props.snapshot.jointType === 'postTie') {
    return `${side ? '后排' : '前排'}立柱拉杆${sideAvailable(side) ? '与立柱连接' : '：当前未生成有效拉杆'}`;
  }
  if (props.snapshot.jointType === 'purlinTie') {
    return `檩条拉杆与${side ? '最高' : '最低'}一根檩条连接${sideAvailable(side) ? '' : '：当前未布置拉杆'}`;
  }
  return `${side ? '后' : '前'}立柱一侧（檩条-斜梁、檩条-组件：${side ? '最高' : '最低'}一根檩条）`;
}
</script>

<template>
  <header id="bar">
    <div class="title">
      <b>光伏固定支架 3D 设计</b>
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
          title="组件缝上的中压块，1 颗 M8×35 内六角螺栓" @click="$emit('joint', 'type', 'mod')">中压块</button>
        <button class="chip" data-clamp="side" data-clampopt :disabled="!ready" :class="{ on: snapshot.jointType === 'side' }"
          title="阵列东边：边压块勾住组件边框、立在檩条伸出组件的 100 上，1 颗 M8×35 内六角螺栓"
          @click="$emit('joint', 'type', 'side')">边压块</button>
      </template>
      <span class="sep"></span>
      <button class="chip" data-joint="0" :disabled="!ready || !sideAvailable(0)" :class="{ on: snapshot.jointSel === 0 }"
        :title="sideTitle(0)" @click="$emit('joint', 'side', 0)">前侧</button>
      <button class="chip" data-joint="1" :disabled="!ready || !sideAvailable(1)" :class="{ on: snapshot.jointSel === 1 }"
        :title="sideTitle(1)" @click="$emit('joint', 'side', 1)">后侧</button>
      <span class="sep"></span>
      <button data-view="joint-elev" :disabled="!ready" :class="{ on: snapshot.view === 'joint-elev' }"
        title="正对当前节点连接面，查看连接位置和尺寸" @click="$emit('view', 'joint-elev')">正视</button>
      <button data-view="joint-iso" :disabled="!ready" :class="{ on: snapshot.view === 'joint-iso' }"
        title="略偏一侧、偏上看，看得出螺栓和板厚" @click="$emit('view', 'joint-iso')">轴测</button>
    </nav>
  </header>
</template>
