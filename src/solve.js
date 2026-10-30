/* 几何求解：由参数算出框架平面内的关键点和东西向布置，单位 mm。纯计算，不碰 three.js 场景 */
(function () {
  'use strict';
  const PV = window.PV;
  const { DEG, FIX } = PV;

  // 框架平面 (x, y) 内的所有关键点
  PV.solve = function solve(p) {
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
    // 南北坡度：前柱处为转折点（地面 = ±0），后柱处地面高 gR = 坡度 × 立柱间距（南向坡为正）。
    // 两根立柱都按实际地面埋深 embed 定长度：后柱总长 = 柱顶高 − gR + 埋深
    // （图纸后柱 4336 = 2391 + 5% × 2900 + 1800，是按北向坡 5% 设计的）
    const sp = p.slope / 100;
    const gy = (x) => sp * (x - xf);
    const gR = gy(xr);
    const botF = -p.embed, botR = gR - p.embed;
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
    // 与两张图纸的斜撑长度一致；实际斜撑从连接板上的螺栓连到斜梁节点（见 parts/brace.js）
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

    const clearEdge = p.h0 - gy(0);
    const clearBraceR = p.braceHR - gR;
    if (clearBraceR < 100) warn.push(`后斜撑下端离地只有 ${Math.round(clearBraceR)}`);
    if (clearEdge < 300) warn.push(`组件前沿实际离地只有 ${Math.round(clearEdge)}`);

    return {
      c, s, beamLen, ovh, extLow, hBeamTop, hModBot, xf, xr, nodeF, nodeR, topF, topR, botF, botR,
      lenF: topF - botF, lenR: topR - botR, along, tF, tR, bF, bR, tFp, tRp, braceF, braceR, outer,
      modStarts, purlins, sp, gy, gR, clearEdge, clearBraceR, warn,
    };
  };

  // 东西向：榀位 zs（首末跨即第 1–2 榀、倒数第 2–1 榀用 pitchEnd，中间跨用 pitch，整排居中）、组件列数、檩条长度
  PV.layoutEW = function layoutEW(p) {
    const bays = [];
    for (let i = 0; i < p.frames - 1; i++) bays.push(i === 0 || i === p.frames - 2 ? p.pitchEnd : p.pitch);
    const spanEW = bays.reduce((a, b) => a + b, 0);
    const zs = [-spanEW / 2];
    for (const b of bays) zs.push(zs[zs.length - 1] + b);
    const pitchEW = FIX.modW + FIX.modGapEW;
    const cols = Math.max(1, Math.round((spanEW + 0.6 * p.pitchEnd) / pitchEW));
    const arrW = cols * pitchEW - FIX.modGapEW;
    const purlinLen = arrW + 2 * FIX.purlinExt;
    // 檩条-组件节点详图取的组件缝：最东一跨里离两榀最远的一道（离檩托、斜梁远，画面里只有组件和檩条）；只有 1 列组件时取阵列东边
    const gaps = [];
    for (let j = 1; j < cols; j++) gaps.push(-arrW / 2 + j * pitchEW - FIX.modGapEW / 2);
    const zE = zs[zs.length - 1], zW = zs.length > 1 ? zs[zs.length - 2] : -Infinity;
    const clear = (g) => Math.min(...zs.map((z) => Math.abs(g - z)));
    const inBay = gaps.filter((g) => g > zW && g < zE), pool = inBay.length ? inBay : gaps;
    const gapZ = pool.length ? pool.reduce((a, g) => (clear(g) > clear(a) ? g : a)) : arrW / 2 + FIX.modGapEW / 2;
    // 东西坡度：上面东西向的 z 都是沿檩条（沿坡）量的，榀距 = 两榀之间的檩条长度。
    // 换成世界坐标时沿坡 z 处水平位置 z·cos、抬高 z·sin（阵列中心不动），见 PV.ewMatrix
    const i = (p.slopeEW || 0) / 100, ca = 1 / Math.hypot(1, i);
    const ew = { i, ca, sa: i * ca };
    return { zs, bays, spanEW, pitchEW, cols, arrW, purlinLen, gapZ, ew };
  };
})();
