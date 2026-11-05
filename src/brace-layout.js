/** 二维 112 双立柱的连接孔布局；尺寸和坐标均为 mm，不依赖页面状态。 */
export function braceConnection({ x, y, side, postWidth, outer, boltOffset, rise }) {
  const holeSpacing = outer
    ? (postWidth < 140 ? 240 : postWidth + 140)
    : 240 + Math.max(0, Math.ceil((postWidth - 120) / 20)) * 20;
  const offset = holeSpacing / 2;
  return {
    xc: x, yc: y, side, offset,
    plateShift: offset - boltOffset,
    split: !!outer && postWidth >= 140,
    Q: { x: x + side * offset, y: y + rise },
    Qo: outer ? { x: x - side * offset, y: y + rise } : null,
  };
}

/** 两端孔心各外伸 edge；保留几何精度，显示/出料时再四舍五入。 */
export function braceMember(Q, T, edge) {
  const holeLength = Math.hypot(T.x - Q.x, T.y - Q.y);
  if (holeLength <= 0) throw new RangeError('斜撑上下安装孔不能重合');
  const ax = (T.x - Q.x) / holeLength, ay = (T.y - Q.y) / holeLength;
  const E = { x: Q.x - ax * edge, y: Q.y - ay * edge };
  const end = { x: T.x + ax * edge, y: T.y + ay * edge };
  return { Q, T, E, end, ax, ay, eTop: edge, len: holeLength + 2 * edge };
}
