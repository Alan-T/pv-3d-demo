import type { ClampCatalog, CorrosivityCategory, MemberKey, PurlinAccessory, SurfaceFinishKey } from '../domain/design-types.ts';

// 压块规格（mm）：中压块槽外宽或边压块总高 - L长度 × Φ孔径。
export const CLAMP_SPECS: ClampCatalog = {
  mid: { 40: '20-L40×Φ9', 50: '20-L50×Φ9', 60: '20-L60×Φ9', 80: '20-L80×Φ9' },
  // 按组件厚度确定螺栓，在该组内按压块长度选边压块。
  byThickness: {
    30: {
      edge: { 40: '35-L40×Φ9', 50: '35-L50×Φ9', 60: '35-L60×Φ9', 80: '35-L80×Φ9' },
      bolt: 'M8×30',
    },
    33: {
      edge: { 40: '38-L40×Φ9', 50: '38-L50×Φ9', 60: '38-L60×Φ9', 80: '38-L80×Φ9' },
      bolt: 'M8×35',
    },
    35: {
      edge: { 40: '40-L40×Φ9', 50: '40-L50×Φ9', 60: '40-L60×Φ9', 80: '40-L80×Φ9' },
      bolt: 'M8×35',
    },
  },
};
// 常规 C 型构件规格（C d*f*l*t：截面高 × 翼缘宽 × 卷边 × 板厚，mm），由 section-spec.ts 解析尺寸。
export const SECTION_LIB: string[] = [
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
export const TIE_SECTION_LIB: string[] = [
  'L35*35*1.6',
  'C59*39*8*1.6',
  'C60*40*10*1.6',
];
// 檩托：立边高*底边宽*厚度*长度（mm）。
export const PURLIN_CLIP_SPECS = ['L100*63*6.0*50', 'L90*56*5.0*50', 'L75*50*5.0*50'];
// 斜撑连接板：单块板的宽*高*厚（mm）。分装时每侧用一块单面板。
export const BRACE_CONNECTOR_SPECS: readonly [single: string, double: string] = [
  '160*120*5.75', // 单面板
  '280*120*5.75', // 双面板
];
// 檩条连接件规格名称：高度*翼缘宽*板厚*长度（mm），按高度、宽度、板厚升序维护。
export const PURLIN_CONNECTOR_SPECS = [
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

export const SECTION_LABEL = {
  postF: '前立柱', postR: '后立柱', beam: '斜梁',
  braceF: '前斜撑', braceR: '后斜撑', braceOF: '前外斜撑', braceOR: '后外斜撑',
  purlin: '檩条', postTie: '立柱拉杆', purlinTie: '檩条拉杆',
} satisfies Record<MemberKey, string>;
export const PURLIN_ACCESSORY_KEYS: PurlinAccessory[] = ['purlinClip', 'purlinConnector'];
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

// C1、C2、C3 对应相同的表面处理，编码与上方下拉选项一致。
const c1ToC3Finishes = {
  moduleFastenerFinish: '30304', otherFastenerFinish: '20045',
  postFinish: '20065', otherFinish: '10275',
  smallPartFinish: '20065', zamSmallPartFinish: '10275',
  pileFinish: '20085', roundRodFinish: '20045',
};
export const SURFACE_FINISH_BY_CORROSIVITY = {
  C1: c1ToC3Finishes,
  C2: c1ToC3Finishes,
  C3: c1ToC3Finishes,
  C4: {
    moduleFastenerFinish: '30304', otherFastenerFinish: '30304',
    postFinish: '20085', otherFinish: '10310',
    smallPartFinish: '20085', zamSmallPartFinish: '10310',
    pileFinish: '20085', roundRodFinish: '20045',
  },
  C5: {
    moduleFastenerFinish: '30304', otherFastenerFinish: '30304',
    postFinish: '20120', otherFinish: '10450',
    smallPartFinish: '20120', zamSmallPartFinish: '10450',
    pileFinish: '20120', roundRodFinish: '20065',
  },
} satisfies Record<CorrosivityCategory, Record<SurfaceFinishKey, string>>;
