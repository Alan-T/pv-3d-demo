// 立柱拉杆计算，尺寸单位 mm。对应二维 TopView.vue 的 calculateXY / postBraceFL / postBraceBL。
// 当前支架为直埋 C 型立柱：抱箍孔距为 0，两端孔心到杆端各 135。
export function postTieHeights({ postLength, embed, strutHeight, slopeHeight = 0 }) {
  const available = postLength - embed - strutHeight - slopeHeight - 200;
  const candidates = [];
  if (available < 250) return { topOffset: available, holeRise: 0 };
  for (let rise = 100; rise <= available - 150; rise += 100) {
    const offset = available - rise;
    if (offset >= 150 && offset <= 300) candidates.push({ topOffset: offset, holeRise: rise });
  }
  if (!candidates.length) {
    const rise = Math.round((available - 300) / 100) * 100;
    return { topOffset: available - rise, holeRise: rise };
  }
  return candidates.reduce((best, next) =>
    Math.abs(next.topOffset - 225) < Math.abs(best.topOffset - 225) ? next : best);
}

export function enabledPostTieSpans(mode, selected, count) {
  return Array.from({ length: count }, (_, index) =>
    mode === 'all' || (mode === 'ends' && (index === 0 || index === count - 1)) ||
    (mode === 'custom' && selected?.[index] === 1));
}

// 每一排、每一跨单独比较一对拉杆。边界±100mm包含在可共用平地料长的范围内。
export function postTieLengths(span, holeRise, slope) {
  const roundLength = distance => Math.round(distance / 10) * 10 + 270;
  const levelLength = roundLength(Math.hypot(span, holeRise));
  const horizontalSpan = span / Math.hypot(1, slope);
  const actualLengths = [1, -1].map(direction =>
    roundLength(Math.hypot(horizontalSpan, direction * holeRise + span * slope)));
  const useLevelLength = actualLengths.every(length => Math.abs(length - levelLength) <= 100);
  return { levelLength, actualLengths, useLevelLength,
    lengths: useLevelLength ? [levelLength, levelLength] : actualLengths };
}

export function calculatePostTies(parameters, solution, layout) {
  const p = parameters, s = solution, { zs, ew } = layout;
  return [false, true].map(rear => {
    const key = rear ? 'R' : 'F';
    const heights = postTieHeights({
      postLength: Math.round(rear ? s.lenR : s.lenF), embed: p.embed,
      strutHeight: rear ? p.braceHR : p.braceHF,
      slopeHeight: rear ? Math.abs(p.span * p.slopeNS / 100) : 0,
    });
    const top = (rear ? s.topR : s.topF) - heights.topOffset;
    const bottom = top - heights.holeRise;
    const valid = heights.topOffset >= 50 && bottom >= (rear ? s.gR : 0) + 50;
    const enabled = enabledPostTieSpans(p['postTie' + key], p['postTieSpans' + key], zs.length - 1);
    const rods = [];
    for (let bay = 0; bay < enabled.length; bay++) {
      if (!enabled[bay] || !valid) continue;
      const span = zs[bay + 1] - zs[bay];
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
          start: { y: y1 + zs[bay] * ew.sa, z: zs[bay] * ew.ca },
          end: { y: y2 + zs[bay + 1] * ew.sa, z: zs[bay + 1] * ew.ca },
        });
      }
    }
    return { rear, x: rear ? s.xr : s.xf, ...heights, top, bottom, valid, enabled, rods };
  });
}
