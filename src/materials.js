/* 材质、贴图、配色，以及各构件共用的卷边槽钢截面 */
(function () {
  'use strict';
  const PV = window.PV;
  const { MM, renderer } = PV;

  function cellTexture() {
    const cv = document.createElement('canvas');
    cv.width = 1024; cv.height = 488;                         // 2382 : 1134
    const g = cv.getContext('2d');
    const fw = 9, W = cv.width - 2 * fw, H = cv.height - 2 * fw;
    g.fillStyle = '#d6dbe0'; g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#c3cedb'; g.fillRect(fw, fw, W, H);
    const cols = 24, rows = 6, gap = 2, mid = 6;
    const cw = (W - mid) / cols, ch = H / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const x = fw + i * cw + (i >= cols / 2 ? mid : 0), y = fw + j * ch;
        const gr = g.createLinearGradient(x, y, x + cw, y + ch);
        gr.addColorStop(0, '#1d3157'); gr.addColorStop(1, '#16264a');
        g.fillStyle = gr;
        g.fillRect(x + gap / 2, y + gap / 2, cw - gap, ch - gap);
        g.fillStyle = 'rgba(190,205,225,0.18)';
        for (let k = 1; k <= 3; k++) g.fillRect(x + gap / 2, y + (ch * k) / 4, cw - gap, 1);
      }
    }
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function gridTexture() {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = '#d5dcc9'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(70,90,60,0.16)'; g.lineWidth = 2;
    g.strokeRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }

  const steel = () => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.18 });
  const M = {
    post: steel(), beam: steel(), brace: steel(), purlin: steel(), buried: steel(), bracket: steel(), clip: steel(),
    ground: new THREE.MeshLambertMaterial({ map: gridTexture() }),
    boltSteel: new THREE.MeshStandardMaterial({ color: 0xd3d8dd, roughness: 0.32, metalness: 0.55 }),
    slot: new THREE.MeshStandardMaterial({
      color: 0x15202b, roughness: 0.9, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
    }),
  };
  const PALETTE = {
    drawing: { post: 0xb3b7bb, beam: 0xf0a020, brace: 0x96a6a5, purlin: 0x3d7a50, buried: 0x858c92, bracket: 0x2f8fd8, clip: 0x38b26a },
    steel:   { post: 0xb8bfc5, beam: 0xb8bfc5, brace: 0xb1b8be, purlin: 0xa9b1b8, buried: 0x7d858c, bracket: 0x98a1a9, clip: 0xa3abb3 },
  };
  // 剖切面封口（轴测节点图里被切开的檩条、组件补画的截面）：双面，转到背面看也在
  M.purlinCap = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.18, side: THREE.DoubleSide });
  function applyPalette() {
    const pal = PV.show.drawingColors ? PALETTE.drawing : PALETTE.steel;
    for (const k in pal) M[k].color.setHex(pal[k]);
    M.purlinCap.color.copy(M.purlin.color);
  }

  // 光伏组件：边框、背板、正面电池片（BoxGeometry 六个面的材质顺序 +x −x +y −y +z −z）
  const modFrame = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.35, metalness: 0.4 });
  const modBack = new THREE.MeshStandardMaterial({ color: 0xe9ebed, roughness: 0.8 });
  const modTop = new THREE.MeshStandardMaterial({ map: cellTexture(), roughness: 0.32, metalness: 0.15 });
  const modMats = [modFrame, modFrame, modTop, modBack, modFrame, modFrame];
  M.moduleCap = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.35, metalness: 0.4, side: THREE.DoubleSide });

  // 半透明：垂直组件视图里透出组件下面的檩条和斜梁；节点视图里透出被斜梁、组件挡住的部分（相当于 CAD 的虚线）
  function ghostMat(m, on, opacity) {
    if (!!m.userData.ghost === on) return;
    m.userData.ghost = on;
    m.transparent = on;
    m.opacity = on ? opacity : 1;
    m.depthWrite = !on;
    m.needsUpdate = true;
  }
  function ghostModules(on, opacity) {
    for (const m of [modFrame, modTop, modBack, M.moduleCap]) {
      ghostMat(m, on, opacity || 0.32);
      if (on) m.opacity = opacity || 0.32;
    }
  }

  // 卷边槽钢截面形状（局部 a 沿腹板高度、b 沿翼缘方向，腹板在 b=0），单位米
  function cShape(sec) {
    const d = (sec.d / 2) * MM, f = sec.f * MM, l = sec.l * MM, t = sec.t * MM;
    const pts = [[-d, 0], [d, 0], [d, f], [d - l, f], [d - l, f - t], [d - t, f - t], [d - t, t],
      [-d + t, t], [-d + t, f - t], [-d + l, f - t], [-d + l, f], [-d, f]];
    return new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0], q[1])));
  }
  // 杆件几何体：沿 z 拉伸单位长度，靠矩阵拉伸
  function extrudeC(sec) {
    return new THREE.ExtrudeGeometry(cShape(sec), { depth: 1, bevelEnabled: false });
  }

  Object.assign(PV, { M, modMats, applyPalette, ghostMat, ghostModules, cShape, extrudeC });
})();
