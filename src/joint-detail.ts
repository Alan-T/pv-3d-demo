import { mats, DimSet } from './dims.ts';
import { FIX } from './config.ts';
import { P } from './model-parameters.ts';
import { CLAMP_PROFILE, getClampSpec } from './clamp-spec.ts';
import { BRACE_JOINT } from './brace-connector-spec.ts';
import { V, V3, MM, DEG, ewPlace, track } from './core.ts';
import * as THREE from 'three';
import { createTieJointSpecs } from './tie-joint-spec.ts';

import type { Solution } from './solve.ts';
import type { getBuiltState } from './core.ts';
import type { PlanarJointSpec, JointSpecs, JointType } from './joint-view-types.ts';

type Point = { x: number; y: number };
type LeaderPart = [point: Point, label: string, z?: number];
type BuiltLayout = ReturnType<typeof getBuiltState>['layout'];
type ClampSpec = ReturnType<typeof getClampSpec>;

interface JointBuildHelpers {
  S: Solution;
  layout: BuiltLayout;
  clamp: ClampSpec | null;
  cosT: number;
  mv: (p: Point, du: number, dn: number) => Point;
  beamY: (p: Point, x: number, h: number) => number;
  seg2: (a: Point, b: Point) => [number, number, number, number];
}

// 全局剖切也会裁掉随镜头转向的文字精灵。仅为本节点的标注使用独立材质，
// 去掉片元剖切，保留模型剖切和其他节点的材质设置。
function keepAnnotationsUnclipped(group: THREE.Group) {
  const materials = new Map<THREE.Material, THREE.Material>();
  group.traverse((object) => {
    if (!(object instanceof THREE.Line || object instanceof THREE.Sprite) || Array.isArray(object.material)) return;
    const original: THREE.Material = object.material;
    if (!materials.has(original)) {
      const material = track(original.clone());
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '');
      };
      material.customProgramCacheKey = () => 'unclipped-joint-annotation';
      materials.set(original, material);
    }
    object.material = materials.get(original)!;
  });
}

function addLeader(segments: DimSet, tip: THREE.Vector3, anchor: THREE.Vector3) {
  const axis = anchor.clone().sub(tip).normalize().multiplyScalar(0.012);
  const wing = new V3(-axis.y, axis.x, 0).multiplyScalar(0.4);
  segments.seg(tip, anchor);
  segments.seg(tip, tip.clone().add(axis).add(wing));
  segments.seg(tip, tip.clone().add(axis).sub(wing));
}

function buildFootPlanarJointSpec(fr: number, { S, layout }: JointBuildHelpers): PlanarJointSpec {
  const J = layout.joints[fr];
  const post = fr ? S.sections.postR : S.sections.postF;
  const brace = fr ? S.sections.braceR : S.sections.braceF;

  if (J.o) {
    // 双面连接板：立柱两侧都有斜撑，文字放到外斜撑一侧、连接板下面
    const outerBrace = fr ? S.sections.braceOR : S.sections.braceOF;
    const o = J.o;
    const yBot = J.yc - J.hh;
    const ax = J.xc - J.side * (J.extent + 60);
    const outerPlateX = o.Q.x + J.side * BRACE_JOINT.boltU;
    const ly = (k: number) => yBot - 50 - 48 * k;
    return {
      labelSide: -J.side,
      anchorX: ax,
      leaders: [
        [o.Q.x + o.ax * 170, o.Q.y + o.ay * 170, ly(0), `外斜撑 ${outerBrace.name}`],
        [J.Q.x + J.ax * 170, J.Q.y + J.ay * 170, ly(1), `斜撑 ${brace.name}`],
        [J.xc, J.yTop + 45, ly(2), `立柱 ${post.name}`],
        [J.bolts[1][0], J.bolts[1][1], ly(3), 'M12×35 外六角螺栓及螺母 ×' + J.bolts.length],
        [outerPlateX - J.side * 30, J.yc - 25, ly(4), `${J.split ? '两侧单面斜撑连接板' : '双面斜撑连接板'} ${J.spec}`],
        [o.Q.x, o.Q.y, ly(5), `斜撑孔，孔心到斜撑端头 ${FIX.braceEdge}`],
        [J.xc, J.yc - BRACE_JOINT.boltPitch / 2, ly(6), '两面平垫，螺母侧弹垫；长圆孔'],
      ],
      lines: [
        [J.xc, yBot - 70, J.xc, J.yTop + 130],
        [J.E.x - J.ax * 40, J.E.y - J.ay * 40, J.Q.x + J.ax * 260, J.Q.y + J.ay * 260],
        [o.E.x - o.ax * 40, o.E.y - o.ay * 40, o.Q.x + o.ax * 260, o.Q.y + o.ay * 260],
      ],
      box: [J.xc + J.side * (J.extent + 160), ax, ly(6) - 30, J.yTop + 200],
    };
  }

  // 单面连接板：文字放在立柱另一侧
  return {
    labelSide: -J.side,
    anchorX: J.xc - J.side * (post.d / 2 + 50),
    leaders: [
      [J.Q.x + J.ax * 170, J.Q.y + J.ay * 170, J.yc + J.hh + 70, `斜撑 ${brace.name}`],
      [J.xc, J.yc + J.hh + 45, J.yc + J.hh + 15, `立柱 ${post.name}`],
      [J.xc, J.yc + BRACE_JOINT.boltPitch / 2, J.yc + 40, 'M12×35 外六角螺栓及螺母 ×3'],
      [J.xc + J.side * 45, J.yc + 10, J.yc - 20, `斜撑连接板 ${J.spec}`],
      [J.Q.x, J.Q.y, J.yc - 80, `斜撑孔，孔心到斜撑端头 ${FIX.braceEdge}`],
      [J.xc, J.yc - BRACE_JOINT.boltPitch / 2, J.yc - 130, '两面平垫，螺母侧弹垫；长圆孔'],
    ],
    lines: [
      [J.xc, J.yc - J.hh - 70, J.xc, J.yc + J.hh + 130],
      [J.E.x - J.ax * 40, J.E.y - J.ay * 40, J.Q.x + J.ax * 260, J.Q.y + J.ay * 260],
    ],
    box: [J.xc - J.side * (post.d / 2 + 110), J.xc + J.side * (J.extent + 170), J.yc - 160, J.yc + J.hh + 150],
  };
}

function buildTopPlanarJointSpec(fr: number, { S, mv, beamY, seg2 }: JointBuildHelpers): PlanarJointSpec {
  const post = fr ? S.sections.postR : S.sections.postF;
  const node = { x: fr ? S.xr : S.xf, y: fr ? S.nodeR : S.nodeF };
  const ty = fr ? S.topR : S.topF;
  const ls = fr ? 1 : -1;
  const hole = { x: node.x, y: fr ? S.holeR : S.holeF };
  const ax = node.x + ls * (post.d / 2 + 140);
  const y0 = beamY(node, ax, -S.hBeamTop) - 45;
  const bp = mv(node, ls * 130, 0);

  return {
    labelSide: ls,
    anchorX: ax,
    leaders: [
      [bp.x, bp.y, y0, `斜梁 ${S.sections.beam.name}`],
      [node.x - post.d / 2 + 15, ty - 4, y0 - 65, `柱顶平切，孔心距柱顶 ${FIX.postTopHole}`],
      [hole.x, hole.y, y0 - 130, 'M16×40 外六角螺栓（平垫 + 弹垫）'],
      [hole.x, hole.y - 16, y0 - 195, '立柱上竖向长圆孔'],
      [node.x, node.y - 190, y0 - 260, `立柱 ${post.name}`],
    ],
    lines: [[node.x, node.y - 280, node.x, ty + 70], seg2(mv(node, -320, 0), mv(node, 320, 0))],
    dims: [[node.x, ty, hole.x, hole.y, -ls * (post.d / 2 + 60), 0, `${FIX.postTopHole}`]],
    box: [node.x - ls * 260, ax, y0 - 290, ty + 90],
  };
}

function buildBraceTopPlanarJointSpec(fr: number, { S, layout, mv, beamY, seg2 }: JointBuildHelpers): PlanarJointSpec {
  const J = layout.joints[fr];
  const brace = fr ? S.sections.braceR : S.sections.braceF;
  const T = J.T;
  const ls = J.side;
  const ax = T.x + ls * 260;
  const y0 = beamY(T, ax, -S.hBeamTop) - 45;
  const end = { x: T.x + J.ax * J.eTop, y: T.y + J.ay * J.eTop };
  const bp = mv(T, ls * 170, 0);

  return {
    labelSide: ls,
    anchorX: ax,
    leaders: [
      [bp.x, bp.y, y0, `斜梁 ${S.sections.beam.name}`],
      [end.x, end.y, y0 - 65, `斜撑端头平切，孔心到端头 ${FIX.braceEdge}`],
      [T.x, T.y, y0 - 130, 'M12×35 外六角螺栓（平垫 + 弹垫）'],
      [T.x - J.ax * 230, T.y - J.ay * 230, y0 - 195, `斜撑 ${brace.name}`],
    ],
    lines: [
      seg2(mv(T, -340, 0), mv(T, 340, 0)),
      [T.x + J.ax * 80, T.y + J.ay * 80, T.x - J.ax * 380, T.y - J.ay * 380],
    ],
    box: [T.x - ls * 240, ax, y0 - 225, T.y + 140],
  };
}

function buildClipPlanarJointSpec(fr: number, { S, layout, clamp, cosT, mv, beamY, seg2 }: JointBuildHelpers): PlanarJointSpec {
  const { beam, purlin } = S.sections;
  const CLIP = layout.purlinClip;
  const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]);
  const ax = P0.x + 220;
  const web = -purlin.f / 2;
  const parts: LeaderPart[] = [
    [mv(P0, 160, S.hModBot + P.modT / 2), `组件 ${P.modL}×${P.modW}×${P.modT}`],
    ...(clamp ? [] : [[mv(P0, 0, S.hModBot - purlin.t - 4), 'M8×22 外六角螺栓 + 螺母']] satisfies LeaderPart[]),
    [mv(P0, web, S.hBeamTop + 92), `檩条 ${purlin.name}`],
    [mv(P0, web - CLIP.t / 2, S.hBeamTop + CLIP.height - 8), `檩托 ${CLIP.name}`],
    [mv(P0, web - CLIP.t, S.hBeamTop + CLIP.webBolt), 'M12×35 螺栓 ×2（平垫 + 弹垫）'],
    ...(layout.ew.i === 0 ? [[mv(P0, 0, S.hBeamTop), 'M12×35：檩条下翼缘—斜梁上翼缘']] satisfies LeaderPart[] : []),
    [mv(P0, -220, 0), `斜梁 ${beam.name}`],
  ];
  const yLow = beamY(P0, ax, -S.hBeamTop) - 35 - 45 * (parts.length - 1);

  return {
    labelSide: 1,
    anchorX: ax,
    leaders: parts.map(([p, text], k) => [p.x, p.y, yLow + 45 * (parts.length - 1 - k), text]),
    lines: [seg2(mv(P0, -320, 0), mv(P0, 320, 0)), seg2(mv(P0, 0, S.hBeamTop - 30), mv(P0, 0, S.hModBot + P.modT + 60))],
    box: [P0.x - 220, ax, yLow - 30, P0.y + (S.hModBot + P.modT + 70) / cosT],
  };
}

function buildModPlanarJointSpec(fr: number, { S, layout, clamp, cosT, mv, beamY, seg2 }: JointBuildHelpers): PlanarJointSpec {
  const { purlin } = S.sections;
  const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]);
  const ax = P0.x + 70;
  const yLow = beamY(P0, ax, S.hBeamTop) - 35 - 45 * (clamp ? 3 : 2);
  const zl = clamp ? layout.gapZ : layout.gapZ - FIX.modGapEW / 2 - 18;
  const top = S.hModBot + P.modT;
  const parts: LeaderPart[] = [
    [mv(P0, 60, top), `组件 ${P.modL}×${P.modW}×${P.modT}，缝 ${FIX.modGapEW}`],
    ...(clamp
      ? [
          [mv(P0, 0, top + CLAMP_PROFILE.mid.top), `中压块 ${clamp.mid.name}`, layout.gapZ - clamp.mid.width / 2 - CLAMP_PROFILE.mid.press / 2],
          [mv(P0, 0, top - CLAMP_PROFILE.mid.floor + 8), `${clamp.bolt.name} 内六角螺栓 + 螺母`],
        ] satisfies LeaderPart[]
      : [[mv(P0, 0, S.hModBot + 2 + 4), 'M8×22 外六角螺栓 + 螺母']] satisfies LeaderPart[]),
    [mv(P0, -purlin.f / 2, S.hBeamTop + 50), `檩条 ${purlin.name}`],
  ];

  return {
    labelSide: 1,
    anchorX: ax,
    z: layout.gapZ,
    zl,
    at: mv(P0, 0, S.hModBot),
    leaders: parts.map(([p, text, pz], k) => [p.x, p.y, yLow + 45 * (parts.length - 1 - k), text, pz]),
    lines: [seg2(mv(P0, 0, S.hBeamTop - 30), mv(P0, 0, S.hModBot + P.modT + 60))],
    box: [P0.x - 130, ax, yLow - 30, P0.y + (S.hModBot + P.modT + 70) / cosT],
  };
}

function buildSidePlanarJointSpec(fr: number, clamp: ClampSpec, { S, layout, cosT, mv, beamY, seg2 }: JointBuildHelpers): PlanarJointSpec {
  const { purlin } = S.sections;
  const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]);
  const ax = P0.x + 70;
  const yLow = beamY(P0, ax, S.hBeamTop) - 35 - 45 * 3;
  const Sd = CLAMP_PROFILE.side;
  const e = layout.arrW / 2;
  const top = S.hModBot + P.modT;
  const zb = e + (Sd.wall + Sd.w - (Sd.foot + Sd.stem) / 2 + Sd.stem) / 2;
  const parts: LeaderPart[] = [
    [mv(P0, 60, top), `组件 ${P.modL}×${P.modW}×${P.modT}`, e - 60],
    [mv(P0, 0, S.hModBot + clamp.edge.height), `边压块 ${clamp.edge.name}`, e + Sd.wall / 2],
    [mv(P0, 0, top - Sd.floor + 8), `${clamp.bolt.name} 内六角螺栓 + 螺母`],
    [mv(P0, -purlin.f / 2, S.hBeamTop + 50), `檩条 ${purlin.name}，伸出组件 ${layout.purlinExt}`],
  ];

  return {
    labelSide: 1,
    anchorX: ax,
    z: zb,
    zl: zb,
    at: mv(P0, 0, S.hModBot),
    leaders: parts.map(([p, text, pz], k) => [p.x, p.y, yLow + 45 * (parts.length - 1 - k), text, pz]),
    lines: [seg2(mv(P0, 0, S.hBeamTop - 30), mv(P0, 0, top + 60))],
    box: [P0.x - 130, ax, yLow - 30, P0.y + (top + 70) / cosT],
  };
}

function buildSplicePlanarJointSpec(fr: number, { S, layout, mv, seg2 }: JointBuildHelpers): PlanarJointSpec {
  const { purlin } = S.sections;
  const splice = layout.purlinConnector!;
  const p = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]);
  const z = layout.cuts.positions.at(-1) || 0;
  const q = mv(p, -purlin.f / 2, S.hBeamTop + purlin.d / 2);
  const ax = q.x + 210;
  const upperLip = mv(q, purlin.f - purlin.t / 2, purlin.d / 2 - purlin.l / 2);
  const lowerLip = mv(q, purlin.f - purlin.t / 2, -purlin.d / 2 + purlin.l / 2);
  const connectorBottom = mv(q, 8, -splice.d / 2);
  const lowerBolt = mv(q, splice.flangeHoleOffset - splice.t, -splice.d / 2 - 8);

  return {
    labelSide: 1,
    anchorX: ax,
    z,
    zl: z,
    at: q,
    leaders: [
      [upperLip.x, upperLip.y, q.y + 100, '檩条 1 ' + purlin.name],
      [q.x, q.y, q.y + 45, '檩条接缝 4 mm'],
      [lowerLip.x, lowerLip.y, q.y - 10, '檩条 2 ' + purlin.name],
      [connectorBottom.x, connectorBottom.y, q.y - 65, splice.name + ' 连接件'],
      [lowerBolt.x, lowerBolt.y, q.y - 120, 'M12×35 ×8（两面平垫，螺母侧弹垫）'],
    ],
    // 接缝中心处的法线，沿组件法向贯穿檩条截面，上下各伸出 40 mm。
    lines: [[...seg2(mv(q, 0, -purlin.d / 2 - 40), mv(q, 0, purlin.d / 2 + 40)), z]],
    box: [q.x - 160, ax, q.y - 170, q.y + 130],
  };
}

function renderJointAnnotations(specs: JointSpecs, zj: number, layout: BuiltLayout, zLast: number) {
  const group = new THREE.Group();
  for (const type of Object.keys(specs) as JointType[]) {
    specs[type].forEach((sp, fr) => {
      if (!sp) return;
      const lead = new DimSet();
      const cl = new DimSet();
      const zl = sp.zl === undefined ? zj : sp.zl;

      for (const [px, py, ly, text, pz, elevPoint] of sp.leaders) {
        const a = V(px, py, pz === undefined ? zl : pz);
        const b = V(sp.anchorX, ly, zl);
        if (elevPoint) {
          // 檩条拉杆在两种视角下分别露出螺栓头、螺母，共用一条文字说明。
          for (const [view, tip] of [['joint-elev', V(...elevPoint)], ['joint-iso', a]] as const) {
            const arrow = new DimSet();
            addLeader(arrow, tip, b);
            const arrowGroup = arrow.finish(mats.line);
            arrowGroup.userData.jointView = view;
            lead.group.add(arrowGroup);
          }
        } else {
          addLeader(lead, a, b);
        }
        lead.label(text, b, 'out', 13).userData.outside = {
          at: b,
          dir: new V3(sp.labelSide, 0, 0),
          screenSide: sp.matrix ? sp.labelSide : undefined,
        };
      }

      for (const [x1, y1, x2, y2, lineZ = zl] of sp.lines) cl.seg(V(x1, y1, lineZ), V(x2, y2, lineZ), true);
      for (const [x1, y1, x2, y2, ox, oy, text] of sp.dims || []) {
        // 拉杆局部 z=0 是安装面；尺寸界线应从真实孔心和杆端起算。
        const dimZ = sp.matrix ? 0 : zl;
        const d = lead.dim(V(x1, y1, dimZ), V(x2, y2, dimZ), new V3(ox * MM, oy * MM, 0), text, 'out', 13, 0.2);
        d.label.userData.outside = { at: d.A.clone().add(d.B).multiplyScalar(0.5), dir: new V3(Math.sign(ox), 0, 0) };
      }

      const g = lead.finish(mats.line);
      g.add(cl.finish(mats.line, mats.center));
      if (type === 'splice' || sp.matrix) keepAnnotationsUnclipped(g);
      g.userData.joint = type + fr;
      // 东西坡度：支架节点跟着最东一榀平移，檩条-组件、边压块顺坡
      if (sp.matrix) {
        g.matrixAutoUpdate = false;
        g.matrix.copy(sp.matrix);
      } else {
        ewPlace(g, layout.ew, type === 'mod' || type === 'side' || type === 'splice' ? undefined : zLast);
      }
      group.add(g);
    });
  }
  return group;
}

/** 生成各连接节点详图分组，并将节点取景规格写入 layout.jointSpecs。 */
function build(S: Solution, layout: BuiltLayout) {
  const clamp = P.fix === 'clamp' ? getClampSpec(P.modT, P.clampL) : null;
  const zLast = layout.zs[layout.zs.length - 1];
  const zj = zLast + S.sections.postF.f / 2 + S.sections.beam.f + 20; // 标注平面：在斜梁翼缘外侧
  const tanT = Math.tan(P.tilt * DEG);
  const cosT = Math.cos(P.tilt * DEG);

  const helpers: JointBuildHelpers = {
    S,
    layout,
    clamp,
    cosT,
    mv: (p, du, dn) => ({ x: p.x + S.c * du - S.s * dn, y: p.y + S.s * du + S.c * dn }),
    beamY: (p, x, h) => p.y + (x - p.x) * tanT + h / cosT,
    seg2: (a, b) => [a.x, a.y, b.x, b.y],
  };

  const specs: JointSpecs = {
    foot: [],
    top: [],
    btop: [],
    clip: [],
    mod: [],
    side: [],
    splice: [],
    ...createTieJointSpecs(S, layout, S.sections),
  };

  for (const fr of [0, 1]) {
    specs.foot.push(buildFootPlanarJointSpec(fr, helpers));
    specs.top.push(buildTopPlanarJointSpec(fr, helpers));
    specs.btop.push(buildBraceTopPlanarJointSpec(fr, helpers));
    specs.clip.push(buildClipPlanarJointSpec(fr, helpers));
    specs.mod.push(buildModPlanarJointSpec(fr, helpers));
    if (clamp) specs.side.push(buildSidePlanarJointSpec(fr, clamp, helpers));
  }
  if (layout.purlinConnector) {
    for (const fr of [0, 1]) specs.splice.push(buildSplicePlanarJointSpec(fr, helpers));
  }

  layout.jointSpecs = specs;
  return renderJointAnnotations(specs, zj, layout, zLast);
}

export { build };
