import type { Section, MemberKey } from './config.ts';
import type { EWLayout, Solution } from './solve.ts';
import type { PostTieRow } from './post-tie-layout.ts';
import type { PurlinTies } from './purlin-tie-layout.ts';
import type { TieJointSpec } from './joint-view-types.ts';

type TieLayout = EWLayout & { postTies: PostTieRow[]; purlinTies: PurlinTies };
type TieSections = Pick<Record<MemberKey, Section>, 'postF' | 'postR' | 'postTie' | 'purlinTie' | 'purlin'>;

import { Matrix4, Vector3 } from 'three';
import { MM, ewMatrix } from './core.ts';

const number = (value: number) => String(Math.round(value * 10) / 10);
const tieBolt = 'M12×35 外六角（双平垫＋弹垫）';
const sectionName = (section: Section) => {
  const thickness = Number.isInteger(section.t) ? section.t.toFixed(1) : String(section.t);
  return section.type === 'L'
    ? `L${section.d}*${section.f}*${thickness}`
    : `C${section.d}*${section.f}*${section.l}*${thickness}`;
};

function postTieSpec(row: PostTieRow | undefined, sections: TieSections, rearSide: boolean): TieJointSpec | null {
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
  // 与 PostTiePart 相同，按选定料长和实际孔距平分两端余量。
  const allowance = (rod.length - holeLength) / 2;
  const ax = -side * (rod.end.z - rod.start.z) / holeLength;
  const ay = (rod.end.y - rod.start.y) / holeLength;
  const endX = ax * allowance, endY = ay * allowance;
  const halfWidth = Math.max(210, Math.abs(endX) + tie.d / 2 + 18);
  const halfHeight = Math.max(175, Math.abs(endY) + tie.d / 2 + 22);
  const labelSide = -side, anchorX = labelSide * (halfWidth + 15);
  // 标注杆端这一小段的腹板，按杆端在螺栓上方或下方安排引线，避免两条线交叉。
  const rodAboveBolt = endY > 0;
  const dimensionOffset = -Math.sign(ax) * (tie.d / 2 + 26);
  // +z 看向选中拉杆贴柱的一面；深度保留整个柱截面及拉杆翼缘、螺栓。
  return {
    matrix, labelSide, anchorX, z: 0, zl: tie.f,
    isoDirection: [labelSide * 0.72, 0.38, 1],
    bay, endAllowance: allowance,
    leaders: [
      [0, halfHeight - 35, halfHeight + (rodAboveBolt ? 10 : -15), `后立柱 ${sectionName(post)} · 第${bay + 1}跨东端`, 0],
      [endX * .65, endY * .65, rodAboveBolt ? 107 : -48, `立柱拉杆 ${sectionName(tie)}`, tie.t],
      [0, 0, rodAboveBolt ? 52 : 22, tieBolt, tie.t + 10],
    ],
    lines: [[0, -halfHeight, 0, halfHeight, 0], [-ax * 160, -ay * 160, ax * (allowance + 12), ay * (allowance + 12), 0]],
    dims: [[0, 0, endX, endY, -ay * dimensionOffset, ax * dimensionOffset, number(allowance)]],
    clipBox: [-halfWidth, halfWidth, -halfHeight, halfHeight, -post.d - 25, tie.f + 30],
  };
}

function purlinTieSpec(solution: Solution, layout: TieLayout, sections: TieSections, rear: boolean): TieJointSpec | null {
  const ties = layout.purlinTies;
  if (!ties?.rods.length || !solution.purlins.length) return null;
  const rod = ties.rods.reduce((east, next) => next.z > east.z ? next : east);
  const t = rear ? solution.purlins[solution.purlins.length - 1] : solution.purlins[0];
  const p = solution.along(t), tie = sections.purlinTie, purlin = sections.purlin;
  const u = new Vector3(solution.c, solution.s, 0), n = new Vector3(-solution.s, solution.c, 0);
  const origin = new Vector3(p.x, p.y, rod.z).multiplyScalar(MM).addScaledVector(n, solution.hBeamTop * MM);
  // 檩条和拉杆都沿东西坡度剪切；此矩阵同时用于标注、取景与裁切，避免施加坡度两次。
  const matrix = ewMatrix(layout.ew).multiply(new Matrix4().makeBasis(u, n, new Vector3(0, 0, 1)).setPosition(origin));
  const endX = rear ? ties.start + ties.length - t : ties.start - t;
  const allowance = Math.abs(endX), depth = tie.type === 'L' ? tie.d : tie.f;
  const flangeZ = (tie.type === 'L' ? tie.f : tie.d) / 2 - tie.t / 2;
  const labelSide = rear ? 1 : -1, anchorX = labelSide * (allowance + 65);
  return {
    matrix, labelSide, anchorX, z: 0, zl: flangeZ,
    isoDirection: [labelSide * 0.9, -0.55, 0.95],
    bay: rod.bay, endAllowance: allowance,
    leaders: [
      [-purlin.f / 2, purlin.d * .65, purlin.d + 32, `檩条 ${sectionName(purlin)} · 第${rod.bay + 1}跨`, 55],
      // 正视时螺母被槽边挡住，引线指向檩条上方的头部；从下方轴测时则指向螺母。
      [0, -tie.t - 10, purlin.d * .28, tieBolt, 0, [0, purlin.t + 6, 0]],
      [endX * .55, -depth + tie.t, -depth - 20, `檩条拉杆 ${sectionName(tie)}，Ø14 通孔`, 0],
    ],
    lines: [[0, -depth - 12, 0, purlin.d + 8, 0], [rear ? -145 : endX - 10, 0, rear ? endX + 10 : 145, 0, 0]],
    dims: [[0, 0, endX, 0, 0, -depth - 38, number(allowance)]],
    clipBox: [rear ? -150 : endX - 18, rear ? endX + 18 : 150, -depth - 18, purlin.d + 5, -140, 140],
  };
}

/**
 * 拉杆节点的局部详图：XY 为标注平面（mm），matrix 将局部米坐标变换到实际模型。
 * 前后侧固定占据 0/1；未安装构件时保留 null，不凭参数生成不存在的连接。
 */
export function createTieJointSpecs(solution: Solution, layout: TieLayout, sections: TieSections) {
  const rearPostTies = layout.postTies?.find(row => row.rear);
  return {
    // 立柱拉杆两侧统一查看后排：前侧为前翼缘的拉杆，后侧为后翼缘的拉杆。
    postTie: [false, true].map(rearSide => postTieSpec(rearPostTies, sections, rearSide)),
    purlinTie: [false, true].map(rear => purlinTieSpec(solution, layout, sections, rear)),
  };
}
