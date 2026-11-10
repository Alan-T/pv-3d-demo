// 双立柱体系：一套拉杆贯通所有檩条，在每跨中点布置，两端各伸出首末檩条85mm。
// 对应二维 TopView.vue 的 rodL / rods / CC_PurlinBraceQty。
export function calculatePurlinTies({ mode, selected = [], purlins, framePositions }) {
  const first = purlins[0], last = purlins.at(-1);
  const length = Math.round(last - first + 170);
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
