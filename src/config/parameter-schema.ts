import type { ParameterFieldConfig } from '../domain/design-types.ts';
import { PURLIN_CLIP_SPECS, PURLIN_CONNECTOR_SPECS } from './catalogs.ts';
import { FIX, MODULE_MOUNTING, SOLVE_RULES } from './engineering-rules.ts';

// 面板里放常用的几个；其余蓝字参数在尺寸标注上点击修改，取值范围在 EXTRA_LIMITS
export const PARAMETER_FIELDS: ParameterFieldConfig[] = [
  { key: 'purlinClip', label: '檩托规格', type: 'select',
    options: PURLIN_CLIP_SPECS,
    hint: '立边高 × 底边宽 × 厚度 × 长度（mm）' },
  { key: 'purlinTies', label: '檩条拉杆布置', type: 'select', options: [['none', '无'], ['all', '全部跨'], ['inner', '剔除首末跨'], ['custom', '自定义']],
    hint: `每跨中间一套，贯通所有檩条，两端各伸出 ${FIX.purlinTieEdge} mm；自定义可逐跨勾选` },
  { key: 'pileFoundationType', label: '桩基础类型', type: 'select',
    options: ['水泥灌注桩', '锤入桩', '水泥台桩', '螺旋桩'] },
  { key: 'tilt',   label: '组件倾角',        unit: '°',  min: 10,   max: 40,   step: 0.5 },
  { key: 'span',   label: '前后立柱间距',    unit: 'mm', min: 2000, max: 4500, step: 50 },
  { key: 'h0',     label: '组件前沿离地高度', unit: 'mm', min: 300,  max: 1500, step: 10 },
  { keys: ['modL', 'modW', 'modT'], label: '组件尺寸', type: 'size', unit: 'mm',
    hint: `长（沿坡）× 宽（东西向）× 厚；沿坡间隙 ${FIX.modGap} mm，东西向间隙 ${FIX.modGapEW} mm` },
  { key: 'modPower', label: '组件功率', type: 'number', unit: 'Wp', min: 1, step: 1 },
  { key: 'modWeight', label: '组件重量', type: 'number', unit: 'kg', min: 0.1, step: 0.1 },
  { key: 'fix',   label: '固定方式',        type: 'select', options: [['bolt', '螺栓固定'], ['clamp', '压块']],
    hint: `使用安装孔时配 M${MODULE_MOUNTING.installationBolt.diameter}×${MODULE_MOUNTING.installationBolt.length} 螺栓，檩条两端各伸出组件 ${FIX.purlinExt.bolt} mm。使用压块时，组件缝装中压块，两端装边压块，内六角螺栓按组件厚度选型，檩条两端各伸出 ${FIX.purlinExt.clamp} mm。` },
  { key: 'serratedWasher', label: '包含锯齿垫圈', type: 'bool', whenFix: 'bolt',
    hint: '替换组件螺栓头下的普通平垫，螺母侧大平垫和弹垫不变' },
  { key: 'clampL', label: '压块长度', type: 'select', unit: 'mm', whenFix: 'clamp',
    numericOptions: 'clampLengths' },
  { key: 'maxPurlin', label: '檩条最大长度', type: 'select', unit: 'mm',
    options: ['5700', '7200', '9000'] },
  { key: 'purlinCutMode', label: '分段方式', type: 'select', options: [['auto', '自动'], ['custom', '自定义']] },
  { key: 'purlinConnector', label: '檩条连接件', type: 'select',
    options: PURLIN_CONNECTOR_SPECS,
    hint: '手动选择 U 型连接件规格（高度*翼缘宽*板厚*长度），不随檩条截面自动切换' },
  { key: 'rows', label: '组件排数（沿坡）', type: 'select', unit: '排', numericOptions: [2, 3] },
  { key: 'outer',  label: '外斜撑',          type: 'bool', hint: '立柱外侧再加一根斜撑，撑住斜梁悬挑段（与内斜撑共用连接板）' },
  { key: 'cols',   label: '组件列数（东西向）', unit: '列', min: 1,  max: 60,   step: 1,
    hint: `榀数由列数算出：檩条两端悬挑不超过首末跨榀距 ${SOLVE_RULES.ew.maxEndOverhangRatio} 倍的最少榀数` },
  { key: 'pitch',  label: '中间跨榀距',      unit: 'mm', min: 2000, max: 4500, step: 100 },
  { key: 'pitchEnd', label: '首末跨榀距',    unit: 'mm', min: 1500, max: 4500, step: 100,
    hint: '第 1–2 榀、倒数第 2–1 榀之间的距离' },
  { key: 'slopeNS',  label: '地面南北坡度',    unit: '%',  min: -60,  max: 60,   step: 0.5,
    hint: '正值表示北高南低，负值表示北低南高。前柱处地面为 ±0。勾选“只考虑顺坡安装”时，后柱埋深从输入坡面与水平基线的较低处起算。未勾选时，按正反两个坡向中较低的地面起算。' },
  { key: 'alongSlope', label: '只考虑顺坡安装', type: 'bool' },
  { key: 'slopeEW', label: '地面东西坡度',  unit: '%',  min: -10,  max: 10,   step: 0.5,
    hint: '正 = 东高西低，负 = 东低西高。各榀立柱竖直、跟着地面抬高，檩条顺坡；榀距、阵列宽、檩条长都是沿檩条量的长度，水平距离 = 长度 ÷ √(1 + 坡度²)' },
];
export const EXTRA_LIMITS: Record<string, [number, number]> = {
  braceHF: [100, 800], braceHR: [100, 1200], braceTopF: [600, 5000], braceTopR: [600, 5000],
  braceOutF: [100, 3000], braceOutR: [100, 3000],
  embed: [800, 3000], modL: [1600, 2600], modW: [900, 1400], hole: [600, 2400],
};

export const DISPLAY_DEFAULTS = { dims: true, buried: true, modules: true, bolts: true, drawingColors: true, postTies: true, purlinTies: true, shadows: true };
