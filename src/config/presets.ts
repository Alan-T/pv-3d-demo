import type { DrawingPreset, LayoutPreset, PresetId, ProjectInfo, SharedParameters, SurfaceFinishKey } from '../domain/design-types.ts';

// 图纸模板的长度单位为 mm，角度为 °，坡度为 %。F / R 表示前 / 后。
const BASE_PROJECT_INFO: ProjectInfo = {
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
};

const BASE_SURFACE_FINISHES: Record<SurfaceFinishKey, string> = {
  moduleFastenerFinish: '30304',
  otherFastenerFinish: '30304',
  postFinish: '20085',
  otherFinish: '10310',
  zamSmallPartFinish: '10310',
  smallPartFinish: '20085',
  pileFinish: '20085',
  roundRodFinish: '20045',
};

const BASE_DESIGN: Omit<SharedParameters, SurfaceFinishKey> = {
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
  pileFoundationType: '锤入桩',
  tilt: 20, // 组件倾角（°）
  h0: 620, // 组件前沿离地高度
  span: 3000, // 前后立柱水平间距
  embed: 1500, // 立柱埋深
  slopeNS: 0, // 南北坡度（%），正值北高南低
  slopeEW: 0, // 东西坡度（%），正值东高西低
  alongSlope: 0, // 只考虑顺坡安装

  maxPurlin: 9000, // 檩条切割最大长度

  // 斜撑布置
  outer: 0, // 是否带外斜撑：0 无，1 有
  braceHF: 250, // 前柱斜撑连接板中心标高，相对 ±0
  braceHR: 250, // 后柱斜撑连接板中心标高，相对 ±0
  braceTopF: 1650, // 前内斜撑上节点距斜梁下端（沿梁）
  braceTopR: 1650, // 后内斜撑上节点距斜梁上端（沿梁）
  braceOutF: 400, // 前外斜撑上节点距斜梁下端（沿梁）
  braceOutR: 400, // 后外斜撑上节点距斜梁上端（沿梁）
};

const BASE_SECTIONS: LayoutPreset['sections'] = {
  postF: 'C90*55*20*3.0', postR: 'C90*55*20*3.0',
  beam: 'C90*50*15*2.0', purlin: 'C100*55*20*1.8',
  braceF: 'C59*39*8*1.8', braceR: 'C59*39*8*1.8',
  braceOF: 'C80*40*15*2.0', braceOR: 'C80*40*15*2.0',
  postTie: 'C59*39*8*1.6', purlinTie: 'L35*35*1.6',
  purlinClip: 'L100*63*6.0*50', purlinConnector: 'U108*55*3.0*240',
  braceConnector: '160*120*5.75', // 前后柱共用，保存单块板规格
};

const BASE_LAYOUT_MATERIALS: LayoutPreset['materials'] = {
  postF: 'S420GD', postR: 'S420GD',
  beam: 'S420GD', purlin: 'S420GD',
  braceF: 'S420GD', braceR: 'S420GD',
  braceOF: 'S420GD', braceOR: 'S420GD',
  postTie: 'S420GD', purlinTie: 'S420GD',
  purlinClip: 'Q235B', purlinConnector: 'Q235B',
  braceConnector: 'Q235B',
};

type LayoutTemplate = Partial<Omit<LayoutPreset, 'sections' | 'materials'>> & {
  sections?: Partial<LayoutPreset['sections']>;
  materials?: Partial<LayoutPreset['materials']>;
};

function createLayout(layout: LayoutTemplate & { cols: number }): LayoutPreset {
  return {
    quantity: 1, pitchEnd: 2500, pitch: 2800,
    purlinCutMode: 'auto',
    postTieF: 'ends', postTieR: 'ends', purlinTies: 'all',
    ...layout,
    purlinCutLengths: [...(layout.purlinCutLengths ?? [])],
    postTieSpansF: [...(layout.postTieSpansF ?? [])],
    postTieSpansR: [...(layout.postTieSpansR ?? [])],
    purlinTieSpans: [...(layout.purlinTieSpans ?? [])],
    sections: { ...BASE_SECTIONS, ...layout.sections },
    materials: { ...BASE_LAYOUT_MATERIALS, ...layout.materials },
  };
}

type PresetTemplate = Partial<Omit<DrawingPreset, 'layouts'>> & {
  layouts: (LayoutTemplate & { cols: number })[];
};

function createPreset({ layouts, ...overrides }: PresetTemplate): DrawingPreset {
  return {
    ...BASE_PROJECT_INFO, ...BASE_SURFACE_FINISHES, ...BASE_DESIGN, ...overrides,
    layouts: layouts.map(createLayout),
  };
}

const THREE_ROW_LAYOUT: LayoutTemplate = {
  pitchEnd: 3000, pitch: 3300, purlinTies: 'none',
  sections: {
    postF: 'C80*40*15*3.0', postR: 'C80*40*15*3.0',
    beam: 'C80*40*10*2.0', purlin: 'C90*50*15*1.8',
    braceOF: 'C59*39*8*1.8', braceOR: 'C59*39*8*1.8',
    purlinClip: 'L90*56*5.0*50', purlinConnector: 'U98*55*3.0*220',
    braceConnector: '280*120*5.75',
  },
};

export const PRESETS: Record<PresetId, DrawingPreset> = {
  // 图纸一：2 排组件、螺栓固定、无外斜撑。
  A: createPreset({ layouts: [{ cols: 26 }, { cols: 13 }] }),
  // 图纸二：3 排组件、压块固定、带外斜撑。
  B: createPreset({
    modL: 2382, modW: 1134, modT: 30, rows: 3,
    fix: 'clamp', clampL: 60,
    tilt: 14, h0: 700, span: 3700,
    outer: 1, braceHR: 350, braceTopF: 2650, braceTopR: 2650,
    layouts: [{ ...THREE_ROW_LAYOUT, cols: 27 }, { ...THREE_ROW_LAYOUT, cols: 14 }],
  }),
};

export const DEFAULTS = PRESETS.A;

/** 图纸标注的核对值，单位 mm。缺省的构件不参与该图纸的核对。 */
export interface PresetBenchmark {
  beamLength: number; beamOverhang: number;
  frontPostHeight: number; rearPostHeight: number; rearPostHeightLabel: string;
  frontPostLength: number; rearPostLength: number;
  frontBrace: number; rearBrace: number; frontOuterBrace?: number; rearOuterBrace?: number;
  purlinLength: number; purlinOverhang: number; purlinSpacings: readonly number[];
}

export const PRESET_BENCHMARKS: Record<PresetId, PresetBenchmark> = {
  A: {
    beamLength: 4030, beamOverhang: 419,
    frontPostHeight: 798, rearPostHeight: 1890, rearPostHeightLabel: '后柱顶高（±0 起）',
    frontPostLength: 2298, rearPostLength: 3390,
    frontBrace: 1436, rearBrace: 1610,
    purlinLength: 34478, purlinOverhang: 739, purlinSpacings: [1400, 1004, 1400],
  },
  B: {
    beamLength: 6430, beamOverhang: 1308,
    frontPostHeight: 1026, rearPostHeight: 1948, rearPostHeightLabel: '后柱露出地面',
    frontPostLength: 2526, rearPostLength: 3448,
    frontBrace: 1631, rearBrace: 1750, frontOuterBrace: 968, rearOuterBrace: 1968,
    purlinLength: 31338, purlinOverhang: 1119, purlinSpacings: [1400, 1002, 1400, 1002, 1400],
  },
};
