/* 压块固定（固定方式选“压块”时）：组件东西向每道缝上一个中压块，阵列东西两端各一个边压块，沿坡对齐每根檩条。
 * 每个压块 1 颗 M8×35 内六角螺栓，螺栓头沉在压块槽底，穿过檩条上翼缘，螺母在翼缘下面。截面尺寸见 config.js 的 CLAMP */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V, EZ, FIX, CLAMP, M } = PV;

  // 截面：局部 x 东西向，y 沿组件法向（0 在组件上表面），沿局部 z 拉伸单位长度
  const { t, press, wall, plate, sideW } = CLAMP, H = FIX.modT, yb = -CLAMP.pocket;
  const extrude = (pts) => new THREE.ExtrudeGeometry(
    new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0] * MM, q[1] * MM))), { depth: 1, bevelEnabled: false });
  // 中压块：局部 x 从缝中线算。两翼各压住一块组件的边框，中间的槽伸进组件缝
  const g = FIX.modGapEW / 2, w = g + press;
  const midGeo = extrude([[-w, 0], [-w, t], [-g + wall, t], [-g + wall, yb], [g - wall, yb], [g - wall, t], [w, t], [w, 0],
    [g, 0], [g, yb - plate], [-g, yb - plate], [-g, 0]]);
  // 边压块：局部 x 从组件边往外。上沿勾住组件边框，内外两道立板落在檩条上，中间是放螺栓头的槽
  const sideGeo = extrude([[-press, 0], [-press, t], [wall, t], [wall, yb], [sideW - wall, yb], [sideW - wall, t], [sideW, t],
    [sideW, -H], [sideW - wall, -H], [sideW - wall, yb - plate], [wall, yb - plate], [wall, -H], [0, -H], [0, 0]]);

  // 返回中压块、边压块个数
  function build(c) {
    const { P, S, layout, u, n } = c;
    const L = P.clampL, e = layout.arrW / 2;
    const gaps = [];
    for (let j = 1; j < layout.cols; j++) gaps.push(-e + j * layout.pitchEW - FIX.modGapEW / 2);
    const mid = [], side = [];
    for (const tp of S.purlins) {
      const q = S.along(tp);
      const at = (z, du, dn) => V(q.x, q.y, z).addScaledVector(u, du * MM).addScaledVector(n, dn * MM);
      // sx：局部 x 朝 +z 还是 −z。实例矩阵不能带镜像，局部 x 朝 +z 时只能沿 −u 拉伸，所以从上坡一端起
      const put = (list, z, sx) => list.push(new THREE.Matrix4()
        .makeBasis(EZ.clone().multiplyScalar(sx), n, u.clone().multiplyScalar(-sx * L * MM))
        .setPosition(at(z, (sx * L) / 2, S.hModBot + H)));
      const bolt = (z) => c.bolts.add('clamp', at(z, 0, S.hModBot - FIX.purlin.t), n.clone().negate(), u);
      for (const z of gaps) { put(mid, z, 1); bolt(z); }
      for (const sx of [-1, 1]) { put(side, sx * e, sx); bolt(sx * (e + sideW / 2)); }
    }
    PV.instanced(c.hw, midGeo, M.clamp, mid);
    PV.instanced(c.hw, sideGeo, M.clamp, side);
    return { mid: mid.length, side: side.length };
  }

  PV.parts.clamp = { build };
})();
