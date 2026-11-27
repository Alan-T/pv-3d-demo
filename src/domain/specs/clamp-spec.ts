import { CLAMP_SPECS } from '../../config/catalogs.ts';

export const MODULE_THICKNESSES: readonly number[] = Object.keys(CLAMP_SPECS.byThickness).map(Number);
export const CLAMP_LENGTHS: readonly number[] = Object.keys(CLAMP_SPECS.mid).map(Number);

// 规格名称以外的截面细部按节点图比例量取，槽底深度从组件上表面向下算（mm）。
export const CLAMP_PROFILE = {
  teeth: { h: 0.6, pitch: 1.2 },
  mid: { press: 12, top: 3.2, tip: 2, wall: 2.5, floor: 14, plate: 3 },
  side: { w: 30, press: 11, tip: 2.2, wall: 3.5, floor: 25, plate: 3.5, foot: 8.5, stem: 3.7, pad: 1.6 },
} as const;

function mountingFor(moduleThickness: number) {
  const mounting = CLAMP_SPECS.byThickness[moduleThickness];
  if (!mounting) throw new RangeError(`没有适配 ${moduleThickness} mm 组件的压块`);
  return mounting;
}

function parseClamp(name: string, length: number) {
  const match = /^(\d+(?:\.\d+)?)-L(\d+(?:\.\d+)?)×Φ(\d+(?:\.\d+)?)$/.exec(name);
  if (!match || Number(match[2]) !== length || Number(match[1]) <= 0 || Number(match[3]) <= 0) {
    throw new Error(`压块规格与配置长度 ${length} mm 不匹配：${name}`);
  }
  return { name, size: Number(match[1]), length, holeDiameter: Number(match[3]) };
}

export function getClampBoltSpec(moduleThickness: number) {
  const { bolt: name } = mountingFor(moduleThickness);
  const match = /^M8×([1-9]\d*)$/.exec(name);
  if (!match) throw new Error(`无效的 M8 压块螺栓规格：${name}`);
  return { name, length: Number(match[1]) };
}

export function getClampSpec(moduleThickness: number, length: number) {
  const midName = CLAMP_SPECS.mid[length], edgeName = mountingFor(moduleThickness).edge[length];
  if (!midName || !edgeName) throw new RangeError(`没有适配 ${moduleThickness} mm 组件的 ${length} mm 压块`);
  // 规格第一项分别为中压块槽外宽和边压块总高。
  const { size: width, ...mid } = parseClamp(midName, length);
  const { size: height, ...edge } = parseClamp(edgeName, length);
  return {
    mid: { ...mid, width },
    edge: { ...edge, height },
    bolt: getClampBoltSpec(moduleThickness),
  };
}
