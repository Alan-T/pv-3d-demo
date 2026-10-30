/* 尺寸标注：侧视、东西向、垂直组件视图的标注；文字精灵保持固定屏幕像素大小。连接节点详图见 joint-detail.js */
(function () {
  'use strict';
  const PV = window.PV;
  const { DEG, MM, V3, V, FIX, FONT, canvas, root } = PV;

  const dimLineMat = new THREE.LineBasicMaterial({ color: 0x2f9e44, depthTest: false, transparent: true });
  const refLineMat = new THREE.LineBasicMaterial({ color: 0x7d8790, depthTest: false, transparent: true });
  const groundLineMat = new THREE.LineBasicMaterial({ color: 0x8a6a35, depthTest: false, transparent: true });
  const centerLineMat = new THREE.LineDashedMaterial({ color: 0xd23b3b, dashSize: 0.016, gapSize: 0.006, depthTest: false, transparent: true });
  const purlinLineMat = new THREE.LineBasicMaterial({ color: 0x1f5c34, depthTest: false, transparent: true });
  const beamLineMat = new THREE.LineBasicMaterial({ color: 0xd8861a, depthTest: false, transparent: true });
  const dashMat = new THREE.LineDashedMaterial({ color: 0x7d8790, dashSize: 0.08, gapSize: 0.06, depthTest: false, transparent: true });
  const KIND = { in: '#1958d0', out: '#1f1f1f', ref: '#5f6873' };

  function makeLabel(text, kind, px) {
    const fs = 40, padX = 12, padY = 6;
    const cv = document.createElement('canvas');
    const g = cv.getContext('2d');
    g.font = `600 ${fs}px ${FONT}`;
    const w = Math.ceil(g.measureText(text).width) + padX * 2, h = fs + padY * 2;
    cv.width = w; cv.height = h;
    g.font = `600 ${fs}px ${FONT}`;
    g.fillStyle = 'rgba(255,255,255,0.86)';
    const r = 10;
    g.beginPath();
    g.moveTo(r, 0); g.arcTo(w, 0, w, h, r); g.arcTo(w, h, 0, h, r); g.arcTo(0, h, 0, 0, r); g.arcTo(0, 0, w, 0, r);
    g.fill();
    g.fillStyle = KIND[kind] || KIND.out;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 2);
    const tex = new THREE.CanvasTexture(cv);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, depthWrite: false, transparent: true });
    PV.track(tex, mat);
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 1001;
    sp.userData = { aspect: w / h, px: px || 15 };
    PV.labels.push(sp);
    return sp;
  }

  class DimSet {
    constructor() { this.group = new THREE.Group(); this.pos = []; this.dash = []; }
    seg(a, b, dashed) { (dashed ? this.dash : this.pos).push(a.x, a.y, a.z, b.x, b.y, b.z); }
    label(text, at, kind, px) { const l = makeLabel(text, kind, px); l.position.copy(at); this.group.add(l); return l; }
    // a、b 为被测点，off 为尺寸线相对被测点的偏移（米）
    dim(a, b, off, text, kind, px) {
      const on = off.clone().normalize();
      const A = a.clone().add(off), B = b.clone().add(off);
      this.seg(a.clone().addScaledVector(on, 0.03), A.clone().addScaledVector(on, 0.05));
      this.seg(b.clone().addScaledVector(on, 0.03), B.clone().addScaledVector(on, 0.05));
      this.seg(A, B);
      const tick = B.clone().sub(A).normalize().add(on).normalize().multiplyScalar(0.045);
      this.seg(A.clone().sub(tick), A.clone().add(tick));
      this.seg(B.clone().sub(tick), B.clone().add(tick));
      const label = this.label(text, A.clone().add(B).multiplyScalar(0.5), kind, px);
      return { label, A, B };
    }
    finish(lineMat, dashLineMat) {
      for (const [arr, mat] of [[this.pos, lineMat], [this.dash, dashLineMat || dashMat]]) {
        if (!arr.length) continue;
        const g = PV.track(new THREE.BufferGeometry());
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        const ls = new THREE.LineSegments(g, mat);
        if (mat.isLineDashedMaterial) ls.computeLineDistances();
        ls.renderOrder = 1000;
        this.group.add(ls);
      }
      return this.group;
    }
  }

  function build() {
    const { S, layout } = PV.state, P = PV.P;
    const r = Math.round;
    const zd = layout.zs[layout.zs.length - 1] + 450;    // 标注放在最东一榀前面（侧视图朝向相机）
    const v = (x, y) => V(x, y, zd);
    const n = new V3(-S.s, S.c, 0);
    const off = (dx, dy) => new V3(dx * MM, dy * MM, 0);
    const offN = (k) => n.clone().multiplyScalar(k * MM);
    const at = (t, h) => { const q = S.along(t); return v(q.x - S.s * h, q.y + S.c * h); };  // 斜梁坐标 → 点

    // key：3D 视图也显示的主要尺寸；side/ref/deep：只在侧视图显示的完整标注
    const key = new DimSet(), side = new DimSet(), deep = new DimSet(), ref = new DimSet(), ew = new DimSet();
    // 蓝字标注记下对应的参数，点击可改（d 是 dim() 的返回值或 label 精灵）
    const ed = (d, k) => { (d.label || d).userData.edit = k; return d; };
    const groundLine = new DimSet();

    // ±0 线、设计坡度包络、倾角
    ref.seg(v(-900, 0), v(S.xr + 1100, 0));
    ref.label('±0.000', v(-900, 60), 'ref', 13);
    const ext = P.span + 900, dz = (P.designSlope / 100) * ext;
    ref.seg(v(S.xf, 0), v(S.xf + ext, dz), true);
    ref.seg(v(S.xf, 0), v(S.xf + ext, -dz), true);
    ed(ref.label(`南向坡 ${P.designSlope}%`, v(S.xf + ext + 380, dz + 40), 'in', 13), 'designSlope');
    ed(ref.label(`北向坡 ${P.designSlope}%`, v(S.xf + ext + 380, -dz - 40), 'in', 13), 'designSlope');
    // 倾角（同 CAD 角度标注）：圆心在斜梁中心线与 ±0 线的交点，圆弧从 ±0 线画到斜梁，
    // 半径取到前后立柱之间（离前柱 0.6 倍间距处落地），两端斜短线，文字在圆弧中点
    const th = P.tilt * DEG, x0 = S.xf - S.nodeF / Math.tan(th), R = S.xf + 0.6 * P.span - x0;
    const arcAt = (a) => v(x0 + R * Math.cos(a), R * Math.sin(a));
    for (let i = 0; i < 48; i++) key.seg(arcAt((th * i) / 48), arcAt((th * (i + 1)) / 48));
    for (const a of [0, th]) {
      const p = arcAt(a), tick = new V3(Math.cos(a) - Math.sin(a), Math.sin(a) + Math.cos(a), 0).normalize().multiplyScalar(0.045);
      key.seg(p.clone().sub(tick), p.clone().add(tick));
    }
    ed(key.label(`${P.tilt}°`, arcAt(th / 2), 'in'), 'tilt');
    if (P.slope) {
      const x0 = -900, x1 = S.xr + 1100;
      groundLine.seg(v(x0, S.gy(x0)), v(x1, S.gy(x1)));
      groundLine.label(`实际地面 ${P.slope > 0 ? '南向坡' : '北向坡'} ${Math.abs(P.slope)}%`, v(-150, S.gy(-150) - 120), 'ref', 13);
    }

    // 高度与间距
    ed(key.dim(v(0, 0), v(0, P.h0), off(-230, 0), r(P.h0), 'in'), 'h0');
    ed(key.dim(v(S.xf, 0), v(S.xr, 0), off(0, -170), r(P.span), 'in'), 'span');
    key.dim(v(S.xf, 0), v(S.xf, S.topF), off(230, 0), r(S.topF), 'out');
    ed(side.dim(v(S.xf, 0), v(S.xf, P.braceHF), off(-230, 0), P.braceHF, 'in'), 'braceHF');
    key.dim(v(S.xr, 0), v(S.xr, S.topR), off(-260, 0), r(S.topR), 'out');
    ed(side.dim(v(S.xr, 0), v(S.xr, P.braceHR), off(230, 0), P.braceHR, 'in'), 'braceHR');

    // 斜梁、斜撑连接点、悬挑
    key.dim(at(0, 0), at(S.beamLen, 0), offN(-430), r(S.beamLen), 'out');
    ed(side.dim(at(0, 0), at(S.tF, 0), offN(-210), r(S.tF), 'in'), 'braceTopF');
    ed(side.dim(at(S.tR, 0), at(S.beamLen, 0), offN(-210), r(S.beamLen - S.tR), 'in'), 'braceTopR');
    side.dim(at(S.beamLen - S.ovh, 0), at(S.beamLen, 0), offN(420), r(S.ovh), 'out');
    const O = S.outer;
    if (O) {
      ed(side.dim(at(0, 0), at(O.toF, 0), offN(-320), r(O.toF), 'in'), 'braceOutF');
      ed(side.dim(at(O.toR, 0), at(S.beamLen, 0), offN(-320), r(S.beamLen - O.toR), 'in'), 'braceOutR');
    }

    // 组件与檩条
    const hTop = S.hModBot + FIX.modT;
    for (const m0 of S.modStarts) ed(side.dim(at(m0, hTop), at(m0 + P.modL, hTop), offN(560), P.modL, 'in'), 'modL');
    ed(side.dim(at(S.purlins[0], S.hModBot), at(S.purlins[1], S.hModBot), offN(330), P.hole, 'in'), 'hole');

    // 斜撑长度（标在斜撑外下侧）
    const braceDims = [[S.bF, S.tFp, S.braceF], [S.bR, S.tRp, S.braceR]];
    if (O) braceDims.push([O.oF, O.toFp, O.braceOF], [O.oR, O.toRp, O.braceOR]);
    for (const [B, T, Lb] of braceDims) {
      const dx = T.x - B.x, dy = T.y - B.y, l = Math.hypot(dx, dy);
      let px = -dy / l, py = dx / l;
      if (py > 0) { px = -px; py = -py; }
      side.dim(v(B.x, B.y), v(T.x, T.y), off(px * 160, py * 160), r(Lb), 'out');
    }

    // 地下部分
    ed(deep.dim(v(S.xf, S.botF), v(S.xf, 0), off(230, 0), P.embed, 'in'), 'embed');
    // 后柱按实际地面埋深；有南北坡度时标出后柱处地面与 ±0 的高差
    ed(deep.dim(v(S.xr, S.botR), v(S.xr, S.gR), off(-260, 0), P.embed, 'in'), 'embed');
    if (Math.abs(S.gR) >= 0.5) deep.dim(v(S.xr, S.gR), v(S.xr, 0), off(230, 0), r(Math.abs(S.gR)), 'out');
    deep.dim(v(S.xf, S.botF), v(S.xf, S.topF), off(-470, 0), r(S.lenF), 'out');
    deep.dim(v(S.xr, S.botR), v(S.xr, S.topR), off(480, 0), r(S.lenR), 'out');

    // 东西向：榀距、组件阵列（有东西坡度时顺坡标，即沿檩条的长度，括号里是水平距离）
    const xs = -500, ca = layout.ew.ca;
    const hz = (l) => (layout.ew.i ? `（水平 ${r(l * ca)}）` : '');
    const zsE = layout.zs;
    if (zsE.length > 1) ed(ew.dim(V(xs, 0, zsE[0]), V(xs, 0, zsE[1]), off(-300, 0), `首末跨榀距 ${P.pitchEnd}${hz(P.pitchEnd)}`, 'in'), 'pitchEnd');
    if (zsE.length > 3) ed(ew.dim(V(xs, 0, zsE[1]), V(xs, 0, zsE[2]), off(-300, 0), `中间跨榀距 ${P.pitch}${hz(P.pitch)}`, 'in'), 'pitch');
    ew.dim(V(xs, 0, -layout.arrW / 2), V(xs, 0, layout.arrW / 2), off(-750, 0), `组件阵列 ${r(layout.arrW)}（${layout.cols} 列）`, 'out');
    if (layout.ew.i) {   // 写在阵列中心偏东、地面以下，避开上面几条文字和最东一榀的侧视标注
      ew.label(`实际地面 ${P.slopeEW > 0 ? '东高西低' : '东低西高'} ${Math.abs(P.slopeEW)}%`, V(xs, -450, layout.arrW * 0.3), 'ref', 13);
    }

    // 垂直组件视图：标注放在组件面上方 150 的平行平面内（t 沿坡、z 东西向）
    const nrm = new DimSet();
    const hN = S.hModBot + FIX.modT + 150;
    const pS = (t, z) => { const q = S.along(t); return V(q.x - S.s * hN, q.y + S.c * hN, z); };
    const offU = (k) => new V3(S.c, S.s, 0).multiplyScalar(k * MM);
    const offZ = (k) => new V3(0, 0, k * MM);
    const halfL = layout.purlinLen / 2;
    const tLow = S.modStarts[0], tHigh = S.modStarts[S.modStarts.length - 1] + P.modL;
    const pSec = `C${FIX.purlin.d}×${FIX.purlin.f}×${FIX.purlin.l}×${FIX.purlin.t.toFixed(1)}`;
    nrm.dim(pS(tHigh, -halfL), pS(tHigh, halfL), offU(450), `檩条 ×${S.purlins.length}　${pSec}　总长 ${r(layout.purlinLen)}`, 'out', 13);
    const stops = [-halfL, ...layout.zs, halfL], last = stops.length - 2;
    for (let i = 0; i <= last; i++) {
      const d = nrm.dim(pS(tLow, stops[i]), pS(tLow, stops[i + 1]), offU(-350), r(stops[i + 1] - stops[i]), i === 0 || i === last ? 'out' : 'in');
      if (i === 0) d.label.userData.outside = { at: d.A, dir: new V3(0, 0, -1) };
      else if (i === last) d.label.userData.outside = { at: d.B, dir: new V3(0, 0, 1) };
      else {
        const endBay = i === 1 || i === last - 1;    // 第 i 段是第 i−1 跨
        ed(d, endBay ? 'pitchEnd' : 'pitch').label.userData.fit = { span: d.A.distanceTo(d.B), key: 'pitch' };
      }
    }
    if (last > 1) {
      // 放不下逐跨文字时的合并写法：首末跨与中间跨不同就分开写
      const nb = layout.bays.length, mid = nb - 2;
      const text = P.pitchEnd === P.pitch || nb < 2 ? `${nb} × ${P.pitch === P.pitchEnd || nb < 3 ? P.pitchEnd : P.pitch}`
        : mid > 0 ? `${P.pitchEnd} + ${mid} × ${P.pitch} + ${P.pitchEnd}` : `${P.pitchEnd} + ${P.pitchEnd}`;
      ed(nrm.label(text, pS(tLow, 0).add(offU(-350)), 'in'), mid > 0 ? 'pitch' : 'pitchEnd').userData.altFor = 'pitch';
    }
    for (let i = 0; i < S.purlins.length - 1; i++) nrm.dim(pS(S.purlins[i], -halfL), pS(S.purlins[i + 1], -halfL), offZ(-350), r(S.purlins[i + 1] - S.purlins[i]), 'out');
    for (const m0 of S.modStarts) ed(nrm.dim(pS(m0, halfL), pS(m0 + P.modL, halfL), offZ(350), P.modL, 'in'), 'modL');
    // 示意线：缩小看全排时 50 宽的檩条不到 1 像素，用中心线保证看得见
    const purlinLines = new DimSet(), beamLines = new DimSet();
    for (const t of S.purlins) purlinLines.seg(pS(t, -halfL), pS(t, halfL));
    for (const z of layout.zs) beamLines.seg(pS(0, z), pS(S.beamLen, z));

    const jointG = PV.jointDetail.build(S, layout);
    const deepG = deep.finish(dimLineMat);
    const sideG = new THREE.Group();
    sideG.add(side.finish(dimLineMat), ref.finish(refLineMat), deepG);
    const keyG = new THREE.Group();
    keyG.add(key.finish(dimLineMat), groundLine.finish(groundLineMat));
    const ewG = ew.finish(dimLineMat);
    const normalG = nrm.finish(dimLineMat);
    normalG.add(purlinLines.finish(purlinLineMat), beamLines.finish(beamLineMat));
    // 东西坡度：侧视标注跟着最东一榀平移，东西向、垂直组件视图的标注顺坡
    const zLast = layout.zs[layout.zs.length - 1];
    for (const gr of [keyG, sideG]) PV.ewPlace(gr, layout.ew, zLast);
    for (const gr of [ewG, normalG]) PV.ewPlace(gr, layout.ew);
    const rootG = new THREE.Group();
    rootG.add(keyG, sideG, ewG, normalG, jointG);
    root.add(rootG);
    PV.state.dims = { root: rootG, key: keyG, side: sideG, deep: deepG, ew: ewG, normal: normalG, joint: jointG };
  }

  // 标注文字保持固定的屏幕像素高度（每帧调用）
  const tmpV = new V3(), camDir = new V3();
  function updateLabels(cam) {
    const hpx = canvas.clientHeight || 1;
    const k = (PV.state.labelK = canvas.clientWidth < 520 ? 1.0 : 1.25);
    const collapsed = {};
    cam.getWorldDirection(camDir);
    for (const sp of PV.labels) {
      sp.getWorldPosition(tmpV);
      let wpp;
      if (cam.isPerspectiveCamera) {
        const d = Math.max(0.05, tmpV.sub(cam.position).dot(camDir));
        wpp = (2 * d * Math.tan((cam.fov * DEG) / 2)) / hpx;
      } else {
        wpp = (cam.top - cam.bottom) / cam.zoom / hpx;
      }
      const ud = sp.userData, hgt = ud.px * k * wpp, w = hgt * ud.aspect;
      sp.scale.set(w, hgt, 1);
      // 端部短尺寸：文字放到尺寸线外侧；连续等跨：放不下就收起，改显示合并文字
      if (ud.outside) sp.position.copy(ud.outside.at).addScaledVector(ud.outside.dir, w / 2 + 6 * wpp);
      if (ud.fit) {
        sp.visible = w < ud.fit.span * 0.92;
        if (!sp.visible) collapsed[ud.fit.key] = true;
      }
      if (ud.altFor) sp.visible = !!collapsed[ud.altFor];
    }
  }

  PV.dims = { build, updateLabels, DimSet, mats: { line: dimLineMat, center: centerLineMat } };
})();
