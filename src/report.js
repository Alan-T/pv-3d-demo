import { CLIP } from './config.js';

function kgPerM(sec) {
  const area = sec.type === 'L' ? sec.t * (sec.d + sec.f - sec.t) : sec.t * (sec.d + 2 * sec.f + 2 * sec.l) - 4 * sec.t * sec.t;
  return area * 7.85 / 1000;
}

export function createReport(P, FIX, S, L, preset) {
  const r = Math.round, h1 = (x) => Math.round(x * 10) / 10, n = L.frames, O = S.outer, np = S.purlins.length;
  const title =
    `固定倾角 · 双立柱 · 组件竖排 ${P.rows} 块${O ? ' · 带外斜撑' : ''}（单位 mm）`;
  const warnings = [...S.warn, ...L.warn];
  const steelKg =
    n * (S.lenF * kgPerM(FIX.postF) + S.lenR * kgPerM(FIX.postR) + S.beamLen * kgPerM(FIX.beam) + S.braceF * kgPerM(FIX.braceF) + S.braceR * kgPerM(FIX.braceR) + (O ? O.braceOF * kgPerM(FIX.braceOF) + O.braceOR * kgPerM(FIX.braceOR) : 0)) / 1000 +
    (np * L.purlinLen * kgPerM(FIX.purlin)) / 1000 +
    L.postTies.flatMap(row => row.rods).reduce((sum, rod) => sum + rod.length * kgPerM(FIX.postTie) / 1000, 0) +
    L.purlinTies.count * L.purlinTies.length * kgPerM(FIX.purlinTie) / 1000;
  const rows = [
    ['榀数（按组件列数）', `${n} 榀（檩条两端悬挑 ${r((L.purlinLen - L.spanEW) / 2)}）`],
    ['榀距 首末跨 / 中间跨', `${P.pitchEnd} / ${P.pitch}（总 ${r(L.spanEW)}）`],
    // 东西坡度：榀距是沿檩条的长度，水平距离 = 榀距 × cos，相邻榀抬高 = 榀距 × sin
    ...(L.ew.i ? [
      ['水平榀距 首末跨 / 中间跨', `${h1(P.pitchEnd * L.ew.ca)} / ${h1(P.pitch * L.ew.ca)}（总 ${r(L.spanEW * L.ew.ca)}）`],
      ['相邻榀高差 首末跨 / 中间跨', `${h1(P.pitchEnd * L.ew.sa)} / ${h1(P.pitch * L.ew.sa)}（首末榀 ${r(L.spanEW * L.ew.sa)}）`],
    ] : []),
    ['斜梁', `${r(S.beamLen)} × ${n}（两端悬挑 ${r(S.ovh)}）`],
    ['前柱 总长（露出）', `${r(S.lenF)}（${r(S.topF)}）× ${n}`],
    ['后柱 总长（顶高）', `${r(S.lenR)}（${r(S.topR)}）× ${n}`],
    ['前 / 后斜撑', `${r(S.braceF)} / ${r(S.braceR)} × ${n}`],
    ...L.postTies.map(row => {
      const counts = new Map();
      for (const rod of row.rods) counts.set(rod.length, (counts.get(rod.length) || 0) + 1);
      return [row.rear ? '后排立柱拉杆' : '前排立柱拉杆',
        counts.size ? [...counts].map(([length, count]) => `${length} mm × ${count}`).join('；') : '无'];
    }),
    ...(O ? [['前 / 后外斜撑', `${r(O.braceOF)} / ${r(O.braceOR)} × ${n}`]] : []),
    ['斜撑连接板', `${2 * n} 块（${O ? '双面 ' : '单面 '}${L.joints[0].spec}）`],
    ['檩托', `${L.counts.clip} 个（L 形 t=${CLIP.t}）`],
    ['M16×40 立柱连接螺栓', `${L.counts.m16} 套`],
    ['M12 螺栓', `${L.counts.m12} 套`],
    ['其中立柱拉杆 M12×35', `${L.counts.postTieBolts} 套（两面平垫，螺母侧弹垫）`],
    ['其中檩条拉杆 M12×35', `${L.counts.purlinTieBolts} 套（Ø14通孔）`],
    ...(L.counts.clamps ? [
      ['中压块 / 边压块', `${L.counts.clamps.mid} / ${L.counts.clamps.side} 个（长 ${P.clampL}）`],
      ['M8×35 内六角螺栓', `${L.counts.m8c} 套`],
    ] : [['M8×22 组件安装螺栓', `${L.counts.m8} 套`]]),
    ['檩条切割（每根）', L.cuts.valid ? L.cuts.segments.map(s=>s.length).join(' / ') + ' mm（缝4）' : '无可行方案'],
    ['檩条连接件', L.purlinConnector ? L.purlinConnector.name + '，' + L.cuts.positions.length * np + ' 个；M12×35 ' + L.counts.spliceBolts + ' 套' : '未选择有效规格'],
    ['檩条', `${r(L.purlinLen)} × ${np}`],
    ['檩条拉杆', L.purlinTies.count ? `${L.purlinTies.length} mm × ${L.purlinTies.count} 套` : '无'],
    ['组件', `${P.rows * L.cols} 块（${P.rows} × ${L.cols}）`],
    ['钢材估重', `${r(steelKg)} kg`],
    ['前沿实际离地', `${r(S.clearEdge)}`],
    ['后柱处地面（相对 ±0）', `${S.gR > 0 ? '+' : ''}${r(S.gR)}`],
  ];

  // 与所选图纸核对；模型里没有的项（比如关掉外斜撑）显示“—”
  const gap = (i) => (i + 1 < np ? S.purlins[i + 1] - S.purlins[i] : NaN);
  const purlinRows = (k) => Array.from({ length: k }, (_, i) => [`檩条间距 ${i + 1}-${i + 2}`, i % 2 ? (preset === 'A' ? 1004 : 1002) : 1400, gap(i)]);
  const check = preset === 'A' ? [
    ['斜梁长度', 4030, S.beamLen],
    ['斜梁上端悬挑', 419, S.ovh],
    ['前柱露出地面', 798, S.topF],
    ['后柱顶高（±0 起）', 1890, S.topR],
    ['前柱总长', 2298, S.lenF],
    ['后柱总长', 3390, S.lenR],
    ['前斜撑', 1436, S.braceF],
    ['后斜撑', 1610, S.braceR],
    ['檩条总长', 34478, L.purlinLen],
    ['檩条端部悬挑', 739, (L.purlinLen - L.spanEW) / 2],
    ...purlinRows(3),
  ] : [
    ['斜梁长度', 6430, S.beamLen],
    ['斜梁上端悬挑', 1308, S.ovh],
    ['前柱露出地面', 1026, S.topF],
    ['后柱露出地面', 1948, S.topR],
    ['前柱总长', 2526, S.lenF],
    ['后柱总长', 3448, S.lenR],
    ['前斜撑', 1631, S.braceF],
    ['后斜撑', 1750, S.braceR],
    ['前外斜撑', 968, O ? O.braceOF : NaN],
    ['后外斜撑', 1968, O ? O.braceOR : NaN],
    ['檩条总长', 31338, L.purlinLen],
    ['檩条端部悬挑', 1119, (L.purlinLen - L.spanEW) / 2],
    ...purlinRows(5),
  ];
  return {
    title,
    warnings,
    rows,
    checks: check.map(([label, expected, value]) => {
      const actual = Number.isFinite(value) ? r(value) : null;
      const delta = actual === null ? null : actual - expected;
      return { label, expected, actual, delta, matches: delta !== null && Math.abs(delta) <= 2 };
    }),
  };
}
