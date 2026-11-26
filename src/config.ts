/* 图纸尺寸、两套图纸参数、可调参数的范围（单位 mm）。改尺寸、加参数基本都在这里 */

import type { DrawingPreset, LayoutPreset, MemberKey, ModelParameters, NamedSection,
  ParameterDefinition, PresetId, PurlinAccessory, Section } from './design-types.ts';
import { getSectionLibrary } from './section-spec.ts';
export type * from './design-types.ts';
export { isSurfaceFinishKey } from './design-types.ts';

// ---------- 选型规格库与选项 ----------
// 常规 C 型构件规格（C d*f*l*t：截面高 × 翼缘宽 × 卷边 × 板厚，mm），由 section-spec.ts 解析尺寸。
const SECTION_LIB: string[] = [
  'C50*30*10*1.8', 'C50*30*10*2.0',
  'C59*39*8*1.6', 'C59*39*8*1.8',
  'C60*40*10*1.6', 'C60*40*10*1.8', 'C60*40*10*2.0',
  'C70*40*10*1.8', 'C70*40*10*2.0', 'C75*40*10*1.85',
  'C79*39*8*1.8', 'C79*39*8*2.0',
  'C80*40*10*1.8', 'C80*40*10*2.0', 'C80*40*15*1.8', 'C80*40*15*2.0', 'C80*40*15*3.0',
  'C80*45*15*1.8', 'C80*45*15*2.0', 'C80*45*15*3.0',
  'C80*50*10*2.0', 'C80*50*15*1.8', 'C80*50*15*2.0', 'C80*50*15*3.0', 'C80*50*20*2.0',
  'C80*55*15*1.8', 'C80*55*15*3.0', 'C80*55*20*1.8', 'C80*55*20*2.0',
  'C80*60*15*1.8', 'C80*60*15*2.0', 'C80*60*15*3.0', 'C80*60*20*1.8', 'C80*60*20*2.0',
  'C90*40*10*1.8', 'C90*40*10*2.0', 'C90*40*15*1.8', 'C90*40*15*3.0',
  'C90*45*15*1.8', 'C90*45*15*2.0', 'C90*45*15*3.0',
  'C90*50*10*2.0', 'C90*50*15*1.8', 'C90*50*15*2.0', 'C90*50*15*3.0', 'C90*50*20*1.8', 'C90*50*20*2.0',
  'C90*55*15*1.8', 'C90*55*15*3.0', 'C90*55*20*1.8', 'C90*55*20*2.0', 'C90*55*20*3.0',
  'C90*60*15*1.8', 'C90*60*15*2.0', 'C90*60*15*3.0', 'C90*60*20*1.8', 'C90*60*20*2.0', 'C90*60*20*3.0',
  'C99*39*8*1.8', 'C99*39*8*2.0', 'C99*39*8*2.3', 'C99*49*8*1.8', 'C99*49*8*2.0', 'C99*49*8*2.3',
  'C100*40*10*1.8', 'C100*40*10*2.0', 'C100*40*10*2.3', 'C100*40*15*1.8', 'C100*40*15*2.0', 'C100*40*15*2.3', 'C100*40*15*3.0',
  'C100*45*10*1.8', 'C100*45*15*1.8',
  'C100*50*10*1.8', 'C100*50*10*2.0', 'C100*50*10*2.3', 'C100*50*15*1.8', 'C100*50*15*2.0', 'C100*50*15*2.3', 'C100*50*15*3.0',
  'C100*50*20*1.8', 'C100*50*20*2.0', 'C100*50*20*2.3', 'C100*50*20*3.0',
  'C100*55*15*1.8', 'C100*55*15*2.0', 'C100*55*20*1.8', 'C100*55*20*2.0', 'C100*55*20*3.0',
  'C100*60*15*1.8', 'C100*60*15*2.0', 'C100*60*20*1.8', 'C100*60*20*2.0', 'C100*60*20*3.0',
  'C110*50*20*1.8', 'C110*50*20*2.0', 'C110*50*20*3.0', 'C110*55*20*1.8', 'C110*60*20*1.8', 'C110*60*20*2.3', 'C110*60*20*3.0',
  'C120*50*15*1.8', 'C120*50*20*1.8', 'C120*50*20*2.0', 'C120*50*20*2.3', 'C120*50*20*3.0',
  'C120*55*20*1.8', 'C120*60*20*1.8', 'C120*60*20*2.0', 'C120*60*20*2.3', 'C120*60*20*2.5', 'C120*60*20*3.0',
  'C130*60*20*3.0', 'C130*60*25*2.0', 'C140*60*20*3.0', 'C150*60*20*3.0',
  'C160*60*20*3.0', 'C160*70*20*3.0', 'C170*60*20*3.0', 'C170*70*20*3.0', 'C170*70*30*3.0',
  'C180*70*20*3.0', 'C180*70*30*3.0', 'C180*70*30*3.5', 'C180*80*30*3.5',
  'C200*80*30*3.0', 'C200*80*30*3.5', 'C200*100*30*3.5', 'C200*100*30*4.0',
  'C220*100*30*3.5', 'C220*100*30*4.0', 'C230*100*30*3.5', 'C230*100*30*4.0',
  'C250*100*30*3.5', 'C250*100*30*4.0',
];
// 立柱拉杆和檩条拉杆共用截面规格名称，材质牌号按排布中的构件分别设置。
const TIE_SECTION_LIB: string[] = [
  'L35*35*1.6',
  'C59*39*8*1.6',
  'C60*40*10*1.6',
];
// 檩托：立边高*底边宽*厚度*长度（mm）。
const PURLIN_CLIP_SPECS = ['L100*63*6.0*50', 'L90*56*5.0*50', 'L75*50*5.0*50'];
// 檩条连接件规格名称：高度*翼缘宽*板厚*长度（mm），按高度、宽度、板厚升序维护。
const PURLIN_CONNECTOR_SPECS = [
  'U88*45*2.75*220',
  'U88*55*2.75*220',
  'U88*55*3.0*220',
  'U98*45*2.75*220',
  'U98*45*3.0*220',
  'U98*55*2.75*220',
  'U98*55*3.0*220',
  'U108*45*2.75*240',
  'U108*45*3.0*240',
  'U108*55*3.0*240',
  'U118*45*3.0*240',
  'U118*55*3.0*240',
  'U128*45*3.0*240',
  'U128*53*3.0*240',
];

const SECTION_LABEL = {
  postF: '前立柱', postR: '后立柱', beam: '斜梁',
  braceF: '前斜撑', braceR: '后斜撑', braceOF: '前外斜撑', braceOR: '后外斜撑',
  purlin: '檩条', postTie: '立柱拉杆', purlinTie: '檩条拉杆',
};
export const PURLIN_ACCESSORY_KEYS: PurlinAccessory[] = ['purlinClip', 'purlinConnector'];
const ACCESSORY_SECTION_KEYS = [...PURLIN_ACCESSORY_KEYS, 'braceConnector', 'braceConnectorF', 'braceConnectorR'];
export const MATERIAL_GRADE_OPTIONS = ['S350GD', 'S420GD', 'S450GD', 'S550GD', 'Q235B'];
export const SURFACE_FINISH_OPTIONS = [
  { value: '20040', label: 'HDG Average ≥ 40μm' },
  { value: '20045', label: 'HDG Average ≥ 45μm' },
  { value: '20050', label: 'HDG Average ≥ 50μm' },
  { value: '20055', label: 'HDG Average ≥ 55μm' },
  { value: '20060', label: 'HDG Average ≥ 60μm' },
  { value: '20065', label: 'HDG Average ≥ 65μm' },
  { value: '20085', label: 'HDG Average ≥ 85μm' },
  { value: '20100', label: 'HDG Average ≥ 100μm' },
  { value: '20110', label: 'HDG Average ≥ 110μm' },
  { value: '20120', label: 'HDG Average ≥ 120μm' },
  { value: '10275', label: 'ZM275g/m2 (Double sided)' },
  { value: '10310', label: 'ZM310g/m2 (Double sided)' },
  { value: '10350', label: 'ZM350g/m2 (Double sided)' },
  { value: '10450', label: 'ZM450g/m2 (Double sided)' },
  { value: '30304', label: 'SUS304(A2-70)' },
  { value: '30316', label: 'SUS316(A4-70)' },
  { value: '40015', label: 'AA15μm' },
];

// ---------- 运行时基准尺寸与连接件 ----------
const frameDefaults = { d: 90, f: 55, l: 20, t: 3 };
const FIX = {
  postF: { ...frameDefaults }, postR: { ...frameDefaults },
  braceF: { ...frameDefaults }, braceR: { ...frameDefaults },
  braceOF: { ...frameDefaults }, braceOR: { ...frameDefaults },
  beam:   { d: 80,  f: 40, l: 15, t: 2.0 },
  purlin: { d: 100, f: 55, l: 15, t: 1.8 },
  postTie: { d: 59, f: 39, l: 8, t: 1.6 } as Section,
  purlinTie: { type: 'L', d: 35, f: 35, t: 1.6 } as Section,
  beamEndOffsets: { low: 135, high: 85 }, // 首末孔到梁端的基础距离（沿梁）；长度取整余量再平分两端
  modGap: 20, modGapEW: 20,   // 组件间隙固定 20（沿坡、东西向）
  // 檩条伸出组件阵列边：螺栓固定两端各 50（檩条图：32392 = 28 列组件 32292 + 2×50），压块固定各 100（放边压块）
  purlinExt: { bolt: 50, clamp: 100 },
  maxOverhang: 0.4,     // 榀数按组件列数算：取檩条两端悬挑不超过首末跨榀距 0.4 倍的最少榀数（两张图都是 12 / 10 榀）
};
const section = (kind: 'post' | 'brace', rear = false, outer = false) =>
  FIX[kind === 'post' ? (rear ? 'postR' : 'postF') : (outer ? (rear ? 'braceOR' : 'braceOF') : (rear ? 'braceR' : 'braceF'))];

function applySection(key: MemberKey, { name, ...dimensions }: NamedSection) {
  const target = FIX[key];
  // 保留对象引用，但清掉旧截面字段，避免 C/L 切换后残留 type、卷边或名称。
  for (const field of Object.keys(target)) Reflect.deleteProperty(target, field);
  Object.assign(target, dimensions);
}

// 斜撑连接板只有两种规格：单面 160×120×5.75、双面 280×120×5.75（按连接板详图）。坐标原点在立柱中心线、板竖向中点
const JOINT = {
  plateT: 5.75,
  plateH: 120,
  boltPitch: 70,    // 立柱中心线上两孔间距（孔心距板上、下边各 25）
  boltU: 120,       // 斜撑孔离立柱中心线（水平），斜撑孔 (±120, 30)
  rise: 30,         // 斜撑孔比板竖向中点高（孔心距板上边 30）
  braceEdge: 35,    // 斜撑两端孔心到斜撑端头（沿斜撑）
  postTopHole: 50,  // 立柱-斜梁螺栓孔心到柱顶（立柱中心线上）
  singleW: 160,     // 单面板宽
  singleBack: 20,   // 单面板从立柱中心线往背离斜撑一侧伸出 20（往斜撑一侧伸出 140，斜撑孔距板边 20）
  singleBot: 30,    // 单面板下边从背侧板边到立柱中心线往斜撑一侧 30（下边宽 50）
  chamferY: 5,      // 斜撑一侧竖直板边高 55（到板竖向中点 +5），再斜切到下边
  slotW: 14, slotL: 28,
};
// 带外斜撑时的双面连接板 280×120×5.75：左右对称，上边 ±half，两侧竖直板边高 55，再斜切到下边 ±botHalf（下边宽 60）。
// 孔位见 JOINT（与单面板相同）；板竖向中点在 braceHF / braceHR
const DBL = { half: 140, botHalf: 30 };
// 压块（按压块节点图的比例量取，图上没标尺寸；螺栓 M8×35 内六角）。高度都从组件上表面算，向下为正：
const CLAMP = {
  bolt: 35, teeth: { h: 0.6, pitch: 1.2 },
  mid: { press: 12, top: 3.2, tip: 2, wall: 2.5, floor: 14, plate: 3 },
  side: { w: 30, press: 11, top: 3.6, tip: 2.2, wall: 3.5, floor: 25, plate: 3.5, foot: 8.5, stem: 3.7, pad: 1.6 },
};

// ---------- 图纸预设参数 ----------
// 两套预设使用相同字段和分组顺序；长度单位 mm，角度单位 °，坡度单位 %。
// F / R 表示前 / 后；保留未启用构件的参数，便于切换固定方式或启用外斜撑。
// layouts 中的每一项对应一个排布标签，按数组顺序编号；其余设计参数由同图纸的排布共用。
// 每项的 sections 与 materials 分别配置截面和材质。材质空字符串表示未指定。
const PRESETS: Record<PresetId, DrawingPreset> = {
  // 图纸一：2 排组件、螺栓固定、无外斜撑。
  A: {
    // 项目资料初始值；页面单独复制，切换或重置设计参数时保留已填写资料。
    projectInfo: {
      number: '202611041101',
      version: '1',
      name: 'Sunel- Romania-Buzoesti-38',
      customer: '0',
      productType: '双立柱',
      tradeTerm: 'DDP',
      country: 'Romania',
      longitude: 6,
      latitude: 52,
      designStandard: 'US2010(ASCE 7-10)',
      designMethod: 'ASD',
      terrainCategory: '3',
      buildingCategory: 'Ⅱ',
      windSpeed: 79.167, // m/s
      snowPressure: 0, // kN/m²
      elevation: 0, // m
      airDensity: 1.225, // kg/m³
      designLife: 25, // 年
      corrosivityCategory: 'C4',
    },

    // 表面处理，当前图纸的所有排布共用。
    moduleFastenerFinish: '30304',
    otherFastenerFinish: '30304',
    postFinish: '20085',
    otherFinish: '10310',
    zamSmallPartFinish: '10310',
    smallPartFinish: '20085',
    pileFinish: '20085',
    roundRodFinish: '20045',

    // 组件尺寸与阵列
    modL: 2384, // 组件长度（沿坡）
    modW: 1303, // 组件宽度（东西向）
    modT: 33, // 组件厚度
    modPower: 670, // 单块组件功率（Wp）
    modWeight: 33.1, // 单块组件重量（kg）
    hole: 1400, // 组件安装孔距（同一组件下两根檩条的间距）
    rows: 2, // 沿坡组件排数

    // 组件固定
    fix: 'bolt', // bolt：安装孔螺栓；clamp：中压块 + 边压块
    serratedWasher: false, // 螺栓固定时，锯齿垫圈替换头下普通平垫
    clampL: 50, // 压块长度（沿坡），仅压块固定时生效

    // 安装位置与地形
    tilt: 20, // 组件倾角（°）
    h0: 620, // 组件前沿离地高度
    span: 3000, // 前后立柱水平间距
    embed: 1500, // 立柱埋深
    slopeNS: 0, // 南北坡度（%），正值北高南低
    slopeEW: 0, // 东西坡度（%），正值东高西低

    maxPurlin: 9000, // 檩条切割最大长度

    // 斜撑布置
    outer: 0, // 是否带外斜撑：0 无，1 有
    braceHF: 250, // 前柱斜撑连接板中心标高，相对 ±0
    braceHR: 250, // 后柱斜撑连接板中心标高，相对 ±0
    braceTopF: 1650, // 前内斜撑上节点距斜梁下端（沿梁）
    braceTopR: 1650, // 后内斜撑上节点距斜梁上端（沿梁）
    braceOutF: 400, // 前外斜撑上节点距斜梁下端（沿梁）
    braceOutR: 400, // 后外斜撑上节点距斜梁上端（沿梁）

    layouts: [
      {
        quantity: 1,
        cols: 26, // 东西向组件列数，榀数由此计算
        purlinCutMode: 'auto',
        purlinCutLengths: [], // 自定义时从西向东列出各段净长（mm）
        pitchEnd: 2500, // 首末跨榀距
        pitch: 2800, // 中间跨榀距
        postTieF: 'ends', postTieR: 'ends', // none 无 / ends 首末跨 / all 全部跨 / custom 自定义
        postTieSpansF: [], postTieSpansR: [], // 自定义时逐跨设置，0 不安装、1 安装
        purlinTies: 'all', // none 无 / all 全部跨 / inner 剔除首末跨 / custom 自定义
        purlinTieSpans: [],
        sections: {
          postF: 'C90*55*20*3.0', postR: 'C90*55*20*3.0',
          beam: 'C90*50*15*2.0', purlin: 'C100*55*20*1.8',
          braceF: 'C59*39*8*1.8', braceR: 'C59*39*8*1.8',
          braceOF: 'C80*40*15*2.0', braceOR: 'C80*40*15*2.0',
          postTie: 'C59*39*8*1.6', purlinTie: 'L35*35*1.6',
          purlinClip: 'L100*63*6.0*50', purlinConnector: 'U108*55*3.0*240',
          braceConnector: '160*120*5.75', // 前后柱共用，自动选型后保存单块板的宽*高*厚
        },
        materials: {
          postF: 'S420GD', postR: 'S420GD',
          beam: 'S420GD', purlin: 'S420GD',
          braceF: 'S420GD', braceR: 'S420GD',
          braceOF: 'S420GD', braceOR: 'S420GD',
          postTie: 'S420GD', purlinTie: 'S420GD',
          purlinClip: 'Q235B', purlinConnector: 'Q235B',
          braceConnector: 'Q235B',
        },
      },
      {
        quantity: 1,
        cols: 13,
        purlinCutMode: 'auto',
        purlinCutLengths: [],
        pitchEnd: 2500,
        pitch: 2800,
        postTieF: 'ends', postTieR: 'ends',
        postTieSpansF: [], postTieSpansR: [],
        purlinTies: 'all',
        purlinTieSpans: [],
        sections: {
          postF: 'C90*55*20*3.0', postR: 'C90*55*20*3.0',
          beam: 'C90*50*15*2.0', purlin: 'C100*55*20*1.8',
          braceF: 'C59*39*8*1.8', braceR: 'C59*39*8*1.8',
          braceOF: 'C80*40*15*2.0', braceOR: 'C80*40*15*2.0',
          postTie: 'C59*39*8*1.6', purlinTie: 'L35*35*1.6',
          purlinClip: 'L100*63*6.0*50', purlinConnector: 'U108*55*3.0*240',
          braceConnector: '160*120*5.75',
        },
        materials: {
          postF: 'S420GD', postR: 'S420GD',
          beam: 'S420GD', purlin: 'S420GD',
          braceF: 'S420GD', braceR: 'S420GD',
          braceOF: 'S420GD', braceOR: 'S420GD',
          postTie: 'S420GD', purlinTie: 'S420GD',
          purlinClip: 'Q235B', purlinConnector: 'Q235B',
          braceConnector: 'Q235B',
        },
      },
    ],
  },
  // 图纸二：3 排组件、压块固定、带外斜撑。
  B: {
    // 项目资料初始值；页面单独复制，切换或重置设计参数时保留已填写资料。
    projectInfo: {
      number: '202611041101',
      version: '1',
      name: 'Sunel- Romania-Buzoesti-38',
      customer: '0',
      productType: '双立柱',
      tradeTerm: 'DDP',
      country: 'Romania',
      longitude: 6,
      latitude: 52,
      designStandard: 'US2010(ASCE 7-10)',
      designMethod: 'ASD',
      terrainCategory: '3',
      buildingCategory: 'Ⅱ',
      windSpeed: 79.167, // m/s
      snowPressure: 0, // kN/m²
      elevation: 0, // m
      airDensity: 1.225, // kg/m³
      designLife: 25, // 年
      corrosivityCategory: 'C4',
    },

    // 表面处理，当前图纸的所有排布共用。
    moduleFastenerFinish: '30304',
    otherFastenerFinish: '30304',
    postFinish: '20085',
    otherFinish: '10310',
    zamSmallPartFinish: '10310',
    smallPartFinish: '20085',
    pileFinish: '20085',
    roundRodFinish: '20045',

    // 组件尺寸与阵列
    modL: 2382, // 组件长度（沿坡）
    modW: 1134, // 组件宽度（东西向）
    modT: 30, // 组件厚度
    modPower: 670, // 单块组件功率（Wp）
    modWeight: 33.1, // 单块组件重量（kg）
    hole: 1400, // 组件安装孔距（同一组件下两根檩条的间距）
    rows: 3, // 沿坡组件排数

    // 组件固定
    fix: 'clamp', // bolt：安装孔螺栓；clamp：中压块 + 边压块
    serratedWasher: false, // 螺栓固定时，锯齿垫圈替换头下普通平垫
    clampL: 60, // 压块长度（沿坡），仅压块固定时生效

    // 安装位置与地形
    tilt: 14, // 组件倾角（°）
    h0: 700, // 组件前沿离地高度
    span: 3700, // 前后立柱水平间距
    embed: 1500, // 立柱埋深
    slopeNS: 0, // 南北坡度（%），正值北高南低
    slopeEW: 0, // 东西坡度（%），正值东高西低

    maxPurlin: 9000, // 檩条切割最大长度

    // 斜撑布置
    outer: 1, // 是否带外斜撑：0 无，1 有
    braceHF: 250, // 前柱斜撑连接板中心标高，相对 ±0
    braceHR: 350, // 后柱斜撑连接板中心标高，相对 ±0
    braceTopF: 2650, // 前内斜撑上节点距斜梁下端（沿梁）
    braceTopR: 2650, // 后内斜撑上节点距斜梁上端（沿梁）
    braceOutF: 400, // 前外斜撑上节点距斜梁下端（沿梁）
    braceOutR: 400, // 后外斜撑上节点距斜梁上端（沿梁）

    layouts: [
      {
        quantity: 1,
        cols: 27,
        purlinCutMode: 'auto',
        purlinCutLengths: [],
        pitchEnd: 3000,
        pitch: 3300,
        postTieF: 'ends', postTieR: 'ends',
        postTieSpansF: [], postTieSpansR: [],
        purlinTies: 'none',
        purlinTieSpans: [],
        sections: {
          postF: 'C80*40*15*3.0', postR: 'C80*40*15*3.0',
          beam: 'C80*40*10*2.0', purlin: 'C90*50*15*1.8',
          braceF: 'C59*39*8*1.8', braceR: 'C59*39*8*1.8',
          braceOF: 'C59*39*8*1.8', braceOR: 'C59*39*8*1.8',
          postTie: 'C59*39*8*1.6', purlinTie: 'L35*35*1.6',
          purlinClip: 'L90*56*5.0*50', purlinConnector: 'U98*55*3.0*220',
          braceConnector: '280*120*5.75',
        },
        materials: {
          postF: 'S420GD', postR: 'S420GD',
          beam: 'S420GD', purlin: 'S420GD',
          braceF: 'S420GD', braceR: 'S420GD',
          braceOF: 'S420GD', braceOR: 'S420GD',
          postTie: 'S420GD', purlinTie: 'S420GD',
          purlinClip: 'Q235B', purlinConnector: 'Q235B',
          braceConnector: 'Q235B',
        },
      },
      {
        quantity: 1,
        cols: 14,
        purlinCutMode: 'auto',
        purlinCutLengths: [],
        pitchEnd: 3000,
        pitch: 3300,
        postTieF: 'ends', postTieR: 'ends',
        postTieSpansF: [], postTieSpansR: [],
        purlinTies: 'none',
        purlinTieSpans: [],
        sections: {
          postF: 'C80*40*15*3.0', postR: 'C80*40*15*3.0',
          beam: 'C80*40*10*2.0', purlin: 'C90*50*15*1.8',
          braceF: 'C59*39*8*1.8', braceR: 'C59*39*8*1.8',
          braceOF: 'C59*39*8*1.8', braceOR: 'C59*39*8*1.8',
          postTie: 'C59*39*8*1.6', purlinTie: 'L35*35*1.6',
          purlinClip: 'L90*56*5.0*50', purlinConnector: 'U98*55*3.0*220',
          braceConnector: '280*120*5.75',
        },
        materials: {
          postF: 'S420GD', postR: 'S420GD',
          beam: 'S420GD', purlin: 'S420GD',
          braceF: 'S420GD', braceR: 'S420GD',
          braceOF: 'S420GD', braceOR: 'S420GD',
          postTie: 'S420GD', purlinTie: 'S420GD',
          purlinClip: 'Q235B', purlinConnector: 'Q235B',
          braceConnector: 'Q235B',
        },
      },
    ],
  },
};
// 应用截面时复制尺寸，保留运行时 FIX 引用，避免修改预设。
function applyPresetSections(preset: PresetId, sectionNames: Partial<Record<MemberKey | PurlinAccessory | 'braceConnector', string>> = PRESETS[preset].layouts[0].sections) {
  const members = Object.entries(sectionNames).filter(([key]) => !ACCESSORY_SECTION_KEYS.includes(key));
  const sections = members.map(([key, name]) => {
    const library = getSectionLibrary(key);
    const value = library.find(item => item.name === name);
    if (!value || !isMemberKey(key)) throw new Error(`图纸 ${preset} 的 ${isMemberKey(key) ? SECTION_LABEL[key] : key} 截面不存在：${name}`);
    return [key, value] as const;
  });
  // 全部名称校验通过后再应用，复制尺寸，避免修改截面库或预设。
  for (const [key, dimensions] of sections) applySection(key, dimensions);
}
applyPresetSections('A');
const DEFAULTS = PRESETS.A;

// ---------- 可调参数 ----------
// 面板里放常用的几个；其余蓝字参数在尺寸标注上点击修改，取值范围在 EXTRA_LIMITS
const PARAMS: ParameterDefinition[] = [
  { key: 'purlinClip', label: '檩托规格', type: 'select',
    options: PURLIN_CLIP_SPECS.map(name => [name, name]),
    hint: '立边高 × 底边宽 × 厚度 × 长度（mm）' },
  { key: 'purlinTies', label: '檩条拉杆布置', type: 'select', options: [['none', '无'], ['all', '全部跨'], ['inner', '剔除首末跨'], ['custom', '自定义']],
    hint: '每跨中间一套，贯通所有檩条，两端各伸出85 mm；自定义可逐跨勾选' },
  { key: 'tilt',   label: '组件倾角',        unit: '°',  min: 10,   max: 40,   step: 0.5 },
  { key: 'span',   label: '前后立柱间距',    unit: 'mm', min: 2000, max: 4500, step: 50 },
  { key: 'h0',     label: '组件前沿离地高度', unit: 'mm', min: 300,  max: 1500, step: 10 },
  { keys: ['modL', 'modW', 'modT'], label: '组件尺寸', type: 'size', unit: 'mm',
    hint: '长（沿坡）× 宽（东西向）× 厚；组件间隙固定 20' },
  { key: 'modPower', label: '组件功率', type: 'number', unit: 'Wp', min: 1, step: 1 },
  { key: 'modWeight', label: '组件重量', type: 'number', unit: 'kg', min: 0.1, step: 0.1 },
  { key: 'fix',   label: '固定方式',        type: 'select', options: [['bolt', '螺栓固定'], ['clamp', '压块']],
    hint: '螺栓固定：组件安装孔 M8×22，檩条两端各伸出组件 50；压块：缝上中压块、两端边压块，M8×35 内六角，檩条两端各伸出 100' },
  { key: 'serratedWasher', label: '包含锯齿垫圈', type: 'bool', when: (P) => P.fix === 'bolt',
    hint: '替换组件螺栓头下的普通平垫，螺母侧大平垫和弹垫不变' },
  { key: 'clampL', label: '压块长度',        unit: 'mm', min: 30,   max: 200,  step: 5, when: (P) => P.fix === 'clamp' },
  { key: 'maxPurlin', label: '檩条最大长度', type: 'select', options: [['5700', '5700 mm'], ['7200', '7200 mm'], ['9000', '9000 mm']] },
  { key: 'purlinCutMode', label: '分段方式', type: 'select', options: [['auto', '自动'], ['custom', '自定义']] },
  { key: 'purlinConnector', label: '檩条连接件', type: 'select',
    options: PURLIN_CONNECTOR_SPECS.map(name => [name, name]),
    hint: '手动选择 U 型连接件规格（高度*翼缘宽*板厚*长度），不随檩条截面自动切换' },
  { key: 'rows',   label: '组件排数（沿坡）', unit: '排', min: 2,    max: 4,    step: 1 },
  { key: 'outer',  label: '外斜撑',          type: 'bool', hint: '立柱外侧再加一根斜撑，撑住斜梁悬挑段（与内斜撑共用连接板）' },
  { key: 'cols',   label: '组件列数（东西向）', unit: '列', min: 1,  max: 60,   step: 1,
    hint: '榀数由列数算出：檩条两端悬挑不超过首末跨榀距 0.4 倍的最少榀数' },
  { key: 'pitch',  label: '中间跨榀距',      unit: 'mm', min: 2000, max: 4500, step: 100 },
  { key: 'pitchEnd', label: '首末跨榀距',    unit: 'mm', min: 1500, max: 4500, step: 100,
    hint: '第 1–2 榀、倒数第 2–1 榀之间的距离' },
  { key: 'slopeNS',  label: '地面南北坡度',    unit: '%',  min: -10,  max: 10,   step: 0.5,
    hint: '正 = 南向坡（北高南低），负 = 北向坡（北低南高）。前柱处地面为 ±0，后柱按实际地面埋深：后柱总长 = 柱顶高 − 坡度 × 立柱间距 + 埋深' },
  { key: 'slopeEW', label: '地面东西坡度',  unit: '%',  min: -10,  max: 10,   step: 0.5,
    hint: '正 = 东高西低，负 = 东低西高。各榀立柱竖直、跟着地面抬高，檩条顺坡；榀距、阵列宽、檩条长都是沿檩条量的长度，水平距离 = 长度 ÷ √(1 + 坡度²)' },
];
const EXTRA_LIMITS: Record<string, [number, number]> = {
  braceHF: [100, 800], braceHR: [100, 1200], braceTopF: [600, 5000], braceTopR: [600, 5000],
  braceOutF: [100, 3000], braceOutR: [100, 3000],
  embed: [800, 3000], modL: [1600, 2600], modW: [900, 1400], modT: [25, 50], hole: [600, 2400],
};
// 返回 [最小, 最大, 步长]；安装孔距不能超过组件长度 − 200
function limits(key: string): [number, number, number] {
  const d = PARAMS.find((q) => q.key === key);
  if (d) return [d.min ?? -Infinity, d.max ?? Infinity, key === 'tilt' || d.unit === '%' ? 0.1 : Math.min(d.step ?? 1, 1)];
  const [lo, hi] = EXTRA_LIMITS[key];
  return [lo, key === 'hole' ? Math.min(hi, P.modL - 200) : hi, 1];
}

export function isMemberKey(key: string): key is MemberKey {
  return Object.hasOwn(SECTION_LABEL, key);
}

export function getLayoutParameters({ id, label, quantity, sections, materials, ...parameters }:
  LayoutPreset & { id?: string; label?: string } & Partial<Record<PurlinAccessory, string>>) {
  for (const key of PURLIN_ACCESSORY_KEYS) {
    if (sections && Object.hasOwn(sections, key)) parameters[key] = sections[key];
  }
  return parameters as Omit<LayoutPreset, 'quantity' | 'sections' | 'materials'> & Record<PurlinAccessory, string>;
}

// 三维模型使用图纸共用参数和当前排布参数的独立副本。
function getPresetParameters({ projectInfo, layouts, ...sharedParameters }: DrawingPreset, layout = layouts[0]): ModelParameters {
  return structuredClone({ ...sharedParameters, ...getLayoutParameters(layout) });
}
const P = getPresetParameters(DEFAULTS);
const show = { dims: true, buried: true, modules: true, bolts: true, drawingColors: true, postTies: true, purlinTies: true, shadows: true };
export { TIE_SECTION_LIB, PURLIN_CLIP_SPECS, PURLIN_CONNECTOR_SPECS, applySection };
export { applyPresetSections, getPresetParameters, FIX, PRESETS, DEFAULTS, JOINT, DBL, CLAMP, PARAMS, limits, SECTION_LIB, SECTION_LABEL, P, show, section };
