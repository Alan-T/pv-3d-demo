import type { ModelParameters, Section, PresetId } from './design-types.ts';
import type { EWLayout, Solution } from './solve.ts';
import type { PostTieRow } from './post-tie-layout.ts';
import type { PurlinTies } from './purlin-tie-layout.ts';
import { getClampSpec } from './clamp-spec.ts';

type ReportLayout = EWLayout & {
  postTies: PostTieRow[];
  purlinTies: PurlinTies;
  joints: { plateCount: number; specLabel: string }[];
  purlinClip: { name: string };
  purlinConnector: { name: string } | null;
  counts: {
    clip: number;
    m16: number;
    m12: number;
    m8: number;
    m8c: number;
    postTieBolts: number;
    purlinTieBolts: number;
    spliceBolts: number;
    clamps: { mid: number; side: number } | null;
  };
};

function kgPerM(sec: Section) {
  const area = sec.type === 'L'
    ? sec.t * (sec.d + sec.f - sec.t)
    : sec.t * (sec.d + 2 * sec.f + 2 * sec.l) - 4 * sec.t * sec.t;
  return (area * 7.85) / 1000;
}

function computeSteelWeightKg(S: Solution, L: ReportLayout) {
  const { sections } = S;
  const outer = S.outer;
  const frameSteel =
    S.lenF * kgPerM(sections.postF) +
    S.lenR * kgPerM(sections.postR) +
    S.beamLen * kgPerM(sections.beam) +
    S.braceF * kgPerM(sections.braceF) +
    S.braceR * kgPerM(sections.braceR) +
    (outer ? outer.braceOF * kgPerM(sections.braceOF) + outer.braceOR * kgPerM(sections.braceOR) : 0);

  return (
    (L.frames * frameSteel) / 1000 +
    (S.purlins.length * L.purlinLen * kgPerM(sections.purlin)) / 1000 +
    L.postTies.flatMap((row) => row.rods).reduce((sum, rod) => sum + (rod.length * kgPerM(sections.postTie)) / 1000, 0) +
    (L.purlinTies.count * L.purlinTies.length * kgPerM(sections.purlinTie)) / 1000
  );
}

/** 与所选图纸核对；模型里没有的项（比如关掉外斜撑）显示 “—”。 */
function buildPresetChecks(S: Solution, L: ReportLayout, preset: PresetId) {
  const outer = S.outer;
  const np = S.purlins.length;
  const gap = (i: number) => (i + 1 < np ? S.purlins[i + 1] - S.purlins[i] : NaN);
  const purlinRows = (k: number): [string, number, number][] =>
    Array.from({ length: k }, (_, i) => [`檩条间距 ${i + 1}-${i + 2}`, i % 2 ? (preset === 'A' ? 1004 : 1002) : 1400, gap(i)]);

  const raw: [string, number, number][] = preset === 'A'
    ? [
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
      ]
    : [
        ['斜梁长度', 6430, S.beamLen],
        ['斜梁上端悬挑', 1308, S.ovh],
        ['前柱露出地面', 1026, S.topF],
        ['后柱露出地面', 1948, S.topR],
        ['前柱总长', 2526, S.lenF],
        ['后柱总长', 3448, S.lenR],
        ['前斜撑', 1631, S.braceF],
        ['后斜撑', 1750, S.braceR],
        ['前外斜撑', 968, outer ? outer.braceOF : NaN],
        ['后外斜撑', 1968, outer ? outer.braceOR : NaN],
        ['檩条总长', 31338, L.purlinLen],
        ['檩条端部悬挑', 1119, (L.purlinLen - L.spanEW) / 2],
        ...purlinRows(5),
      ];

  return raw.map(([label, expected, value]) => {
    const actual = Number.isFinite(value) ? Math.round(value) : null;
    const delta = actual === null ? null : actual - expected;
    return { label, expected, actual, delta, matches: delta !== null && Math.abs(delta) <= 2 };
  });
}

export function createReport(P: ModelParameters, S: Solution, L: ReportLayout, preset: PresetId) {
  const r = Math.round;
  const h1 = (x: number) => Math.round(x * 10) / 10;
  const n = L.frames;
  const outer = S.outer;
  const np = S.purlins.length;
  const moduleCount = P.rows * L.cols;
  const clamps = L.counts.clamps;
  const clampSpec = clamps ? getClampSpec(P.modT, P.clampL) : null;
  const steelKg = computeSteelWeightKg(S, L);

  const rows: [string, string][] = [
    ['榀数（按组件列数）', `${n} 榀（檩条两端悬挑 ${r((L.purlinLen - L.spanEW) / 2)}）`],
    ['榀距 首末跨 / 中间跨', `${P.pitchEnd} / ${P.pitch}（总 ${r(L.spanEW)}）`],
    ...(L.ew.i
      ? [
          ['水平榀距 首末跨 / 中间跨', `${h1(P.pitchEnd * L.ew.ca)} / ${h1(P.pitch * L.ew.ca)}（总 ${r(L.spanEW * L.ew.ca)}）`] as [string, string],
          ['相邻榀高差 首末跨 / 中间跨', `${h1(P.pitchEnd * L.ew.sa)} / ${h1(P.pitch * L.ew.sa)}（首末榀 ${r(L.spanEW * L.ew.sa)}）`] as [string, string],
        ]
      : []),
    ['斜梁', `${r(S.beamLen)} × ${n}（两端悬挑 ${r(S.ovh)}）`],
    ['前柱 总长（露出）', `${r(S.lenF)}（${r(S.topF)}）× ${n}`],
    ['后柱 总长（顶高）', `${r(S.lenR)}（${r(S.topR)}）× ${n}`],
    ['前 / 后斜撑', `${r(S.braceF)} / ${r(S.braceR)} × ${n}`],
    ...L.postTies.map((row): [string, string] => {
      const counts = new Map<number, number>();
      for (const rod of row.rods) counts.set(rod.length, (counts.get(rod.length) || 0) + 1);
      return [
        row.rear ? '后排立柱拉杆' : '前排立柱拉杆',
        counts.size ? [...counts].map(([length, count]) => `${length} mm × ${count}`).join('；') : '无',
      ];
    }),
    ...(outer ? [['前 / 后外斜撑', `${r(outer.braceOF)} / ${r(outer.braceOR)} × ${n}`] as [string, string]] : []),
    ['斜撑连接板', `${L.joints.reduce((sum, joint) => sum + joint.plateCount, 0) * n} 块 · ${L.joints[0].specLabel}`],
    ['檩托', `${L.counts.clip} 个（${L.purlinClip.name}）`],
    ['M16×40 立柱连接螺栓', `${L.counts.m16} 套`],
    ['M12 螺栓', `${L.counts.m12} 套`],
    ['其中立柱拉杆 M12×35', `${L.counts.postTieBolts} 套（两面平垫，螺母侧弹垫）`],
    ['其中檩条拉杆 M12×35', `${L.counts.purlinTieBolts} 套（Ø14通孔）`],
    ...(clamps && clampSpec
      ? [
          ['中压块', `${clampSpec.mid.name} × ${clamps.mid} 个`] as [string, string],
          ['边压块', `${clampSpec.edge.name} × ${clamps.side} 个`] as [string, string],
          [`${clampSpec.bolt.name} 内六角螺栓`, `${L.counts.m8c} 套`] as [string, string],
        ]
      : [['M8×22 组件安装螺栓', `${L.counts.m8} 套`] as [string, string]]),
    ['檩条切割（每根）', L.cuts.valid ? L.cuts.segments.map((s) => s.length).join(' / ') + ' mm（缝4）' : '无可行方案'],
    ['檩条连接件', L.purlinConnector ? `${L.purlinConnector.name}，${L.cuts.positions.length * np} 个；M12×35 ${L.counts.spliceBolts} 套` : '未选择有效规格'],
    ['檩条', `${r(L.purlinLen)} × ${np}`],
    ['檩条拉杆', L.purlinTies.count ? `${L.purlinTies.length} mm × ${L.purlinTies.count} 套` : '无'],
    ['组件', `${moduleCount} 块（${P.rows} × ${L.cols}）`],
    ['组件总功率', `${(moduleCount * P.modPower) / 1000} kWp`],
    ['组件总重', `${h1(moduleCount * P.modWeight)} kg`],
    ['钢材估重', `${r(steelKg)} kg`],
    ['前沿实际离地', `${r(S.clearEdge)}`],
    ['后柱处地面（相对 ±0）', `${S.gR > 0 ? '+' : ''}${r(S.gR)}`],
  ];

  return {
    title: `固定倾角 · 双立柱 · 组件竖排 ${P.rows} 块${outer ? ' · 带外斜撑' : ''}（单位 mm）`,
    warnings: [...S.warn, ...L.warn],
    rows,
    checks: buildPresetChecks(S, L, preset),
  };
}
