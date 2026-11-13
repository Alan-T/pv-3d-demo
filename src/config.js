

/* 图纸尺寸、两套图纸参数、可调参数的范围（单位 mm）。改尺寸、加参数基本都在这里 */

// ---------- 图纸尺寸与假设 ----------
const FIX = {
  beamEndOffsets: { low: 135, high: 85 }, // 首末孔到梁端的基础距离（沿梁）；长度取整余量再平分两端
  modGap: 20, modGapEW: 20,   // 组件间隙固定 20（沿坡、东西向）
  // 檩条伸出组件阵列边：螺栓固定两端各 50（檩条图：32392 = 28 列组件 32292 + 2×50），压块固定各 100（放边压块）
  purlinExt: { bolt: 50, clamp: 100 },
  maxOverhang: 0.4,     // 榀数按组件列数算：取檩条两端悬挑不超过首末跨榀距 0.4 倍的最少榀数（两张图都是 12 / 10 榀）
  beam:   { d: 80,  f: 40, l: 15, t: 2.0 },
  purlin: { d: 100, f: 55, l: 15, t: 1.8 },
  postTie: { d: 59, f: 39, l: 8, t: 1.6 },
  purlinTie: { type: 'L', d: 35, f: 35, t: 1.6 },
};
// ---------- 构件截面选型库 ----------
// 常规 C 型构件共用这一份数据（C d*f*l*t：截面高 × 翼缘宽 × 卷边 × 板厚，单位 mm）；拉杆使用专用库。
// 选中后把尺寸写进 FIX 同名对象并重建模型；加新规格往字符串里追加即可。
const SECTION_LIB = `
  C50*30*10*1.8    C50*30*10*2.0    C59*39*8*1.6     C59*39*8*1.8     C60*40*10*1.6
  C60*40*10*1.8    C60*40*10*2.0    C70*40*10*1.8    C70*40*10*2.0    C75*40*10*1.85
  C79*39*8*1.8     C79*39*8*2.0     C80*40*10*1.8    C80*40*10*2.0    C80*40*15*1.8
  C80*40*15*2.0    C80*40*15*3.0    C80*45*15*1.8    C80*45*15*2.0    C80*45*15*3.0
  C80*50*10*2.0    C80*50*15*1.8    C80*50*15*2.0    C80*50*15*3.0    C80*50*20*2.0
  C80*55*15*1.8    C80*55*15*3.0    C80*55*20*1.8    C80*55*20*2.0    C80*60*15*1.8
  C80*60*15*2.0    C80*60*15*3.0    C80*60*20*1.8    C80*60*20*2.0    C90*40*10*1.8
  C90*40*10*2.0    C90*40*15*1.8    C90*40*15*3.0    C90*45*15*1.8    C90*45*15*2.0
  C90*45*15*3.0    C90*50*10*2.0    C90*50*15*1.8    C90*50*15*2.0    C90*50*15*3.0
  C90*50*20*1.8    C90*50*20*2.0    C90*55*15*1.8    C90*55*15*3.0    C90*55*20*1.8
  C90*55*20*2.0    C90*55*20*3.0    C90*60*15*1.8    C90*60*15*2.0    C90*60*15*3.0
  C90*60*20*1.8    C90*60*20*2.0    C90*60*20*3.0    C99*39*8*1.8     C99*39*8*2.0
  C99*39*8*2.3     C99*49*8*1.8     C99*49*8*2.0     C99*49*8*2.3     C100*40*10*1.8
  C100*40*10*2.0   C100*40*10*2.3   C100*40*15*1.8   C100*40*15*2.0   C100*40*15*2.3
  C100*40*15*3.0   C100*45*10*1.8   C100*45*15*1.8   C100*50*10*1.8   C100*50*10*2.0
  C100*50*10*2.3   C100*50*15*1.8   C100*50*15*2.0   C100*50*15*2.3   C100*50*15*3.0
  C100*50*20*1.8   C100*50*20*2.0   C100*50*20*2.3   C100*50*20*3.0   C100*55*15*1.8
  C100*55*15*2.0   C100*55*20*1.8   C100*55*20*2.0   C100*55*20*3.0   C100*60*15*1.8
  C100*60*15*2.0   C100*60*20*1.8   C100*60*20*2.0   C100*60*20*3.0   C110*50*20*1.8
  C110*50*20*2.0   C110*50*20*3.0   C110*55*20*1.8   C110*60*20*1.8   C110*60*20*2.3
  C110*60*20*3.0   C120*50*15*1.8   C120*50*20*1.8   C120*50*20*2.0   C120*50*20*2.3
  C120*50*20*3.0   C120*55*20*1.8   C120*60*20*1.8   C120*60*20*2.0   C120*60*20*2.3
  C120*60*20*2.5   C120*60*20*3.0   C130*60*20*3.0   C130*60*25*2.0   C140*60*20*3.0
  C150*60*20*3.0   C160*60*20*3.0   C160*70*20*3.0   C170*60*20*3.0   C170*70*20*3.0
  C170*70*30*3.0   C180*70*20*3.0   C180*70*30*3.0   C180*70*30*3.5   C180*80*30*3.5
  C200*80*30*3.0   C200*80*30*3.5   C200*100*30*3.5  C200*100*30*4.0  C220*100*30*3.5
  C220*100*30*4.0  C230*100*30*3.5  C230*100*30*4.0  C250*100*30*3.5  C250*100*30*4.0
`.split(/\s+/).filter(Boolean).map((s) => {
  const m = s.match(/^C(\d+)\*(\d+)\*(\d+)\*([\d.]+)$/);
  return { name: `C${m[1]}*${m[2]}*${m[3]}*${m[4]}`, d: +m[1], f: +m[2], l: +m[3], t: +m[4] };
});
for (const key of ['postF', 'postR', 'braceF', 'braceR', 'braceOF', 'braceOR']) FIX[key] = {};
const section = (kind, rear = false, outer = false) => FIX[kind === 'post' ? (rear ? 'postR' : 'postF') : (outer ? (rear ? 'braceOR' : 'braceOF') : (rear ? 'braceR' : 'braceF'))];
// 立柱拉杆和檩条拉杆共用规格，仅按截面尺寸选型，暂不区分 S420GD 等材质牌号。
const TIE_SECTION_LIB = [
  { type: 'L', name: 'L35*35*1.6', d: 35, f: 35, t: 1.6 },
  { type: 'C', name: 'C59*39*8*1.6', d: 59, f: 39, l: 8, t: 1.6 },
  { type: 'C', name: 'C60*40*10*1.6', d: 60, f: 40, l: 10, t: 1.6 },
];

function getSectionLibrary(key) {
  return key === 'postTie' || key === 'purlinTie' ? TIE_SECTION_LIB : SECTION_LIB;
}

function applySection(key, { name, ...dimensions }) {
  const target = FIX[key];
  // 保留对象引用，但清掉旧截面字段，避免 C/L 切换后残留 type、卷边或名称。
  for (const field of Object.keys(target)) delete target[field];
  Object.assign(target, dimensions);
}

const SECTION_LABEL = { postF: '前立柱', postR: '后立柱', beam: '斜梁', braceF: '前斜撑', braceR: '后斜撑', braceOF: '前外斜撑', braceOR: '后外斜撑', purlin: '檩条', postTie: '立柱拉杆', purlinTie: '檩条拉杆' };
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

// ---------- 图纸预设参数 ----------
// 两套预设使用相同字段和分组顺序；长度单位 mm，角度单位 °，坡度单位 %。
// F / R 表示前 / 后；保留未启用构件的参数，便于切换固定方式或启用外斜撑。
const PRESETS = {
  // 图纸一：2 排组件、螺栓固定、无外斜撑。
  A: {
    // 构件截面名称：对应 C 型钢 / L 型角钢截面库
    sections: {
      postF: 'C90*55*20*3.0', // 前立柱
      postR: 'C90*55*20*3.0', // 后立柱
      beam: 'C90*50*15*2.0', // 斜梁
      braceF: 'C59*39*8*1.8', // 前斜撑
      braceR: 'C59*39*8*1.8', // 后斜撑
      braceOF: 'C80*40*15*2.0', // 前外斜撑
      braceOR: 'C80*40*15*2.0', // 后外斜撑
      purlin: 'C100*55*20*1.8', // 檩条
      postTie: 'C59*39*8*1.6', // 立柱拉杆
      purlinTie: 'L35*35*1.6', // 檩条拉杆
    },

    // 组件尺寸与阵列
    modL: 2384, // 组件长度（沿坡）
    modW: 1303, // 组件宽度（东西向）
    modT: 33, // 组件厚度
    hole: 1400, // 组件安装孔距（同一组件下两根檩条的间距）
    rows: 2, // 沿坡组件排数
    cols: 26, // 东西向组件列数，榀数由此计算

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

    // 榀距与檩条
    pitch: 2800, // 中间跨榀距（沿檩条）
    pitchEnd: 2500, // 首末跨榀距（沿檩条）
    maxPurlin: 9000, // 檩条切割最大长度
    purlinConnector: 'U108*55*3.0*240', // 手动选择连接件规格

    // 斜撑布置
    outer: 0, // 是否带外斜撑：0 无，1 有
    braceHF: 250, // 前柱斜撑连接板中心标高，相对 ±0
    braceHR: 250, // 后柱斜撑连接板中心标高，相对 ±0
    braceTopF: 1650, // 前内斜撑上节点距斜梁下端（沿梁）
    braceTopR: 1650, // 后内斜撑上节点距斜梁上端（沿梁）
    braceOutF: 400, // 前外斜撑上节点距斜梁下端（沿梁）
    braceOutR: 400, // 后外斜撑上节点距斜梁上端（沿梁）

    // 立柱拉杆布置
    postTieF: 'ends', // 前排：none 无 / ends 首末跨 / all 全部跨 / custom 自定义
    postTieR: 'ends', // 后排：同前排布置选项
    postTieSpansF: [], // 前排自定义逐跨开关，0 不安装、1 安装
    postTieSpansR: [], // 后排自定义逐跨开关，0 不安装、1 安装

    // 檩条拉杆布置
    purlinTies: 'all', // none 无 / all 全部跨 / inner 剔除首末跨 / custom 自定义
    purlinTieSpans: [], // 自定义逐跨开关，0 不安装、1 安装
  },
  // 图纸二：3 排组件、压块固定、带外斜撑。
  B: {
    // 构件截面名称：对应 C 型钢 / L 型角钢截面库
    sections: {
      postF: 'C80*40*15*3.0', // 前立柱
      postR: 'C80*40*15*3.0', // 后立柱
      beam: 'C80*40*10*2.0', // 斜梁
      braceF: 'C59*39*8*1.8', // 前斜撑
      braceR: 'C59*39*8*1.8', // 后斜撑
      braceOF: 'C59*39*8*1.8', // 前外斜撑
      braceOR: 'C59*39*8*1.8', // 后外斜撑
      purlin: 'C90*50*15*1.8', // 檩条
      postTie: 'C59*39*8*1.6', // 立柱拉杆
      purlinTie: 'L35*35*1.6', // 檩条拉杆
    },

    // 组件尺寸与阵列
    modL: 2382, // 组件长度（沿坡）
    modW: 1134, // 组件宽度（东西向）
    modT: 30, // 组件厚度
    hole: 1400, // 组件安装孔距（同一组件下两根檩条的间距）
    rows: 3, // 沿坡组件排数
    cols: 27, // 东西向组件列数，榀数由此计算

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

    // 榀距与檩条
    pitch: 3300, // 中间跨榀距（沿檩条）
    pitchEnd: 3000, // 首末跨榀距（沿檩条）
    maxPurlin: 9000, // 檩条切割最大长度
    purlinConnector: 'U98*55*3.0*220', // 手动选择连接件规格

    // 斜撑布置
    outer: 1, // 是否带外斜撑：0 无，1 有
    braceHF: 250, // 前柱斜撑连接板中心标高，相对 ±0
    braceHR: 350, // 后柱斜撑连接板中心标高，相对 ±0
    braceTopF: 2650, // 前内斜撑上节点距斜梁下端（沿梁）
    braceTopR: 2650, // 后内斜撑上节点距斜梁上端（沿梁）
    braceOutF: 400, // 前外斜撑上节点距斜梁下端（沿梁）
    braceOutR: 400, // 后外斜撑上节点距斜梁上端（沿梁）

    // 立柱拉杆布置
    postTieF: 'ends', // 前排：none 无 / ends 首末跨 / all 全部跨 / custom 自定义
    postTieR: 'ends', // 后排：同前排布置选项
    postTieSpansF: [], // 前排自定义逐跨开关，0 不安装、1 安装
    postTieSpansR: [], // 后排自定义逐跨开关，0 不安装、1 安装

    // 檩条拉杆布置
    purlinTies: 'none', // none 无 / all 全部跨 / inner 剔除首末跨 / custom 自定义
    purlinTieSpans: [], // 自定义逐跨开关，0 不安装、1 安装
  },
};
// 应用截面时复制尺寸，保留运行时 FIX 引用，避免修改预设。
function applyPresetSections(preset) {
  const sections = Object.entries(PRESETS[preset].sections).map(([key, name]) => {
    const library = getSectionLibrary(key);
    const value = library.find(item => item.name === name);
    if (!value) throw new Error(`图纸 ${preset} 的 ${SECTION_LABEL[key] || key} 截面不存在：${name}`);
    return [key, value];
  });
  // 全部名称校验通过后再应用，复制尺寸，避免修改截面库或预设。
  for (const [key, dimensions] of sections) applySection(key, dimensions);
}
applyPresetSections('A');
const DEFAULTS = PRESETS.A;

// ---------- 连接件尺寸 ----------
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
const CLIP = { t: 4, base: 64, height: 80, width: 50, baseBolt: 32, webBolt: 50 };   // 檩托（假设）
// 压块（按压块节点图的比例量取，图上没标尺寸；螺栓 M8×35 内六角）。高度都从组件上表面算，向下为正：
// 中压块：U 形槽外宽 = 组件缝，两翼压住两侧组件边框 press，翼板上表面根部高 top、翼尖高 tip，翼板底面带齿；
//   槽壁厚 wall，槽底上表面（螺栓头支承面）在 floor，槽底板厚 plate
// 边压块：从组件边往外共宽 w（檩条伸出组件 100，放得下）。上沿勾住边框 press、底面带齿；内立板厚 wall，
//   底板上表面（螺栓头支承面）在 floor、厚 plate。外端一只倒 T 形的脚：底板外端大圆角转下来成宽 stem 的短立柱，
//   下面是宽 foot、厚 pad 的脚垫（两边各比立柱宽出一截，底面带齿）落在檩条上；螺栓在立板和底板外端之间居中
const CLAMP = {
  bolt: 35, teeth: { h: 0.6, pitch: 1.2 },
  mid: { press: 12, top: 3.2, tip: 2, wall: 2.5, floor: 14, plate: 3 },
  side: { w: 30, press: 11, top: 3.6, tip: 2.2, wall: 3.5, floor: 25, plate: 3.5, foot: 8.5, stem: 3.7, pad: 1.6 },
};

// ---------- 可调参数 ----------
// 面板里放常用的几个；其余蓝字参数在尺寸标注上点击修改，取值范围在 EXTRA_LIMITS
const PARAMS = [
  { key: 'purlinTies', label: '檩条拉杆布置', type: 'select', options: [['none', '无'], ['all', '全部跨'], ['inner', '剔除首末跨'], ['custom', '自定义']],
    hint: '每跨中间一套，贯通所有檩条，两端各伸出85 mm；自定义可逐跨勾选' },
  { key: 'tilt',   label: '组件倾角',        unit: '°',  min: 10,   max: 40,   step: 0.5 },
  { key: 'span',   label: '前后立柱间距',    unit: 'mm', min: 2000, max: 4500, step: 50 },
  { key: 'h0',     label: '组件前沿离地高度', unit: 'mm', min: 300,  max: 1500, step: 10 },
  { keys: ['modL', 'modW', 'modT'], label: '组件尺寸', type: 'size', unit: 'mm',
    hint: '长（沿坡）× 宽（东西向）× 厚；组件间隙固定 20' },
  { key: 'fix',   label: '固定方式',        type: 'select', options: [['bolt', '螺栓固定'], ['clamp', '压块']],
    hint: '螺栓固定：组件安装孔 M8×22，檩条两端各伸出组件 50；压块：缝上中压块、两端边压块，M8×35 内六角，檩条两端各伸出 100' },
  { key: 'serratedWasher', label: '包含锯齿垫圈', type: 'bool', when: (P) => P.fix === 'bolt',
    hint: '替换组件螺栓头下的普通平垫，螺母侧大平垫和弹垫不变' },
  { key: 'maxPurlin', label: '檩条最大长度', type: 'select', options: [['5700', '5700 mm'], ['7200', '7200 mm'], ['9000', '9000 mm']] },
  { key: 'purlinConnector', label: '檩条连接件', type: 'select',
    options: PURLIN_CONNECTOR_SPECS.map(name => [name, name]),
    hint: '手动选择 U 型连接件规格（高度*翼缘宽*板厚*长度），不随檩条截面自动切换' },
  { key: 'clampL', label: '压块长度',        unit: 'mm', min: 30,   max: 200,  step: 5, when: (P) => P.fix === 'clamp' },
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
const EXTRA_LIMITS = {
  braceHF: [100, 800], braceHR: [100, 1200], braceTopF: [600, 5000], braceTopR: [600, 5000],
  braceOutF: [100, 3000], braceOutR: [100, 3000],
  embed: [800, 3000], modL: [1600, 2600], modW: [900, 1400], modT: [25, 50], hole: [600, 2400],
};
// 返回 [最小, 最大, 步长]；安装孔距不能超过组件长度 − 200
function limits(key) {
  const d = PARAMS.find((q) => q.key === key);
  if (d) return [d.min, d.max, key === 'tilt' || d.unit === '%' ? 0.1 : 1];
  const [lo, hi] = EXTRA_LIMITS[key];
  return [lo, key === 'hole' ? Math.min(hi, P.modL - 200) : hi, 1];
}

// 截面由 FIX 管理；可调参数单独复制，数组也不与预设共享。
const { sections: defaultSections, ...defaultParameters } = DEFAULTS;
const P = Object.fromEntries(Object.entries(defaultParameters).map(([key, value]) => [key, Array.isArray(value) ? [...value] : value]));
const show = { dims: true, buried: true, modules: true, bolts: true, drawingColors: true, postTies: true, purlinTies: true, shadows: true };
export { TIE_SECTION_LIB, PURLIN_CONNECTOR_SPECS, getSectionLibrary, applySection };
export { applyPresetSections, FIX, PRESETS, DEFAULTS, JOINT, DBL, CLIP, CLAMP, PARAMS, limits, SECTION_LIB, SECTION_LABEL, P, show, section };
