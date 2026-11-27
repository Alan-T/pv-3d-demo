import type { ModelParameters } from '../domain/design-types.ts';
import { fastenerLabel } from '../domain/specs/fastener-spec.ts';
import { FIX, MODULE_MOUNTING, PURLIN_CUT_RULES } from '../config/engineering-rules.ts';
import { CLAMP_PROFILE, getClampSpec } from '../domain/specs/clamp-spec.ts';
import { BRACE_JOINT } from '../domain/specs/brace-connector-spec.ts';
import { DEG } from '../model/geometry/core.ts';
import { createTieJointSpecs } from './tie-joint-spec.ts';

import type { Solution } from '../domain/solve.ts';
import type { createBracket } from '../model/bracket.ts';
import type { PlanarJointSpec, JointSpecs } from '../model/joint-view-types.ts';

type Point = { x: number; y: number };
type LeaderPart = [point: Point, label: string, z?: number];
type BuiltLayout = ReturnType<typeof createBracket>['layout'];
type ClampSpec = ReturnType<typeof getClampSpec>;

interface JointBuildHelpers {
  solution: Solution;
  parameters: ModelParameters;
  layout: BuiltLayout;
  clamp: ClampSpec | null;
  cosTilt: number;
  offsetAlongBeam: (p: Point, du: number, dn: number) => Point;
  beamHeightAt: (p: Point, x: number, h: number) => number;
  segment: (a: Point, b: Point) => [number, number, number, number];
}

function buildFootPlanarJointSpec(sideIndex: number, helpers: JointBuildHelpers): PlanarJointSpec {
  const { solution, layout } = helpers;
  const joint = layout.joints[sideIndex];
  const post = sideIndex ? solution.sections.postR : solution.sections.postF;
  const brace = sideIndex ? solution.sections.braceR : solution.sections.braceF;

  if (joint.o) {
    // 双面连接板：立柱两侧都有斜撑，文字放到外斜撑一侧、连接板下面
    const outerBrace = sideIndex ? solution.sections.braceOR : solution.sections.braceOF;
    const outerJoint = joint.o;
    const plateBottomY = joint.yc - joint.hh;
    const anchorX = joint.xc - joint.side * (joint.extent + 60);
    const outerPlateX = outerJoint.Q.x + joint.side * BRACE_JOINT.boltU;
    const labelY = (k: number) => plateBottomY - 50 - 48 * k;
    return {
      labelSide: -joint.side,
      anchorX,
      leaders: [
        [outerJoint.Q.x + outerJoint.ax * 170, outerJoint.Q.y + outerJoint.ay * 170, labelY(0), `外斜撑 ${outerBrace.name}`],
        [joint.Q.x + joint.ax * 170, joint.Q.y + joint.ay * 170, labelY(1), `斜撑 ${brace.name}`],
        [joint.xc, joint.yTop + 45, labelY(2), `立柱 ${post.name}`],
        [joint.bolts[1][0], joint.bolts[1][1], labelY(3), `${fastenerLabel('foot')} 外六角螺栓及螺母 ×` + joint.bolts.length],
        [outerPlateX - joint.side * 30, joint.yc - 25, labelY(4), `${joint.split ? '两侧单面斜撑连接板' : '双面斜撑连接板'} ${joint.spec}`],
        [outerJoint.Q.x, outerJoint.Q.y, labelY(5), `斜撑孔，孔心到斜撑端头 ${FIX.braceEdge}`],
        [joint.xc, joint.yc - BRACE_JOINT.boltPitch / 2, labelY(6), '两面平垫，螺母侧弹垫；长圆孔'],
      ],
      lines: [
        [joint.xc, plateBottomY - 70, joint.xc, joint.yTop + 130],
        [joint.E.x - joint.ax * 40, joint.E.y - joint.ay * 40, joint.Q.x + joint.ax * 260, joint.Q.y + joint.ay * 260],
        [outerJoint.E.x - outerJoint.ax * 40, outerJoint.E.y - outerJoint.ay * 40, outerJoint.Q.x + outerJoint.ax * 260, outerJoint.Q.y + outerJoint.ay * 260],
      ],
      box: [joint.xc + joint.side * (joint.extent + 160), anchorX, labelY(6) - 30, joint.yTop + 200],
    };
  }

  // 单面连接板：文字放在立柱另一侧
  return {
    labelSide: -joint.side,
    anchorX: joint.xc - joint.side * (post.d / 2 + 50),
    leaders: [
      [joint.Q.x + joint.ax * 170, joint.Q.y + joint.ay * 170, joint.yc + joint.hh + 70, `斜撑 ${brace.name}`],
      [joint.xc, joint.yc + joint.hh + 45, joint.yc + joint.hh + 15, `立柱 ${post.name}`],
      [joint.xc, joint.yc + BRACE_JOINT.boltPitch / 2, joint.yc + 40, `${fastenerLabel('foot')} 外六角螺栓及螺母 ×3`],
      [joint.xc + joint.side * 45, joint.yc + 10, joint.yc - 20, `斜撑连接板 ${joint.spec}`],
      [joint.Q.x, joint.Q.y, joint.yc - 80, `斜撑孔，孔心到斜撑端头 ${FIX.braceEdge}`],
      [joint.xc, joint.yc - BRACE_JOINT.boltPitch / 2, joint.yc - 130, '两面平垫，螺母侧弹垫；长圆孔'],
    ],
    lines: [
      [joint.xc, joint.yc - joint.hh - 70, joint.xc, joint.yc + joint.hh + 130],
      [joint.E.x - joint.ax * 40, joint.E.y - joint.ay * 40, joint.Q.x + joint.ax * 260, joint.Q.y + joint.ay * 260],
    ],
    box: [joint.xc - joint.side * (post.d / 2 + 110), joint.xc + joint.side * (joint.extent + 170), joint.yc - 160, joint.yc + joint.hh + 150],
  };
}

function buildTopPlanarJointSpec(sideIndex: number, helpers: JointBuildHelpers): PlanarJointSpec {
  const { solution, offsetAlongBeam, beamHeightAt, segment } = helpers;
  const post = sideIndex ? solution.sections.postR : solution.sections.postF;
  const node = { x: sideIndex ? solution.xr : solution.xf, y: sideIndex ? solution.nodeR : solution.nodeF };
  const postTopY = sideIndex ? solution.topR : solution.topF;
  const labelSide = sideIndex ? 1 : -1;
  const hole = { x: node.x, y: sideIndex ? solution.holeR : solution.holeF };
  const anchorX = node.x + labelSide * (post.d / 2 + 140);
  const firstLabelY = beamHeightAt(node, anchorX, -solution.hBeamTop) - 45;
  const beamPoint = offsetAlongBeam(node, labelSide * 130, 0);

  return {
    labelSide,
    anchorX,
    leaders: [
      [beamPoint.x, beamPoint.y, firstLabelY, `斜梁 ${solution.sections.beam.name}`],
      [node.x - post.d / 2 + 15, postTopY - 4, firstLabelY - 65, `柱顶平切，孔心距柱顶 ${FIX.postTopHole}`],
      [hole.x, hole.y, firstLabelY - 130, `${fastenerLabel('top')} 外六角螺栓（平垫 + 弹垫）`],
      [hole.x, hole.y - 16, firstLabelY - 195, '立柱上竖向长圆孔'],
      [node.x, node.y - 190, firstLabelY - 260, `立柱 ${post.name}`],
    ],
    lines: [[node.x, node.y - 280, node.x, postTopY + 70], segment(offsetAlongBeam(node, -320, 0), offsetAlongBeam(node, 320, 0))],
    dims: [[node.x, postTopY, hole.x, hole.y, -labelSide * (post.d / 2 + 60), 0, `${FIX.postTopHole}`]],
    box: [node.x - labelSide * 260, anchorX, firstLabelY - 290, postTopY + 90],
  };
}

function buildBraceTopPlanarJointSpec(sideIndex: number, helpers: JointBuildHelpers): PlanarJointSpec {
  const { solution, layout, offsetAlongBeam, beamHeightAt, segment } = helpers;
  const joint = layout.joints[sideIndex];
  const brace = sideIndex ? solution.sections.braceR : solution.sections.braceF;
  const braceTop = joint.T;
  const labelSide = joint.side;
  const anchorX = braceTop.x + labelSide * 260;
  const firstLabelY = beamHeightAt(braceTop, anchorX, -solution.hBeamTop) - 45;
  const end = { x: braceTop.x + joint.ax * joint.eTop, y: braceTop.y + joint.ay * joint.eTop };
  const beamPoint = offsetAlongBeam(braceTop, labelSide * 170, 0);

  return {
    labelSide,
    anchorX,
    leaders: [
      [beamPoint.x, beamPoint.y, firstLabelY, `斜梁 ${solution.sections.beam.name}`],
      [end.x, end.y, firstLabelY - 65, `斜撑端头平切，孔心到端头 ${FIX.braceEdge}`],
      [braceTop.x, braceTop.y, firstLabelY - 130, `${fastenerLabel('btop')} 外六角螺栓（平垫 + 弹垫）`],
      [braceTop.x - joint.ax * 230, braceTop.y - joint.ay * 230, firstLabelY - 195, `斜撑 ${brace.name}`],
    ],
    lines: [
      segment(offsetAlongBeam(braceTop, -340, 0), offsetAlongBeam(braceTop, 340, 0)),
      [braceTop.x + joint.ax * 80, braceTop.y + joint.ay * 80, braceTop.x - joint.ax * 380, braceTop.y - joint.ay * 380],
    ],
    box: [braceTop.x - labelSide * 240, anchorX, firstLabelY - 225, braceTop.y + 140],
  };
}

function buildClipPlanarJointSpec(sideIndex: number, helpers: JointBuildHelpers): PlanarJointSpec {
  const { solution, parameters, layout, clamp, cosTilt, offsetAlongBeam, beamHeightAt, segment } = helpers;
  const { beam, purlin } = solution.sections;
  const clip = layout.purlinClip;
  const purlinOrigin = solution.along(solution.purlins[sideIndex ? solution.purlins.length - 1 : 0]);
  const anchorX = purlinOrigin.x + 220;
  const web = -purlin.f / 2;
  const parts: LeaderPart[] = [
    [offsetAlongBeam(purlinOrigin, 160, solution.hModBot + parameters.modT / 2), `组件 ${parameters.modL}×${parameters.modW}×${parameters.modT}`],
    ...(clamp ? [] : [[offsetAlongBeam(purlinOrigin, 0, solution.hModBot - purlin.t - 4), `${fastenerLabel('module')} 外六角螺栓 + 螺母`]] satisfies LeaderPart[]),
    [offsetAlongBeam(purlinOrigin, web, solution.hBeamTop + 92), `檩条 ${purlin.name}`],
    [offsetAlongBeam(purlinOrigin, web - clip.t / 2, solution.hBeamTop + clip.height - 8), `檩托 ${clip.name}`],
    [offsetAlongBeam(purlinOrigin, web - clip.t, solution.hBeamTop + clip.webBolt), `${fastenerLabel('clipWeb')} 螺栓 ×2（平垫 + 弹垫）`],
    ...(layout.ew.i === 0 ? [[offsetAlongBeam(purlinOrigin, 0, solution.hBeamTop), `${fastenerLabel('purlinBeam')}：檩条下翼缘—斜梁上翼缘`]] satisfies LeaderPart[] : []),
    [offsetAlongBeam(purlinOrigin, -220, 0), `斜梁 ${beam.name}`],
  ];
  const firstLabelY = beamHeightAt(purlinOrigin, anchorX, -solution.hBeamTop) - 35 - 45 * (parts.length - 1);

  return {
    labelSide: 1,
    anchorX,
    leaders: parts.map(([p, text], k) => [p.x, p.y, firstLabelY + 45 * (parts.length - 1 - k), text]),
    lines: [
      segment(offsetAlongBeam(purlinOrigin, -320, 0), offsetAlongBeam(purlinOrigin, 320, 0)),
      segment(offsetAlongBeam(purlinOrigin, 0, solution.hBeamTop - 30), offsetAlongBeam(purlinOrigin, 0, solution.hModBot + parameters.modT + 60)),
    ],
    box: [purlinOrigin.x - 220, anchorX, firstLabelY - 30, purlinOrigin.y + (solution.hModBot + parameters.modT + 70) / cosTilt],
  };
}

function buildModPlanarJointSpec(sideIndex: number, helpers: JointBuildHelpers): PlanarJointSpec {
  const { solution, parameters, layout, clamp, cosTilt, offsetAlongBeam, beamHeightAt, segment } = helpers;
  const { purlin } = solution.sections;
  const purlinOrigin = solution.along(solution.purlins[sideIndex ? solution.purlins.length - 1 : 0]);
  const anchorX = purlinOrigin.x + 70;
  const firstLabelY = beamHeightAt(purlinOrigin, anchorX, solution.hBeamTop) - 35 - 45 * (clamp ? 3 : 2);
  const labelZ = clamp ? layout.gapZ : layout.gapZ - FIX.modGapEW / 2 - MODULE_MOUNTING.boltEdgeInset;
  const top = solution.hModBot + parameters.modT;
  const parts: LeaderPart[] = [
    [offsetAlongBeam(purlinOrigin, 60, top), `组件 ${parameters.modL}×${parameters.modW}×${parameters.modT}，缝 ${FIX.modGapEW}`],
    ...(clamp
      ? [
          [offsetAlongBeam(purlinOrigin, 0, top + CLAMP_PROFILE.mid.top), `中压块 ${clamp.mid.name}`, layout.gapZ - clamp.mid.width / 2 - CLAMP_PROFILE.mid.press / 2],
          [offsetAlongBeam(purlinOrigin, 0, top - CLAMP_PROFILE.mid.floor + 8), `${clamp.bolt.name} 内六角螺栓 + 螺母`],
        ] satisfies LeaderPart[]
      : [[offsetAlongBeam(purlinOrigin, 0, solution.hModBot + MODULE_MOUNTING.frameFlangeThickness + 4), `${fastenerLabel('module')} 外六角螺栓 + 螺母`]] satisfies LeaderPart[]),
    [offsetAlongBeam(purlinOrigin, -purlin.f / 2, solution.hBeamTop + 50), `檩条 ${purlin.name}`],
  ];

  return {
    labelSide: 1,
    anchorX,
    z: layout.gapZ,
    zl: labelZ,
    at: offsetAlongBeam(purlinOrigin, 0, solution.hModBot),
    leaders: parts.map(([p, text, tipZ], k) => [p.x, p.y, firstLabelY + 45 * (parts.length - 1 - k), text, tipZ]),
    lines: [segment(offsetAlongBeam(purlinOrigin, 0, solution.hBeamTop - 30), offsetAlongBeam(purlinOrigin, 0, solution.hModBot + parameters.modT + 60))],
    box: [purlinOrigin.x - 130, anchorX, firstLabelY - 30, purlinOrigin.y + (solution.hModBot + parameters.modT + 70) / cosTilt],
  };
}

function buildSidePlanarJointSpec(sideIndex: number, clamp: ClampSpec, helpers: JointBuildHelpers): PlanarJointSpec {
  const { solution, parameters, layout, cosTilt, offsetAlongBeam, beamHeightAt, segment } = helpers;
  const { purlin } = solution.sections;
  const purlinOrigin = solution.along(solution.purlins[sideIndex ? solution.purlins.length - 1 : 0]);
  const anchorX = purlinOrigin.x + 70;
  const firstLabelY = beamHeightAt(purlinOrigin, anchorX, solution.hBeamTop) - 35 - 45 * 3;
  const edgeProfile = CLAMP_PROFILE.side;
  const arrayEdgeZ = layout.arrW / 2;
  const top = solution.hModBot + parameters.modT;
  const boltZ = arrayEdgeZ + (edgeProfile.wall + edgeProfile.w - (edgeProfile.foot + edgeProfile.stem) / 2 + edgeProfile.stem) / 2;
  const parts: LeaderPart[] = [
    [offsetAlongBeam(purlinOrigin, 60, top), `组件 ${parameters.modL}×${parameters.modW}×${parameters.modT}`, arrayEdgeZ - 60],
    [offsetAlongBeam(purlinOrigin, 0, solution.hModBot + clamp.edge.height), `边压块 ${clamp.edge.name}`, arrayEdgeZ + edgeProfile.wall / 2],
    [offsetAlongBeam(purlinOrigin, 0, top - edgeProfile.floor + 8), `${clamp.bolt.name} 内六角螺栓 + 螺母`],
    [offsetAlongBeam(purlinOrigin, -purlin.f / 2, solution.hBeamTop + 50), `檩条 ${purlin.name}，伸出组件 ${layout.purlinExt}`],
  ];

  return {
    labelSide: 1,
    anchorX,
    z: boltZ,
    zl: boltZ,
    at: offsetAlongBeam(purlinOrigin, 0, solution.hModBot),
    leaders: parts.map(([p, text, tipZ], k) => [p.x, p.y, firstLabelY + 45 * (parts.length - 1 - k), text, tipZ]),
    lines: [segment(offsetAlongBeam(purlinOrigin, 0, solution.hBeamTop - 30), offsetAlongBeam(purlinOrigin, 0, top + 60))],
    box: [purlinOrigin.x - 130, anchorX, firstLabelY - 30, purlinOrigin.y + (top + 70) / cosTilt],
  };
}

function buildSplicePlanarJointSpec(sideIndex: number, helpers: JointBuildHelpers): PlanarJointSpec {
  const { solution, layout, offsetAlongBeam, segment } = helpers;
  const { purlin } = solution.sections;
  const splice = layout.purlinConnector!;
  const purlinOrigin = solution.along(solution.purlins[sideIndex ? solution.purlins.length - 1 : 0]);
  const z = layout.cuts.positions.at(-1) || 0;
  const webCenter = offsetAlongBeam(purlinOrigin, -purlin.f / 2, solution.hBeamTop + purlin.d / 2);
  const anchorX = webCenter.x + 210;
  const upperLip = offsetAlongBeam(webCenter, purlin.f - purlin.t / 2, purlin.d / 2 - purlin.l / 2);
  const lowerLip = offsetAlongBeam(webCenter, purlin.f - purlin.t / 2, -purlin.d / 2 + purlin.l / 2);
  const connectorBottom = offsetAlongBeam(webCenter, 8, -splice.d / 2);
  const lowerBolt = offsetAlongBeam(webCenter, splice.flangeHoleOffset - splice.t, -splice.d / 2 - 8);

  return {
    labelSide: 1,
    anchorX,
    z,
    zl: z,
    at: webCenter,
    leaders: [
      [upperLip.x, upperLip.y, webCenter.y + 100, '檩条 1 ' + purlin.name],
      [webCenter.x, webCenter.y, webCenter.y + 45, `檩条接缝 ${PURLIN_CUT_RULES.gap} mm`],
      [lowerLip.x, lowerLip.y, webCenter.y - 10, '檩条 2 ' + purlin.name],
      [connectorBottom.x, connectorBottom.y, webCenter.y - 65, splice.name + ' 连接件'],
      [lowerBolt.x, lowerBolt.y, webCenter.y - 120, `${fastenerLabel('splice')} ×8（两面平垫，螺母侧弹垫）`],
    ],
    // 接缝中心处的法线，沿组件法向贯穿檩条截面，上下各伸出 40 mm。
    lines: [[...segment(offsetAlongBeam(webCenter, 0, -purlin.d / 2 - 40), offsetAlongBeam(webCenter, 0, purlin.d / 2 + 40)), z]],
    box: [webCenter.x - 160, anchorX, webCenter.y - 170, webCenter.y + 130],
  };
}

/** 生成前后两侧的节点详图规格与默认标注平面（mm）。 */
export function buildJointSpecs(parameters: ModelParameters, solution: Solution, layout: BuiltLayout) {
  const clamp = parameters.fix === 'clamp' ? getClampSpec(parameters.modT, parameters.clampL) : null;
  const eastFrameZ = layout.zs[layout.zs.length - 1];
  const labelPlaneZ = eastFrameZ + solution.sections.postF.f / 2 + solution.sections.beam.f + 20; // 标注平面：在斜梁翼缘外侧
  const tanTilt = Math.tan(parameters.tilt * DEG);
  const cosTilt = Math.cos(parameters.tilt * DEG);

  const helpers: JointBuildHelpers = {
    solution,
    parameters,
    layout,
    clamp,
    cosTilt,
    offsetAlongBeam: (p, du, dn) => ({ x: p.x + solution.c * du - solution.s * dn, y: p.y + solution.s * du + solution.c * dn }),
    beamHeightAt: (p, x, h) => p.y + (x - p.x) * tanTilt + h / cosTilt,
    segment: (a, b) => [a.x, a.y, b.x, b.y],
  };

  const specs: JointSpecs = {
    foot: [],
    top: [],
    btop: [],
    clip: [],
    mod: [],
    side: [],
    splice: [],
    ...createTieJointSpecs(solution, layout, solution.sections),
  };

  for (const sideIndex of [0, 1]) {
    specs.foot.push(buildFootPlanarJointSpec(sideIndex, helpers));
    specs.top.push(buildTopPlanarJointSpec(sideIndex, helpers));
    specs.btop.push(buildBraceTopPlanarJointSpec(sideIndex, helpers));
    specs.clip.push(buildClipPlanarJointSpec(sideIndex, helpers));
    specs.mod.push(buildModPlanarJointSpec(sideIndex, helpers));
    if (clamp) specs.side.push(buildSidePlanarJointSpec(sideIndex, clamp, helpers));
  }
  if (layout.purlinConnector) {
    for (const sideIndex of [0, 1]) specs.splice.push(buildSplicePlanarJointSpec(sideIndex, helpers));
  }

  return { specs, labelPlaneZ };
}
