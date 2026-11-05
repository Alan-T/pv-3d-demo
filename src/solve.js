import { braceConnection, braceMember } from './brace-layout.js';
import { cutPurlin } from './purlin-cut.js';
import { JOINT, FIX } from './config.js';
import { DEG, ewMatrix } from './core.js';

/* 几何求解：由参数算出框架平面内的关键点和东西向布置，单位 mm。纯计算，不碰 three.js 场景 */

// 框架平面 (x, y) 内的所有关键点
export function solve(p) {
  const th = p.tilt * DEG, c = Math.cos(th), s = Math.sin(th);
  const L = p.span;
  // 安装孔在每块组件上居中；首末孔距加下端 135、上端 85 后向上取整到 10。
  // 与二维一致：取整增加的长度平均分到上下两端。
  const a = (p.modL - p.hole) / 2;                         // 组件下沿到下安装孔（沿坡）
  const purlinSpan = (p.rows - 1) * (p.modL + FIX.modGap) + p.hole;
  const ret = purlinSpan + FIX.beamEndOffsets.low + FIX.beamEndOffsets.high;
  const beamLen = Math.ceil(ret / 10) * 10;
  const endAllowance = (beamLen - ret) / 2;
  const ovh = (beamLen - L / c) / 2;                        // 斜梁两端伸出立柱中心（悬挑）
  const extLow = a - FIX.beamEndOffsets.low - endAllowance; // 组件下沿伸出斜梁下端
  const sLow = ovh + extLow;                                // 前柱节点 → 组件下沿（沿坡）
  const hBeamTop = FIX.beam.d / 2;                          // 斜梁中心线 → 上表面
  const hModBot = hBeamTop + FIX.purlin.d;                  // 斜梁中心线 → 组件底面
  const xf = sLow * c + hModBot * s;                        // 前柱中心到原点
  const xr = xf + L;
  const nodeF = p.h0 + sLow * s - hModBot * c;              // 斜梁中心线在前柱中心处的高度
  const nodeR = nodeF + L * s / c;
  // 连接孔位于立柱中心线与斜梁腹板中心线的交点；柱顶水平切，孔心向上留边。
  const holeF = nodeF, holeR = nodeR;
  const topF = holeF + JOINT.postTopHole, topR = holeR + JOINT.postTopHole;
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
  // 连接件中心高度仍相对 ±0；斜撑下孔在中心上方 rise，水平偏移随各自柱截面计算。
  const connections = [
    braceConnection({ x: xf, y: p.braceHF, side: 1, postWidth: FIX.postF.d, outer: p.outer, boltOffset: JOINT.boltU, rise: JOINT.rise }),
    braceConnection({ x: xr, y: p.braceHR, side: -1, postWidth: FIX.postR.d, outer: p.outer, boltOffset: JOINT.boltU, rise: JOINT.rise }),
  ];
  const bF = connections[0].Q, bR = connections[1].Q;
  const tFp = along(tF), tRp = along(tR);
  const braceMembers = [braceMember(bF, tFp, JOINT.braceEdge), braceMember(bR, tRp, JOINT.braceEdge)];
  const braceF = braceMembers[0].len, braceR = braceMembers[1].len;

  // 外斜撑：下节点在立柱外侧面（与内斜撑同高、同一块连接板），上节点在斜梁悬挑段
  let outer = null;
  if (p.outer) {
    const oF = connections[0].Qo, oR = connections[1].Qo;
    const toF = Math.min(p.braceOutF, ovh - 100), toR = beamLen - Math.min(p.braceOutR, ovh - 100);
    if (p.braceOutF > ovh - 100 || p.braceOutR > ovh - 100) warn.push('外斜撑上节点要落在立柱外侧的斜梁悬挑段上，已临时压回悬挑段');
    const toFp = along(toF), toRp = along(toR);
    outer = {
      oF, oR, toF, toR, toFp, toRp,
      braceOF: braceMember(oF, toFp, JOINT.braceEdge).len, braceOR: braceMember(oR, toRp, JOINT.braceEdge).len,
    };
  }

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
    c, s, beamLen, ovh, extLow, hBeamTop, hModBot, xf, xr, nodeF, nodeR, topF, topR, holeF, holeR, botF, botR,
    lenF: topF - botF, lenR: topR - botR, along, tF, tR, bF, bR, tFp, tRp, braceF, braceR, outer,
    connections, braceMembers, modStarts, purlins, sp, gy, gR, clearEdge, clearBraceR, warn,
  };
}

// 东西向：组件列数 → 阵列宽、檩条长（两端各伸出 purlinExt，螺栓固定 50、压块 100）→ 榀数、榀位 zs（首末跨即第 1–2 榀、
// 倒数第 2–1 榀用 pitchEnd，中间跨用 pitch，整排居中）。榀数取檩条两端悬挑不超过 maxOverhang × 首末跨榀距的最少榀数；
// 榀距比阵列还宽时少放一榀
export function layoutEW(p) {
  const cols = p.cols, pitchEW = p.modW + FIX.modGapEW;
  const arrW = cols * pitchEW - FIX.modGapEW;
  const purlinExt = FIX.purlinExt[p.fix], purlinLen = arrW + 2 * purlinExt;
  const bayAt = (i, n) => (i === 0 || i === n - 2 ? p.pitchEnd : p.pitch);
  const spanOf = (n) => { let s = 0; for (let i = 0; i < n - 1; i++) s += bayAt(i, n); return s; };
  const warn = [];
  let frames = 1;
  while ((purlinLen - spanOf(frames)) / 2 > FIX.maxOverhang * p.pitchEnd) frames++;
  if (frames > 1 && spanOf(frames) > purlinLen - FIX.purlin.f) {
    frames--;
    warn.push(`组件列数太少：檩条两端悬挑 ${Math.round((purlinLen - spanOf(frames)) / 2)}，再加一榀又放不下`);
  }
  const bays = [];
  for (let i = 0; i < frames - 1; i++) bays.push(bayAt(i, frames));
  const spanEW = spanOf(frames);
  const zs = [-spanEW / 2];
  for (const b of bays) zs.push(zs[zs.length - 1] + b);
  // 檩条-组件节点详图取的组件缝：最东一跨里离两榀最远的一道（离檩托、斜梁远，画面里只有组件和檩条）；只有 1 列组件时取阵列东边
  const gaps = [];
  for (let j = 1; j < cols; j++) gaps.push(-arrW / 2 + j * pitchEW - FIX.modGapEW / 2);
  const zE = zs[zs.length - 1], zW = zs.length > 1 ? zs[zs.length - 2] : -Infinity;
  const clear = (g) => Math.min(...zs.map((z) => Math.abs(g - z)));
  const inBay = gaps.filter((g) => g > zW && g < zE), pool = inBay.length ? inBay : gaps;
  const gapZ = pool.length ? pool.reduce((a, g) => (clear(g) > clear(a) ? g : a)) : arrW / 2 + FIX.modGapEW / 2;
  // 东西坡度：上面东西向的 z 都是沿檩条（沿坡）量的，榀距 = 两榀之间的檩条长度。
  // 换成世界坐标时沿坡 z 处水平位置 z·cos、抬高 z·sin（阵列中心不动），见 ewMatrix
  const i = (p.slopeEW || 0) / 100, ca = 1 / Math.hypot(1, i);
  const ew = { i, ca, sa: i * ca };
  const cuts = cutPurlin(p, purlinLen, zs, gaps, arrW);
  if (!cuts.valid) warn.push('檩条切割无可行解，请调整榀距或最大长度；暂显示通长檩条');
  return { cuts, frames, zs, bays, spanEW, pitchEW, cols, arrW, purlinExt, purlinLen, gapZ, ew, warn };
}
