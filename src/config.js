/* 图纸尺寸、两套图纸参数、可调参数的范围（单位 mm）。改尺寸、加参数基本都在这里 */
(function () {
  'use strict';
  const PV = window.PV;

  // ---------- 图纸尺寸与假设 ----------
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
      fix: 'bolt',        // 组件固定方式：bolt 安装孔螺栓，clamp 压块（中压块 + 边压块）
      clampL: 50,         // 压块长度（沿坡）
    },
    // 图纸 B 没标斜撑上节点位置：2650 / 2656 / 402 / 379 由四根斜撑长度 1722 / 1900 / 1011 / 2184 反推
    B: {
      tilt: 15, span: 3700, h0: 800, frames: 10, pitch: 3250, pitchEnd: 3250, slope: 0,
      rows: 3, outer: 1, designSlope: 2,
      braceHF: 250, braceHR: 300, braceTopF: 2650, braceTopR: 2656, braceOutF: 402, braceOutR: 379,
      embed: 1800, modL: 2382, hole: 1400, fix: 'bolt', clampL: 50,
    },
  };
  const DEFAULTS = PRESETS.A;

  // ---------- 连接件尺寸 ----------
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
  // 带外斜撑时的双面连接板 280×120×5.75：左右对称，上边 ±half，竖直肩边到两立柱孔中点高度，再斜切到下边 ±botHalf。
  // 孔位见 JOINT（与单面板相同）；板竖向中点在 braceHF / braceHR
  const DBL = { half: 140, botHalf: 30 };
  const CLIP = { t: 4, base: 64, height: 80, width: 50, baseBolt: 32, webBolt: 50 };   // 檩托（假设）
  // 压块（截面为假设，螺栓按压块节点图 M8×35 内六角）：t 顶板厚，press 压住组件边框的宽度，wall 立板厚，
  // pocket 螺栓头支承面（槽底）离组件上表面，plate 槽底板厚，sideW 边压块从组件边往外的宽度（檩条伸出组件 50，放得下）
  const CLAMP = { t: 4, press: 12, wall: 2.5, pocket: 12, plate: 4, sideW: 24, bolt: 35 };

  // ---------- 可调参数 ----------
  // 面板里放常用的几个；其余蓝字参数在尺寸标注上点击修改，取值范围在 EXTRA_LIMITS
  const PARAMS = [
    { key: 'tilt',   label: '组件倾角',        unit: '°',  min: 10,   max: 40,   step: 0.5 },
    { key: 'span',   label: '前后立柱间距',    unit: 'mm', min: 2000, max: 4500, step: 50 },
    { key: 'h0',     label: '组件前沿离地高度', unit: 'mm', min: 300,  max: 1500, step: 10 },
    { key: 'fix',    label: '固定方式',        type: 'select', options: [['bolt', '螺栓固定'], ['clamp', '压块']],
      hint: '螺栓固定：组件安装孔 M8×22；压块：缝上中压块、两端边压块，M8×35 内六角' },
    { key: 'clampL', label: '压块长度',        unit: 'mm', min: 30,   max: 200,  step: 5, when: (P) => P.fix === 'clamp' },
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
    return [lo, key === 'hole' ? Math.min(hi, PV.P.modL - 200) : hi, key === 'designSlope' ? 0.5 : 1];
  }

  Object.assign(PV, {
    FIX, PRESETS, DEFAULTS, JOINT, DBL, CLIP, CLAMP, PARAMS, limits,
    P: Object.assign({}, DEFAULTS),   // 当前参数
    show: { dims: true, buried: true, modules: true, bolts: true, drawingColors: true, overlay: false },
  });
})();
