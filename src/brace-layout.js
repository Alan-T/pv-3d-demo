/** 带外斜撑时，前后立柱共用的板型按较宽一侧选定。 */
export function needsSplitBraceConnector(outer, frontWidth, rearWidth = frontWidth) {
  return !!outer && Math.max(frontWidth, rearWidth) >= 140;
}

/** 单块板规格（宽*高*厚，mm）；分装时两块单面板使用同一规格。 */
export function braceConnectorSpec(outer, split, joint, doublePlate) {
  const width = outer && !split ? doublePlate.half * 2 : joint.singleW;
  return `${width}*${joint.plateH}*${joint.plateT}`;
}

/** 二维 112 双立柱的连接孔布局；尺寸和坐标均为 mm，不依赖页面状态。 */
export function braceConnection({ x, y, side, postWidth, outer, split = needsSplitBraceConnector(outer, postWidth), boltOffset, singleBack = 20, rise }) {
  // 分装时保持两块单面板背边不重叠，宽柱继续沿用各自柱边到孔心 50 mm 的布置。
  const plateShift = split ? Math.max(singleBack, postWidth / 2 - 50)
    : outer ? 0 : Math.max(0, Math.ceil((postWidth - 120) / 20)) * 10;
  const offset = boltOffset + plateShift;
  return {
    xc: x, yc: y, side, offset,
    plateShift, split,
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
