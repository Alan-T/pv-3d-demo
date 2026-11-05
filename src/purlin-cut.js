// All distances are in millimetres. Candidate positions are measured from
// the west end; returned positions use the array centre as their origin.
const CUT = {
  step: 50,
  gap: 4,
  minFrameDistance: 300,
  maxFrameDistance: 1000,
  fixtureClearance: 300,
  minJointSpacing: 400,
  extraSegments: 20,
  moduleGap: 20,
  boltInset: 18,
};

function fixturePositions(params, gaps, width) {
  if (params.fix === 'clamp') return [...gaps, -width / 2, width / 2];
  return Array.from({ length: params.cols }, (_, column) => {
    const start = -width / 2 + column * (params.modW + CUT.moduleGap);
    return [start + CUT.boltInset, start + params.modW - CUT.boltInset];
  }).flat();
}

function jointCandidates(total, posts, fixtures) {
  const candidates = [];
  for (let offset = CUT.step; offset < total; offset += CUT.step) {
    const position = offset - total / 2;
    const frameDistance = Math.min(...posts.map(post => Math.abs(position - post)));
    const clearsFrames = frameDistance >= CUT.minFrameDistance && frameDistance <= CUT.maxFrameDistance;
    const clearsFixtures = fixtures.every(fixture => Math.abs(position - fixture) >= CUT.fixtureClearance);
    if (clearsFrames && clearsFixtures) candidates.push(offset);
  }
  return candidates;
}

// Keep the least-cost path ending at each candidate for the current joint.
function findPath(candidates, total, maxLength, segmentCount) {
  const targetLength = total / segmentCount;
  let states = [{ offset: 0, cost: 0, path: [] }];
  for (let joint = 1; joint < segmentCount && states.length; joint++) {
    const next = [];
    for (const offset of candidates) {
      let best;
      for (const previous of states) {
        const spacing = offset - previous.offset;
        const length = spacing - (joint === 1 ? CUT.gap / 2 : CUT.gap);
        if (length <= 0 || length > maxLength) continue;
        if (joint > 1 && spacing < CUT.minJointSpacing) continue;
        const cost = previous.cost + (length - targetLength) ** 2;
        if (!best || cost < best.cost) {
          best = { offset, cost, path: [...previous.path, offset] };
        }
      }
      if (best) next.push(best);
    }
    states = next;
  }

  const lastLength = state => total - state.offset - CUT.gap / 2;
  const valid = states.filter(state => lastLength(state) > 0 && lastLength(state) <= maxLength);
  const totalCost = state => state.cost + (lastLength(state) - targetLength) ** 2;
  valid.sort((a, b) => totalCost(a) - totalCost(b));
  return valid[0]?.path;
}

function segmentsFromPath(path, total) {
  const halfLength = total / 2;
  const positions = path.map(offset => offset - halfLength);
  const segments = [];
  let start = -halfLength;
  for (const position of positions) {
    segments.push({ start, length: position - CUT.gap / 2 - start });
    start = position + CUT.gap / 2;
  }
  segments.push({ start, length: halfLength - start });
  return { valid: true, positions, segments };
}

export function cutPurlin(params, total, posts, gaps, width) {
  const maxLength = Number(params.maxPurlin);
  const fallback = { valid: false, positions: [], segments: [{ start: -total / 2, length: total }] };
  if (!(maxLength > 0)) return fallback;
  if (total <= maxLength) return { ...fallback, valid: true };

  const fixtures = fixturePositions(params, gaps, width);
  const candidates = jointCandidates(total, posts, fixtures);
  const minimumSegments = Math.ceil(total / maxLength);
  const maximumSegments = Math.min(candidates.length + 1, minimumSegments + CUT.extraSegments);
  for (let count = minimumSegments; count <= maximumSegments; count++) {
    const path = findPath(candidates, total, maxLength, count);
    if (path) return segmentsFromPath(path, total);
  }
  return fallback;
}
