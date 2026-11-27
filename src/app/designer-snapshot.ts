import { DEFAULTS, PRESET_BENCHMARKS } from '../config/presets.ts';
import { DrawingLayouts } from '../domain/layout-variants.ts';
import type { calculatePostTies } from '../domain/post-tie-layout.ts';
import { createReport } from '../domain/report.ts';
import { createRuntimeContext, type RuntimeContext } from '../viewer/runtime-context.ts';

function describePostTieLengths({ rods, enabled }: ReturnType<typeof calculatePostTies>[number]) {
  const endSpans = new Set<number>();
  const middleSpans = new Set<number>();
  for (const { bay, length } of rods) {
    const group = bay === 0 || bay === enabled.length - 1 ? endSpans : middleSpans;
    group.add(length);
  }
  const groups: [string, Set<number>][] = [['首末跨', endSpans], ['中间跨', middleSpans]];
  return groups
    .filter(([, lengths]) => lengths.size)
    .map(([label, lengths]) => `${label} ${[...lengths].sort((a, b) => a - b).join(' / ')} mm`)
    .join(' · ');
}

// Vue receives plain snapshots. Three.js objects stay inside the scene runtime.
export function buildSnapshot(context: RuntimeContext, drawing: DrawingLayouts, viewLocked: boolean) {
  const { state, parameters, display } = context;
  const layout = state.layout;
  return {
    parameters: structuredClone(parameters),
    sections: { ...drawing.active.sections },
    activeLayoutId: drawing.activeId,
    layouts: structuredClone(drawing.layouts),
    display: { ...display },
    preset: state.preset,
    view: state.view,
    jointType: state.jointType,
    jointSel: state.jointSel,
    viewLocked,
    spliceAvailable: !!(layout?.cuts.positions.length && layout.purlinConnector),
    tieJointAvailable: Object.fromEntries((['postTie', 'purlinTie'] as const).map(type =>
      [type, [0, 1].map(side => !!layout?.jointSpecs?.[type]?.[side])])),
    braceConnectorSpec: layout?.joints[0]?.specLabel ?? '',
    bayCount: layout ? layout.zs.length - 1 : 0,
    frameCount: layout?.frames ?? 0,
    purlinTieCount: layout?.purlinTies.count ?? 0,
    purlinTieLength: layout?.purlinTies.count ? layout.purlinTies.length : null,
    purlinLength: layout?.purlinLen ?? 0,
    purlinCutError: layout?.cuts.error ?? '',
    postTies: layout?.postTies.map(row => ({
      key: row.rear ? 'R' as const : 'F' as const,
      label: row.rear ? '后排' : '前排',
      topOffset: Math.round(row.topOffset),
      holeRise: row.holeRise,
      enabled: [...row.enabled],
      lengthDescription: describePostTieLengths(row),
    })) ?? [],
    report: state.S && layout ? createReport(parameters, state.S, layout, PRESET_BENCHMARKS[state.preset]) : null,
  };
}

export type DesignerSnapshot = ReturnType<typeof buildSnapshot>;

export function initialSnapshot() {
  return buildSnapshot(createRuntimeContext(), new DrawingLayouts(DEFAULTS), false);
}
