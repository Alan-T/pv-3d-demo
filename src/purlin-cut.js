// 与二维 TopView 自动切割保持一致。搜索坐标从檩条西端起算，输出以阵列中心为原点，单位 mm。
const CUT = {
  step: 50,
  gap: 4,
  minFrameDistance: 300,
  maxFrameDistance: 1000,
  fixtureClearance: 300,
  moduleGap: 20,
  maxAdjustAttempts: 400,
  maxRecalcAttempts: 5,
};

// 二维 pClamps：两种固定方式均按组件缝避让，包含首块组件前方的虚拟缝。
function fixturePositions(params, total, width) {
  const start = (total - width) / 2 - CUT.moduleGap / 2;
  return Array.from({ length: params.cols }, (_, i) => start + i * (params.modW + CUT.moduleGap));
}

function validJoint(position, posts, fixtures) {
  const nearFrame = posts.some(post => {
    const distance = Math.abs(position - post);
    return distance >= CUT.minFrameDistance && distance <= CUT.maxFrameDistance;
  });
  return nearFrame && fixtures.every(fixture => Math.abs(position - fixture) >= CUT.fixtureClearance);
}

function adjustJoint(initial, total, posts, fixtures) {
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

function segmentsFromPositions(offsets, total) {
  const positions = offsets.map(offset => offset - total / 2);
  const segments = [];
  let start = -total / 2;
  for (const position of positions) {
    segments.push({ start, length: position - CUT.gap / 2 - start });
    start = position + CUT.gap / 2;
  }
  segments.push({ start, length: total / 2 - start });
  return { valid: true, positions, segments };
}

export function cutPurlin(params, total, posts, width) {
  const maxLength = Number(params.maxPurlin);
  const fallback = { valid: false, positions: [], segments: [{ start: -total / 2, length: total }] };
  if (!Number.isFinite(maxLength) || maxLength <= 0 || !Number.isFinite(total) || total <= 0) return fallback;
  if (total <= maxLength) return { ...fallback, valid: true };

  const framePositions = posts.map(post => post + total / 2);
  const fixtures = fixturePositions(params, total, width);
  const minimumCount = Math.ceil(total / maxLength);
  for (let retry = 0; retry < CUT.maxRecalcAttempts; retry++) {
    const count = minimumCount + retry;
    const defaultLength = Math.round(total / count / 100) * 100;
    const offsets = [];
    for (let i = 1; i < count; i++) {
      const initial = i === 1 ? defaultLength + CUT.gap / 2 : i * (defaultLength + CUT.gap) - CUT.gap / 2;
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
