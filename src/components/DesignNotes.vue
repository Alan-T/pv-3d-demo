<script setup lang="ts">
import { computed } from 'vue';
import { BRACE_JOINT, braceConnectorPlates } from '../domain/specs/brace-connector-spec.ts';
import { CLAMP_LENGTHS, getClampSpec, MODULE_THICKNESSES } from '../domain/specs/clamp-spec.ts';
import { fastenerLabel } from '../domain/specs/fastener-spec.ts';
import { FIX, MODULE_MOUNTING } from '../config/engineering-rules.ts';

const props = defineProps<{ moduleThickness: number; clampLength: number }>();
const clampSpec = computed(() => getClampSpec(props.moduleThickness, props.clampLength));
const { single, double } = braceConnectorPlates;
</script>

<template>
  <section class="notes">
    <h3>按图推算的尺寸</h3>
    <ul>
      <li><b>斜梁长度规则</b>：首末组件安装孔间距 + 下端 135 + 上端 85，均沿斜梁方向量取，再按 Math.ceil(ret / 10) * 10 向上取整，余量平均分到两端。默认图纸一：4024 → 4030；默认图纸二：6424 → 6430。</li>
      <li><b>立柱位置</b>：前后立柱间距中点与斜梁中点水平位置一致，两端悬挑 =（斜梁长度 − 立柱间距 ÷ cos倾角）÷ 2。</li>
      <li><b>柱顶</b>：立柱连接孔位于立柱中心线与斜梁腹板中心线的交点，柱顶水平切，位于孔心上方 {{ FIX.postTopHole }} mm。立柱总长为柱顶到柱底的竖直距离。</li>
      <li><b>图纸一侧视参数</b>：倾角 20°，前沿高度 620，柱距 3000，埋深 1500，南北坡度 0%；组件沿坡长 2384，安装孔距 1400，组件间隙 20，沿坡 2 排、4 根檩条。</li>
      <li><b>图纸一斜撑</b>：前后连接件中心高度均为 250，下端孔在中心上方 30、立柱中心向内 120；上端孔距对应斜梁端部均为 1650。斜撑长度 = 两孔中心距 + 2 × {{ FIX.braceEdge }} mm。图纸示例中前后斜撑长度取整为 1436 / 1610 mm，模型保留小数精度。</li>
      <li><b>图纸一截面</b>：前后立柱 C90×55×20×3.0，前后斜撑 C59×39×8×1.8，斜梁 C90×50×15×2.0，檩条 C100×55×20×1.8。</li>
      <li><b>图纸一俯视参数</b>：组件 2384×1303×33，2 排 × 26 列，螺栓固定。阵列宽 26×1303 + 25×20 = 34378，檩条两端各伸出 50，总长 34478。共 13 榀，首末跨 2500、中间 10 跨各 2800，总跨度 33000，两端悬挑各 739。</li>
      <li><b>取整余量</b>：与二维一致，图纸一增加的 6 mm 两端各分 3 mm，首末孔到梁端实际距离为 138 / 88；前后柱总长取整为 2298 / 3390。</li>
      <li><b>图纸二（3 排压块 + 外斜撑）</b>：倾角 14°、组件前沿高度 700、柱距 3700、埋深 1500，南北和东西坡度均为 0。组件 2382×1134×30，3 排 × 27 列，安装孔距 1400，压块长 60。前后柱总长取整为 2526 / 3448。</li>
      <li><b>图纸二斜撑</b>：内斜撑上孔距梁端均为 2650，外斜撑均为 400；前后连接件中心高度 250 / 350。内斜撑长度取整 1631 / 1750，外斜撑 968 / 1968。前后立柱 C80×40×15×3.0，四根斜撑 C59×39×8×1.8，斜梁 C80×40×10×2.0，檩条 C90×50×15×1.8。</li>
    </ul>
    <h3>假设（图上没有）</h3>
    <ul>
      <li>型材截面：立柱 C120×60×20×2.5（截面高 120 由斜撑长度反推），斜梁、斜撑 C80×40×15×2.0，檩条 C100×55×15×1.8；檩条连接件 U108×55×3.0（无卷边）。</li>
      <li>在“组件尺寸”里输入长、宽，厚度可选 {{ MODULE_THICKNESSES.join('、') }} mm。组件间隙固定 20（沿坡、东西向）。“前沿离地 800”指组件下沿底面到 ±0。</li>
      <li>组件阵列中心比斜梁中心沿坡向高 32（按图量取，使 1038 / 2391 与图纸吻合）。</li>
      <li>立柱、斜梁、斜撑按腹板背靠背螺栓连接，东西向略错开。</li>
      <li>
        单面斜撑连接板 {{ single.name.replaceAll('*', '×') }}。从立柱孔中心线向斜撑侧伸出 {{ single.width - BRACE_JOINT.singleBack }} mm，背侧伸出 {{ BRACE_JOINT.singleBack }} mm。
        斜撑侧竖边高 {{ single.height / 2 - BRACE_JOINT.chamferY }} mm，再斜切到宽 {{ BRACE_JOINT.singleBack + BRACE_JOINT.singleBot }} mm 的下边。
        两个立柱孔上下对称，孔距 {{ BRACE_JOINT.boltPitch }} mm。斜撑孔离立柱孔中心线 {{ BRACE_JOINT.boltU }} mm，比板中点高 {{ BRACE_JOINT.rise }} mm。
        斜撑两端孔心距端头各 {{ FIX.braceEdge }} mm。竖向长圆孔配 {{ fastenerLabel('footBrace') }} 外六角螺栓及螺母。
      </li>
      <li>{{ fastenerLabel('top') }}（立柱-斜梁）及 M12 螺栓（斜撑-立柱、斜撑-斜梁、檩托）螺母下都是一个平垫、一个弹垫（按节点图，弹垫按 GB 93）。</li>
      <li>立柱-斜梁：斜梁腹板贴立柱腹板，1 颗 {{ fastenerLabel('top') }} 在立柱中心线上、孔心距柱顶 {{ FIX.postTopHole }} mm，立柱腹板上开竖向长圆孔（可调高度）；柱顶平切。</li>
      <li>斜撑-斜梁：斜撑腹板贴斜梁腹板，在两条中心线交点用 1 颗 {{ fastenerLabel('btop') }}；斜撑端头平切，孔心到端头 {{ FIX.braceEdge }} mm。</li>
      <li>檩条-斜梁：每处 1 个 L 形檩托，可在“构件”页选择 L100×63×6.0×50、L90×56×5.0×50 或 L75×50×5.0×50（立边高×底边宽×厚度×长度，mm）。底边 1 颗 {{ fastenerLabel('clip') }} 接斜梁上翼缘、立边 1 颗 {{ fastenerLabel('clipWeb') }} 接檩条腹板；孔位暂按底边居中、立边距底面 50 mm，两孔均在长度中线。东西坡度为 0 时，另加 1 颗 {{ fastenerLabel('purlinBeam') }} 直接连接檩条下翼缘与斜梁上翼缘；组件用安装孔压在檩条上翼缘，每块 4 颗 {{ fastenerLabel('module') }} 外六角螺栓 + 螺母（规格按组件节点图），螺栓头下普通平垫，螺母侧大平垫 + 弹垫；组件边框翼缘厚按 {{ MODULE_MOUNTING.frameFlangeThickness }} 算。</li>
      <li>
        按当前组件厚度 {{ moduleThickness }} mm 和压块长度 {{ clampLength }} mm，采用压块固定时，选用中压块 {{ clampSpec.mid.name }}、边压块 {{ clampSpec.edge.name }} 和 {{ clampSpec.bolt.name }} 内六角螺栓。
        东西向每道组件缝上一个中压块，阵列两端各一个边压块（立在檩条伸出组件的 100 上），沿坡对齐每根檩条，每个压块 1 颗螺栓穿过檩条上翼缘。
        其余截面细部按节点图比例量取。中压块 U 形槽外宽 {{ clampSpec.mid.width }} mm、槽壁厚 2.5，两翼各压住边框 12、翼板底面带齿，螺栓头坐在槽底（离组件上表面 14）；边压块宽 30，上沿勾住边框 11，内立板厚 3.5，螺栓头坐在底板上（离组件上表面 25），外端是倒 T 形的脚：底板外端圆角转下来成宽 3.7 的短立柱，下接宽 8.5 的脚垫，脚垫底面带齿、落在檩条上。压块长度可选 {{ CLAMP_LENGTHS.join('、') }} mm。
      </li>
      <li>东西向：阵列宽 = 列数 × 组件宽 + 间隙 20；檩条两端伸出量为螺栓固定各 50、压块各 100。图纸一 26 列 → 13 榀；图纸二 27 列 → 10 榀，首末跨 3000、中间跨 3300，总跨度 29100，檩条总长 31338，两端悬挑各 1119。最大单段檩条长度独立选择。立柱拉杆默认前后排首末跨，可逐跨配置，未启用的跨不生成实体。</li>
      <li>两套图纸的南北坡度默认为 0%，可在 −60% 到 +60% 之间调节。坡度非零时，默认显示顺坡和逆坡，后柱按较低一侧的地面确定埋深。勾选“只考虑顺坡安装”后，只显示输入坡向。后柱处地面低于前柱时，后柱按高差加长；高于前柱时，后柱采用平地柱长。钢材重量按截面估算。</li>
      <li>东西坡度：各榀立柱仍竖直、构件不变，整榀跟着地面抬高；檩条、组件顺坡。榀距是两榀之间的檩条长度（沿坡），水平距离 = 榀距 ÷ √(1 + 坡度²)，相邻榀高差 = 榀距 × 坡度 ÷ √(1 + 坡度²)，例：3750、10% → 水平 3731.4、高差 373.1。</li>
      <li>
        带外斜撑时，整块双面连接板为 {{ double.name.replaceAll('*', '×') }}，左右对称。从中心线到侧边为 {{ double.width / 2 }} mm，
        两侧竖边高 {{ double.height / 2 - BRACE_JOINT.chamferY }} mm，再斜切到宽 {{ 2 * BRACE_JOINT.doubleBottomHalf }} mm 的下边。内、外斜撑孔对称同高。
        需要分装时，每根立柱两侧各用一块单面板。
      </li>
    </ul>
  </section>
</template>
