import { MODULE_MOUNTING } from '../config/engineering-rules.ts';
import type { LayoutPreset, MemberSections, ModelParameters, NumericParameterKey } from './design-types.ts';
import { MODULE_THICKNESSES } from './specs/clamp-spec.ts';
import { getSectionLibrary } from './specs/section-spec.ts';
import { getBraceConnectorPlate, needsSplitBraceConnector } from './specs/brace-connector-spec.ts';
import { limits } from './parameter-fields.ts';
import { layoutEW } from './solve.ts';
import type { calculatePostTies } from './post-tie-layout.ts';
import type { calculatePurlinTies } from './purlin-tie-layout.ts';

// 面板和画布标注共用同一套取整、上下限与组件安装孔距联动规则。
export function updateNumericParameter(parameters: ModelParameters, key: NumericParameterKey, value: number) {
  if (key === 'modT' && !MODULE_THICKNESSES.includes(value)) return false;
  const [min, max, step] = limits(key, parameters);
  const clamped = Math.min(max, Math.max(min, Math.round(value / step) * step));
  const next = Math.round(clamped * 10) / 10;
  if (parameters[key] === next) return false;
  parameters[key] = next;
  if (key === 'modL') parameters.hole = Math.min(parameters.hole, next - MODULE_MOUNTING.holeLengthAllowance);
  return true;
}

const postWidths = new Map(getSectionLibrary('postF').map(({ name, d }) => [name, d]));

export function updateBraceConnector(layout: LayoutPreset & { outer?: ModelParameters['outer'] }, sharedOuter: ModelParameters['outer']) {
  const { sections } = layout;
  const outer = layout.outer ?? sharedOuter;
  const split = needsSplitBraceConnector(outer, postWidths.get(sections.postF) ?? 0, postWidths.get(sections.postR) ?? 0);
  sections.braceConnector = getBraceConnectorPlate(outer, split).name;
}

export function reconcileLayout(layout: LayoutPreset, outer: ModelParameters['outer'], purlinLengthChanged: boolean) {
  updateBraceConnector(layout, outer);
  if (purlinLengthChanged) {
    layout.purlinCutMode = 'auto';
    layout.purlinCutLengths = [];
  }
}

export function automaticPurlinCutLengths(parameters: ModelParameters, sections: MemberSections) {
  const { cuts } = layoutEW({ ...parameters, purlinCutMode: 'auto' }, sections);
  return cuts.valid ? cuts.segments.map(segment => segment.length) : null;
}

type TieLayout = {
  bays: readonly number[];
  postTies: ReturnType<typeof calculatePostTies>;
  purlinTies: ReturnType<typeof calculatePurlinTies>;
};

/** 切换到自定义时，沿用当前已安装的拉杆跨或按自动规则得到的分段。 */
export function initializeCustomLayout(parameters: ModelParameters, key: keyof ModelParameters, layout: TieLayout, sections: MemberSections) {
  if (key === 'purlinCutMode' && !parameters.purlinCutLengths?.length) {
    parameters.purlinCutLengths = automaticPurlinCutLengths(parameters, sections) ?? [];
  } else if (key === 'purlinTies') {
    const installed = new Set(layout.purlinTies.rods.map(rod => rod.bay));
    parameters.purlinTieSpans = layout.bays.map((_, index) => Number(installed.has(index)));
  } else if (key === 'postTieF' || key === 'postTieR') {
    const front = key === 'postTieF';
    parameters[front ? 'postTieSpansF' : 'postTieSpansR'] = layout.postTies[front ? 0 : 1].enabled.map(Number);
  }
}
