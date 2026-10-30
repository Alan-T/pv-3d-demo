/* 压块固定（固定方式选“压块”时）：组件东西向每道缝上一个中压块，阵列东西两端各一个边压块，沿坡对齐每根檩条。
 * 每个压块 1 颗 M8×35 内六角螺栓，螺栓头坐在压块槽底，穿过檩条上翼缘，螺母在翼缘下面。截面尺寸见 config.js 的 CLAMP */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, V, EZ, FIX, CLAMP, M } = PV;
  const T = CLAMP.teeth, H = FIX.modT, V2 = THREE.Vector2;

  // 一排锯齿：从 x0 到 x1，齿根在 yb、齿尖在 yt
  function teeth(x0, x1, yb, yt) {
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / T.pitch)), d = (x1 - x0) / n, pts = [];
    for (let i = 0; i < n; i++) pts.push([x0 + d * i, yb], [x0 + d * (i + 0.5), yt]);
    pts.push([x1, yb]);
    return pts;
  }
  // 倒圆角：点带第三个数 r 的，按半径 r 倒圆（每个角 4 段）
  function fillet(pts) {
    const out = [], n = pts.length;
    pts.forEach(([x, y, r], i) => {
      if (!r) return out.push([x, y]);
      const p = new V2(x, y), a = new V2(...pts[(i + n - 1) % n]).sub(p).normalize(), b = new V2(...pts[(i + 1) % n]).sub(p).normalize();
      const half = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) / 2, d = r / Math.tan(half);
      const c = a.clone().add(b).normalize().multiplyScalar(r / Math.sin(half)).add(p);
      const s = Math.atan2(p.y + a.y * d - c.y, p.x + a.x * d - c.x), e = Math.atan2(p.y + b.y * d - c.y, p.x + b.x * d - c.x);
      const da = Math.atan2(Math.sin(e - s), Math.cos(e - s));
      for (let k = 0; k <= 4; k++) out.push([c.x + r * Math.cos(s + (da * k) / 4), c.y + r * Math.sin(s + (da * k) / 4)]);
    });
    return out;
  }
  // 截面（mm）：局部 x 东西向，y 沿组件法向、0 在组件上表面；沿局部 z 拉伸单位长度
  const extrude = (pts) => new THREE.ExtrudeGeometry(
    new THREE.Shape(fillet(pts).map(([x, y]) => new V2(x * MM, y * MM))), { depth: 1, bevelEnabled: false });

  // 中压块：局部 x 从缝中线算。U 形槽贴着两侧组件边框伸进缝里，两翼压住边框（翼板根部厚、翼尖薄，底面带齿），
  // 螺栓头坐在槽底。先画右半边（槽口右上角 → 翼尖 → 翼底齿 → 槽壁外侧 → 右下角），左半边镜像
  const Mi = CLAMP.mid, g = FIX.modGapEW / 2, gi = g - Mi.wall, tipM = g + Mi.press, botM = -(Mi.floor + Mi.plate);
  const halfM = [[gi, Mi.top, 0.6], [g + 3, Mi.top], [tipM, Mi.tip, 0.6], [tipM, T.h], ...teeth(tipM - 0.5, g + 1, T.h, 0),
    [g, T.h, 0.4], [g, botM, 1.5]];
  const midGeo = extrude([...halfM, ...halfM.map(([x, y, r]) => [-x, y, r]).reverse(),
    [-gi, -Mi.floor, 0.8], [gi, -Mi.floor, 0.8]]);

  // 边压块：局部 x 从组件边往外。上沿勾住边框（底面带齿），内立板贴着边框外侧下到底板，
  // 底板上放螺栓头，外端一只脚落在檩条上（底面带齿），脚顶比底板高一点
  const Sd = CLAMP.side, fx = Sd.w - Sd.foot, sideBoltX = (Sd.wall + fx) / 2;
  const sideGeo = extrude([[-Sd.press, Sd.tip, 0.6], [-1, Sd.top], [Sd.wall, Sd.top, 1.2], [Sd.wall, -Sd.floor, 0.8],
    [fx, -Sd.floor, 0.8], [fx, -Sd.floor + 2, 0.6], [Sd.w, -Sd.floor + 2, 1], [Sd.w, -H + T.h],
    ...teeth(Sd.w - 0.5, fx + 0.5, -H + T.h, -H), [fx, -H + T.h], [fx, -Sd.floor - Sd.plate, 0.6], [0, -Sd.floor - Sd.plate, 1.5],
    [0, T.h, 0.4], ...teeth(-1, -Sd.press + 0.5, T.h, 0), [-Sd.press, T.h]]);

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
      const bolt = (kind, z) => c.bolts.add(kind, at(z, 0, S.hModBot - FIX.purlin.t), n.clone().negate(), u);
      for (const z of gaps) { put(mid, z, 1); bolt('clampMid', z); }
      for (const sx of [-1, 1]) { put(side, sx * e, sx); bolt('clampSide', sx * (e + sideBoltX)); }
    }
    PV.instanced(c.hw, midGeo, M.clamp, mid);
    PV.instanced(c.hw, sideGeo, M.clamp, side);
    return { mid: mid.length, side: side.length };
  }

  PV.parts.clamp = { build };
})();
