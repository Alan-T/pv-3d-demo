import { getScene } from './scene.ts';
import { FONT, V, V3, MM, DEG, track, ewPlace, shared, getBuiltState } from './core.ts';
import { P } from './model-parameters.ts';
import { build as jointDetailBuild } from './joint-detail.ts';
import * as THREE from 'three';

import type { Solution, EWLayout } from './solve.ts';

/* 尺寸标注：侧视、东西向、垂直组件视图的标注；文字精灵保持固定屏幕像素大小。连接节点详图见 joint-detail.ts */

const dimLineMat = new THREE.LineBasicMaterial({ color: 0x2f9e44, depthTest: false, transparent: true });
const refLineMat = new THREE.LineBasicMaterial({ color: 0x7d8790, depthTest: false, transparent: true });
const groundLineMat = new THREE.LineBasicMaterial({ color: 0x8a6a35, depthTest: false, transparent: true });
const centerLineMat = new THREE.LineDashedMaterial({ color: 0xd23b3b, dashSize: 0.016, gapSize: 0.006, depthTest: false, transparent: true });
const purlinLineMat = new THREE.LineBasicMaterial({ color: 0x1f5c34, depthTest: false, transparent: true });
const beamLineMat = new THREE.LineBasicMaterial({ color: 0xd8861a, depthTest: false, transparent: true });
const dashMat = new THREE.LineDashedMaterial({ color: 0x7d8790, dashSize: 0.08, gapSize: 0.06, depthTest: false, transparent: true });
const KIND = { in: '#1958d0', out: '#1f1f1f', ref: '#5f6873' };

type LabelKind = keyof typeof KIND;

function makeLabel(text: string | number, kind: LabelKind, px?: number) {
  const fs = 40;
  const padX = 12;
  const padY = 6;
  const cv = document.createElement('canvas');
  const g = cv.getContext('2d')!;
  g.font = `600 ${fs}px ${FONT}`;
  const w = Math.ceil(g.measureText(String(text)).width) + padX * 2;
  const h = fs + padY * 2;
  cv.width = w;
  cv.height = h;
  g.font = `600 ${fs}px ${FONT}`;
  g.fillStyle = 'rgba(255,255,255,0.86)';
  const r = 10;
  g.beginPath();
  g.moveTo(r, 0);
  g.arcTo(w, 0, w, h, r);
  g.arcTo(w, h, 0, h, r);
  g.arcTo(0, h, 0, 0, r);
  g.arcTo(0, 0, w, 0, r);
  g.fill();
  g.fillStyle = KIND[kind] || KIND.out;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(String(text), w / 2, h / 2 + 2);

  const tex = new THREE.CanvasTexture(cv);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
  track(tex, mat);
  const sp = new THREE.Sprite(mat);
  sp.renderOrder = 1001;
  sp.userData = { aspect: w / h, px: px || 15 };
  shared.labels.push(sp);
  return sp;
}

/** 标记可点击编辑的蓝字标注对应参数。 */
function editable<T extends THREE.Sprite | { label: THREE.Sprite }>(d: T, k: keyof typeof P): T {
  const sprite = d instanceof THREE.Sprite ? d : d.label;
  sprite.userData.edit = k;
  return d;
}

class DimSet {
  group = new THREE.Group();
  pos: number[] = [];
  dash: number[] = [];

  seg(a: THREE.Vector3, b: THREE.Vector3, dashed = false) {
    (dashed ? this.dash : this.pos).push(a.x, a.y, a.z, b.x, b.y, b.z);
  }

  label(text: string | number, at: THREE.Vector3, kind: LabelKind, px?: number) {
    const l = makeLabel(text, kind, px);
    l.position.copy(at);
    this.group.add(l);
    return l;
  }

  /** a、b 为被测点，off 为尺寸线相对被测点的偏移（米）；k 为界线留空、出头和斜短线的比例。 */
  dim(a: THREE.Vector3, b: THREE.Vector3, off: THREE.Vector3, text: string | number, kind: LabelKind, px?: number, k = 1) {
    const on = off.clone().normalize();
    const A = a.clone().add(off);
    const B = b.clone().add(off);
    this.seg(a.clone().addScaledVector(on, 0.03 * k), A.clone().addScaledVector(on, 0.05 * k));
    this.seg(b.clone().addScaledVector(on, 0.03 * k), B.clone().addScaledVector(on, 0.05 * k));
    this.seg(A, B);
    const tick = B.clone().sub(A).normalize().add(on).normalize().multiplyScalar(0.045 * k);
    this.seg(A.clone().sub(tick), A.clone().add(tick));
    this.seg(B.clone().sub(tick), B.clone().add(tick));
    const label = this.label(text, A.clone().add(B).multiplyScalar(0.5), kind, px);
    return { label, A, B };
  }

  finish(lineMat: THREE.LineBasicMaterial, dashLineMat?: THREE.LineBasicMaterial) {
    for (const [arr, mat] of [[this.pos, lineMat], [this.dash, dashLineMat || dashMat]] as const) {
      if (!arr.length) continue;
      const g = track(new THREE.BufferGeometry());
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const ls = new THREE.LineSegments(g, mat);
      if (mat instanceof THREE.LineDashedMaterial) ls.computeLineDistances();
      ls.renderOrder = 1000;
      this.group.add(ls);
    }
    return this.group;
  }
}

function addFrameDimensions(
  S: Solution,
  layout: ReturnType<typeof getBuiltState>['layout'],
  sets: { key: DimSet; side: DimSet; deep: DimSet; ref: DimSet; groundLine: DimSet },
) {
  const { key, side, deep, ref, groundLine } = sets;
  const r = Math.round;
  const zd = layout.zs[layout.zs.length - 1] + 450; // 标注放在最东一榀前面（侧视图朝向相机）
  const v = (x: number, y: number) => V(x, y, zd);
  const n = new V3(-S.s, S.c, 0);
  const off = (dx: number, dy: number) => new V3(dx * MM, dy * MM, 0);
  const offN = (k: number) => n.clone().multiplyScalar(k * MM);
  const at = (t: number, h: number) => {
    const q = S.along(t);
    return v(q.x - S.s * h, q.y + S.c * h);
  };

  // ±0 水平线与倾角
  const gx0 = -900;
  const gx1 = S.xr + 1100;
  ref.seg(v(gx0, 0), v(gx1, 0));
  ref.label('±0.000', v(gx0, 60), 'ref', 13);

  const th = P.tilt * DEG;
  const x0 = S.xf - S.nodeF / Math.tan(th);
  const R = S.xf + 0.6 * P.span - x0;
  const arcAt = (a: number) => v(x0 + R * Math.cos(a), R * Math.sin(a));
  for (let i = 0; i < 48; i++) key.seg(arcAt((th * i) / 48), arcAt((th * (i + 1)) / 48));
  for (const a of [0, th]) {
    const p = arcAt(a);
    const tick = new V3(Math.cos(a) - Math.sin(a), Math.sin(a) + Math.cos(a), 0).normalize().multiplyScalar(0.045);
    key.seg(p.clone().sub(tick), p.clone().add(tick));
  }
  editable(key.label(`${P.tilt}°`, arcAt(th / 2), 'in'), 'tilt');

  if (P.slopeNS) {
    const up = P.slopeNS > 0;
    groundLine.seg(v(gx0, S.gy(gx0)), v(gx1, S.gy(gx1)));
    editable(
      groundLine.label(`${up ? '南向坡' : '北向坡'} ${Math.abs(P.slopeNS)}%`, v(gx1 + 380, S.gy(gx1) + (up ? 40 : -40)), 'in', 13),
      'slopeNS',
    );
    side.dim(v(S.xr, 0), v(S.xr, S.gR), off(620, 0), r(Math.abs(S.gR)), 'out');
    if (!P.alongSlope) {
      ref.seg(v(gx0, -S.gy(gx0)), v(gx1, -S.gy(gx1)), true);
      ref.label(`反向参考 · ${up ? '北向坡' : '南向坡'} ${Math.abs(P.slopeNS)}%`, v(S.xr, -S.gR + (up ? -120 : 120)), 'ref', 13);
      side.dim(v(S.xr, 0), v(S.xr, -S.gR), off(620, 0), r(Math.abs(S.gR)), 'out');
    }
  }

  // 高度与间距
  editable(key.dim(v(0, 0), v(0, P.h0), off(-230, 0), r(P.h0), 'in'), 'h0');
  editable(key.dim(v(S.xf, 0), v(S.xr, 0), off(0, -170), r(P.span), 'in'), 'span');
  key.dim(v(S.xf, 0), v(S.xf, S.topF), off(230, 0), r(S.topF), 'out');
  editable(side.dim(v(S.xf, 0), v(S.xf, P.braceHF), off(-230, 0), P.braceHF, 'in'), 'braceHF');
  key.dim(v(S.xr, 0), v(S.xr, S.topR), off(-260, 0), r(S.topR), 'out');
  editable(side.dim(v(S.xr, 0), v(S.xr, P.braceHR), off(230, 0), P.braceHR, 'in'), 'braceHR');

  // 斜梁、斜撑连接点、悬挑
  key.dim(at(0, 0), at(S.beamLen, 0), offN(-430), r(S.beamLen), 'out');
  editable(side.dim(at(0, 0), at(S.tF, 0), offN(-210), r(S.tF), 'in'), 'braceTopF');
  editable(side.dim(at(S.tR, 0), at(S.beamLen, 0), offN(-210), r(S.beamLen - S.tR), 'in'), 'braceTopR');
  side.dim(at(S.beamLen - S.ovh, 0), at(S.beamLen, 0), offN(420), r(S.ovh), 'out');
  if (S.outer) {
    editable(side.dim(at(0, 0), at(S.outer.toF, 0), offN(-320), r(S.outer.toF), 'in'), 'braceOutF');
    editable(side.dim(at(S.outer.toR, 0), at(S.beamLen, 0), offN(-320), r(S.beamLen - S.outer.toR), 'in'), 'braceOutR');
  }

  // 组件与檩条
  const hTop = S.hModBot + P.modT;
  for (const m0 of S.modStarts) editable(side.dim(at(m0, hTop), at(m0 + P.modL, hTop), offN(560), P.modL, 'in'), 'modL');
  editable(side.dim(at(S.purlins[0], S.hModBot), at(S.purlins[1], S.hModBot), offN(330), P.hole, 'in'), 'hole');

  // 斜撑长度（标在斜撑外下侧）
  const braceDims = layout.joints.flatMap((j) => [j, ...(j.o ? [j.o] : [])]).map((j) => [j.E, j.end, j.len] as const);
  for (const [B, T, Lb] of braceDims) {
    const dx = T.x - B.x;
    const dy = T.y - B.y;
    const l = Math.hypot(dx, dy);
    let px = -dy / l;
    let py = dx / l;
    if (py > 0) {
      px = -px;
      py = -py;
    }
    side.dim(v(B.x, B.y), v(T.x, T.y), off(px * 160, py * 160), r(Lb), 'out');
  }

  // 地下部分
  editable(deep.dim(v(S.xf, S.botF), v(S.xf, 0), off(230, 0), P.embed, 'in'), 'embed');
  editable(deep.dim(v(S.xr, S.botR), v(S.xr, S.embedLevelR), off(-260, 0), P.embed, 'in'), 'embed');
  deep.dim(v(S.xf, S.botF), v(S.xf, S.topF), off(-470, 0), r(S.lenF), 'out');
  deep.dim(v(S.xr, S.botR), v(S.xr, S.topR), off(480, 0), r(S.lenR), 'out');
}

function addEastWestDimensions(layout: EWLayout, ew: DimSet) {
  const r = Math.round;
  const xs = -500;
  const ca = layout.ew.ca;
  const off = (dx: number, dy: number) => new V3(dx * MM, dy * MM, 0);
  const hz = (l: number) => (layout.ew.i ? `（水平 ${r(l * ca)}）` : '');
  const zsE = layout.zs;
  if (zsE.length > 1) editable(ew.dim(V(xs, 0, zsE[0]), V(xs, 0, zsE[1]), off(-300, 0), `首末跨榀距 ${P.pitchEnd}${hz(P.pitchEnd)}`, 'in'), 'pitchEnd');
  if (zsE.length > 3) editable(ew.dim(V(xs, 0, zsE[1]), V(xs, 0, zsE[2]), off(-300, 0), `中间跨榀距 ${P.pitch}${hz(P.pitch)}`, 'in'), 'pitch');
  editable(ew.dim(V(xs, 0, -layout.arrW / 2), V(xs, 0, layout.arrW / 2), off(-750, 0), `组件阵列 ${r(layout.arrW)}（${layout.cols} 列）`, 'in'), 'cols');
  if (layout.ew.i) {
    ew.label(`实际地面 ${P.slopeEW > 0 ? '东高西低' : '东低西高'} ${Math.abs(P.slopeEW)}%`, V(xs, -450, layout.arrW * 0.3), 'ref', 13);
  }
}

function addNormalDimensions(S: Solution, layout: EWLayout, nrm: DimSet, topCuts: DimSet, purlinLines: DimSet, beamLines: DimSet) {
  const r = Math.round;
  const hN = S.hModBot + P.modT + 150;
  const pS = (t: number, z: number) => {
    const q = S.along(t);
    return V(q.x - S.s * hN, q.y + S.c * hN, z);
  };
  const offU = (k: number) => new V3(S.c, S.s, 0).multiplyScalar(k * MM);
  const offZ = (k: number) => new V3(0, 0, k * MM);
  const halfL = layout.purlinLen / 2;
  const tLow = S.modStarts[0];
  const tHigh = S.modStarts[S.modStarts.length - 1] + P.modL;

  nrm.dim(pS(tHigh, -halfL), pS(tHigh, halfL), offU(700), `檩条 ×${S.purlins.length}　${S.sections.purlin.name}　总长 ${r(layout.purlinLen)}`, 'out', 13);
  if (layout.cuts.valid) {
    for (const seg of layout.cuts.segments) {
      const text = String(Math.round(seg.length * 10) / 10);
      nrm.dim(pS(tHigh, seg.start), pS(tHigh, seg.start + seg.length), offU(350), text, 'out', 13);
      topCuts.dim(pS(tHigh, seg.start), pS(tHigh, seg.start + seg.length), offU(350), text, 'out', 13);
    }
  }
  topCuts.dim(pS(tHigh, -halfL), pS(tHigh, halfL), offU(700), `檩条总长 ${r(layout.purlinLen)}（接缝4）`, 'out', 13);

  const stops = [-halfL, ...layout.zs, halfL];
  const last = stops.length - 2;
  for (let i = 0; i <= last; i++) {
    const d = nrm.dim(pS(tLow, stops[i]), pS(tLow, stops[i + 1]), offU(-350), r(stops[i + 1] - stops[i]), i === 0 || i === last ? 'out' : 'in');
    if (i === 0) d.label.userData.outside = { at: d.A, dir: new V3(0, 0, -1) };
    else if (i === last) d.label.userData.outside = { at: d.B, dir: new V3(0, 0, 1) };
    else {
      const endBay = i === 1 || i === last - 1;
      editable(d, endBay ? 'pitchEnd' : 'pitch').label.userData.fit = { span: d.A.distanceTo(d.B), key: 'pitch' };
    }
  }
  if (last > 1) {
    const nb = layout.bays.length;
    const mid = nb - 2;
    const text =
      P.pitchEnd === P.pitch || nb < 2
        ? `${nb} × ${P.pitch === P.pitchEnd || nb < 3 ? P.pitchEnd : P.pitch}`
        : mid > 0
          ? `${P.pitchEnd} + ${mid} × ${P.pitch} + ${P.pitchEnd}`
          : `${P.pitchEnd} + ${P.pitchEnd}`;
    editable(nrm.label(text, pS(tLow, 0).add(offU(-350)), 'in'), mid > 0 ? 'pitch' : 'pitchEnd').userData.altFor = 'pitch';
  }

  for (let i = 0; i < S.purlins.length - 1; i++) {
    nrm.dim(pS(S.purlins[i], -halfL), pS(S.purlins[i + 1], -halfL), offZ(-350), r(S.purlins[i + 1] - S.purlins[i]), 'out');
  }
  for (const m0 of S.modStarts) editable(nrm.dim(pS(m0, halfL), pS(m0 + P.modL, halfL), offZ(350), P.modL, 'in'), 'modL');

  for (const t of S.purlins) purlinLines.seg(pS(t, -halfL), pS(t, halfL));
  for (const z of layout.zs) beamLines.seg(pS(0, z), pS(S.beamLen, z));
}

function build() {
  const { S, layout } = getBuiltState();
  const key = new DimSet();
  const side = new DimSet();
  const deep = new DimSet();
  const ref = new DimSet();
  const groundLine = new DimSet();
  const ew = new DimSet();
  const nrm = new DimSet();
  const topCuts = new DimSet();
  const purlinLines = new DimSet();
  const beamLines = new DimSet();

  addFrameDimensions(S, layout, { key, side, deep, ref, groundLine });
  addEastWestDimensions(layout, ew);
  addNormalDimensions(S, layout, nrm, topCuts, purlinLines, beamLines);

  const jointG = jointDetailBuild(S, layout);
  const deepG = deep.finish(dimLineMat);
  const sideG = new THREE.Group();
  sideG.add(side.finish(dimLineMat), ref.finish(refLineMat), deepG);
  const keyG = new THREE.Group();
  keyG.add(key.finish(dimLineMat), groundLine.finish(groundLineMat));
  const ewG = ew.finish(dimLineMat);
  const normalG = nrm.finish(dimLineMat);
  const topCutsG = topCuts.finish(dimLineMat);
  normalG.add(purlinLines.finish(purlinLineMat), beamLines.finish(beamLineMat));

  // 东西坡度：侧视标注跟着最东一榀平移，东西向、垂直组件视图的标注顺坡
  const zLast = layout.zs[layout.zs.length - 1];
  for (const gr of [keyG, sideG]) ewPlace(gr, layout.ew, zLast);
  for (const gr of [ewG, normalG, topCutsG]) ewPlace(gr, layout.ew);

  const rootG = new THREE.Group();
  rootG.add(keyG, sideG, ewG, normalG, jointG, topCutsG);
  getScene().root.add(rootG);
  shared.state.dims = { root: rootG, key: keyG, side: sideG, deep: deepG, ew: ewG, normal: normalG, joint: jointG, topCuts: topCutsG };
}

// 标注文字保持固定的屏幕像素高度（每帧调用）
const tmpV = new V3();
const camDir = new V3();
const labelRight = new V3();
const labelParentInverse = new THREE.Matrix3();

function updateLabels(cam: THREE.PerspectiveCamera | THREE.OrthographicCamera, viewport: Pick<HTMLElement, 'clientHeight' | 'clientWidth'> = getScene().canvas) {
  const hpx = viewport.clientHeight || 1;
  const k = (shared.state.labelK = viewport.clientWidth < 520 ? 1.0 : 1.25);
  const collapsed = new Set();
  cam.getWorldDirection(camDir);

  for (const sp of shared.labels) {
    sp.getWorldPosition(tmpV);
    const wpp =
      cam instanceof THREE.PerspectiveCamera
        ? (2 * Math.max(0.05, tmpV.sub(cam.position).dot(camDir)) * Math.tan((cam.fov * DEG) / 2)) / hpx
        : (cam.top - cam.bottom) / cam.zoom / hpx;

    const ud = sp.userData;
    const hgt = ud.px * k * wpp;
    const w = hgt * ud.aspect;
    sp.scale.set(w, hgt, 1);

    if (ud.outside) {
      let direction = ud.outside.dir;
      if (ud.outside.screenSide) {
        labelParentInverse.setFromMatrix4(sp.parent!.matrixWorld).invert();
        direction = labelRight.setFromMatrixColumn(cam.matrixWorld, 0).multiplyScalar(ud.outside.screenSide).applyMatrix3(labelParentInverse);
      }
      sp.position.copy(ud.outside.at).addScaledVector(direction, w / 2 + 6 * wpp);
    }
    if (ud.fit && w >= ud.fit.span * 0.92) collapsed.add(ud.fit.key);
  }

  for (const sp of shared.labels) {
    const { fit, altFor } = sp.userData;
    if (fit) sp.visible = !collapsed.has(fit.key);
    else if (altFor) sp.visible = collapsed.has(altFor);
  }
}

const mats = { line: dimLineMat, center: centerLineMat };

function disposeDimensions() {
  for (const material of [dimLineMat, refLineMat, groundLineMat, centerLineMat, purlinLineMat, beamLineMat, dashMat]) {
    material.dispose();
  }
}

export { build, updateLabels, disposeDimensions, DimSet, mats };
