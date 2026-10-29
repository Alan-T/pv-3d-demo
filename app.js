/* 光伏支架 3D 设计 Demo —— three.js r128（全局 THREE + THREE.OrbitControls）
 *
 * 坐标约定（与原图侧视一致）：x 向北（图右）、y 向上、z 向东（侧视图从东往西看）。
 * 图纸尺寸都用 mm，建模时乘 MM 换成米。原点 (0,0) 在组件前沿正下方的 ±0 地面。
 */
(function () {
  'use strict';

  const DEG = Math.PI / 180;
  const MM = 0.001;
  const V3 = THREE.Vector3;
  const FONT = '"PingFang SC","Microsoft YaHei","Segoe UI",sans-serif';

  // ---------- 图纸尺寸与假设（mm） ----------
  const FIX = {
    beamPastPurlin: 114,  // 斜梁伸出第一根、最后一根檩条（两张图：3802+228→4030，6204+228→6430，长度取整到 10）
    modW: 1134, modT: 35, modGap: 20, modGapEW: 20,
    arrayShift: 32.1,     // 组件阵列中心相对斜梁中心沿坡向上移（按图量取，两张图柱高都在 1 mm 内吻合）
    purlinExt: 50,        // 檩条伸出组件阵列（檩条图：32392 = 28 列组件 32292 + 2×50）
    post:   { d: 120, f: 60, l: 20, t: 2.5 },
    beam:   { d: 80,  f: 40, l: 15, t: 2.0 },
    brace:  { d: 80,  f: 40, l: 15, t: 2.0 },
    purlin: { d: 100, f: 50, l: 20, t: 2.0 },
  };
  // 两套图纸参数。A：2 排组件（侧视图 + 檩条图）；B：3 排组件 + 外斜撑（侧视图 + 檩条图）
  const PRESETS = {
    A: {
      tilt: 25, span: 2900, h0: 800, frames: 12, pitch: 2800, pitchEnd: 2800, slope: 0,
      rows: 2,            // 沿坡组件排数（竖排）
      outer: 0,           // 是否带外斜撑（立柱外侧、撑斜梁悬挑段）
      designSlope: 5,     // 设计坡度 %，后柱按“北向坡”时后柱处地面低 designSlope×间距 来定长度
      braceHF: 250,       // 前柱斜撑下节点离 ±0（内、外斜撑共用一块连接板）
      braceHR: 350,       // 后柱斜撑下节点离 ±0
      braceTopF: 1650,    // 前斜撑上节点到斜梁下端
      braceTopR: 1650,    // 后斜撑上节点到斜梁上端
      braceOutF: 400,     // 前外斜撑上节点到斜梁下端
      braceOutR: 400,     // 后外斜撑上节点到斜梁上端
      embed: 1800,        // 立柱埋深
      modL: 2382,         // 组件长度（沿坡）
      hole: 1400,         // 组件安装孔距 = 同一块组件下两根檩条的间距
    },
    // 图纸 B 没标斜撑上节点位置：2650 / 2656 / 402 / 379 由四根斜撑长度 1722 / 1900 / 1011 / 2184 反推
    B: {
      tilt: 15, span: 3700, h0: 800, frames: 10, pitch: 3250, pitchEnd: 3250, slope: 0,
      rows: 3, outer: 1, designSlope: 2,
      braceHF: 250, braceHR: 300, braceTopF: 2650, braceTopR: 2656, braceOutF: 402, braceOutR: 379,
      embed: 1800, modL: 2382, hole: 1400,
    },
  };
  let preset = 'A';
  const DEFAULTS = PRESETS.A;
  // 带外斜撑时的双面连接板 280×120×5.75：左右对称，上边 ±half，竖直肩边到两立柱孔中点高度，再斜切到下边 ±botHalf。
  // 孔位见 JOINT（与单面板相同）；板竖向中点在 braceHF / braceHR
  const DBL = { half: 140, botHalf: 30 };
  // 面板里放常用的几个；其余蓝字参数在尺寸标注上点击修改，取值范围在 EXTRA_LIMITS
  const PARAMS = [
    { key: 'tilt',   label: '组件倾角',        unit: '°',  min: 10,   max: 40,   step: 0.5 },
    { key: 'span',   label: '前后立柱间距',    unit: 'mm', min: 2000, max: 4500, step: 50 },
    { key: 'h0',     label: '组件前沿离地高度', unit: 'mm', min: 300,  max: 1500, step: 10 },
    { key: 'rows',   label: '组件排数（沿坡）', unit: '排', min: 2,    max: 4,    step: 1 },
    { key: 'outer',  label: '外斜撑',          type: 'bool', hint: '立柱外侧再加一根斜撑，撑住斜梁悬挑段（与内斜撑共用连接板）' },
    { key: 'frames', label: '榀数（东西向）',  unit: '榀', min: 1,    max: 20,   step: 1 },
    { key: 'pitch',  label: '中间跨榀距',      unit: 'mm', min: 2000, max: 4500, step: 100 },
    { key: 'pitchEnd', label: '首末跨榀距',    unit: 'mm', min: 1500, max: 4500, step: 100,
      hint: '第 1–2 榀、倒数第 2–1 榀之间的距离' },
    { key: 'slope',  label: '地面南北坡度',    unit: '%',  min: -10,  max: 10,   step: 0.5,
      hint: '正 = 南向坡（北高南低），负 = 北向坡（北低南高）' },
  ];
  const EXTRA_LIMITS = {
    braceHF: [100, 800], braceHR: [100, 1200], braceTopF: [600, 5000], braceTopR: [600, 5000],
    braceOutF: [100, 3000], braceOutR: [100, 3000], designSlope: [0, 10],
    embed: [800, 3000], modL: [1600, 2600], hole: [600, 2400],
  };
  // 返回 [最小, 最大, 步长]；安装孔距不能超过组件长度 − 200
  function limits(key) {
    const d = PARAMS.find((q) => q.key === key);
    if (d) return [d.min, d.max, key === 'tilt' ? 0.1 : 1];
    const [lo, hi] = EXTRA_LIMITS[key];
    return [lo, key === 'hole' ? Math.min(hi, P.modL - 200) : hi, key === 'designSlope' ? 0.5 : 1];
  }
  const P = Object.assign({}, DEFAULTS);
  const show = { dims: true, buried: true, modules: true, bolts: true, drawingColors: true, overlay: false };

  // ---------- 几何求解：所有关键点都在框架平面 (x, y) 内，单位 mm ----------
  function solve(p) {
    const th = p.tilt * DEG, c = Math.cos(th), s = Math.sin(th);
    const L = p.span;
    // 沿坡 rows 块组件，每块下 2 根檩条（安装孔距 hole）；斜梁伸出首末檩条各 114，长度取整到 10；立柱在斜梁上居中
    const arrLen = p.rows * p.modL + (p.rows - 1) * FIX.modGap;
    const purlinSpan = (p.rows - 1) * (p.modL + FIX.modGap) + p.hole;
    const beamLen = Math.round((purlinSpan + 2 * FIX.beamPastPurlin) / 10) * 10;
    const ovh = (beamLen - L / c) / 2;                        // 斜梁两端伸出立柱中心（悬挑）
    const extLow = (arrLen - beamLen) / 2 - FIX.arrayShift;   // 组件下沿伸出斜梁下端
    const sLow = ovh + extLow;                                // 前柱节点 → 组件下沿（沿坡）
    const hBeamTop = FIX.beam.d / 2;                          // 斜梁中心线 → 上表面
    const hModBot = hBeamTop + FIX.purlin.d;                  // 斜梁中心线 → 组件底面
    const xf = sLow * c + hModBot * s;                        // 前柱中心到原点
    const xr = xf + L;
    const nodeF = p.h0 + sLow * s - hModBot * c;              // 斜梁中心线在前柱中心处的高度
    const nodeR = nodeF + L * s / c;
    const topF = nodeF + hBeamTop / c, topR = nodeR + hBeamTop / c;
    const drop = (p.designSlope / 100) * L;
    const botF = -p.embed, botR = -drop - p.embed;
    const along = (t) => ({ x: xf + (t - ovh) * c, y: nodeF + (t - ovh) * s }); // t：距斜梁下端
    const warn = [];
    if (ovh < 150) warn.push(`立柱间距太大：斜梁两端悬挑只剩 ${Math.round(ovh)}`);
    if (!p.outer && ovh > 1000) warn.push(`斜梁两端悬挑 ${Math.round(ovh)}，比较长，建议加外斜撑或加大立柱间距`);

    let tF = p.braceTopF, tR = beamLen - p.braceTopR;
    if (tR - tF < 150) {
      tF = beamLen / 2 - 75; tR = beamLen / 2 + 75;
      warn.push('立柱间距太小：两根斜撑的上节点会重叠，暂时移到斜梁中部');
    }
    // 斜撑下端理论节点：立柱侧面、离 ±0 高 braceH（= 连接板竖向中点）。斜撑长度按理论节点到斜梁节点算，
    // 与两张图纸的斜撑长度一致；实际斜撑从连接板上的螺栓连到斜梁节点（见 braceJoint）
    const bx = FIX.post.d / 2;
    const bF = { x: xf + bx, y: p.braceHF };
    const bR = { x: xr - bx, y: p.braceHR };
    const tFp = along(tF), tRp = along(tR);
    const braceF = Math.hypot(tFp.x - bF.x, tFp.y - bF.y);
    const braceR = Math.hypot(tRp.x - bR.x, tRp.y - bR.y);

    // 外斜撑：下节点在立柱外侧面（与内斜撑同高、同一块连接板），上节点在斜梁悬挑段
    let outer = null;
    if (p.outer) {
      const oF = { x: xf - bx, y: p.braceHF }, oR = { x: xr + bx, y: p.braceHR };
      const toF = Math.min(p.braceOutF, ovh - 100), toR = beamLen - Math.min(p.braceOutR, ovh - 100);
      if (p.braceOutF > ovh - 100 || p.braceOutR > ovh - 100) warn.push('外斜撑上节点要落在立柱外侧的斜梁悬挑段上，已临时压回悬挑段');
      const toFp = along(toF), toRp = along(toR);
      outer = {
        oF, oR, toF, toR, toFp, toRp,
        braceOF: Math.hypot(toFp.x - oF.x, toFp.y - oF.y), braceOR: Math.hypot(toRp.x - oR.x, toRp.y - oR.y),
      };
    }

    const a = (p.modL - p.hole) / 2;
    const modStarts = [];
    for (let r = 0; r < p.rows; r++) modStarts.push(-extLow + r * (p.modL + FIX.modGap));
    const purlins = [];
    for (const m of modStarts) purlins.push(m + a, m + a + p.hole);
    const pf = FIX.purlin.f / 2, pLast = purlins[purlins.length - 1];
    if (purlins[0] - pf < 0 || pLast + pf > beamLen) warn.push(`檩条（按组件安装孔距 ${p.hole} 布置）超出了斜梁端部`);

    const sp = p.slope / 100;
    const gy = (x) => sp * (x - xf);                         // 实际地面高度（前柱处为转折点）
    const embedR = gy(xr) - botR;
    const clearEdge = p.h0 - gy(0);
    const clearBraceR = p.braceHR - gy(xr);
    if (embedR < p.embed - 0.5) warn.push(`后柱实际埋深只有 ${Math.round(embedR)}（北向坡超过设计的 ${p.designSlope}%）`);
    if (clearBraceR < 100) warn.push(`后斜撑下端离地只有 ${Math.round(clearBraceR)}`);
    if (clearEdge < 300) warn.push(`组件前沿实际离地只有 ${Math.round(clearEdge)}`);

    return {
      c, s, beamLen, ovh, extLow, hBeamTop, hModBot, xf, xr, nodeF, nodeR, topF, topR, drop, botF, botR,
      lenF: topF - botF, lenR: topR - botR, along, tF, tR, bF, bR, tFp, tRp, braceF, braceR, outer,
      modStarts, purlins, sp, gy, embedR, clearEdge, clearBraceR, warn,
    };
  }

  // ---------- 渲染器、相机、灯光 ----------
  const canvas = document.getElementById('c');
  const stage = document.getElementById('stage');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef2f6);
  const persp = new THREE.PerspectiveCamera(40, 1, 0.05, 2000);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.05, 2000);
  let cam = persp;
  const controls = new THREE.OrbitControls(cam, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.5;
  controls.maxDistance = 300;
  controls.minZoom = 0.005;
  controls.maxZoom = 20;

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb7ad94, 0.72));
  const sun = new THREE.DirectionalLight(0xffffff, 0.72);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xffffff, 0.38);   // 东侧补光：侧视图看到的正是东立面
  fill.position.set(0.35, 0.45, 1);
  scene.add(fill);

  // ---------- 材质、贴图、共用几何体 ----------
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
  };
  const PALETTE = {
    drawing: { post: 0xb3b7bb, beam: 0xf0a020, brace: 0x96a6a5, purlin: 0x3d7a50, buried: 0x858c92, bracket: 0x2f8fd8, clip: 0x38b26a },
    steel:   { post: 0xb8bfc5, beam: 0xb8bfc5, brace: 0xb1b8be, purlin: 0xa9b1b8, buried: 0x7d858c, bracket: 0x98a1a9, clip: 0xa3abb3 },
  };
  const modFrame = new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.35, metalness: 0.4 });
  const modBack = new THREE.MeshStandardMaterial({ color: 0xe9ebed, roughness: 0.8 });
  const modTop = new THREE.MeshStandardMaterial({ map: cellTexture(), roughness: 0.32, metalness: 0.15 });
  const modMats = [modFrame, modFrame, modTop, modBack, modFrame, modFrame];

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
    for (const m of [modFrame, modTop, modBack]) {
      ghostMat(m, on, opacity || 0.32);
      if (on) m.opacity = opacity || 0.32;
    }
  }

  function applyPalette() {
    const pal = show.drawingColors ? PALETTE.drawing : PALETTE.steel;
    for (const k in pal) M[k].color.setHex(pal[k]);
  }

  // 卷边槽钢截面（局部 a 沿腹板高度、b 沿翼缘方向，腹板在 b=0）
  function extrudeC(sec) {
    const d = (sec.d / 2) * MM, f = sec.f * MM, l = sec.l * MM, t = sec.t * MM;
    const pts = [[-d, 0], [d, 0], [d, f], [d - l, f], [d - l, f - t], [d - t, f - t], [d - t, t],
      [-d + t, t], [-d + t, f - t], [-d + l, f - t], [-d + l, f], [-d, f]];
    const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0], q[1])));
    return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });  // 单位长度，靠矩阵拉伸
  }
  const GEO = {
    post: extrudeC(FIX.post), beam: extrudeC(FIX.beam), brace: extrudeC(FIX.brace), purlin: extrudeC(FIX.purlin),
    box: new THREE.BoxGeometry(1, 1, 1),
  };

  // ---------- 连接件（按节点图） ----------
  // 斜撑-立柱：五边形连接板贴在立柱腹板外侧，2 颗螺栓（立柱中心线上，上下排）接立柱；板向斜撑一侧伸出，
  //   斜撑腹板贴在伸出部分上用 1 颗螺栓；伸出部分的下角斜切。螺栓孔为竖向长圆孔。
  // 立柱-斜梁：斜梁腹板贴立柱腹板，节点（两条中心线交点）1 颗螺栓，竖向长圆孔；柱顶平切。
  // 斜撑-斜梁：斜撑腹板贴斜梁腹板，两条中心线交点 1 颗螺栓；斜撑端头平切，伸到斜梁上缘。
  // 檩条-斜梁：L 形檩托，底边压在斜梁上翼缘、立边贴檩条腹板（下坡一侧），各 1 颗 M12；组件用安装孔 M8 螺栓压在檩条上翼缘。
  // 斜撑连接板只有两种规格：单面 160×120×5.75、双面 280×120×5.75。孔位按节点图比例量取（两张节点图一致）
  const JOINT = {
    plateT: 5.75,
    plateH: 120,
    boltPitch: 80,    // 立柱中心线上两孔间距
    boltU: 120,       // 斜撑孔离立柱中心线（水平）
    rise: 30,         // 斜撑孔比两立柱孔中点高
    braceEdge: 40,    // 斜撑孔到斜撑端头（沿斜撑）
    singleW: 160,     // 单面板宽
    singleBack: 19,   // 单面板从立柱中心线往背离斜撑一侧伸出的距离（往斜撑一侧伸出 160 − 19 = 141）
    chamferY: 5,      // 单面板下角斜切：从斜撑一侧板边（立柱孔中点 +5）切到立柱面、板底
    slotW: 14, slotL: 28,
  };
  const CLIP = { t: 4, base: 64, height: 80, width: 50, baseBolt: 32, webBolt: 50 };   // 檩托（假设）
  M.boltSteel = new THREE.MeshStandardMaterial({ color: 0xd3d8dd, roughness: 0.32, metalness: 0.55 });
  M.slot = new THREE.MeshStandardMaterial({
    color: 0x15202b, roughness: 0.9, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });

  // 螺栓组：局部 z 为螺栓轴线、指向螺母一侧，z=0 在螺母一侧被连接件的外表面。
  // 零件：垫圈、螺母、露出的螺杆、另一侧的螺栓头；可选长圆孔（沿局部 y，front 在螺母一侧、back 在螺栓头一侧）
  const BOLT_SIZE = {
    12: { wr: 12, wt: 2.5, af: 18, nh: 10.8, r: 6, hh: 7.5, out: 6 },
    8: { wr: 8, wt: 1.6, af: 13, nh: 6.5, r: 4, hh: 5.3, out: 4 },
  };
  function boltKind(size, stack, slot) {
    const b = BOLT_SIZE[size], hexR = b.af / Math.sqrt(3), top = b.wt + b.nh;
    const cyl = (r, z0, z1, seg) => {
      const g = new THREE.CylinderGeometry(r * MM, r * MM, (z1 - z0) * MM, seg);
      g.rotateX(Math.PI / 2);
      g.translate(0, 0, ((z0 + z1) / 2) * MM);
      return g;
    };
    const parts = [
      [cyl(b.wr, 0, b.wt, 24), M.boltSteel],
      [cyl(hexR, b.wt, top, 6), M.boltSteel],
      [cyl(b.r, -stack - b.hh, top + b.out, 16), M.boltSteel],
      [cyl(hexR, -stack - b.hh, -stack, 6), M.boltSteel],
    ];
    if (slot) {
      const w = (JOINT.slotW / 2) * MM, l = ((slot.len - JOINT.slotW) / 2) * MM;
      const s = new THREE.Shape();
      s.moveTo(w, -l);
      s.lineTo(w, l);
      s.absarc(0, l, w, 0, Math.PI, false);
      s.lineTo(-w, -l);
      s.absarc(0, -l, w, Math.PI, Math.PI * 2, false);
      const g = new THREE.ShapeGeometry(s, 12);
      g.translate(0, 0, (slot.side === 'front' ? 0.4 : -stack - 0.4) * MM);
      parts.unshift([g, M.slot]);
    }
    return parts;
  }
  const BOLTS = {
    foot: boltKind(12, JOINT.plateT + FIX.post.t, { side: 'front', len: JOINT.slotL }),  // 斜撑-立柱：连接板 + 腹板
    top: boltKind(12, FIX.beam.t + FIX.post.t, { side: 'front', len: 40 }),            // 立柱-斜梁：竖向长圆孔（画在看得见的螺母一侧）
    btop: boltKind(12, FIX.beam.t + FIX.brace.t, null),                                // 斜撑-斜梁
    clip: boltKind(12, CLIP.t + FIX.beam.t, null),                                     // 檩托两处叠层都是 4+2
    module: boltKind(8, FIX.purlin.t + 2, null),                                       // 组件安装孔：檩条上翼缘 + 组件边框
  };

  // 檩托截面：局部 x 从檩条腹板外表面往下坡，局部 y 从斜梁上表面往上；沿局部 z 拉伸单位长度
  GEO.clip = (() => {
    const t = CLIP.t * MM, a = CLIP.base * MM, h = CLIP.height * MM;
    const s = new THREE.Shape([[0, 0], [a, 0], [a, t], [t, t], [t, h], [0, h]].map((q) => new THREE.Vector2(q[0], q[1])));
    return new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  })();

  // 实际斜撑：从连接板上的螺栓 Q 连到斜梁节点 T。端头 E 在 Q 下方 braceEdge；
  // 上端过 T 继续伸长，端头（垂直切口）靠上的角点刚好到斜梁上缘
  function braceEnds(Q, T) {
    const dx = T.x - Q.x, dy = T.y - Q.y, len = Math.hypot(dx, dy);
    const ax = dx / len, ay = dy / len;
    const E = { x: Q.x - ax * JOINT.braceEdge, y: Q.y - ay * JOINT.braceEdge };
    const nx = -S.s, ny = S.c, an = ax * nx + ay * ny, pn = Math.abs(-ay * nx + ax * ny);
    const eTop = an > 0.05 ? Math.max(0, (S.hBeamTop - (FIX.brace.d / 2) * pn) / an - 2) : 0;
    return { T, E, Q, ax, ay, eTop, len: len + JOINT.braceEdge + eTop };
  }

  // 斜撑下端连接板。B：内斜撑理论节点（立柱内侧面，高 braceH）；T：内斜撑上节点；Bo/To：外斜撑（可无）。
  // 连接板竖向中点（= 两颗立柱螺栓的中点）就在 braceH，也就是图上“离地 250 / 350”标的位置。
  // 只有内斜撑：单面五边形板 160×120，斜撑一侧下角斜切；带外斜撑：对称六边形双面板 280×120（Bracing Connector）。
  // 孔位两种板相同：立柱中心线上 2 孔（间距 boltPitch），斜撑孔离立柱中心 ±boltU、比两立柱孔中点高 rise
  function braceJoint(B, T, Bo, To) {
    const dbl = !!Bo, side = Math.sign(T.x - B.x);            // +1 前柱（内斜撑向北），−1 后柱
    const xc = B.x - (side * FIX.post.d) / 2, yc = B.y;
    const hh = JOINT.plateH / 2, yTop = yc + hh;
    const U = (u) => xc + side * u;                             // u：离立柱中心线、朝内斜撑一侧的水平距离
    let pts, Qo = null;
    if (!dbl) {
      const back = -JOINT.singleBack, out = JOINT.singleW - JOINT.singleBack;
      pts = [[U(back), yc - hh], [U(FIX.post.d / 2), yc - hh], [U(out), yc + JOINT.chamferY], [U(out), yTop], [U(back), yTop]];
    } else {
      pts = [[U(-DBL.half), yTop], [U(DBL.half), yTop], [U(DBL.half), yc], [U(DBL.botHalf), yc - hh],
        [U(-DBL.botHalf), yc - hh], [U(-DBL.half), yc]];
      Qo = { x: U(-JOINT.boltU), y: yc + JOINT.rise };
    }
    const Q = { x: U(JOINT.boltU), y: yc + JOINT.rise };
    const shape = new THREE.Shape(pts.map((q) => new THREE.Vector2(q[0] * MM, q[1] * MM)));
    const plateGeo = new THREE.ExtrudeGeometry(shape, { depth: JOINT.plateT * MM, bevelEnabled: false });
    disposables.push(plateGeo);
    const inner = braceEnds(Q, T), o = dbl ? braceEnds(Qo, To) : null;
    const bolts = [[xc, yc - JOINT.boltPitch / 2], [xc, yc + JOINT.boltPitch / 2], [Q.x, Q.y]];
    if (o) bolts.push([o.Q.x, o.Q.y]);
    const spec = `${dbl ? DBL.half * 2 : JOINT.singleW}×${JOINT.plateH}×${JOINT.plateT}`;
    return { ...inner, B, side, xc, yc, hh, yTop, plateGeo, bolts, o, spec };
  }

  // ---------- 场景构建 ----------
  const root = new THREE.Group();
  scene.add(root);
  let disposables = [];
  const labels = [];
  let S, layout, model, buriedGroup, moduleGroup, hwGroup, ground;
  let dimsRoot, dimsKey, dimsSide, dimsDeep, dimsEW, dimsNormal, dimsJoint, overlay;

  const V = (x, y, z) => new V3(x * MM, y * MM, z * MM);
  const EX = new V3(1, 0, 0), EY = new V3(0, 1, 0), EZ = new V3(0, 0, 1), NZ = new V3(0, 0, -1);

  function addMember(parent, geo, mat, origin, X, Y, Z) {
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    m.matrix.makeBasis(X, Y, Z).setPosition(origin);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  function clearDynamic() {
    for (const d of disposables) d.dispose();
    disposables = [];
    labels.length = 0;
    while (root.children.length) root.remove(root.children[0]);
  }

  function build() {
    // 先记下旧几何下的取景，重建后让垂直组件 / 节点视图跟着新几何走
    const oldPose = layout && FOLLOW_VIEWS.has(currentView) ? framePose(currentView) : null;
    clearDynamic();
    S = solve(P);
    const u = new V3(S.c, S.s, 0), n = new V3(-S.s, S.c, 0);
    const zw = FIX.post.f / 2;                 // 立柱腹板所在平面（框架平面东侧）
    // 东西向榀位：首末跨（第 1–2 榀、倒数第 2–1 榀）用 pitchEnd，中间跨用 pitch；整排居中
    const bays = [];
    for (let i = 0; i < P.frames - 1; i++) bays.push(i === 0 || i === P.frames - 2 ? P.pitchEnd : P.pitch);
    const spanEW = bays.reduce((a, b) => a + b, 0);
    const zs = [-spanEW / 2];
    for (const b of bays) zs.push(zs[zs.length - 1] + b);
    const pitchEW = FIX.modW + FIX.modGapEW;
    const cols = Math.max(1, Math.round((spanEW + 0.6 * P.pitchEnd) / pitchEW));
    const arrW = cols * pitchEW - FIX.modGapEW;
    const purlinLen = arrW + 2 * FIX.purlinExt;
    layout = { zs, bays, spanEW, cols, arrW, purlinLen };

    model = new THREE.Group();
    buriedGroup = new THREE.Group();
    moduleGroup = new THREE.Group();
    hwGroup = new THREE.Group();          // 连接件：螺栓、连接板、檩托
    model.add(buriedGroup, moduleGroup, hwGroup);

    // 螺栓按种类收集实例矩阵；axis：螺栓轴线（指向螺母一侧），up：局部 y（长圆孔方向）
    const boltMats = {};
    for (const k in BOLTS) boltMats[k] = [];
    const addBolt = (kind, p, axis, up) => {
      const z = axis.clone().normalize(), y = up.clone().normalize(), x = new V3().crossVectors(y, z);
      boltMats[kind].push(new THREE.Matrix4().makeBasis(x, y, z).setPosition(p));
    };
    const clipMats = [];
    const post = (x, yBot, yTop, yG, z0) => {
      const cut = Math.min(Math.max(yG, yBot), yTop);
      if (yTop - cut > 1) addMember(model, GEO.post, M.post, V(x, cut, z0 + zw), EX, NZ, EY.clone().multiplyScalar((yTop - cut) * MM));
      if (cut - yBot > 1) addMember(buriedGroup, GEO.post, M.buried, V(x, yBot, z0 + zw), EX, NZ, EY.clone().multiplyScalar((cut - yBot) * MM));
    };
    // 斜撑 + 下端连接板：斜撑腹板、立柱腹板外表面都在 z0+zw 平面，连接板压在两者外侧
    const O = S.outer;
    const joints = [braceJoint(S.bF, S.tFp, O && O.oF, O && O.toFp), braceJoint(S.bR, S.tRp, O && O.oR, O && O.toRp)];
    layout.joints = joints;
    const zBeamWeb = zw + FIX.beam.t;          // 斜梁腹板内表面（相对 z0），柱顶、撑顶螺栓的螺母在这一侧
    const zClip = zw + FIX.beam.f / 2;         // 斜梁上翼缘中线，檩托居中
    const brace = (J, z0) => {
      for (const b of J.o ? [J, J.o] : [J]) {
        addMember(model, GEO.brace, M.brace, V(b.E.x, b.E.y, z0 + zw),
          new V3(-b.ay, b.ax, 0), NZ, new V3(b.ax, b.ay, 0).multiplyScalar(b.len * MM));
        addBolt('btop', V(b.T.x, b.T.y, z0 + zBeamWeb), EZ, u);
      }
      const plate = new THREE.Mesh(J.plateGeo, M.bracket);
      plate.position.z = (z0 + zw) * MM;
      plate.castShadow = plate.receiveShadow = true;
      hwGroup.add(plate);
      for (const [x, y] of J.bolts) addBolt('foot', V(x, y, z0 + zw + JOINT.plateT), EZ, EY);
    };

    for (const z0 of zs) {
      post(S.xf, S.botF, S.topF, S.gy(S.xf), z0);
      post(S.xr, S.botR, S.topR, S.gy(S.xr), z0);
      const b0 = S.along(0);
      addMember(model, GEO.beam, M.beam, V(b0.x, b0.y, z0 + zw), n, EZ, u.clone().multiplyScalar(S.beamLen * MM));
      for (const J of joints) brace(J, z0);
      addBolt('top', V(S.xf, S.nodeF, z0 + zBeamWeb), EZ, EY);
      addBolt('top', V(S.xr, S.nodeR, z0 + zBeamWeb), EZ, EY);
      // 檩托：每根檩条与每榀斜梁相交处一个，立边贴檩条腹板外表面（下坡一侧）
      for (const t of S.purlins) {
        const q = S.along(t);
        const at = (du, dn, dz) => V(q.x, q.y, z0 + dz)
          .addScaledVector(u, (-FIX.purlin.f / 2 + du) * MM)
          .addScaledVector(n, (S.hBeamTop + dn) * MM);
        // 局部 x 朝下坡、y 朝上；z 取 −z 方向保证右手系（实例矩阵不能带镜像）
        clipMats.push(new THREE.Matrix4()
          .makeBasis(u.clone().negate(), n, EZ.clone().multiplyScalar(-CLIP.width * MM))
          .setPosition(at(0, 0, zClip + CLIP.width / 2)));
        addBolt('clip', at(-CLIP.baseBolt, CLIP.t, zClip), n, u);
        addBolt('clip', at(-CLIP.t, CLIP.webBolt, zClip), u.clone().negate(), n);
      }
    }

    // 檩条：坐在斜梁上表面，沿东西向通长
    for (const t of S.purlins) {
      const p = S.along(t);
      const o = V(p.x, p.y, -purlinLen / 2)
        .addScaledVector(n, (S.hBeamTop + FIX.purlin.d / 2) * MM)
        .addScaledVector(u, (-FIX.purlin.f / 2) * MM);
      addMember(model, GEO.purlin, M.purlin, o, n, u, EZ.clone().multiplyScalar(purlinLen * MM));
    }

    // 组件：沿坡 2 块竖排，东西向 cols 列；每块 4 颗 M8 安装螺栓（两根檩条 × 两条长边框），螺母在檩条上翼缘下面
    const modGeo = new THREE.BoxGeometry(P.modL * MM, FIX.modT * MM, FIX.modW * MM);   // 组件长度可改，每次重建
    disposables.push(modGeo);
    S.modStarts.forEach((m0, r) => {
      const p = S.along(m0 + P.modL / 2);
      for (let j = 0; j < cols; j++) {
        const z = -arrW / 2 + j * pitchEW + FIX.modW / 2;
        const mesh = new THREE.Mesh(modGeo, modMats);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.makeBasis(u, n, EZ).setPosition(V(p.x, p.y, z).addScaledVector(n, (S.hModBot + FIX.modT / 2) * MM));
        mesh.castShadow = mesh.receiveShadow = true;
        moduleGroup.add(mesh);
        for (const t of [S.purlins[2 * r], S.purlins[2 * r + 1]]) {
          const q = S.along(t);
          for (const k of [-1, 1]) {
            addBolt('module', V(q.x, q.y, z + k * (FIX.modW / 2 - 18)).addScaledVector(n, (S.hModBot - FIX.purlin.t) * MM),
              n.clone().negate(), u);
          }
        }
      }
    });

    // 连接件数量多（每榀几十个零件），全部用实例化网格
    const instanced = (geo, mat, mats) => {
      if (!mats.length) return;
      const im = new THREE.InstancedMesh(geo, mat, mats.length);
      mats.forEach((m, i) => im.setMatrixAt(i, m));
      im.instanceMatrix.needsUpdate = true;
      im.frustumCulled = false;      // 包围球按几何体原点算，不能拿来裁剪实例
      im.castShadow = true;
      im.userData.noBox = true;
      hwGroup.add(im);
      disposables.push(im);
    };
    for (const k in BOLTS) for (const [g, mat] of BOLTS[k]) instanced(g, mat, boltMats[k]);
    instanced(GEO.clip, M.clip, clipMats);
    layout.counts = {
      clip: clipMats.length,
      m12: boltMats.foot.length + boltMats.top.length + boltMats.btop.length + boltMats.clip.length,
      m8: boltMats.module.length,
    };
    root.add(model);

    // 地面：过前柱脚，按坡度绕 z 轴倾斜
    const gSize = Math.max(40, arrW * MM + 24);
    const gg = new THREE.PlaneGeometry(gSize, gSize);
    gg.rotateX(-Math.PI / 2);
    disposables.push(gg);
    ground = new THREE.Mesh(gg, M.ground);
    ground.position.set(S.xf * MM, 0, 0);
    ground.rotation.z = Math.atan(S.sp);
    ground.receiveShadow = true;
    M.ground.map.repeat.set(gSize, gSize);
    root.add(ground);

    buildDims();
    buildOverlay();
    applyVisibility();
    placeSun();
    updatePanel();
    followView(oldPose);
  }

  // ---------- 尺寸标注 ----------
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
    disposables.push(tex, mat);
    const sp = new THREE.Sprite(mat);
    sp.renderOrder = 1001;
    sp.userData = { aspect: w / h, px: px || 15 };
    labels.push(sp);
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
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
        disposables.push(g);
        const ls = new THREE.LineSegments(g, mat);
        if (mat.isLineDashedMaterial) ls.computeLineDistances();
        ls.renderOrder = 1000;
        this.group.add(ls);
      }
      return this.group;
    }
  }

  function buildDims() {
    const r = Math.round;
    const zd = layout.zs[layout.zs.length - 1] + 450;    // 标注放在最东一榀前面（侧视图朝向相机）
    const v = (x, y) => V(x, y, zd);
    const n = new V3(-S.s, S.c, 0);
    const off = (dx, dy) => new V3(dx * MM, dy * MM, 0);
    const offN = (k) => n.clone().multiplyScalar(k * MM);
    const at = (t, h) => { const q = S.along(t); return v(q.x - S.s * h, q.y + S.c * h); };  // 斜梁坐标 → 点

    // key：3D 视图也显示的主要尺寸；side/ref/deep：只在侧视图显示的完整标注
    const key = new DimSet(), keyRef = new DimSet(), side = new DimSet(), deep = new DimSet(), ref = new DimSet(), ew = new DimSet();
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
    ed(deep.dim(v(S.xr, S.botR), v(S.xr, -S.drop), off(-260, 0), P.embed, 'in'), 'embed');
    deep.dim(v(S.xr, -S.drop), v(S.xr, 0), off(230, 0), r(S.drop), 'out');
    deep.dim(v(S.xf, S.botF), v(S.xf, S.topF), off(-470, 0), r(S.lenF), 'out');
    deep.dim(v(S.xr, S.botR), v(S.xr, S.topR), off(480, 0), r(S.lenR), 'out');

    // 东西向：榀距、组件阵列
    const xs = -500;
    const zsE = layout.zs;
    if (zsE.length > 1) ed(ew.dim(V(xs, 0, zsE[0]), V(xs, 0, zsE[1]), off(-300, 0), `首末跨榀距 ${P.pitchEnd}`, 'in'), 'pitchEnd');
    if (zsE.length > 3) ed(ew.dim(V(xs, 0, zsE[1]), V(xs, 0, zsE[2]), off(-300, 0), `中间跨榀距 ${P.pitch}`, 'in'), 'pitch');
    ew.dim(V(xs, 0, -layout.arrW / 2), V(xs, 0, layout.arrW / 2), off(-750, 0), `组件阵列 ${r(layout.arrW)}（${layout.cols} 列）`, 'out');

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

    // 连接节点详图（最东一榀，4 种节点 × 前/后各一组）：引线标注 + 红色点划中心线。
    // 每组的 box（框架平面 mm）和 labelSide（文字在节点哪一侧）也给 setView 取景用
    const zLast = layout.zs[layout.zs.length - 1];
    const zj = zLast + FIX.post.f / 2 + FIX.beam.f + 20;      // 标注平面：在斜梁翼缘外侧
    const tanT = Math.tan(P.tilt * DEG), cosT = Math.cos(P.tilt * DEG);
    const mv = (p, du, dn) => ({ x: p.x + S.c * du - S.s * dn, y: p.y + S.s * du + S.c * dn });   // 沿坡 du、法向 dn
    const beamY = (p, x, h) => p.y + (x - p.x) * tanT + h / cosT;   // 过 p 的斜梁中心线法向偏 h，在 x 处的高度
    const sec = (s) => `C${s.d}×${s.f}×${s.l}×${s.t.toFixed(1)}`;
    const seg2 = (a, b) => [a.x, a.y, b.x, b.y];
    const specs = { foot: [], top: [], btop: [], clip: [] };
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
        const parts = [
          [mv(P0, 160, S.hModBot + FIX.modT / 2), `组件 ${P.modL}×${FIX.modW}×${FIX.modT}`],
          [mv(P0, 0, S.hModBot - FIX.purlin.t - 4), 'M8 组件安装螺栓（安装孔距 1400）'],
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
    }
    layout.jointSpecs = specs;
    dimsJoint = new THREE.Group();
    for (const type in specs) {
      specs[type].forEach((sp, fr) => {
        const lead = new DimSet(), cl = new DimSet();
        for (const [px, py, ly, text] of sp.leaders) {
          const a = V(px, py, zj), b = V(sp.anchorX, ly, zj);
          lead.seg(a, b);
          const d = b.clone().sub(a).normalize().multiplyScalar(0.012), w = new V3(-d.y, d.x, 0).multiplyScalar(0.4);
          lead.seg(a, a.clone().add(d).add(w));
          lead.seg(a, a.clone().add(d).sub(w));
          lead.label(text, b, 'out', 13).userData.outside = { at: b, dir: new V3(sp.labelSide, 0, 0) };
        }
        for (const [x1, y1, x2, y2] of sp.lines) cl.seg(V(x1, y1, zj), V(x2, y2, zj), true);
        const g = lead.finish(dimLineMat);
        g.add(cl.finish(dimLineMat, centerLineMat));
        g.userData.joint = type + fr;
        dimsJoint.add(g);
      });
    }

    dimsDeep = deep.finish(dimLineMat);
    dimsSide = new THREE.Group();
    dimsSide.add(side.finish(dimLineMat), ref.finish(refLineMat), dimsDeep);
    dimsKey = new THREE.Group();
    dimsKey.add(key.finish(dimLineMat), keyRef.finish(refLineMat), groundLine.finish(groundLineMat));
    dimsEW = ew.finish(dimLineMat);
    dimsNormal = nrm.finish(dimLineMat);
    dimsNormal.add(purlinLines.finish(purlinLineMat), beamLines.finish(beamLineMat));
    dimsRoot = new THREE.Group();
    dimsRoot.add(dimsKey, dimsSide, dimsEW, dimsNormal, dimsJoint);
    root.add(dimsRoot);
  }

  // ---------- 原图叠加（侧视对照，位置按默认参数的立柱对齐） ----------
  let refTexture = null;
  function buildOverlay() {
    const R = window.PV_REF_SIDE;
    overlay = new THREE.Group();
    root.add(overlay);
    if (!R) return;
    if (!refTexture) {
      refTexture = new THREE.TextureLoader().load(R.src);
      refTexture.minFilter = THREE.LinearFilter;
      refTexture.generateMipmaps = false;
    }
    const k = R.mmPerPx, xf0 = solve(DEFAULTS).xf;
    const w = R.w * k, h = R.h * k;
    const cx = xf0 + (R.w / 2 - R.postPx[0]) * k, cy = (R.groundPx - R.h / 2) * k;
    const g = new THREE.PlaneGeometry(w * MM, h * MM);
    disposables.push(g);
    const mat = new THREE.MeshBasicMaterial({ map: refTexture, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false });
    disposables.push(mat);
    const mesh = new THREE.Mesh(g, mat);
    mesh.position.copy(V(cx, cy, layout.zs[layout.zs.length - 1] + 600));
    mesh.renderOrder = 900;
    overlay.add(mesh);
  }

  // ---------- 显示开关 ----------
  let currentView = '3d';
  const clipLo = new THREE.Plane(new V3(0, 0, 1), 0), clipHi = new THREE.Plane(new V3(0, 0, -1), 0);
  let jointType = 'foot';   // 节点详图：foot 斜撑-立柱，top 立柱-斜梁，btop 斜撑-斜梁，clip 檩条-斜梁
  let jointSel = 1;         // 0 前侧，1 后侧（斜撑-立柱的后侧与节点图同向）
  function applyVisibility() {
    if (!model) return;
    dimsRoot.visible = show.dims;
    dimsKey.visible = currentView === '3d' || currentView === 'side';
    dimsSide.visible = currentView === 'side';
    dimsEW.visible = currentView === '3d' || currentView === 'front' || currentView === 'top';
    dimsNormal.visible = currentView === 'normal';
    dimsJoint.visible = currentView.startsWith('joint');
    dimsJoint.children.forEach((g) => { g.visible = g.userData.joint === jointType + jointSel; });
    dimsDeep.visible = show.buried;
    buriedGroup.visible = show.buried;
    moduleGroup.visible = show.modules;
    const inJoint = currentView.startsWith('joint'), sectioned = currentView === 'joint-iso';
    // 轴测节点图只看最东一榀前后 700 mm 的一段（剖切），相邻榀、通长檩条的其余部分都不画，像 CAD 节点详图。
    // 正视不剖切：正视里组件、檩条只看得到端面，剖掉端面后侧面全是“侧着”的，会整个看不见；
    // 而正视下相邻榀正好重合在后面，本来也不乱
    if (sectioned) {
      const z = layout.zs[layout.zs.length - 1];
      clipLo.constant = -(z - 400) * MM;
      clipHi.constant = (z + 300) * MM;
      renderer.clippingPlanes = [clipLo, clipHi];
    } else {
      renderer.clippingPlanes = [];
    }
    ghostModules(currentView === 'normal' || (sectioned && jointType === 'clip'), sectioned ? 0.2 : 0.32);
    ghostMat(M.beam, inJoint && (jointType === 'top' || jointType === 'btop'), 0.42);
    hwGroup.visible = show.bolts;
    overlay.visible = show.overlay && preset === 'A';   // 原图只有图纸一（2 排）的侧视图
    const g = M.ground;
    const wantTransparent = show.buried;
    if (g.transparent !== wantTransparent) {
      g.transparent = wantTransparent;
      g.opacity = wantTransparent ? 0.5 : 1;
      g.depthWrite = !wantTransparent;
      g.needsUpdate = true;
    }
    applyPalette();
  }

  function visibleBox(objs) {
    const box = new THREE.Box3(), tmp = new THREE.Box3();
    const visit = (o) => {
      if (!o.visible || o.isSprite || o.userData.noBox) return;
      if (o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        tmp.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        box.union(tmp);
      }
      for (const ch of o.children) visit(ch);
    };
    for (const o of objs) { o.updateMatrixWorld(true); visit(o); }
    return box;
  }

  function placeSun() {
    const box = visibleBox([model]);
    const ctr = box.getCenter(new V3());
    const rad = box.getSize(new V3()).length() / 2 + 2;
    sun.position.copy(ctr).addScaledVector(new V3(-0.55, 0.78, 0.32).normalize(), rad + 12);
    sun.target.position.copy(ctr);
    const sc = sun.shadow.camera;
    sc.left = -rad; sc.right = rad; sc.top = rad; sc.bottom = -rad;
    sc.near = 0.5; sc.far = 2 * rad + 30;
    sc.updateProjectionMatrix();
  }

  // ---------- 视角切换 ----------
  let tween = null;
  const viewButtons = document.querySelectorAll('.views button[data-view]');

  // 侧视、正视、俯视、垂直组件锁定方向：不能旋转，左键/单指改为平移，缩放照常
  const LOCKED_VIEWS = new Set(['side', 'front', 'top', 'normal']);
  const hintEl = document.getElementById('hint');
  function lockView(locked) {
    controls.enableRotate = !locked;
    controls.mouseButtons.LEFT = locked ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE;
    controls.touches.ONE = locked ? THREE.TOUCH.PAN : THREE.TOUCH.ROTATE;
    hintEl.textContent = locked ? '视图已锁定：拖动平移 · 滚轮/双指缩放' : '拖动旋转 · 滚轮/双指缩放 · 右键/双指平移';
  }

  // 垂直组件、连接节点这几个视图的取景跟着几何走（法向随倾角变、节点随尺寸移动）。
  // 返回正交相机的目标点、视线方向（目标点 → 相机）和缩放
  const FOLLOW_VIEWS = new Set(['normal', 'joint-elev', 'joint-iso']);
  function framePose(name) {
    if (name === 'normal') {
      // 沿组件法向看：屏幕横向 = 东西向，纵向 = 沿坡向上（倾角 > 0 时世界 y 投影到屏幕正好朝上坡）
      const n = new V3(-S.s, S.c, 0), u = new V3(S.c, S.s, 0);
      const q = S.along((S.modStarts[0] + S.modStarts[S.modStarts.length - 1] + P.modL) / 2);
      const c = V(q.x, q.y, 0).addScaledVector(n, (S.hModBot + FIX.modT) * MM).addScaledVector(u, 0.25);
      // 标注文字是固定像素大小，所以按屏幕像素留边：左右 64px、上下 72px
      const w = (layout.purlinLen + 700) * MM, h = (P.rows * P.modL + (P.rows - 1) * FIX.modGap + 800) * MM;
      const pw = Math.max(80, canvas.clientWidth - 128), ph = Math.max(80, canvas.clientHeight - 144);
      const half = (Math.max(w / pw, h / ph) * canvas.clientHeight) / 2;
      return { target: c, dir: n, zoom: 1 / half };
    }
    // 最东一榀的连接节点。正视：从东往西正对节点（同节点正视图）；轴测：略偏向文字一侧、偏上，看得出螺栓和板厚。
    // 都用正交相机：后面各榀与本榀重合或整体平移出画面，不会在节点背后挤成一团。
    // 取景按屏幕像素算：节点区域（mm）+ 文字（最长约 230px，手机 170px），比例最大 3 px/mm
    const sp = layout.jointSpecs[jointType][jointSel], z = layout.zs[layout.zs.length - 1] + FIX.post.f / 2;
    const xL = Math.min(sp.box[0], sp.box[1]), xR = Math.max(sp.box[0], sp.box[1]), yB = sp.box[2], yT = sp.box[3];
    const cw = canvas.clientWidth || 1, ch = canvas.clientHeight || 1, labelPx = cw < 520 ? 170 : 230;
    const scale = Math.max(0.2, Math.min(3, (cw - labelPx - 40) / (xR - xL), (ch - 190) / (yT - yB)));
    const c = V((xL + xR) / 2 + (sp.labelSide * labelPx) / 2 / scale, (yB + yT) / 2 + 40 / scale, z);
    // 轴测一般偏向文字一侧；檩托在檩条下坡一侧，所以檩条-斜梁从下坡（南）一侧看
    const sx = jointType === 'clip' ? -1 : sp.labelSide;
    const dir = name === 'joint-elev' ? new V3(0, 0, 1) : new V3(0.4 * sx, 0.3, 1).normalize();
    return { target: c, dir, zoom: 1 / ((ch / 2 / scale) * MM) };
  }

  // 参数改了以后，若停在上面这些视图里：按新几何重新取景，同时保留用户在视图里做过的平移和缩放
  function screenAxes(dir) {
    const right = new V3().crossVectors(EY, dir).normalize();   // 相机在 target + dir 一侧、朝 −dir 看
    return [right, new V3().crossVectors(dir, right).normalize()];
  }
  function followView(oldPose) {
    if (!oldPose || !FOLLOW_VIEWS.has(currentView)) return;
    if (tween) { setView(currentView, true); return; }
    const np = framePose(currentView);
    const [r0, u0] = screenAxes(oldPose.dir), [r1, u1] = screenAxes(np.dir);
    const off = controls.target.clone().sub(oldPose.target);
    // 垂直组件锁定了方向，跟着新的组件法向转；节点视图保留用户自己转过的方向
    const dir = currentView === 'normal' ? np.dir : cam.position.clone().sub(controls.target).normalize();
    controls.target.copy(np.target).addScaledVector(r1, off.dot(r0)).addScaledVector(u1, off.dot(u0));
    cam.position.copy(controls.target).addScaledVector(dir, 60);
    cam.zoom *= np.zoom / oldPose.zoom;
    cam.updateProjectionMatrix();
    cam.lookAt(controls.target);
    controls.update();
  }

  function setView(name, instant) {
    currentView = name;
    viewButtons.forEach((b) => b.classList.toggle('on', b.dataset.view === name));
    lockView(LOCKED_VIEWS.has(name));
    applyVisibility();
    const objs = name === 'side' && show.dims ? [model, dimsKey, dimsSide] : [model];
    const box = visibleBox(objs);
    const ctr = box.getCenter(new V3()), size = box.getSize(new V3());
    const aspect = persp.aspect;
    if (FOLLOW_VIEWS.has(name)) {
      const p = framePose(name);
      goTo(ortho, p.target.clone().addScaledVector(p.dir, 60), p.target, p.zoom, instant);
      return;
    }
    if (name === '3d') {
      const dir = new V3(-1, 0.68, 1.25).normalize();
      const vf = persp.fov * DEG, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
      const dist = (visibleBox([model]).getSize(new V3()).length() / 2 / Math.sin(Math.min(vf, hf) / 2)) * (aspect < 1 ? 0.95 : 0.86);
      goTo(persp, ctr.clone().addScaledVector(dir, dist), ctr, null, instant);
    } else {
      let dir, w, h;
      if (name === 'side') { dir = new V3(0, 0, 1); w = size.x + (show.dims ? 1.6 : 0); h = size.y; }  // 两端文字留边
      else if (name === 'front') { dir = new V3(-1, 0, 0); w = size.z; h = size.y; }
      else { dir = new V3(-0.002, 1, 0).normalize(); w = size.z; h = size.x; }
      const half = Math.max(h / 2, w / 2 / aspect) * 1.1;
      goTo(ortho, ctr.clone().addScaledVector(dir, 60), ctr, 1 / half, instant);
    }
  }

  function goTo(next, pos, target, zoom, instant) {
    const fovT = Math.tan((persp.fov * DEG) / 2);
    if (next !== cam) {
      // 换相机时保持当前朝向与画面比例，过渡才连贯
      const dir = cam.position.clone().sub(controls.target).normalize();
      if (next.isOrthographicCamera) {
        next.zoom = 1 / (cam.position.distanceTo(controls.target) * fovT);
        next.position.copy(controls.target).addScaledVector(dir, 60);
      } else {
        next.position.copy(controls.target).addScaledVector(dir, 1 / (cam.zoom * fovT));
      }
      next.updateProjectionMatrix();
      next.lookAt(controls.target);
      cam = next;
      controls.object = next;
    }
    if (instant) {
      cam.position.copy(pos);
      controls.target.copy(target);
      if (zoom) { cam.zoom = zoom; cam.updateProjectionMatrix(); }
      controls.update();
      tween = null;
      return;
    }
    tween = {
      from: { off: cam.position.clone().sub(controls.target), t: controls.target.clone(), z: cam.zoom },
      to: { off: pos.clone().sub(target), t: target.clone(), z: zoom || cam.zoom },
      t0: performance.now(), dur: 700,
    };
  }

  function stepTween(now) {
    const k = Math.min(1, (now - tween.t0) / tween.dur);
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const f = tween.from, t = tween.to;
    const d0 = f.off.clone().normalize(), d1 = t.off.clone().normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(d0, d1);
    const qe = new THREE.Quaternion().slerp(q, e);
    const len = f.off.length() + (t.off.length() - f.off.length()) * e;
    controls.target.lerpVectors(f.t, t.t, e);
    cam.position.copy(controls.target).add(d0.applyQuaternion(qe).multiplyScalar(len));
    if (cam.isOrthographicCamera) { cam.zoom = f.z * Math.pow(t.z / f.z, e); cam.updateProjectionMatrix(); }
    cam.lookAt(controls.target);
    if (k >= 1) { tween = null; controls.update(); }
  }
  controls.addEventListener('start', () => { tween = null; });

  // 标注文字保持固定的屏幕像素高度
  const tmpV = new V3(), camDir = new V3();
  let labelK = 1.25;   // 文字像素高度系数（手机上小一点），点击修改时输入框也按它定大小
  function updateLabels() {
    const hpx = canvas.clientHeight || 1;
    const k = (labelK = canvas.clientWidth < 520 ? 1.0 : 1.25);
    const collapsed = {};
    cam.getWorldDirection(camDir);
    for (const sp of labels) {
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
      if (editing && sp === editing.sprite) sp.visible = false;   // 正在修改：由输入框代替
    }
    if (editing) placeEdit();
  }

  // ---------- 蓝字（输入参数）点击修改 ----------
  // 点击蓝字 → 原位出现红字输入框（带光标）；回车或点别处完成，Esc 取消。数值超范围自动夹到范围内
  const editEl = document.getElementById('dimEdit');
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let editing = null;   // { sprite, key }
  const shown = (o) => { for (; o; o = o.parent) if (!o.visible) return false; return true; };

  function pickLabel(ev) {
    if (!show.dims) return null;
    const r = canvas.getBoundingClientRect();
    ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, cam);
    const hit = raycaster.intersectObjects(labels.filter((l) => l.userData.edit && shown(l)), false)[0];
    return hit ? hit.object : null;
  }

  function placeEdit() {
    const sp = editing.sprite, h = Math.round(sp.userData.px * labelK) + 6;
    const v = sp.getWorldPosition(new V3()).project(cam);
    const w = Math.max(Math.round((h - 6) * sp.userData.aspect) + 12, 60);
    editEl.style.height = `${h}px`;
    editEl.style.width = `${w}px`;
    editEl.style.fontSize = `${Math.round((h - 6) * 0.78)}px`;
    editEl.style.left = `${((v.x + 1) / 2) * canvas.clientWidth - w / 2}px`;
    editEl.style.top = `${((1 - v.y) / 2) * canvas.clientHeight - h / 2}px`;
  }

  function openEdit(sp) {
    editing = { sprite: sp, key: sp.userData.edit };
    editEl.value = String(P[editing.key]);
    editEl.hidden = false;
    placeEdit();
    editEl.focus();
    const n = editEl.value.length;
    editEl.setSelectionRange(n, n);
  }

  function closeEdit(commit) {
    if (!editing) return;
    const { sprite, key } = editing;
    editing = null;
    editEl.hidden = true;
    sprite.visible = true;
    const v = parseFloat(editEl.value.replace(/[^\d.\-]/g, ''));
    if (commit && isFinite(v)) setParam(key, v);
  }

  function setParam(key, v) {
    const [lo, hi, step] = limits(key);
    v = Math.min(hi, Math.max(lo, Math.round(v / step) * step));
    v = Math.round(v * 10) / 10;
    if (P[key] === v) return;
    P[key] = v;
    if (key === 'modL') P.hole = Math.min(P.hole, P.modL - 200);
    if (inputs[key]) inputs[key].show(v);
    build();
  }

  let downAt = null;
  canvas.addEventListener('pointerdown', (e) => {
    // OrbitControls 会 preventDefault，输入框不会自己失焦，这里手动提交
    if (editing) editEl.blur();
    downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!downAt) return;
    const click = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6 && performance.now() - downAt.t < 1000;
    downAt = null;
    const sp = click && pickLabel(e);
    if (sp) openEdit(sp);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!e.buttons) canvas.style.cursor = pickLabel(e) ? 'text' : '';
  });
  editEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); editEl.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); closeEdit(false); }
  });
  editEl.addEventListener('blur', () => closeEdit(true));

  function resize() {
    const w = stage.clientWidth || 1, h = stage.clientHeight || 1;
    renderer.setSize(w, h, false);
    persp.aspect = w / h;
    persp.updateProjectionMatrix();
    ortho.left = -w / h; ortho.right = w / h; ortho.top = 1; ortho.bottom = -1;
    ortho.updateProjectionMatrix();
  }

  // ---------- 面板 ----------
  const inputs = {};
  let pending = false;
  function scheduleBuild() {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; build(); });
  }

  function initPanel() {
    const box = document.getElementById('params');
    for (const d of PARAMS) {
      const row = document.createElement('div');
      row.className = 'prow';
      if (d.type === 'bool') {
        row.classList.add('pbool');
        row.innerHTML = `<label class="pl"><input type="checkbox"${P[d.key] ? ' checked' : ''}>${d.label}</label>` +
          (d.hint ? `<small>${d.hint}</small>` : '');
        const cb = row.querySelector('input');
        cb.addEventListener('change', () => { P[d.key] = cb.checked ? 1 : 0; scheduleBuild(); });
        inputs[d.key] = { show: (v) => { cb.checked = !!v; } };
        box.appendChild(row);
        continue;
      }
      row.innerHTML =
        `<span class="pl">${d.label}</span>` +
        `<span class="pv"><input type="number" min="${d.min}" max="${d.max}" step="${d.step}" value="${P[d.key]}"><i>${d.unit}</i></span>` +
        `<input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${P[d.key]}" aria-label="${d.label}">` +
        (d.hint ? `<small>${d.hint}</small>` : '');
      const num = row.querySelector('input[type=number]'), range = row.querySelector('input[type=range]');
      const set = (val, src) => {
        if (!isFinite(val)) return;
        val = Math.min(d.max, Math.max(d.min, val));
        P[d.key] = val;
        if (src !== range) range.value = val;
        if (src !== num) num.value = val;
        scheduleBuild();
      };
      range.addEventListener('input', () => set(+range.value, range));
      num.addEventListener('change', () => set(+num.value, null));
      inputs[d.key] = { show: (v) => { num.value = v; range.value = v; } };
      box.appendChild(row);
    }
    // 图纸方案：整套参数切换到对应图纸；“恢复图纸参数”回到当前方案的图纸值。原图叠加只有图纸一
    const presetEl = document.getElementById('preset'), overlayCb = document.querySelector('[data-k=overlay]');
    const applyPreset = () => {
      Object.assign(P, PRESETS[preset]);
      for (const k in inputs) inputs[k].show(P[k]);
      overlayCb.disabled = preset !== 'A';
      overlayCb.closest('label').classList.toggle('off', preset !== 'A');
      build();
      setView(currentView);
    };
    presetEl.addEventListener('change', () => { preset = presetEl.value; applyPreset(); });
    document.getElementById('reset').addEventListener('click', applyPreset);
    document.querySelectorAll('.toggles input').forEach((cb) => {
      cb.addEventListener('change', () => {
        show[cb.dataset.k] = cb.checked;
        applyVisibility();
        if (cb.dataset.k === 'overlay' && cb.checked && currentView !== 'side') setView('side');
      });
    });
    viewButtons.forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
    // 节点详图：先选节点种类、前/后侧，再选正视/轴测；不在节点视图时点种类直接进正视
    const openJoint = () => setView(currentView.startsWith('joint') ? currentView : 'joint-elev');
    const chipGroup = (sel, apply) => {
      const chips = document.querySelectorAll(sel);
      chips.forEach((b) => b.addEventListener('click', () => {
        apply(b);
        chips.forEach((x) => x.classList.toggle('on', x === b));
        openJoint();
      }));
    };
    chipGroup('[data-jtype]', (b) => { jointType = b.dataset.jtype; });
    chipGroup('[data-joint]', (b) => { jointSel = +b.dataset.joint; });
    const panel = document.getElementById('panel');
    document.getElementById('sheetHandle').addEventListener('click', () => {
      panel.classList.toggle('open');
      setTimeout(() => { resize(); setView(currentView); }, 30);   // 画布变矮了，重新取景
    });
  }

  function kgPerM(sec) { return ((sec.t * (sec.d + 2 * sec.f + 2 * sec.l) - 4 * sec.t * sec.t) * 7.85) / 1000; }

  function updatePanel() {
    const r = Math.round, n = P.frames, L = layout, O = S.outer, np = S.purlins.length;
    document.querySelector('.title small').textContent =
      `固定倾角 · 双立柱 · 组件竖排 ${P.rows} 块${O ? ' · 带外斜撑' : ''}（单位 mm）`;
    document.getElementById('warnings').innerHTML = S.warn.map((w) => `<li>${w}</li>`).join('');
    const braceSum = S.braceF + S.braceR + (O ? O.braceOF + O.braceOR : 0);
    const steelKg =
      n * ((S.lenF + S.lenR) * kgPerM(FIX.post) + S.beamLen * kgPerM(FIX.beam) + braceSum * kgPerM(FIX.brace)) / 1000 +
      (np * L.purlinLen * kgPerM(FIX.purlin)) / 1000;
    const rows = [
      ['榀距 首末跨 / 中间跨', `${P.pitchEnd} / ${P.pitch}（总 ${r(L.spanEW)}）`],
      ['斜梁', `${r(S.beamLen)} × ${n}（两端悬挑 ${r(S.ovh)}）`],
      ['前柱 总长（露出）', `${r(S.lenF)}（${r(S.topF)}）× ${n}`],
      ['后柱 总长（顶高）', `${r(S.lenR)}（${r(S.topR)}）× ${n}`],
      ['前 / 后斜撑', `${r(S.braceF)} / ${r(S.braceR)} × ${n}`],
      ...(O ? [['前 / 后外斜撑', `${r(O.braceOF)} / ${r(O.braceOR)} × ${n}`]] : []),
      ['斜撑连接板', `${2 * n} 块（${O ? '双面 ' : '单面 '}${L.joints[0].spec}）`],
      ['檩托', `${L.counts.clip} 个（L 形 t=${CLIP.t}）`],
      ['M12 螺栓', `${L.counts.m12} 套`],
      ['M8 组件安装螺栓', `${L.counts.m8} 套`],
      ['檩条', `${r(L.purlinLen)} × ${np}`],
      ['组件', `${P.rows * L.cols} 块（${P.rows} × ${L.cols}）`],
      ['钢材估重', `${r(steelKg)} kg`],
      ['前沿实际离地', `${r(S.clearEdge)}`],
      ['后柱实际埋深', `${r(S.embedR)}`],
    ];
    document.getElementById('results').innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');

    // 与所选图纸核对；模型里没有的项（比如关掉外斜撑）显示“—”
    const gap = (i) => (i + 1 < np ? S.purlins[i + 1] - S.purlins[i] : NaN);
    const purlinRows = (k) => Array.from({ length: k }, (_, i) => [`檩条间距 ${i + 1}-${i + 2}`, i % 2 ? 1002 : 1400, gap(i)]);
    const check = preset === 'A' ? [
      ['斜梁长度', 4030, S.beamLen],
      ['斜梁上端悬挑', 415, S.ovh],
      ['前柱露出地面', 1038, S.topF],
      ['后柱顶高（±0 起）', 2391, S.topR],
      ['前柱总长', 2838, S.lenF],
      ['后柱总长', 4336, S.lenR],
      ['设计坡差 5%', 145, S.drop],
      ['前斜撑', 1649, S.braceF],
      ['后斜撑', 1816, S.braceR],
      ['檩条总长', 32392, L.purlinLen],
      ['檩条端部悬挑', 796, (L.purlinLen - L.spanEW) / 2],
      ...purlinRows(3),
    ] : [
      ['斜梁长度', 6430, S.beamLen],
      ['前柱总长', 2933, S.lenF],
      ['后柱总长', 3998, S.lenR],
      ['设计坡差 2%', 74, S.drop],
      ['前斜撑', 1722, S.braceF],
      ['后斜撑', 1900, S.braceR],
      ['前外斜撑', 1011, O ? O.braceOF : NaN],
      ['后外斜撑', 2184, O ? O.braceOR : NaN],
      ['檩条总长', 31238, L.purlinLen],
      ['檩条端部悬挑', 994, (L.purlinLen - L.spanEW) / 2],
      ...purlinRows(5),
    ];
    document.querySelector('#check tbody').innerHTML = check.map(([k, a, b]) => {
      if (!isFinite(b)) return `<tr><td>${k}</td><td>${a}</td><td>—</td><td class="bad">—</td></tr>`;
      const d = r(b) - a;
      return `<tr><td>${k}</td><td>${a}</td><td>${r(b)}</td><td class="${Math.abs(d) <= 2 ? 'ok' : 'bad'}">${d > 0 ? '+' : ''}${d}</td></tr>`;
    }).join('');
  }

  // ---------- 启动 ----------
  initPanel();
  resize();
  build();
  setView('3d', true);
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
  else window.addEventListener('resize', resize);

  function loop(now) {
    requestAnimationFrame(loop);
    if (tween) stepTween(now); else controls.update();
    updateLabels();
    renderer.render(scene, cam);
  }
  requestAnimationFrame(loop);

  // 调试/测试用
  window.pvDemo = { P, show, solve, setView, rebuild: build, controls, labels, pickLabel, get camera() { return cam; }, get state() { return { S, layout, view: currentView, cam: cam.type }; } };
})();
