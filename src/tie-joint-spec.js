import { Matrix4, Vector3 } from 'three';
import { MM, ewMatrix } from './core.js';

const number = value => String(Math.round(value * 10) / 10);
const sectionName = section => {
  const thickness = Number.isInteger(section.t) ? section.t.toFixed(1) : String(section.t);
  return section.type === 'L'
    ? `L${section.d}*${section.f}*${thickness}`
    : `C${section.d}*${section.f}*${section.l}*${thickness}`;
};

function postTieSpec(row, sections, rearSide) {
  if (!row?.rods.length) return null;
  const desiredSide = rearSide ? 1 : -1;
  const bay = Math.max(...row.rods.map(rod => rod.bay));
  const rods = row.rods.filter(rod => rod.bay === bay);
  const rod = rods.find(item => item.direction === desiredSide) ?? rods[0];
  const side = rod.direction, post = row.rear ? sections.postR : sections.postF;
  const tie = sections.postTie;
  const origin = new Vector3(row.x + side * post.d / 2, rod.end.y, rod.end.z).multiplyScalar(MM);
  const right = new Vector3(0, 0, -side), up = new Vector3(0, 1, 0), outward = new Vector3(side, 0, 0);
  const matrix = new Matrix4().makeBasis(right, up, outward).setPosition(origin);
  const holeLength = Math.hypot(rod.end.y - rod.start.y, rod.end.z - rod.start.z);
  // 与 PostTiePart 相同：下料取整余量平分到两端，不能把图纸的 135 当作实际端距。
  const allowance = (rod.length - holeLength) / 2;
  const ax = -side * (rod.end.z - rod.start.z) / holeLength;
  const ay = (rod.end.y - rod.start.y) / holeLength;
  const endX = ax * allowance, endY = ay * allowance;
  const labelSide = -side, anchorX = labelSide * (Math.max(180, Math.abs(endX) + 45));
  const halfWidth = Math.max(260, Math.abs(endX) + 45);
  const halfHeight = Math.max(230, Math.abs(endY) + 80);
  // +z 看向选中拉杆贴柱的一面；深度保留整个柱截面及拉杆翼缘、螺栓。
  return {
    matrix, labelSide, anchorX, z: 0, zl: tie.f + 20,
    isoDirection: [labelSide * 0.45, 0.3, 1],
    bay, endAllowance: allowance,
    leaders: [
      [0, 170, 180, `立柱 ${sectionName(post)}`, -post.t / 2],
      [-ax * 170, -ay * 170, 120, `立柱拉杆 ${sectionName(tie)}`, tie.t],
      [0, 0, 60, 'M12×35 外六角螺栓', tie.t + 6],
      [0, 0, 0, '两面平垫，螺母侧弹垫', -post.t - 3],
      [endX, endY, -60, `第 ${bay + 1} 跨东端，端距 ${number(allowance)} mm`, tie.t],
    ],
    lines: [[0, -halfHeight, 0, halfHeight, 0], [-ax * 240, -ay * 240, ax * (allowance + 30), ay * (allowance + 30), 0]],
    dims: [[0, 0, endX, endY, -ay * 65, ax * 65, number(allowance)]],
    box: [-halfWidth, halfWidth, -halfHeight, halfHeight],
    clipBox: [-halfWidth, halfWidth, -halfHeight, halfHeight, -post.d - 25, tie.f + 30],
  };
}

function purlinTieSpec(solution, layout, sections, rear) {
  const ties = layout.purlinTies;
  if (!ties?.rods.length || !solution.purlins.length) return null;
  const rod = ties.rods.reduce((east, next) => next.z > east.z ? next : east);
  const t = rear ? solution.purlins.at(-1) : solution.purlins[0];
  const p = solution.along(t), tie = sections.purlinTie, purlin = sections.purlin;
  const u = new Vector3(solution.c, solution.s, 0), n = new Vector3(-solution.s, solution.c, 0);
  const origin = new Vector3(p.x, p.y, rod.z).multiplyScalar(MM).addScaledVector(n, solution.hBeamTop * MM);
  // 檩条和拉杆都沿东西坡度剪切；此矩阵同时用于标注、取景与裁切，避免施加坡度两次。
  const matrix = ewMatrix(layout.ew).multiply(new Matrix4().makeBasis(u, n, new Vector3(0, 0, 1)).setPosition(origin));
  const endX = rear ? ties.start + ties.length - t : ties.start - t;
  const allowance = Math.abs(endX), depth = tie.type === 'L' ? tie.d : tie.f;
  const flangeZ = (tie.type === 'L' ? tie.f : tie.d) / 2 - tie.t / 2;
  const labelSide = rear ? 1 : -1, anchorX = labelSide * Math.max(210, allowance + 80);
  const yTop = purlin.d + 55, yBottom = Math.min(-depth - 100, purlin.d - 240);
  return {
    matrix, labelSide, anchorX, z: 0, zl: Math.max(60, flangeZ + 25),
    isoDirection: [0.6, -0.85, 1],
    bay: rod.bay, endAllowance: allowance,
    leaders: [
      [-purlin.f / 2, purlin.d / 2, purlin.d + 30, `檩条 ${sectionName(purlin)}`, 0],
      [-labelSide * 110, -depth / 2, purlin.d - 20, `檩条拉杆 ${sectionName(tie)}`, flangeZ],
      [0, purlin.t + 6, purlin.d - 70, 'M12×35，两面平垫、弹垫', 0],
      [0, 0, purlin.d - 120, 'Ø14 通孔，螺母位于拉杆下方', 0],
      [endX, -tie.t / 2, purlin.d - 170, `第 ${rod.bay + 1} 跨，端距 ${number(allowance)} mm`, 0],
    ],
    lines: [[0, -depth - 25, 0, purlin.d + 25, 0], [Math.min(endX, -140), 0, Math.max(endX, 140), 0, 0]],
    dims: [[0, 0, endX, 0, 0, -depth - 55, number(allowance)]],
    box: [Math.min(-240, anchorX - 20), Math.max(240, anchorX + 20), yBottom, yTop],
    clipBox: [rear ? -230 : endX - 35, rear ? endX + 35 : 230, -depth - 35, purlin.d + 40, -110, 110],
  };
}

/**
 * 拉杆节点的局部详图：XY 为标注平面（mm），matrix 将局部米坐标变换到实际模型。
 * 前后侧固定占据 0/1；未安装构件时保留 null，不凭参数生成不存在的连接。
 */
export function createTieJointSpecs(solution, layout, sections) {
  const rearPostTies = layout.postTies?.find(row => row.rear);
  return {
    // 立柱拉杆两侧统一查看后排：前侧为前翼缘的拉杆，后侧为后翼缘的拉杆。
    postTie: [false, true].map(rearSide => postTieSpec(rearPostTies, sections, rearSide)),
    purlinTie: [false, true].map(rear => purlinTieSpec(solution, layout, sections, rear)),
  };
}
