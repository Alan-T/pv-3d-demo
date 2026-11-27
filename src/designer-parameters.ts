import { getBuiltState } from './core.ts';
import { isSurfaceFinishKey } from './design-types.ts';
import type { MaterialKey, MemberKey, MemberSections, ModelParameters, NumericParameterKey } from './design-types.ts';
import type { DrawingLayouts } from './layout-variants.ts';
import { P } from './model-parameters.ts';
import { findParameterField, updateNumericParameter } from './parameter-fields.ts';
import { findSection } from './section-spec.ts';
import { layoutEW } from './solve.ts';

export type PostSide = 'F' | 'R';

interface ParameterEditorOptions {
  currentDrawing(): DrawingLayouts;
  currentSections(): MemberSections;
  scheduleBuild(): void;
  publish(): void;
}

export function createParameterEditor({ currentDrawing, currentSections, scheduleBuild, publish }: ParameterEditorOptions) {
  function getAutomaticPurlinCutLengths() {
    const { cuts } = layoutEW({ ...P, purlinCutMode: 'auto' }, currentSections());
    return cuts.valid ? cuts.segments.map(segment => segment.length) : null;
  }

  // 切到自定义时，用当前实际分段或已安装的跨作为表单初值。
  function initializeCustomLayout(key: keyof ModelParameters) {
    if (key === 'purlinCutMode' && !P.purlinCutLengths?.length) {
      P.purlinCutLengths = getAutomaticPurlinCutLengths() ?? [];
    }
    if (key === 'purlinTies') {
      const { layout } = getBuiltState();
      const installed = new Set(layout.purlinTies.rods.map(rod => rod.bay));
      P.purlinTieSpans = layout.bays.map((_, index) => Number(installed.has(index)));
    }
  }

  function changeParameter(key: keyof ModelParameters, value: string | boolean) {
    if (isSurfaceFinishKey(key)) {
      if (typeof value === 'string' && P[key] !== value) {
        P[key] = value;
        currentDrawing().sharedParameters[key] = value;
        publish();
      }
      return P[key];
    }
    const definition = findParameterField(key);
    if (definition?.type === 'select') {
      const selected = 'numericOptions' in definition
        ? definition.numericOptions.find(option => String(option) === value)
        : definition.options.find(([option]) => option === value)?.[0];
      if (selected === undefined) return P[key];
      if (selected === 'custom') initializeCustomLayout(key);
      Object.assign(P, { [key]: selected });
      scheduleBuild();
    } else if (definition?.type === 'bool') {
      Object.assign(P, { [key]: Number(value) });
      scheduleBuild();
    } else {
      const numeric = Number(value);
      if (String(value).trim() && Number.isFinite(numeric) && updateNumericParameter(key as NumericParameterKey, numeric)) {
        scheduleBuild();
      }
    }
    return P[key];
  }

  function changeSection(key: MemberKey, text: string) {
    const section = findSection(key, text);
    if (section) {
      currentDrawing().setSection(key, section.name);
      scheduleBuild();
    }
    return currentDrawing().active.sections[key];
  }

  function changeMaterialGrade(key: MaterialKey, value: string) {
    const grade = currentDrawing().setMaterialGrade(key, value);
    publish();
    return grade;
  }

  function changePurlinCutLengths(lengths: number[]) {
    if (P.purlinCutMode !== 'custom') return '请先选择自定义分段。';
    const { cuts } = layoutEW({ ...P, purlinCutLengths: lengths }, currentSections());
    if (!cuts.valid) return cuts.error ?? '当前参数无法生成有效的檩条分段。';
    P.purlinCutLengths = [...lengths];
    scheduleBuild();
    return '';
  }

  function resetPurlinCutLengths() {
    const lengths = getAutomaticPurlinCutLengths();
    if (!lengths) return { error: '当前参数无法自动分段，请调整榀距或檩条最大长度。' };
    return { lengths, error: changePurlinCutLengths(lengths) };
  }

  function changePostTieMode(key: PostSide, mode: string) {
    if (mode === 'custom') {
      P[`postTieSpans${key}`] = getBuiltState().layout.postTies[key === 'F' ? 0 : 1].enabled.map(Number);
    }
    P[`postTie${key}`] = mode;
    scheduleBuild();
  }

  function changePostTieBay(key: PostSide, index: number, enabled: boolean) {
    // Preserve edits made during the same animation frame.
    const selected = getBuiltState().layout.postTies[key === 'F' ? 0 : 1].enabled
      .map((installed, bay) => P[`postTieSpans${key}`][bay] ?? Number(installed));
    selected[index] = Number(enabled);
    P[`postTieSpans${key}`] = selected;
    scheduleBuild();
  }

  function changePurlinTieBay(index: number, enabled: boolean) {
    const selected = [...P.purlinTieSpans];
    selected[index] = Number(enabled);
    P.purlinTieSpans = selected;
    scheduleBuild();
  }

  return {
    changeParameter, changeSection, changeMaterialGrade, changePurlinCutLengths, resetPurlinCutLengths,
    changePostTieMode, changePostTieBay, changePurlinTieBay,
  };
}
