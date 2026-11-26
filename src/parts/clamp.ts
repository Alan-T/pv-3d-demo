import type { PartOptions, BuildContext } from '../part-types.ts';
import { createClampGeometry } from '../clamp-geometry.ts';
import { CLAMP_PROFILE, getClampSpec } from '../clamp-spec.ts';
import { EZ, V, MM, instanced } from '../core.ts';
import * as THREE from 'three';

/** 构件实例：构造参数配置本构件，build 接收本次支架的放置上下文。 */
export class ClampPart {
  build;
  sideBoltX;

  constructor({
    modGapEWSection,
    purlinSection,
    clampMaterial,
    track,
  }: PartOptions['clamp']) {
  /* 压块固定（固定方式选“压块”时）：组件东西向每道缝上一个中压块，阵列东西两端各一个边压块，沿坡对齐每根檩条。
   * 每个压块 1 颗 M8 内六角螺栓，螺栓头坐在压块槽底，穿过檩条上翼缘，螺母在翼缘下面。 */
  const T = CLAMP_PROFILE.teeth, V2 = THREE.Vector2;

  // 一排锯齿：从 x0 到 x1，齿根在 yb、齿尖在 yt
  function teeth(x0: number, x1: number, yb: number, yt: number) {
    const n = Math.max(1, Math.round(Math.abs(x1 - x0) / T.pitch)), d = (x1 - x0) / n, pts = [];
    for (let i = 0; i < n; i++) pts.push([x0 + d * i, yb], [x0 + d * (i + 0.5), yt]);
    pts.push([x1, yb]);
    return pts;
  }
  // 倒圆角：点带第三个数 r 的，按半径 r 倒圆（每个角 4 段）
  function fillet(pts: number[][]) {
    const out: number[][] = [], n = pts.length;
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
  // 中压块：局部 x 从缝中线算。U 形槽贴着两侧组件边框伸进缝里，两翼压住边框（翼板根部厚、翼尖薄，底面带齿），
  // 先画右半边（槽口 → 翼尖 → 翼底齿 → 槽壁 → 槽底），左半边镜像。
  const Mi = CLAMP_PROFILE.mid;
  function midProfile(width: number) {
    const g = width / 2, gi = g - Mi.wall, tipM = g + Mi.press, botM = -(Mi.floor + Mi.plate);
    const halfM = [[gi, Mi.top, 0.6], [g + 3, Mi.top], [tipM, Mi.tip, 0.6], [tipM, T.h], ...teeth(tipM - 0.5, g + 1, T.h, 0),
      [g, T.h, 0.4], [g, botM, 1.5]];
    return fillet([...halfM, ...halfM.map(([x, y, r]) => [-x, y, r]).reverse(),
      [-gi, -Mi.floor, 0.8], [gi, -Mi.floor, 0.8]]);
  }

  // 边压块：局部 x 从组件边往外。上沿勾住边框（底面带齿），内立板贴着边框外侧下到底板，底板上放螺栓头。
  // 外端是倒 T 形的脚：底板上表面在外端大圆角转下来成短立柱（x 从 s0 到 s1），立柱下面是更宽的脚垫（x 从 p0 到 w），
  // 脚垫底面带齿落在檩条上，上沿按所选边压块的总高定位。
  const Sd = CLAMP_PROFILE.side, p0 = Sd.w - Sd.foot, s0 = Sd.w - (Sd.foot + Sd.stem) / 2, s1 = s0 + Sd.stem;
  const floorBot = -Sd.floor - Sd.plate, sideBoltX = (Sd.wall + s1) / 2;
  function sideProfile(H: number, height: number) {
    const padTop = -H + T.h + Sd.pad, top = height - H;
    // 30 mm 组件的脚垫与底板在高度上重叠，沿两者合并后的外缘画截面。
    const innerFoot = padTop >= floorBot ? [[p0, floorBot, 0.4]]
      : [[p0, padTop, 0.8], [s0, padTop, 0.6], [s0, floorBot, 0.8]];
    return fillet([[-Sd.press, Sd.tip, 0.6], [-1, top], [Sd.wall, top, 1.2], [Sd.wall, -Sd.floor, 0.8],
      [s1, -Sd.floor, 2], [s1, padTop, 0.8], [Sd.w, padTop, 0.8], [Sd.w, -H + T.h],
      ...teeth(Sd.w - 0.4, p0 + 0.4, -H + T.h, -H), [p0, -H + T.h], ...innerFoot,
      [0, floorBot, 1.5], [0, T.h, 0.4], ...teeth(-1, -Sd.press + 0.5, T.h, 0), [-Sd.press, T.h]]);
  }

  // 返回中压块、边压块个数
  function build(c: BuildContext) {
    const { P, S, layout, u, n } = c;
    const H = P.modT, spec = getClampSpec(H, P.clampL), e = layout.arrW / 2;
    const gaps = [];
    for (let j = 1; j < layout.cols; j++) gaps.push(-e + j * layout.pitchEW - modGapEWSection / 2);
    const mid: THREE.Matrix4[] = [], side: THREE.Matrix4[] = [];
    for (const tp of S.purlins) {
      const q = S.along(tp);
      const at = (z: number, du: number, dn: number) => V(q.x, q.y, z).addScaledVector(u, du * MM).addScaledVector(n, dn * MM);
      // 局部 x 朝组件外侧，局部 z 沿坡；两端压块绕法向转向，保持右手坐标系。
      const put = (list: THREE.Matrix4[], z: number, sx: number) => list.push(new THREE.Matrix4()
        .makeBasis(EZ.clone().multiplyScalar(sx), n, u.clone().multiplyScalar(-sx))
        .setPosition(at(z, 0, S.hModBot + H)));
      const bolt = (kind: string, z: number) => c.bolts.add(kind, at(z, 0, S.hModBot - purlinSection.t), n.clone().negate(), u);
      for (const z of gaps) { put(mid, z, 1); bolt('clampMid', z); }
      for (const sx of [-1, 1]) { put(side, sx * e, sx); bolt('clampSide', sx * (e + sideBoltX)); }
    }
    const midGeo = track(createClampGeometry(midProfile(spec.mid.width), spec.mid.length, 0, spec.mid.holeDiameter, -Mi.floor, Mi.plate));
    const sideGeo = track(createClampGeometry(sideProfile(H, spec.edge.height), spec.edge.length, sideBoltX, spec.edge.holeDiameter, -Sd.floor, Sd.plate));
    instanced(c.hwSlope, midGeo, clampMaterial, mid);
    instanced(c.hwSlope, sideGeo, clampMaterial, side);
    return { mid: mid.length, side: side.length };
  }
    this.build = build;
    this.sideBoltX = sideBoltX;
  }
}
