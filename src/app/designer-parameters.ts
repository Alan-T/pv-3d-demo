import type { RuntimeContext } from '../viewer/runtime-context.ts';
import { isSurfaceFinishKey } from '../domain/design-types.ts';
import type { MaterialKey, MemberKey, MemberSections, ModelParameters, NumericParameterKey } from '../domain/design-types.ts';
import type { DrawingLayouts } from '../domain/layout-variants.ts';
import { findParameterField } from '../domain/parameter-fields.ts';
import { automaticPurlinCutLengths, initializeCustomLayout, updateNumericParameter } from '../domain/parameter-rules.ts';
import { findSection } from '../domain/specs/section-spec.ts';
import { layoutEW } from '../domain/solve.ts';

export type PostSide = 'F' | 'R';

interface ParameterEditorOptions {
  currentDrawing(): DrawingLayouts;
  currentSections(): MemberSections;
  scheduleBuild(): void;
  publish(): void;
}

export function createParameterEditor(context: RuntimeContext, { currentDrawing, currentSections, scheduleBuild, publish }: ParameterEditorOptions) {
  const { parameters, getBuiltState } = context;

  function changeParameter(key: keyof ModelParameters, value: string | boolean) {
    if (isSurfaceFinishKey(key)) {
      if (typeof value === 'string' && parameters[key] !== value) {
        parameters[key] = value;
        currentDrawing().sharedParameters[key] = value;
        publish();
      }
      return parameters[key];
    }
    const definition = findParameterField(key);
    if (definition?.type === 'select') {
      const selected = 'numericOptions' in definition
        ? definition.numericOptions.find(option => String(option) === value)
        : definition.options.find(([option]) => option === value)?.[0];
      if (selected === undefined) return parameters[key];
      if (selected === 'custom') initializeCustomLayout(parameters, key, getBuiltState().layout, currentSections());
      Object.assign(parameters, { [key]: selected });
      scheduleBuild();
    } else if (definition?.type === 'bool') {
      Object.assign(parameters, { [key]: Number(value) });
      scheduleBuild();
    } else {
      const numeric = Number(value);
      if (String(value).trim() && Number.isFinite(numeric) && updateNumericParameter(parameters, key as NumericParameterKey, numeric)) {
        scheduleBuild();
      }
    }
    return parameters[key];
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
    if (parameters.purlinCutMode !== 'custom') return '请先选择自定义分段。';
    const { cuts } = layoutEW({ ...parameters, purlinCutLengths: lengths }, currentSections());
    if (!cuts.valid) return cuts.error ?? '当前参数无法生成有效的檩条分段。';
    parameters.purlinCutLengths = [...lengths];
    scheduleBuild();
    return '';
  }

  function resetPurlinCutLengths() {
    const lengths = automaticPurlinCutLengths(parameters, currentSections());
    if (!lengths) return { error: '当前参数无法自动分段，请调整榀距或檩条最大长度。' };
    return { lengths, error: changePurlinCutLengths(lengths) };
  }

  function changePostTieMode(key: PostSide, mode: string) {
    if (mode === 'custom') {
      initializeCustomLayout(parameters, `postTie${key}`, getBuiltState().layout, currentSections());
    }
    parameters[`postTie${key}`] = mode;
    scheduleBuild();
  }

  function changePostTieBay(key: PostSide, index: number, enabled: boolean) {
    // Preserve edits made during the same animation frame.
    const selected = getBuiltState().layout.postTies[key === 'F' ? 0 : 1].enabled
      .map((installed, bay) => parameters[`postTieSpans${key}`][bay] ?? Number(installed));
    selected[index] = Number(enabled);
    parameters[`postTieSpans${key}`] = selected;
    scheduleBuild();
  }

  function changePurlinTieBay(index: number, enabled: boolean) {
    const selected = [...parameters.purlinTieSpans];
    selected[index] = Number(enabled);
    parameters.purlinTieSpans = selected;
    scheduleBuild();
  }

  return {
    changeParameter, changeSection, changeMaterialGrade, changePurlinCutLengths, resetPurlinCutLengths,
    changePostTieMode, changePostTieBay, changePurlinTieBay,
  };
}
