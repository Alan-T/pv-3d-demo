import { mats, DimSet } from './dims.js';
import { CLAMP, CLIP, JOINT, FIX, P, section } from './config.js';
import { V, V3, MM, DEG, ewPlace, track } from './core.js';

import * as THREE from 'three';

const params = P;

// 全局剖切也会裁掉随镜头转向的文字精灵。仅为本节点的标注使用独立材质，
// 去掉片元剖切，保留模型剖切和其他节点的材质设置。
function keepAnnotationsUnclipped(group) {
  const materials = new Map();
  group.traverse((object) => {
    if (!object.material) return;
    const original = object.material;
    if (!materials.has(original)) {
      const material = track(original.clone());
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace('#include <clipping_planes_fragment>', '');
      };
      material.customProgramCacheKey = () => 'unclipped-joint-annotation';
      materials.set(original, material);
    }
    object.material = materials.get(original);
  });
}

/* 连接节点详图（最东一榀的 4 种节点 + 最东一跨里一道组件缝处的檩条-组件 + 阵列东边的边压块，各前/后一组）：引线标注 + 红色点划中心线。
 * 每组的 box（框架平面 mm）、labelSide（文字在节点哪一侧）和 z（节点东西向位置，不给就是最东一榀）也给 view.js 取景用 */


// 返回节点详图分组；各组规格写到 layout.jointSpecs
function build(S, layout) {
  const P = params, clamp = P.fix === 'clamp';
  const zLast = layout.zs[layout.zs.length - 1];
  const zj = zLast + FIX.postF.f / 2 + FIX.beam.f + 20;      // 标注平面：在斜梁翼缘外侧
  const tanT = Math.tan(P.tilt * DEG), cosT = Math.cos(P.tilt * DEG);
  const mv = (p, du, dn) => ({ x: p.x + S.c * du - S.s * dn, y: p.y + S.s * du + S.c * dn });   // 沿坡 du、法向 dn
  const beamY = (p, x, h) => p.y + (x - p.x) * tanT + h / cosT;   // 过 p 的斜梁中心线法向偏 h，在 x 处的高度
  const sec = (s) => s.l ? `C${s.d}*${s.f}*${s.l}*${s.t.toFixed(1)}` : `U${s.d}*${s.f}*${s.t.toFixed(1)}`;
  const seg2 = (a, b) => [a.x, a.y, b.x, b.y];
  const specs = { foot: [], top: [], btop: [], clip: [], mod: [], side: [], splice: [] };
  for (const fr of [0, 1]) {
    const J = layout.joints[fr];
    if (J.o) { // 斜撑-立柱（双面连接板）：立柱两侧都有斜撑，文字放到外斜撑一侧、连接板下面
      const o = J.o, yBot = J.yc - J.hh, ax = J.xc - J.side * (J.extent + 60);   // 文字挂在板外侧 60
      const ly = (k) => yBot - 50 - 48 * k;
      specs.foot.push({
        labelSide: -J.side, anchorX: ax,
        leaders: [
          [o.Q.x + o.ax * 170, o.Q.y + o.ay * 170, ly(0), `外斜撑 ${sec(section('brace', !!fr, true))}`],
          [J.Q.x + J.ax * 170, J.Q.y + J.ay * 170, ly(1), `斜撑 ${sec(section('brace', !!fr))}`],
          [J.xc, J.yTop + 45, ly(2), `立柱 ${sec(section('post', !!fr))}`],
          [J.xc, J.yc + JOINT.boltPitch / 2, ly(3), 'M12×35 外六角螺栓及螺母 ×' + J.bolts.length],
          [J.xc - J.side * 30, J.yc - 25, ly(4), `${J.split ? '两侧单面斜撑连接板' : '双面斜撑连接板'} ${J.spec}`],
          [o.Q.x, o.Q.y, ly(5), `斜撑孔，孔心到斜撑端头 ${JOINT.braceEdge}`],
          [J.xc, J.yc - JOINT.boltPitch / 2, ly(6), '两面平垫，螺母侧弹垫；长圆孔'],
        ],
        lines: [[J.xc, yBot - 70, J.xc, J.yTop + 130],
          [J.E.x - J.ax * 40, J.E.y - J.ay * 40, J.Q.x + J.ax * 260, J.Q.y + J.ay * 260],
          [o.E.x - o.ax * 40, o.E.y - o.ay * 40, o.Q.x + o.ax * 260, o.Q.y + o.ay * 260]],
        box: [J.xc + J.side * (J.extent + 160), ax, ly(6) - 30, J.yTop + 200],
      });
    } else { // 斜撑-立柱：文字放在立柱另一侧
      specs.foot.push({
        labelSide: -J.side, anchorX: J.xc - J.side * (section('post', !!fr).d / 2 + 50),
        leaders: [
          [J.xc, J.yc + J.hh + 45, J.yc + J.hh + 70, `立柱 ${sec(section('post', !!fr))}`],
          [J.Q.x + J.ax * 170, J.Q.y + J.ay * 170, J.yc + J.hh + 15, `斜撑 ${sec(section('brace', !!fr))}`],
          [J.xc, J.yc + JOINT.boltPitch / 2, J.yc + 40, 'M12×35 外六角螺栓及螺母 ×3'],
          [J.B.x - J.side * 25, J.yc - J.hh + 22, J.yc - 20, `斜撑连接板 ${J.spec}`],
          [J.Q.x, J.Q.y, J.yc - 80, `斜撑孔，孔心到斜撑端头 ${JOINT.braceEdge}`],
          [J.xc, J.yc - JOINT.boltPitch / 2, J.yc - 130, '两面平垫，螺母侧弹垫；长圆孔'],
        ],
        lines: [[J.xc, J.yc - J.hh - 70, J.xc, J.yc + J.hh + 130],
          [J.E.x - J.ax * 40, J.E.y - J.ay * 40, J.Q.x + J.ax * 260, J.Q.y + J.ay * 260]],
        box: [J.xc - J.side * (section('post', !!fr).d / 2 + 110), J.xc + J.side * (JOINT.singleW - JOINT.singleBack + 170),
          J.yc - 160, J.yc + J.hh + 150],
      });
    }
    { // 立柱-斜梁：文字放在框架外侧、斜梁下面；螺栓在立柱中心线上、孔心距柱顶 50（尺寸标在框架内侧）
      const node = { x: fr ? S.xr : S.xf, y: fr ? S.nodeR : S.nodeF }, ty = fr ? S.topR : S.topF, ls = fr ? 1 : -1;
      const hole = { x: node.x, y: fr ? S.holeR : S.holeF };
      const ax = node.x + ls * (section('post', !!fr).d / 2 + 140), y0 = beamY(node, ax, -S.hBeamTop) - 45, bp = mv(node, ls * 130, 0);
      specs.top.push({
        labelSide: ls, anchorX: ax,
        leaders: [
          [bp.x, bp.y, y0, `斜梁 ${sec(FIX.beam)}`],
          [node.x - section('post', !!fr).d / 2 + 15, ty - 4, y0 - 65, `柱顶平切，孔心距柱顶 ${JOINT.postTopHole}`],
          [hole.x, hole.y, y0 - 130, 'M16×40 外六角螺栓（平垫 + 弹垫）'],
          [hole.x, hole.y - 16, y0 - 195, '立柱上竖向长圆孔'],   // 长圆孔长 40，露在垫圈外的下端
          [node.x, node.y - 190, y0 - 260, `立柱 ${sec(section('post', !!fr))}`],
        ],
        lines: [[node.x, node.y - 280, node.x, ty + 70], seg2(mv(node, -320, 0), mv(node, 320, 0))],
        dims: [[node.x, ty, hole.x, hole.y, -ls * (section('post', !!fr).d / 2 + 60), 0, `${JOINT.postTopHole}`]],
        box: [node.x - ls * 260, ax, y0 - 290, ty + 90],
      });
    }
    { // 斜撑-斜梁：文字放在斜撑另一侧、斜梁下面
      const T = J.T, ls = J.side, ax = T.x + ls * 260, y0 = beamY(T, ax, -S.hBeamTop) - 45;
      const end = { x: T.x + J.ax * J.eTop, y: T.y + J.ay * J.eTop }, bp = mv(T, ls * 170, 0);
      specs.btop.push({
        labelSide: ls, anchorX: ax,
        leaders: [
          [end.x, end.y, y0, `斜撑端头平切，孔心到端头 ${JOINT.braceEdge}`],
          [bp.x, bp.y, y0 - 65, `斜梁 ${sec(FIX.beam)}`],
          [T.x, T.y, y0 - 130, 'M12×35 外六角螺栓（平垫 + 弹垫）'],
          [T.x - J.ax * 230, T.y - J.ay * 230, y0 - 195, `斜撑 ${sec(section('brace', !!fr))}`],
        ],
        lines: [seg2(mv(T, -340, 0), mv(T, 340, 0)),
          [T.x + J.ax * 80, T.y + J.ay * 80, T.x - J.ax * 380, T.y - J.ay * 380]],
        box: [T.x - ls * 240, ax, y0 - 225, T.y + 140],
      });
    }
    { // 檩条-斜梁：前侧取最低一根檩条、后侧取最高一根；文字放在右侧斜梁下面
      const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]), ax = P0.x + 220, web = -FIX.purlin.f / 2;
      // 压块固定时这里没有组件螺栓（压块在组件缝上，见檩条-组件节点）。檩托指到立边上部，M12 指到立边上那颗螺栓
      const parts = [
        [mv(P0, 160, S.hModBot + P.modT / 2), `组件 ${P.modL}×${P.modW}×${P.modT}`],
        ...(clamp ? [] : [[mv(P0, 0, S.hModBot - FIX.purlin.t - 4), 'M8×22 外六角螺栓 + 螺母']]),
        [mv(P0, web, S.hBeamTop + 92), `檩条 ${sec(FIX.purlin)}`],
        [mv(P0, web - CLIP.t / 2, S.hBeamTop + CLIP.height - 8), `檩托 L 形 t=${CLIP.t}`],
        [mv(P0, web - CLIP.t, S.hBeamTop + CLIP.webBolt), 'M12×35 螺栓 ×2（平垫 + 弹垫）'],
        ...(layout.ew.i === 0 ? [[mv(P0, 0, S.hBeamTop), 'M12×35：檩条下翼缘—斜梁上翼缘']] : []),
        [mv(P0, -220, 0), `斜梁 ${sec(FIX.beam)}`],
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
      // 压块固定：缝上 1 个中压块 + M8×35，引线画在缝中线平面里，压块那根指到西侧翼板
      const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]), ax = P0.x + 70;
      const yLow = beamY(P0, ax, S.hBeamTop) - 35 - 45 * (clamp ? 3 : 2);
      const zl = clamp ? layout.gapZ : layout.gapZ - FIX.modGapEW / 2 - 18, top = S.hModBot + P.modT;
      // 引线指到组件面、压块、螺栓头、檩条腹板（轴测从下坡一侧高处看，这几处都看得见）
      const parts = [
        [mv(P0, 60, top), `组件 ${P.modL}×${P.modW}×${P.modT}，缝 ${FIX.modGapEW}`],
        ...(clamp ? [
          [mv(P0, 0, top + CLAMP.mid.top), `中压块，长 ${P.clampL}`, layout.gapZ - FIX.modGapEW / 2 - CLAMP.mid.press / 2],
          [mv(P0, 0, top - CLAMP.mid.floor + 8), 'M8×35 内六角螺栓 + 螺母'],
        ] : [[mv(P0, 0, S.hModBot + 2 + 4), 'M8×22 外六角螺栓 + 螺母']]),
        [mv(P0, -FIX.purlin.f / 2, S.hBeamTop + 50), `檩条 ${sec(FIX.purlin)}`],
      ];
      specs.mod.push({
        labelSide: 1, anchorX: ax, z: layout.gapZ, zl, at: mv(P0, 0, S.hModBot),
        leaders: parts.map(([p, text, pz], k) => [p.x, p.y, yLow + 45 * (parts.length - 1 - k), text, pz]),
        lines: [seg2(mv(P0, 0, S.hBeamTop - 30), mv(P0, 0, S.hModBot + P.modT + 60))],
        box: [P0.x - 130, ax, yLow - 30, P0.y + (S.hModBot + P.modT + 70) / cosT],
      });
    }
    { // 边压块（只在压块固定时有）：阵列东边，前侧取最低一根檩条、后侧取最高一根。文字放在右侧檩条下面，
      // 引线画在螺栓所在平面里；组件、压块那两根指到组件边里面一点和压块上沿
      const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]), ax = P0.x + 70;
      const yLow = beamY(P0, ax, S.hBeamTop) - 35 - 45 * 3;
      const e = layout.arrW / 2, zb = e + (CLAMP.side.wall + CLAMP.side.w - (CLAMP.side.foot + CLAMP.side.stem) / 2 + CLAMP.side.stem) / 2, top = S.hModBot + P.modT, Sd = CLAMP.side;
      const parts = [
        [mv(P0, 60, top), `组件 ${P.modL}×${P.modW}×${P.modT}`, e - 60],
        [mv(P0, 0, top + Sd.top), `边压块，长 ${P.clampL}`, e + Sd.wall / 2],
        [mv(P0, 0, top - Sd.floor + 8), 'M8×35 内六角螺栓 + 螺母'],
        [mv(P0, -FIX.purlin.f / 2, S.hBeamTop + 50), `檩条 ${sec(FIX.purlin)}，伸出组件 ${layout.purlinExt}`],
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
    const splice = layout.purlinConnector;
    const p=S.along(S.purlins[fr?S.purlins.length-1:0]), z=layout.cuts.positions.at(-1)||0;
    const q=mv(p,-FIX.purlin.f/2,S.hBeamTop+FIX.purlin.d/2), ax=q.x+100;
    // 截面标注共用接缝平面，各引线分别指向翼缘、接缝、连接件和下翼缘螺栓。
    const upperLip = mv(q, FIX.purlin.f - FIX.purlin.t / 2, FIX.purlin.d / 2 - FIX.purlin.l / 2);
    const lowerLip = mv(q, FIX.purlin.f - FIX.purlin.t / 2, -FIX.purlin.d / 2 + FIX.purlin.l / 2);
    const connectorBottom = mv(q, 8, -splice.d / 2);
    const lowerBolt = mv(q, splice.flangeHoleOffset - splice.t, -splice.d / 2 - 8);
    specs.splice.push({labelSide:1,anchorX:ax,z,zl:z,at:q,
      leaders:[
        [upperLip.x,upperLip.y,q.y+100,'檩条 1 '+sec(FIX.purlin)],
        [q.x,q.y,q.y+45,'檩条接缝 4 mm'],
        [lowerLip.x,lowerLip.y,q.y-10,'檩条 2 '+sec(FIX.purlin)],
        [connectorBottom.x,connectorBottom.y,q.y-65,splice.name + ' 连接件'],
        [lowerBolt.x,lowerBolt.y,q.y-120,'M12×35 ×8（两面平垫，螺母侧弹垫）']
      ],
      // 接缝中心处的法线，沿组件法向贯穿檩条截面，上下各伸出 40 mm。
      // 与其他节点共用红色虚线材质，放在接缝平面而不是文字所在平面。
      lines: [[...seg2(mv(q, 0, -FIX.purlin.d / 2 - 40), mv(q, 0, FIX.purlin.d / 2 + 40)), z]],
      box:[q.x-160,ax,q.y-170,q.y+130]});
  }
  layout.jointSpecs = specs;

  const group = new THREE.Group();
  for (const type in specs) {
    specs[type].forEach((sp, fr) => {
      const lead = new DimSet(), cl = new DimSet(), zl = sp.zl === undefined ? zj : sp.zl;
      for (const [px, py, ly, text, pz] of sp.leaders) {   // pz：引线端点不在标注平面里时单独给
        const a = V(px, py, pz === undefined ? zl : pz), b = V(sp.anchorX, ly, zl);
        lead.seg(a, b);
        const d = b.clone().sub(a).normalize().multiplyScalar(0.012), w = new V3(-d.y, d.x, 0).multiplyScalar(0.4);
        lead.seg(a, a.clone().add(d).add(w));
        lead.seg(a, a.clone().add(d).sub(w));
        lead.label(text, b, 'out', 13).userData.outside = { at: b, dir: new V3(sp.labelSide, 0, 0) };
      }
      for (const [x1, y1, x2, y2, lineZ = zl] of sp.lines) cl.seg(V(x1, y1, lineZ), V(x2, y2, lineZ), true);
      // 尺寸：被测两点、尺寸线偏移（mm）、文字，文字放在尺寸线外侧
      for (const [x1, y1, x2, y2, ox, oy, text] of sp.dims || []) {
        const d = lead.dim(V(x1, y1, zl), V(x2, y2, zl), new V3(ox * MM, oy * MM, 0), text, 'out', 13, 0.2);
        d.label.userData.outside = { at: d.A.clone().add(d.B).multiplyScalar(0.5), dir: new V3(Math.sign(ox), 0, 0) };
      }
      const g = lead.finish(mats.line);
      g.add(cl.finish(mats.line, mats.center));
      if (type === 'splice') keepAnnotationsUnclipped(g);
      g.userData.joint = type + fr;
      // 东西坡度：支架节点跟着最东一榀平移，檩条-组件、边压块顺坡
      ewPlace(g, layout.ew, type === 'mod' || type === 'side' || type === 'splice' ? undefined : zLast);
      group.add(g);
    });
  }
  return group;
}

export { build };
