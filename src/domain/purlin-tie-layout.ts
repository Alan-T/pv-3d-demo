import { FIX } from '../config/engineering-rules.ts';

// 双立柱体系：一套拉杆贯通所有檩条，在每跨中点布置，取整余量平分到两端。
// 对应二维 TopView.vue 的 rodL / rods / CC_PurlinBraceQty。
export function calculatePurlinTies({ mode, selected = [], purlins, framePositions }: {
  mode: string; selected?: number[]; purlins: number[]; framePositions: number[];
}) {
  const first = purlins[0], last = purlins[purlins.length - 1];
  const length = Math.round(last - first + 2 * FIX.purlinTieEdge);
  const start = first - (length - (last - first)) / 2;
  const rods = [];
  for (let bay = 0; bay < framePositions.length - 1; bay++) {
    const enabled = mode === 'all' || (mode === 'inner' && bay > 0 && bay < framePositions.length - 2) ||
      (mode === 'custom' && selected?.[bay] === 1);
    if (!enabled) continue;
    rods.push({ bay, z: (framePositions[bay] + framePositions[bay + 1]) / 2 });
  }
  return { start, length, rods, count: rods.length };
}

export type PurlinTies = ReturnType<typeof calculatePurlinTies>;
