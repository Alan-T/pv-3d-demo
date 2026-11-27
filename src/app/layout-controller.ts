import type { CorrosivityCategory, PresetId } from '../domain/design-types.ts';
import { PRESETS } from '../config/presets.ts';
import { SURFACE_FINISH_BY_CORROSIVITY } from '../config/catalogs.ts';
import { DrawingLayouts } from '../domain/layout-variants.ts';
import { resolveMemberSections } from '../domain/specs/section-spec.ts';
import type { RuntimeContext } from '../viewer/runtime-context.ts';

interface LayoutActions {
  closeEdit(commit: boolean): void;
  rebuild(refit?: boolean): void;
  publish(): void;
}

export function createLayoutController({ parameters, state }: RuntimeContext, { closeEdit, rebuild, publish }: LayoutActions) {
  const drawings = Object.fromEntries(Object.entries(PRESETS).map(([id, preset]) => [id, new DrawingLayouts(preset)]));
  const currentDrawing = () => drawings[state.preset];
  const currentSections = () => resolveMemberSections(currentDrawing().active.sections);

  function syncParameters() {
    const drawing = currentDrawing();
    drawing.captureParameters(parameters);
    // 总长或最大料长变化后，在下一次重建或编辑前同步分段方式。
    const { purlinCutMode = 'auto', purlinCutLengths = [] } = drawing.active;
    parameters.purlinCutMode = purlinCutMode;
    parameters.purlinCutLengths = [...purlinCutLengths];
  }

  function loadActiveLayout() {
    const drawing = currentDrawing();
    Object.assign(parameters, drawing.getModelParameters());
    rebuild(true);
  }

  function applyPreset(preset: PresetId) {
    if (!Object.hasOwn(drawings, preset) || preset === state.preset) return;
    closeEdit(true);
    state.preset = preset;
    loadActiveLayout();
  }

  function applyCorrosivityCategory(category: CorrosivityCategory) {
    const finishes = SURFACE_FINISH_BY_CORROSIVITY[category];
    for (const drawing of Object.values(drawings)) Object.assign(drawing.sharedParameters, finishes);
    Object.assign(parameters, finishes);
    publish();
  }

  function resetPreset() {
    closeEdit(false);
    currentDrawing().reset();
    loadActiveLayout();
  }

  function selectLayout(id: string) {
    closeEdit(true);
    if (currentDrawing().select(id)) loadActiveLayout();
  }

  function addLayout() {
    closeEdit(true);
    currentDrawing().add();
    loadActiveLayout();
  }

  function removeLayout(id = currentDrawing().activeId) {
    const drawing = currentDrawing();
    closeEdit(true);
    const previous = drawing.activeId;
    if (!drawing.remove(id)) return;
    if (previous !== drawing.activeId) loadActiveLayout();
    else publish();
  }

  function changeLayoutQuantity(value: string) {
    const quantity = currentDrawing().setQuantity(value);
    publish();
    return quantity;
  }

  return {
    currentDrawing, currentSections, syncParameters, applyPreset, resetPreset, applyCorrosivityCategory,
    selectLayout, addLayout, removeLayout, changeLayoutQuantity,
  };
}
