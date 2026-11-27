import type { ModelParameters, Section, PresetId } from './design-types.ts';
import { PRESET_BENCHMARKS, type PresetBenchmark } from '../config/presets.ts';
import { PURLIN_CUT_RULES, TIE_RULES } from '../config/engineering-rules.ts';
import { fastenerLabel, JOINT_FASTENER_RULES } from './specs/fastener-spec.ts';
import type { EWLayout, Solution } from './solve.ts';
import type { PostTieRow } from './post-tie-layout.ts';
import type { PurlinTies } from './purlin-tie-layout.ts';
import { getClampSpec } from './specs/clamp-spec.ts';

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

function computeSteelWeightKg(solution: Solution, layout: ReportLayout) {
  const { sections, outer } = solution;
  const frameSteel =
    solution.lenF * kgPerM(sections.postF) +
    solution.lenR * kgPerM(sections.postR) +
    solution.beamLen * kgPerM(sections.beam) +
    solution.braceF * kgPerM(sections.braceF) +
    solution.braceR * kgPerM(sections.braceR) +
    (outer ? outer.braceOF * kgPerM(sections.braceOF) + outer.braceOR * kgPerM(sections.braceOR) : 0);

  return (
    (layout.frames * frameSteel) / 1000 +
    (solution.purlins.length * layout.purlinLen * kgPerM(sections.purlin)) / 1000 +
    layout.postTies.flatMap((row) => row.rods).reduce((sum, rod) => sum + (rod.length * kgPerM(sections.postTie)) / 1000, 0) +
    (layout.purlinTies.count * layout.purlinTies.length * kgPerM(sections.purlinTie)) / 1000
  );
}

/** 与所选图纸核对；模型里没有的项（比如关掉外斜撑）显示 “—”。 */
function buildPresetChecks(solution: Solution, layout: ReportLayout, benchmark: PresetBenchmark) {
  const raw: [string, number, number][] = [
    ['斜梁长度', benchmark.beamLength, solution.beamLen],
    ['斜梁上端悬挑', benchmark.beamOverhang, solution.ovh],
    ['前柱露出地面', benchmark.frontPostHeight, solution.topF],
    [benchmark.rearPostHeightLabel, benchmark.rearPostHeight, solution.topR],
    ['前柱总长', benchmark.frontPostLength, solution.lenF],
    ['后柱总长', benchmark.rearPostLength, solution.lenR],
    ['前斜撑', benchmark.frontBrace, solution.braceF],
    ['后斜撑', benchmark.rearBrace, solution.braceR],
  ];
  if (benchmark.frontOuterBrace !== undefined) raw.push(['前外斜撑', benchmark.frontOuterBrace, solution.outer?.braceOF ?? NaN]);
  if (benchmark.rearOuterBrace !== undefined) raw.push(['后外斜撑', benchmark.rearOuterBrace, solution.outer?.braceOR ?? NaN]);
  raw.push(
    ['檩条总长', benchmark.purlinLength, layout.purlinLen],
    ['檩条端部悬挑', benchmark.purlinOverhang, (layout.purlinLen - layout.spanEW) / 2],
  );
  for (const [index, spacing] of benchmark.purlinSpacings.entries()) {
    const actual = solution.purlins[index + 1] - solution.purlins[index];
    raw.push([`檩条间距 ${index + 1}-${index + 2}`, spacing, actual]);
  }

  return raw.map(([label, expected, value]) => {
    const actual = Number.isFinite(value) ? Math.round(value) : null;
    const delta = actual === null ? null : actual - expected;
    return { label, expected, actual, delta, matches: delta !== null && Math.abs(delta) <= 2 };
  });
}

type ReportRow = [label: string, value: string];

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

function frameSpacingRows(parameters: ModelParameters, layout: ReportLayout): ReportRow[] {
  const { pitchEnd, pitch } = parameters;
  const { ew, frames, purlinLen, spanEW } = layout;
  const rows: ReportRow[] = [
    ['榀数（按组件列数）', `${frames} 榀（檩条两端悬挑 ${Math.round((purlinLen - spanEW) / 2)}）`],
    ['榀距 首末跨 / 中间跨', `${pitchEnd} / ${pitch}（总 ${Math.round(spanEW)}）`],
  ];
  if (ew.i) {
    rows.push(
      ['水平榀距 首末跨 / 中间跨', `${roundToTenth(pitchEnd * ew.ca)} / ${roundToTenth(pitch * ew.ca)}（总 ${Math.round(spanEW * ew.ca)}）`],
      ['相邻榀高差 首末跨 / 中间跨', `${roundToTenth(pitchEnd * ew.sa)} / ${roundToTenth(pitch * ew.sa)}（首末榀 ${Math.round(spanEW * ew.sa)}）`],
    );
  }
  return rows;
}

function postTieRow(row: PostTieRow): ReportRow {
  const countsByLength = new Map<number, number>();
  for (const { length } of row.rods) {
    countsByLength.set(length, (countsByLength.get(length) ?? 0) + 1);
  }
  const summary = [...countsByLength].map(([length, count]) => `${length} mm × ${count}`).join('；');
  return [row.rear ? '后排立柱拉杆' : '前排立柱拉杆', summary || '无'];
}

function frameMemberRows(solution: Solution, layout: ReportLayout): ReportRow[] {
  const { outer } = solution;
  const { frames } = layout;
  const rows: ReportRow[] = [
    ['斜梁', `${Math.round(solution.beamLen)} × ${frames}（两端悬挑 ${Math.round(solution.ovh)}）`],
    ['前柱 总长（露出）', `${Math.round(solution.lenF)}（${Math.round(solution.topF)}）× ${frames}`],
    ['后柱 总长（顶高）', `${Math.round(solution.lenR)}（${Math.round(solution.topR)}）× ${frames}`],
    ['前 / 后斜撑', `${Math.round(solution.braceF)} / ${Math.round(solution.braceR)} × ${frames}`],
    ...layout.postTies.map(postTieRow),
  ];
  if (outer) rows.push(['前 / 后外斜撑', `${Math.round(outer.braceOF)} / ${Math.round(outer.braceOR)} × ${frames}`]);
  return rows;
}

function hardwareRows(parameters: ModelParameters, layout: ReportLayout): ReportRow[] {
  const { joints, counts } = layout;
  const plateCount = joints.reduce((sum, joint) => sum + joint.plateCount, 0) * layout.frames;
  const rows: ReportRow[] = [
    ['斜撑连接板', `${plateCount} 块 · ${joints[0].specLabel}`],
    ['檩托', `${counts.clip} 个（${layout.purlinClip.name}）`],
    [`${fastenerLabel('top')} 立柱连接螺栓`, `${counts.m16} 套`],
    [`M${JOINT_FASTENER_RULES.foot.diameter} 螺栓`, `${counts.m12} 套`],
    [`其中立柱拉杆 ${fastenerLabel('postTie')}`, `${counts.postTieBolts} 套（两面平垫，螺母侧弹垫）`],
    [`其中檩条拉杆 ${fastenerLabel('purlinTie')}`, `${counts.purlinTieBolts} 套（Ø${2 * TIE_RULES.purlinTie.holeRadius}通孔）`],
  ];
  if (counts.clamps) {
    const spec = getClampSpec(parameters.modT, parameters.clampL);
    rows.push(
      ['中压块', `${spec.mid.name} × ${counts.clamps.mid} 个`],
      ['边压块', `${spec.edge.name} × ${counts.clamps.side} 个`],
      [`${spec.bolt.name} 内六角螺栓`, `${counts.m8c} 套`],
    );
  } else {
    rows.push([`${fastenerLabel('module')} 组件安装螺栓`, `${counts.m8} 套`]);
  }
  return rows;
}

function purlinRows(layout: ReportLayout, purlinCount: number): ReportRow[] {
  const { cuts, purlinConnector, purlinTies } = layout;
  return [
    ['檩条切割（每根）', cuts.valid ? cuts.segments.map(segment => segment.length).join(' / ') + ` mm（缝${PURLIN_CUT_RULES.gap}）` : '无可行方案'],
    ['檩条连接件', purlinConnector ? `${purlinConnector.name}，${cuts.positions.length * purlinCount} 个；${fastenerLabel('splice')} ${layout.counts.spliceBolts} 套` : '未选择有效规格'],
    ['檩条', `${Math.round(layout.purlinLen)} × ${purlinCount}`],
    ['檩条拉杆', purlinTies.count ? `${purlinTies.length} mm × ${purlinTies.count} 套` : '无'],
  ];
}

export function createReport(parameters: ModelParameters, solution: Solution, layout: ReportLayout, preset: PresetBenchmark | PresetId) {
  const benchmark = typeof preset === 'string' ? PRESET_BENCHMARKS[preset] : preset;
  const moduleCount = parameters.rows * layout.cols;
  const rows: ReportRow[] = [
    ...frameSpacingRows(parameters, layout),
    ...frameMemberRows(solution, layout),
    ...hardwareRows(parameters, layout),
    ...purlinRows(layout, solution.purlins.length),
    ['组件', `${moduleCount} 块（${parameters.rows} × ${layout.cols}）`],
    ['组件总功率', `${(moduleCount * parameters.modPower) / 1000} kWp`],
    ['组件总重', `${roundToTenth(moduleCount * parameters.modWeight)} kg`],
    ['钢材估重', `${Math.round(computeSteelWeightKg(solution, layout))} kg`],
    ['前沿实际离地', `${Math.round(solution.clearEdge)}`],
    ['后柱处地面（相对 ±0）', `${solution.gR > 0 ? '+' : ''}${Math.round(solution.gR)}`],
  ];

  return {
    title: `固定倾角 · 双立柱 · 组件竖排 ${parameters.rows} 块${solution.outer ? ' · 带外斜撑' : ''}（单位 mm）`,
    warnings: [...solution.warn, ...layout.warn],
    rows,
    checks: buildPresetChecks(solution, layout, benchmark),
  };
}
