import { FIX, TIE_RULES } from '../config/engineering-rules.ts';
import type { ModelParameters } from './design-types.ts';
import type { Solution, EWLayout } from './solve.ts';

// 立柱拉杆计算，尺寸单位 mm。对应二维 TopView.vue 的 calculateXY / postBraceFL / postBraceBL。
// 当前支架为直埋 C 型立柱，抱箍孔距为 0。
export function postTieHeights({ postLength, embed, strutHeight, slopeHeight = 0 }: {
  postLength: number; embed: number; strutHeight: number; slopeHeight?: number;
}) {
  const { strutClearance, minTopOffset, maxTopOffset, targetTopOffset, holeRiseStep } = TIE_RULES.postTie;
  const available = postLength - embed - strutHeight - slopeHeight - strutClearance;
  const candidates = [];
  if (available < minTopOffset + holeRiseStep) return { topOffset: available, holeRise: 0 };
  for (let rise = holeRiseStep; rise <= available - minTopOffset; rise += holeRiseStep) {
    const offset = available - rise;
    if (offset >= minTopOffset && offset <= maxTopOffset) candidates.push({ topOffset: offset, holeRise: rise });
  }
  if (!candidates.length) {
    const rise = Math.round((available - maxTopOffset) / holeRiseStep) * holeRiseStep;
    return { topOffset: available - rise, holeRise: rise };
  }
  return candidates.reduce((best, next) =>
    Math.abs(next.topOffset - targetTopOffset) < Math.abs(best.topOffset - targetTopOffset) ? next : best);
}

export function enabledPostTieSpans(mode: string, selected: number[], count: number) {
  return Array.from({ length: count }, (_, index) =>
    mode === 'all' || (mode === 'ends' && (index === 0 || index === count - 1)) ||
    (mode === 'custom' && selected?.[index] === 1));
}

// 每一排、每一跨单独比较一对拉杆。边界±100mm包含在可共用平地料长的范围内。
export function postTieLengths(span: number, holeRise: number, slope: number) {
  const { lengthStep, levelLengthTolerance } = TIE_RULES.postTie;
  const roundLength = (distance: number) => Math.round(distance / lengthStep) * lengthStep + 2 * FIX.postTieEdge;
  const levelLength = roundLength(Math.hypot(span, holeRise));
  const horizontalSpan = span / Math.hypot(1, slope);
  const actualLengths = [1, -1].map(direction =>
    roundLength(Math.hypot(horizontalSpan, direction * holeRise + span * slope)));
  const useLevelLength = actualLengths.every(length => Math.abs(length - levelLength) <= levelLengthTolerance);
  return { levelLength, actualLengths, useLevelLength,
    lengths: useLevelLength ? [levelLength, levelLength] : actualLengths };
}

export function calculatePostTies(parameters: ModelParameters, solution: Solution, layout: EWLayout) {
  const { zs: frameZPositions, ew } = layout;
  return [false, true].map(rear => {
    const key = rear ? 'R' : 'F';
    const heights = postTieHeights({
      postLength: Math.round(rear ? solution.lenR : solution.lenF), embed: parameters.embed,
      strutHeight: rear ? parameters.braceHR : parameters.braceHF,
      slopeHeight: rear && !parameters.alongSlope ? Math.abs(solution.gR) : 0,
    });
    const top = (rear ? solution.topR : solution.topF) - heights.topOffset;
    const bottom = top - heights.holeRise;
    const { minEdgeClearance } = TIE_RULES.postTie;
    const valid = heights.topOffset >= minEdgeClearance && bottom >= (rear ? solution.gR : 0) + minEdgeClearance;
    const enabled = enabledPostTieSpans(parameters[`postTie${key}`], parameters[`postTieSpans${key}`], frameZPositions.length - 1);
    const rods = [];
    for (let bay = 0; bay < enabled.length; bay++) {
      if (!enabled[bay] || !valid) continue;
      const span = frameZPositions[bay + 1] - frameZPositions[bay];
      // 二维的坡高采用 span × slope，而三维榀位采用 span × sin(atan(slope))。
      // 下料长度保留二维公式；安装孔使用实际榀位，取整余量在两端平分。
      const selectedLengths = postTieLengths(span, heights.holeRise, ew.i);
      for (const direction of heights.holeRise === 0 ? [1] : [1, -1]) {
        const y1 = direction === 1 ? bottom : top;
        const y2 = direction === 1 ? top : bottom;
        const index = direction === 1 ? 0 : 1;
        const length = selectedLengths.lengths[index];
        rods.push({ bay, direction, length,
          actualLength: selectedLengths.actualLengths[index], levelLength: selectedLengths.levelLength,
          useLevelLength: selectedLengths.useLevelLength,
          start: { y: y1 + frameZPositions[bay] * ew.sa, z: frameZPositions[bay] * ew.ca },
          end: { y: y2 + frameZPositions[bay + 1] * ew.sa, z: frameZPositions[bay + 1] * ew.ca },
        });
      }
    }
    return { rear, x: rear ? solution.xr : solution.xf, ...heights, top, bottom, valid, enabled, rods };
  });
}

export type PostTieRow = ReturnType<typeof calculatePostTies>[number];
