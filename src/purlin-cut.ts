import type { ModelParameters } from './design-types.ts';

type CutParameters = Pick<ModelParameters, 'modW' | 'cols' | 'maxPurlin' | 'purlinCutLengths' | 'purlinCutMode'>;
export interface PurlinCut {
  valid: boolean;
  segments: { start: number; length: number }[];
  positions: number[];
  error?: string;
}

// 与二维 TopView 自动切割保持一致。搜索坐标从檩条西端起算，输出以阵列中心为原点，单位 mm。
export const PURLIN_CUT_GAP = 4;
const CUT = {
  step: 50,
  minFrameDistance: 300,
  maxFrameDistance: 1000,
  fixtureClearance: 300,
  moduleGap: 20,
  maxAdjustAttempts: 400,
  maxRecalcAttempts: 5,
};

// 二维 pClamps：两种固定方式均按组件缝避让，包含首块组件前方的虚拟缝。
function fixturePositions(params: CutParameters, total: number, width: number) {
  const start = (total - width) / 2 - CUT.moduleGap / 2;
  return Array.from({ length: params.cols }, (_, i) => start + i * (params.modW + CUT.moduleGap));
}

function validJoint(position: number, posts: number[], fixtures: number[]) {
  const nearFrame = posts.some(post => {
    const distance = Math.abs(position - post);
    return distance >= CUT.minFrameDistance && distance <= CUT.maxFrameDistance;
  });
  return nearFrame && fixtures.every(fixture => Math.abs(position - fixture) >= CUT.fixtureClearance);
}

function adjustJoint(initial: number, total: number, posts: number[], fixtures: number[]) {
  let position = initial;
  for (let attempt = 0; attempt < CUT.maxAdjustAttempts; attempt++) {
    if (validJoint(position, posts, fixtures)) return position;
    // 二维采用累加调整；未触及边界时，检查顺序为原位、+50、原位、+100、原位……。
    const next = attempt + 1;
    position += (next % 2 ? 1 : -1) * CUT.step * Math.ceil(next / 2);
    position = Math.max(0, Math.min(position, total));
  }
  // 不沿用二维超出尝试次数后仍接受非法位置的行为。
  return null;
}

function segmentsFromPositions(offsets: number[], total: number): PurlinCut {
  const positions = offsets.map(offset => offset - total / 2);
  const segments = [];
  let start = -total / 2;
  for (const position of positions) {
    segments.push({ start, length: position - PURLIN_CUT_GAP / 2 - start });
    start = position + PURLIN_CUT_GAP / 2;
  }
  segments.push({ start, length: total / 2 - start });
  return { valid: true, positions, segments };
}

function customCut(lengths: number[], total: number, maxLength: number, framePositions: number[], fixtures: number[], fallback: PurlinCut): PurlinCut {
  if (!Array.isArray(lengths) || !lengths.length) {
    return { ...fallback, error: '请输入从西到东的各段檩条净长。' };
  }
  const offsets = [];
  const segments = [];
  let end = 0;
  for (const [i, length] of lengths.entries()) {
    if (!Number.isFinite(length) || length <= 0) {
      return { ...fallback, error: `第 ${i + 1} 段净长必须是大于 0 的有限数值。` };
    }
    if (length > maxLength) {
      return { ...fallback, error: `第 ${i + 1} 段净长 ${length} mm 超过檩条最大长度 ${maxLength} mm。` };
    }
    if (i > 0) {
      offsets.push(end + PURLIN_CUT_GAP / 2);
      end += PURLIN_CUT_GAP;
    }
    segments.push({ start: end - total / 2, length });
    end += length;
  }
  if (Math.abs(end - total) > 1e-6) {
    return { ...fallback, error: `各段净长加 ${offsets.length} 道 ${PURLIN_CUT_GAP} mm 接缝共 ${Number(end.toFixed(6))} mm，应为 ${total} mm。` };
  }
  for (const [i, offset] of offsets.entries()) {
    if (!validJoint(offset, framePositions, fixtures)) {
      return { ...fallback, error: `第 ${i + 1} 个接头距西端 ${Number(offset.toFixed(6))} mm，接头应距榀位 ${CUT.minFrameDistance}–${CUT.maxFrameDistance} mm，且距组件缝至少 ${CUT.fixtureClearance} mm。` };
    }
  }
  return { valid: true, positions: offsets.map(offset => offset - total / 2), segments };
}

export function cutPurlin(params: CutParameters, total: number, posts: number[], width: number): PurlinCut {
  const maxLength = Number(params.maxPurlin);
  const fallback = { valid: false, positions: [], segments: [{ start: -total / 2, length: total }] };
  const custom = params.purlinCutMode === 'custom';
  if (!Number.isFinite(maxLength) || maxLength <= 0 || !Number.isFinite(total) || total <= 0) {
    return custom ? { ...fallback, error: '檩条总长和最大长度必须是大于 0 的有限数值。' } : fallback;
  }
  if (!custom && total <= maxLength) return { ...fallback, valid: true };

  const framePositions = posts.map(post => post + total / 2);
  const fixtures = fixturePositions(params, total, width);
  if (custom) return customCut(params.purlinCutLengths, total, maxLength, framePositions, fixtures, fallback);
  const minimumCount = Math.ceil(total / maxLength);
  for (let retry = 0; retry < CUT.maxRecalcAttempts; retry++) {
    const count = minimumCount + retry;
    const defaultLength = Math.round(total / count / 100) * 100;
    const offsets = [];
    for (let i = 1; i < count; i++) {
      const initial = i === 1 ? defaultLength + PURLIN_CUT_GAP / 2 : i * (defaultLength + PURLIN_CUT_GAP) - PURLIN_CUT_GAP / 2;
      const position = adjustJoint(initial, total, framePositions, fixtures);
      if (position === null) break;
      offsets.push(position);
    }
    if (offsets.length !== count - 1) continue;
    offsets.sort((a, b) => a - b);
    const result = segmentsFromPositions(offsets, total);
    if (result.segments.every(segment => segment.length > 0 && segment.length <= maxLength)) return result;
  }
  return fallback;
}
