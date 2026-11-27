import type { PartOptions, BuildContext } from '../part-types.ts';
import { createClampGeometry } from '../clamp-geometry.ts';
import { CLAMP_PROFILE, getClampSpec } from '../clamp-spec.ts';
import { EZ, V, MM, instanced } from '../core.ts';
import * as THREE from 'three';

const TEETH = CLAMP_PROFILE.teeth;
const MID = CLAMP_PROFILE.mid;
const SIDE = CLAMP_PROFILE.side;

const SIDE_FOOT_INNER = SIDE.w - SIDE.foot;
const SIDE_STEM_INNER = SIDE.w - (SIDE.foot + SIDE.stem) / 2;
const SIDE_STEM_OUTER = SIDE_STEM_INNER + SIDE.stem;
const SIDE_FLOOR_BOT = -SIDE.floor - SIDE.plate;
const SIDE_BOLT_X = (SIDE.wall + SIDE_STEM_OUTER) / 2;

/** 生成一排锯齿：从 x0 到 x1，齿根在 yb、齿尖在 yt。 */
function teeth(x0: number, x1: number, yb: number, yt: number): number[][] {
  const count = Math.max(1, Math.round(Math.abs(x1 - x0) / TEETH.pitch));
  const step = (x1 - x0) / count;
  const pts: number[][] = [];
  for (let i = 0; i < count; i++) {
    pts.push([x0 + step * i, yb], [x0 + step * (i + 0.5), yt]);
  }
  pts.push([x1, yb]);
  return pts;
}

/** 对带第三分量圆角半径 r 的顶点序列倒圆（每个角 4 段）。 */
function fillet(pts: number[][]): number[][] {
  const out: number[][] = [];
  const n = pts.length;
  pts.forEach(([x, y, r], i) => {
    if (!r) return out.push([x, y]);
    const p = new THREE.Vector2(x, y);
    const a = new THREE.Vector2(...pts[(i + n - 1) % n]).sub(p).normalize();
    const b = new THREE.Vector2(...pts[(i + 1) % n]).sub(p).normalize();
    const half = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1)) / 2;
    const d = r / Math.tan(half);
    const center = a.clone().add(b).normalize().multiplyScalar(r / Math.sin(half)).add(p);
    const start = Math.atan2(p.y + a.y * d - center.y, p.x + a.x * d - center.x);
    const end = Math.atan2(p.y + b.y * d - center.y, p.x + b.x * d - center.x);
    const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
    for (let k = 0; k <= 4; k++) {
      out.push([
        center.x + r * Math.cos(start + (delta * k) / 4),
        center.y + r * Math.sin(start + (delta * k) / 4),
      ]);
    }
  });
  return out;
}

/**
 * 中压块截面轮廓：局部 x 从缝中线算。
 * 先画右半边（槽口 -> 翼尖 -> 翼底齿 -> 槽壁 -> 槽底），左半边镜像。
 */
function midProfile(width: number): number[][] {
  const g = width / 2;
  const gi = g - MID.wall;
  const tipM = g + MID.press;
  const botM = -(MID.floor + MID.plate);
  const half = [
    [gi, MID.top, 0.6],
    [g + 3, MID.top],
    [tipM, MID.tip, 0.6],
    [tipM, TEETH.h],
    ...teeth(tipM - 0.5, g + 1, TEETH.h, 0),
    [g, TEETH.h, 0.4],
    [g, botM, 1.5],
  ];
  return fillet([
    ...half,
    ...half.map(([x, y, r]) => [-x, y, r]).reverse(),
    [-gi, -MID.floor, 0.8],
    [gi, -MID.floor, 0.8],
  ]);
}

/**
 * 边压块截面轮廓：局部 x 从组件边往外。
 * 上沿勾住边框（底面带齿），内立板下到底板，外端为倒 T 形脚垫落在檩条上。
 */
function sideProfile(modT: number, height: number): number[][] {
  const padTop = -modT + TEETH.h + SIDE.pad;
  const top = height - modT;
  // 30 mm 组件的脚垫与底板在高度上重叠，沿两者合并后的外缘画截面。
  const innerFoot = padTop >= SIDE_FLOOR_BOT
    ? [[SIDE_FOOT_INNER, SIDE_FLOOR_BOT, 0.4]]
    : [[SIDE_FOOT_INNER, padTop, 0.8], [SIDE_STEM_INNER, padTop, 0.6], [SIDE_STEM_INNER, SIDE_FLOOR_BOT, 0.8]];

  return fillet([
    [-SIDE.press, SIDE.tip, 0.6],
    [-1, top],
    [SIDE.wall, top, 1.2],
    [SIDE.wall, -SIDE.floor, 0.8],
    [SIDE_STEM_OUTER, -SIDE.floor, 2],
    [SIDE_STEM_OUTER, padTop, 0.8],
    [SIDE.w, padTop, 0.8],
    [SIDE.w, -modT + TEETH.h],
    ...teeth(SIDE.w - 0.4, SIDE_FOOT_INNER + 0.4, -modT + TEETH.h, -modT),
    [SIDE_FOOT_INNER, -modT + TEETH.h],
    ...innerFoot,
    [0, SIDE_FLOOR_BOT, 1.5],
    [0, TEETH.h, 0.4],
    ...teeth(-1, -SIDE.press + 0.5, TEETH.h, 0),
    [-SIDE.press, TEETH.h],
  ]);
}

/**
 * 压块固定构件（固定方式选“压块”时）：
 * 组件东西向每道缝上一个中压块，阵列东西两端各一个边压块，沿坡对齐每根檩条。
 * 每个压块 1 颗 M8 内六角螺栓，螺栓头坐在压块槽底，穿过檩条上翼缘，螺母在翼缘下面。
 */
export class ClampPart {
  readonly sideBoltX = SIDE_BOLT_X;
  private readonly modGapEWSection;
  private readonly purlinSection;
  private readonly material;
  private readonly track;

  constructor({
    modGapEWSection,
    purlinSection,
    clampMaterial,
    track,
  }: PartOptions['clamp']) {
    this.modGapEWSection = modGapEWSection;
    this.purlinSection = purlinSection;
    this.material = clampMaterial;
    this.track = track;
  }

  /** 生成中压块、边压块及对应 M8 螺栓，返回中/边压块数量。 */
  build(c: BuildContext) {
    const { P, S, layout, u, n } = c;
    const modT = P.modT;
    const spec = getClampSpec(modT, P.clampL);
    const halfWidth = layout.arrW / 2;
    const gaps: number[] = [];
    for (let j = 1; j < layout.cols; j++) {
      gaps.push(-halfWidth + j * layout.pitchEW - this.modGapEWSection / 2);
    }

    const midMatrices: THREE.Matrix4[] = [];
    const sideMatrices: THREE.Matrix4[] = [];
    for (const tp of S.purlins) {
      const q = S.along(tp);
      const at = (z: number, du: number, dn: number) =>
        V(q.x, q.y, z).addScaledVector(u, du * MM).addScaledVector(n, dn * MM);
      // 局部 x 朝组件外侧，局部 z 沿坡；两端压块绕法向转向，保持右手坐标系。
      const put = (list: THREE.Matrix4[], z: number, sx: number) =>
        list.push(
          new THREE.Matrix4()
            .makeBasis(EZ.clone().multiplyScalar(sx), n, u.clone().multiplyScalar(-sx))
            .setPosition(at(z, 0, S.hModBot + modT)),
        );
      const bolt = (kind: string, z: number) =>
        c.bolts.add(kind, at(z, 0, S.hModBot - this.purlinSection.t), n.clone().negate(), u);

      for (const z of gaps) {
        put(midMatrices, z, 1);
        bolt('clampMid', z);
      }
      for (const sx of [-1, 1]) {
        put(sideMatrices, sx * halfWidth, sx);
        bolt('clampSide', sx * (halfWidth + this.sideBoltX));
      }
    }

    const midGeo = this.track(
      createClampGeometry(midProfile(spec.mid.width), spec.mid.length, 0, spec.mid.holeDiameter, -MID.floor, MID.plate),
    );
    const sideGeo = this.track(
      createClampGeometry(sideProfile(modT, spec.edge.height), spec.edge.length, this.sideBoltX, spec.edge.holeDiameter, -SIDE.floor, SIDE.plate),
    );
    instanced(c.hwSlope, midGeo, this.material, midMatrices);
    instanced(c.hwSlope, sideGeo, this.material, sideMatrices);
    return { mid: midMatrices.length, side: sideMatrices.length };
  }
}
