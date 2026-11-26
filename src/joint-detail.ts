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
import type { JointSpecs, JointType } from './joint-view-types.ts';

type Point = { x: number; y: number };
type LeaderPart = [point: Point, label: string, z?: number];

const params = P;

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

/* 连接节点详图：支架、组件、檩条接头和实际拉杆安装点，各前/后一组；引线标注 + 红色点划中心线。
 * box（标注平面 mm）、labelSide 和 z 给 view.ts 取景用；拉杆另用 matrix 定义自身安装平面。 */


function addLeader(segments: DimSet, tip: THREE.Vector3, anchor: THREE.Vector3) {
  const axis = anchor.clone().sub(tip).normalize().multiplyScalar(0.012);
  const wing = new V3(-axis.y, axis.x, 0).multiplyScalar(0.4);
  segments.seg(tip, anchor);
  segments.seg(tip, tip.clone().add(axis).add(wing));
  segments.seg(tip, tip.clone().add(axis).sub(wing));
}

// 返回节点详图分组；各组规格写到 layout.jointSpecs
function build(S: Solution, layout: ReturnType<typeof getBuiltState>['layout']) {
  const P = params, clamp = P.fix === 'clamp' ? getClampSpec(P.modT, P.clampL) : null;
  const { sections } = S;
  const { beam, purlin } = sections;
  const CLIP = layout.purlinClip;
  const zLast = layout.zs[layout.zs.length - 1];
  const zj = zLast + sections.postF.f / 2 + beam.f + 20;      // 标注平面：在斜梁翼缘外侧
  const tanT = Math.tan(P.tilt * DEG), cosT = Math.cos(P.tilt * DEG);
  const mv = (p: Point, du: number, dn: number) => ({ x: p.x + S.c * du - S.s * dn, y: p.y + S.s * du + S.c * dn });   // 沿坡 du、法向 dn
  const beamY = (p: Point, x: number, h: number) => p.y + (x - p.x) * tanT + h / cosT;   // 过 p 的斜梁中心线法向偏 h，在 x 处的高度
  const seg2 = (a: Point, b: Point): [number, number, number, number] => [a.x, a.y, b.x, b.y];
  const specs: JointSpecs = { foot: [], top: [], btop: [], clip: [], mod: [], side: [], splice: [], ...createTieJointSpecs(S, layout, sections) };
  for (const fr of [0, 1]) {
    const J = layout.joints[fr];
    const post = fr ? sections.postR : sections.postF;
    const brace = fr ? sections.braceR : sections.braceF;
    if (J.o) { // 斜撑-立柱（双面连接板）：立柱两侧都有斜撑，文字放到外斜撑一侧、连接板下面
      const outerBrace = fr ? sections.braceOR : sections.braceOF;
      const o = J.o, yBot = J.yc - J.hh, ax = J.xc - J.side * (J.extent + 60);   // 文字挂在板外侧 60
      const outerPlateX = o.Q.x + J.side * BRACE_JOINT.boltU;
      const ly = (k: number) => yBot - 50 - 48 * k;
      specs.foot.push({
        labelSide: -J.side, anchorX: ax,
        leaders: [
          [o.Q.x + o.ax * 170, o.Q.y + o.ay * 170, ly(0), `外斜撑 ${outerBrace.name}`],
          [J.Q.x + J.ax * 170, J.Q.y + J.ay * 170, ly(1), `斜撑 ${brace.name}`],
          [J.xc, J.yTop + 45, ly(2), `立柱 ${post.name}`],
          [J.bolts[1][0], J.bolts[1][1], ly(3), 'M12×35 外六角螺栓及螺母 ×' + J.bolts.length],
          [outerPlateX - J.side * 30, J.yc - 25, ly(4), `${J.split ? '两侧单面斜撑连接板' : '双面斜撑连接板'} ${J.spec}`],
          [o.Q.x, o.Q.y, ly(5), `斜撑孔，孔心到斜撑端头 ${FIX.braceEdge}`],
          [J.xc, J.yc - BRACE_JOINT.boltPitch / 2, ly(6), '两面平垫，螺母侧弹垫；长圆孔'],
        ],
        lines: [[J.xc, yBot - 70, J.xc, J.yTop + 130],
          [J.E.x - J.ax * 40, J.E.y - J.ay * 40, J.Q.x + J.ax * 260, J.Q.y + J.ay * 260],
          [o.E.x - o.ax * 40, o.E.y - o.ay * 40, o.Q.x + o.ax * 260, o.Q.y + o.ay * 260]],
        box: [J.xc + J.side * (J.extent + 160), ax, ly(6) - 30, J.yTop + 200],
      });
    } else { // 斜撑-立柱：文字放在立柱另一侧
      specs.foot.push({
        labelSide: -J.side, anchorX: J.xc - J.side * (post.d / 2 + 50),
        leaders: [
          [J.Q.x + J.ax * 170, J.Q.y + J.ay * 170, J.yc + J.hh + 70, `斜撑 ${brace.name}`],
          [J.xc, J.yc + J.hh + 45, J.yc + J.hh + 15, `立柱 ${post.name}`],
          [J.xc, J.yc + BRACE_JOINT.boltPitch / 2, J.yc + 40, 'M12×35 外六角螺栓及螺母 ×3'],
          [J.xc + J.side * 45, J.yc + 10, J.yc - 20, `斜撑连接板 ${J.spec}`],
          [J.Q.x, J.Q.y, J.yc - 80, `斜撑孔，孔心到斜撑端头 ${FIX.braceEdge}`],
          [J.xc, J.yc - BRACE_JOINT.boltPitch / 2, J.yc - 130, '两面平垫，螺母侧弹垫；长圆孔'],
        ],
        lines: [[J.xc, J.yc - J.hh - 70, J.xc, J.yc + J.hh + 130],
          [J.E.x - J.ax * 40, J.E.y - J.ay * 40, J.Q.x + J.ax * 260, J.Q.y + J.ay * 260]],
        box: [J.xc - J.side * (post.d / 2 + 110), J.xc + J.side * (J.extent + 170),
          J.yc - 160, J.yc + J.hh + 150],
      });
    }
    { // 立柱-斜梁：文字放在框架外侧、斜梁下面；螺栓在立柱中心线上，孔心距柱顶的尺寸标在框架内侧
      const node = { x: fr ? S.xr : S.xf, y: fr ? S.nodeR : S.nodeF }, ty = fr ? S.topR : S.topF, ls = fr ? 1 : -1;
      const hole = { x: node.x, y: fr ? S.holeR : S.holeF };
      const ax = node.x + ls * (post.d / 2 + 140), y0 = beamY(node, ax, -S.hBeamTop) - 45, bp = mv(node, ls * 130, 0);
      specs.top.push({
        labelSide: ls, anchorX: ax,
        leaders: [
          [bp.x, bp.y, y0, `斜梁 ${beam.name}`],
          [node.x - post.d / 2 + 15, ty - 4, y0 - 65, `柱顶平切，孔心距柱顶 ${FIX.postTopHole}`],
          [hole.x, hole.y, y0 - 130, 'M16×40 外六角螺栓（平垫 + 弹垫）'],
          [hole.x, hole.y - 16, y0 - 195, '立柱上竖向长圆孔'],   // 长圆孔长 40，露在垫圈外的下端
          [node.x, node.y - 190, y0 - 260, `立柱 ${post.name}`],
        ],
        lines: [[node.x, node.y - 280, node.x, ty + 70], seg2(mv(node, -320, 0), mv(node, 320, 0))],
        dims: [[node.x, ty, hole.x, hole.y, -ls * (post.d / 2 + 60), 0, `${FIX.postTopHole}`]],
        box: [node.x - ls * 260, ax, y0 - 290, ty + 90],
      });
    }
    { // 斜撑-斜梁：文字放在斜撑另一侧、斜梁下面
      const T = J.T, ls = J.side, ax = T.x + ls * 260, y0 = beamY(T, ax, -S.hBeamTop) - 45;
      const end = { x: T.x + J.ax * J.eTop, y: T.y + J.ay * J.eTop }, bp = mv(T, ls * 170, 0);
      specs.btop.push({
        labelSide: ls, anchorX: ax,
        leaders: [
          [bp.x, bp.y, y0, `斜梁 ${beam.name}`],
          [end.x, end.y, y0 - 65, `斜撑端头平切，孔心到端头 ${FIX.braceEdge}`],
          [T.x, T.y, y0 - 130, 'M12×35 外六角螺栓（平垫 + 弹垫）'],
          [T.x - J.ax * 230, T.y - J.ay * 230, y0 - 195, `斜撑 ${brace.name}`],
        ],
        lines: [seg2(mv(T, -340, 0), mv(T, 340, 0)),
          [T.x + J.ax * 80, T.y + J.ay * 80, T.x - J.ax * 380, T.y - J.ay * 380]],
        box: [T.x - ls * 240, ax, y0 - 225, T.y + 140],
      });
    }
    { // 檩条-斜梁：前侧取最低一根檩条、后侧取最高一根；文字放在右侧斜梁下面
      const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]), ax = P0.x + 220, web = -purlin.f / 2;
      // 压块固定时这里没有组件螺栓（压块在组件缝上，见檩条-组件节点）。檩托指到立边上部，M12 指到立边上那颗螺栓
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
      specs.clip.push({
        labelSide: 1, anchorX: ax,
        leaders: parts.map(([p, text], k) => [p.x, p.y, yLow + 45 * (parts.length - 1 - k), text]),
        lines: [seg2(mv(P0, -320, 0), mv(P0, 320, 0)), seg2(mv(P0, 0, S.hBeamTop - 30), mv(P0, 0, S.hModBot + P.modT + 60))],
        box: [P0.x - 220, ax, yLow - 30, P0.y + (S.hModBot + P.modT + 70) / cosT],
      });
    }
    { // 檩条-组件：在 layout.gapZ 那道组件缝处；前侧取最低一根檩条、后侧取最高一根。文字放在右侧檩条下面。
      // 螺栓固定：缝两侧组件各 1 颗 M8×22，引线画在缝西侧那颗螺栓的平面里；
      // 压块固定：引线画在缝中线平面里，压块那根指到西侧翼板
      const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]), ax = P0.x + 70;
      const yLow = beamY(P0, ax, S.hBeamTop) - 35 - 45 * (clamp ? 3 : 2);
      const zl = clamp ? layout.gapZ : layout.gapZ - FIX.modGapEW / 2 - 18, top = S.hModBot + P.modT;
      // 引线指到组件面、压块、螺栓头、檩条腹板（轴测从下坡一侧高处看，这几处都看得见）
      const parts: LeaderPart[] = [
        [mv(P0, 60, top), `组件 ${P.modL}×${P.modW}×${P.modT}，缝 ${FIX.modGapEW}`],
        ...(clamp ? [
          [mv(P0, 0, top + CLAMP_PROFILE.mid.top), `中压块 ${clamp.mid.name}`, layout.gapZ - clamp.mid.width / 2 - CLAMP_PROFILE.mid.press / 2],
          [mv(P0, 0, top - CLAMP_PROFILE.mid.floor + 8), `${clamp.bolt.name} 内六角螺栓 + 螺母`],
        ] satisfies LeaderPart[] : [[mv(P0, 0, S.hModBot + 2 + 4), 'M8×22 外六角螺栓 + 螺母']] satisfies LeaderPart[]),
        [mv(P0, -purlin.f / 2, S.hBeamTop + 50), `檩条 ${purlin.name}`],
      ];
      specs.mod.push({
        labelSide: 1, anchorX: ax, z: layout.gapZ, zl, at: mv(P0, 0, S.hModBot),
        leaders: parts.map(([p, text, pz], k) => [p.x, p.y, yLow + 45 * (parts.length - 1 - k), text, pz]),
        lines: [seg2(mv(P0, 0, S.hBeamTop - 30), mv(P0, 0, S.hModBot + P.modT + 60))],
        box: [P0.x - 130, ax, yLow - 30, P0.y + (S.hModBot + P.modT + 70) / cosT],
      });
    }
    if (clamp) { // 边压块：阵列东边，前侧取最低一根檩条、后侧取最高一根。文字放在右侧檩条下面，
      // 引线画在螺栓所在平面里；组件、压块那两根指到组件边里面一点和压块上沿
      const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]), ax = P0.x + 70;
      const yLow = beamY(P0, ax, S.hBeamTop) - 35 - 45 * 3;
      const Sd = CLAMP_PROFILE.side, e = layout.arrW / 2, top = S.hModBot + P.modT;
      const zb = e + (Sd.wall + Sd.w - (Sd.foot + Sd.stem) / 2 + Sd.stem) / 2;
      const parts: LeaderPart[] = [
        [mv(P0, 60, top), `组件 ${P.modL}×${P.modW}×${P.modT}`, e - 60],
        [mv(P0, 0, S.hModBot + clamp.edge.height), `边压块 ${clamp.edge.name}`, e + Sd.wall / 2],
        [mv(P0, 0, top - Sd.floor + 8), `${clamp.bolt.name} 内六角螺栓 + 螺母`],
        [mv(P0, -purlin.f / 2, S.hBeamTop + 50), `檩条 ${purlin.name}，伸出组件 ${layout.purlinExt}`],
      ];
      specs.side.push({
        labelSide: 1, anchorX: ax, z: zb, zl: zb, at: mv(P0, 0, S.hModBot),
        leaders: parts.map(([p, text, pz], k) => [p.x, p.y, yLow + 45 * (parts.length - 1 - k), text, pz]),
        lines: [seg2(mv(P0, 0, S.hBeamTop - 30), mv(P0, 0, top + 60))],
        box: [P0.x - 130, ax, yLow - 30, P0.y + (top + 70) / cosT],
      });
    }
  }
  for (const fr of (layout.purlinConnector ? [0,1] : [])) {
    const splice = layout.purlinConnector!;
    const p=S.along(S.purlins[fr?S.purlins.length-1:0]), z=layout.cuts.positions.at(-1)||0;
    const q=mv(p,-purlin.f/2,S.hBeamTop+purlin.d/2), ax=q.x+210;
    // 截面标注共用接缝平面，各引线分别指向翼缘、接缝、连接件和下翼缘螺栓。
    const upperLip = mv(q, purlin.f - purlin.t / 2, purlin.d / 2 - purlin.l / 2);
    const lowerLip = mv(q, purlin.f - purlin.t / 2, -purlin.d / 2 + purlin.l / 2);
    const connectorBottom = mv(q, 8, -splice.d / 2);
    const lowerBolt = mv(q, splice.flangeHoleOffset - splice.t, -splice.d / 2 - 8);
    specs.splice.push({labelSide:1,anchorX:ax,z,zl:z,at:q,
      leaders:[
        [upperLip.x,upperLip.y,q.y+100,'檩条 1 '+purlin.name],
        [q.x,q.y,q.y+45,'檩条接缝 4 mm'],
        [lowerLip.x,lowerLip.y,q.y-10,'檩条 2 '+purlin.name],
        [connectorBottom.x,connectorBottom.y,q.y-65,splice.name + ' 连接件'],
        [lowerBolt.x,lowerBolt.y,q.y-120,'M12×35 ×8（两面平垫，螺母侧弹垫）']
      ],
      // 接缝中心处的法线，沿组件法向贯穿檩条截面，上下各伸出 40 mm。
      // 与其他节点共用红色虚线材质，放在接缝平面而不是文字所在平面。
      lines: [[...seg2(mv(q, 0, -purlin.d / 2 - 40), mv(q, 0, purlin.d / 2 + 40)), z]],
      box:[q.x-160,ax,q.y-170,q.y+130]});
  }
  layout.jointSpecs = specs;

  const group = new THREE.Group();
  for (const type of Object.keys(specs) as JointType[]) {
    specs[type].forEach((sp, fr) => {
      if (!sp) return;
      const lead = new DimSet(), cl = new DimSet(), zl = sp.zl === undefined ? zj : sp.zl;
      for (const [px, py, ly, text, pz, elevPoint] of sp.leaders) {   // pz：引线端点不在标注平面里时单独给
        const a = V(px, py, pz === undefined ? zl : pz), b = V(sp.anchorX, ly, zl);
        if (elevPoint) {
          // 檩条拉杆在两种视角下分别露出螺栓头、螺母，共用一条文字说明。
          for (const [view, tip] of [['joint-elev', V(...elevPoint)], ['joint-iso', a]] as const) {
            const arrow = new DimSet();
            addLeader(arrow, tip, b);
            const group = arrow.finish(mats.line);
            group.userData.jointView = view;
            lead.group.add(group);
          }
        } else addLeader(lead, a, b);
        lead.label(text, b, 'out', 13).userData.outside = { at: b, dir: new V3(sp.labelSide, 0, 0), screenSide: sp.matrix ? sp.labelSide : undefined };
      }
      for (const [x1, y1, x2, y2, lineZ = zl] of sp.lines) cl.seg(V(x1, y1, lineZ), V(x2, y2, lineZ), true);
      // 尺寸：被测两点、尺寸线偏移（mm）、文字，文字放在尺寸线外侧
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
        // 拉杆节点使用自身安装平面；立柱拉杆的坐标已包含东西坡度。
        g.matrixAutoUpdate = false;
        g.matrix.copy(sp.matrix);
      } else ewPlace(g, layout.ew, type === 'mod' || type === 'side' || type === 'splice' ? undefined : zLast);
      group.add(g);
    });
  }
  return group;
}

export { build };
