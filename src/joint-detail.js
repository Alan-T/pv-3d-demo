/* 连接节点详图（最东一榀的 4 种节点 + 最东一跨里一道组件缝处的檩条-组件，各前/后一组）：引线标注 + 红色点划中心线。
 * 每组的 box（框架平面 mm）、labelSide（文字在节点哪一侧）和 z（节点东西向位置，不给就是最东一榀）也给 view.js 取景用 */
(function () {
  'use strict';
  const PV = window.PV;
  const { DEG, V3, V, FIX, JOINT, DBL, CLIP, CLAMP } = PV;
  const { DimSet, mats } = PV.dims;

  // 返回节点详图分组；各组规格写到 layout.jointSpecs
  function build(S, layout) {
    const P = PV.P, clamp = P.fix === 'clamp';
    const zLast = layout.zs[layout.zs.length - 1];
    const zj = zLast + FIX.post.f / 2 + FIX.beam.f + 20;      // 标注平面：在斜梁翼缘外侧
    const tanT = Math.tan(P.tilt * DEG), cosT = Math.cos(P.tilt * DEG);
    const mv = (p, du, dn) => ({ x: p.x + S.c * du - S.s * dn, y: p.y + S.s * du + S.c * dn });   // 沿坡 du、法向 dn
    const beamY = (p, x, h) => p.y + (x - p.x) * tanT + h / cosT;   // 过 p 的斜梁中心线法向偏 h，在 x 处的高度
    const sec = (s) => `C${s.d}×${s.f}×${s.l}×${s.t.toFixed(1)}`;
    const seg2 = (a, b) => [a.x, a.y, b.x, b.y];
    const specs = { foot: [], top: [], btop: [], clip: [], mod: [] };
    for (const fr of [0, 1]) {
      const J = layout.joints[fr];
      if (J.o) { // 斜撑-立柱（双面连接板）：立柱两侧都有斜撑，文字放到外斜撑一侧、连接板下面
        const o = J.o, yBot = J.yc - J.hh, ax = J.xc - J.side * (DBL.half + 60);   // 文字挂在板外侧 60
        const ly = (k) => yBot - 50 - 48 * k;
        specs.foot.push({
          labelSide: -J.side, anchorX: ax,
          leaders: [
            [o.Q.x + o.ax * 170, o.Q.y + o.ay * 170, ly(0), `外斜撑 ${sec(FIX.brace)}`],
            [J.Q.x + J.ax * 170, J.Q.y + J.ay * 170, ly(1), `斜撑 ${sec(FIX.brace)}`],
            [J.xc, J.yTop + 45, ly(2), `立柱 ${sec(FIX.post)}`],
            [J.xc, J.yc + JOINT.boltPitch / 2, ly(3), 'M12 螺栓 ×4，长圆孔'],
            [J.xc - J.side * 30, J.yc - 25, ly(4), `双面斜撑连接板 ${J.spec}`],
          ],
          lines: [[J.xc, yBot - 70, J.xc, J.yTop + 130],
            [J.E.x - J.ax * 40, J.E.y - J.ay * 40, J.Q.x + J.ax * 260, J.Q.y + J.ay * 260],
            [o.E.x - o.ax * 40, o.E.y - o.ay * 40, o.Q.x + o.ax * 260, o.Q.y + o.ay * 260]],
          box: [J.xc + J.side * (DBL.half + 160), ax, ly(4) - 30, J.yTop + 200],
        });
      } else { // 斜撑-立柱：文字放在立柱另一侧
        specs.foot.push({
          labelSide: -J.side, anchorX: J.xc - J.side * (FIX.post.d / 2 + 50),
          leaders: [
            [J.xc, J.yc + J.hh + 45, J.yc + J.hh + 70, `立柱 ${sec(FIX.post)}`],
            [J.Q.x + J.ax * 170, J.Q.y + J.ay * 170, J.yc + J.hh + 15, `斜撑 ${sec(FIX.brace)}`],
            [J.xc, J.yc + JOINT.boltPitch / 2, J.yc + 40, 'M12 螺栓 ×3，长圆孔'],
            [J.B.x - J.side * 25, J.yc - J.hh + 22, J.yc - 20, `斜撑连接板 ${J.spec}`],
          ],
          lines: [[J.xc, J.yc - J.hh - 70, J.xc, J.yc + J.hh + 130],
            [J.E.x - J.ax * 40, J.E.y - J.ay * 40, J.Q.x + J.ax * 260, J.Q.y + J.ay * 260]],
          box: [J.xc - J.side * (FIX.post.d / 2 + 110), J.xc + J.side * (JOINT.singleW - JOINT.singleBack + 170),
            J.yc - J.hh - 70, J.yc + J.hh + 150],
        });
      }
      { // 立柱-斜梁：文字放在框架外侧、斜梁下面
        const node = { x: fr ? S.xr : S.xf, y: fr ? S.nodeR : S.nodeF }, ty = fr ? S.topR : S.topF, ls = fr ? 1 : -1;
        const ax = node.x + ls * (FIX.post.d / 2 + 140), y0 = beamY(node, ax, -S.hBeamTop) - 45, bp = mv(node, ls * 130, 0);
        specs.top.push({
          labelSide: ls, anchorX: ax,
          leaders: [
            [bp.x, bp.y, y0, `斜梁 ${sec(FIX.beam)}`],
            [node.x - FIX.post.d / 2 + 15, ty - 4, y0 - 65, '柱顶平切，与斜梁上表面齐平'],   // 下坡一侧的柱顶角露在斜梁上方
            [node.x, node.y, y0 - 130, 'M12 螺栓，竖向长圆孔'],
            [node.x, node.y - 190, y0 - 195, `立柱 ${sec(FIX.post)}`],
          ],
          lines: [[node.x, node.y - 280, node.x, ty + 70], seg2(mv(node, -320, 0), mv(node, 320, 0))],
          box: [node.x - ls * 260, ax, y0 - 225, ty + 90],
        });
      }
      { // 斜撑-斜梁：文字放在斜撑另一侧、斜梁下面
        const T = J.T, ls = J.side, ax = T.x + ls * 260, y0 = beamY(T, ax, -S.hBeamTop) - 45;
        const end = { x: T.x + J.ax * J.eTop, y: T.y + J.ay * J.eTop }, bp = mv(T, ls * 170, 0);
        specs.btop.push({
          labelSide: ls, anchorX: ax,
          leaders: [
            [end.x, end.y, y0, '斜撑端头平切，伸到斜梁上缘'],
            [bp.x, bp.y, y0 - 65, `斜梁 ${sec(FIX.beam)}`],
            [T.x, T.y, y0 - 130, 'M12 螺栓，在两条中心线交点'],
            [T.x - J.ax * 230, T.y - J.ay * 230, y0 - 195, `斜撑 ${sec(FIX.brace)}`],
          ],
          lines: [seg2(mv(T, -340, 0), mv(T, 340, 0)),
            [T.x + J.ax * 80, T.y + J.ay * 80, T.x - J.ax * 380, T.y - J.ay * 380]],
          box: [T.x - ls * 240, ax, y0 - 225, T.y + 140],
        });
      }
      { // 檩条-斜梁：前侧取最低一根檩条、后侧取最高一根；文字放在右侧斜梁下面
        const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]), ax = P0.x + 220, web = -FIX.purlin.f / 2;
        const yLow = beamY(P0, ax, -S.hBeamTop) - 35 - 45 * 4;
        // 压块固定时这里没有组件螺栓（压块在组件缝上，见檩条-组件节点）
        const parts = [
          [mv(P0, 160, S.hModBot + FIX.modT / 2), `组件 ${P.modL}×${FIX.modW}×${FIX.modT}`],
          ...(clamp ? [] : [[mv(P0, 0, S.hModBot - FIX.purlin.t - 4), 'M8×22 外六角螺栓 + 螺母']]),
          [mv(P0, web, S.hBeamTop + 92), `檩条 ${sec(FIX.purlin)}`],
          [mv(P0, web - CLIP.t, S.hBeamTop + CLIP.webBolt), `檩托 L 形 t=${CLIP.t}，M12 螺栓 ×2`],
          [mv(P0, -220, 0), `斜梁 ${sec(FIX.beam)}`],
        ];
        specs.clip.push({
          labelSide: 1, anchorX: ax,
          leaders: parts.map(([p, text], k) => [p.x, p.y, yLow + 45 * (parts.length - 1 - k), text]),
          lines: [seg2(mv(P0, -320, 0), mv(P0, 320, 0)), seg2(mv(P0, 0, S.hBeamTop - 30), mv(P0, 0, S.hModBot + FIX.modT + 60))],
          box: [P0.x - 220, ax, yLow - 30, P0.y + (S.hModBot + FIX.modT + 70) / cosT],
        });
      }
      { // 檩条-组件：在 layout.gapZ 那道组件缝处；前侧取最低一根檩条、后侧取最高一根。文字放在右侧檩条下面。
        // 螺栓固定：缝两侧组件各 1 颗 M8×22，引线画在缝西侧那颗螺栓的平面里；
        // 压块固定：缝上 1 个中压块 + M8×35，引线画在缝中线平面里，压块那根指到西侧翼板
        const P0 = S.along(S.purlins[fr ? S.purlins.length - 1 : 0]), ax = P0.x + 70;
        const yLow = beamY(P0, ax, S.hBeamTop) - 35 - 45 * (clamp ? 3 : 2);
        const zl = clamp ? layout.gapZ : layout.gapZ - FIX.modGapEW / 2 - 18, top = S.hModBot + FIX.modT;
        // 引线指到组件面、压块、螺栓头、檩条腹板（轴测从下坡一侧高处看，这几处都看得见）
        const parts = [
          [mv(P0, 60, top), `组件 ${P.modL}×${FIX.modW}×${FIX.modT}，缝 ${FIX.modGapEW}`],
          ...(clamp ? [
            [mv(P0, 0, top + CLAMP.t), `中压块，长 ${P.clampL}`, layout.gapZ - FIX.modGapEW / 2 - CLAMP.press / 2],
            [mv(P0, 0, top - CLAMP.pocket + 8), 'M8×35 内六角螺栓 + 螺母'],
          ] : [[mv(P0, 0, S.hModBot + 2 + 4), 'M8×22 外六角螺栓 + 螺母']]),
          [mv(P0, -FIX.purlin.f / 2, S.hBeamTop + 50), `檩条 ${sec(FIX.purlin)}`],
        ];
        specs.mod.push({
          labelSide: 1, anchorX: ax, z: layout.gapZ, zl, at: mv(P0, 0, S.hModBot),
          leaders: parts.map(([p, text, pz], k) => [p.x, p.y, yLow + 45 * (parts.length - 1 - k), text, pz]),
          lines: [seg2(mv(P0, 0, S.hBeamTop - 30), mv(P0, 0, S.hModBot + FIX.modT + 60))],
          box: [P0.x - 130, ax, yLow - 30, P0.y + (S.hModBot + FIX.modT + 70) / cosT],
        });
      }
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
        for (const [x1, y1, x2, y2] of sp.lines) cl.seg(V(x1, y1, zl), V(x2, y2, zl), true);
        const g = lead.finish(mats.line);
        g.add(cl.finish(mats.line, mats.center));
        g.userData.joint = type + fr;
        group.add(g);
      });
    }
    return group;
  }

  PV.jointDetail = { build };
})();
