import type { MaterialKey, MemberKey, ModelParameters, NumericParameterKey, PresetId } from './config.ts';
import type { ViewName, JointType } from './joint-view-types.ts';
import type { DrawingLayout } from './layout-variants.ts';
import type { calculatePostTies } from './post-tie-layout.ts';
import type { RuntimeState } from './core.ts';

export type DesignerSnapshot = ReturnType<typeof getSnapshot>;
export type Designer = ReturnType<typeof createDesigner>;
export type PostSide = 'F' | 'R';
interface DesignerOptions {
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  editor: HTMLInputElement;
  onUpdate(snapshot: DesignerSnapshot): void;
  onReady(): void;
  onError(error: unknown): void;
}

interface DesignerDebug {
  P: ModelParameters;
  show: typeof show;
  solve: typeof solve;
  setView(name: ViewName, instant?: boolean): void;
  rebuild(refit?: boolean): void;
  controls: ReturnType<typeof getScene>['controls'];
  labels: typeof shared.labels;
  pickLabel: typeof pickLabel;
  readonly layouts: DrawingLayout[];
  readonly camera: ReturnType<typeof getCamera>;
  readonly state: Pick<RuntimeState, 'S' | 'layout' | 'view'> & { cam: string };
}
declare global { interface Window { pvDemo?: DesignerDebug } }

import { applyPresetSections, applySection, isSurfaceFinishKey, FIX, P, PARAMS, PRESETS, show } from './config.ts';
import { findSection } from './section-spec.ts';
import { getBuiltState, shared } from './core.ts';
import { initScene, disposeScene, getScene, tryGetScene, resize } from './scene.ts';
import { initMaterials, disposeMaterials } from './materials.ts';
import { build, clearDynamic } from './model.ts';
import { initEditing, disposeEditing, closeEdit, setParam, pickLabel, update as updateEditor } from './edit.ts';
import { updateLabels, disposeDimensions } from './dims.ts';
import { initView, disposeView, setView, applyVisibility, getCamera, resizeTieJointView, tick } from './view.ts';
import { layoutEW, solve } from './solve.ts';
import { createReport } from './report.ts';
import { DrawingLayouts } from './layout-variants.ts';

const state = shared.state;
const drawings = Object.fromEntries(Object.entries(PRESETS).map(([id, preset]) => [id, new DrawingLayouts(preset)]));
const currentDrawing = () => drawings[state.preset];

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
export function getSnapshot() {
  const layout = state.layout;
  const drawing = currentDrawing();
  return {
    parameters: structuredClone(P),
    sections: { ...drawing.active.sections },
    activeLayoutId: drawing.activeId,
    layouts: structuredClone(drawing.layouts),
    display: { ...show },
    preset: state.preset,
    view: state.view,
    jointType: state.jointType,
    jointSel: state.jointSel,
    viewLocked: tryGetScene()?.controls.enableRotate === false,
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
    report: state.S && layout ? createReport(P, FIX, state.S, layout, state.preset) : null,
  };
}

export function createDesigner({ canvas, stage, editor, onUpdate, onReady, onError }: DesignerOptions) {
  let disposed = false;
  let animationFrame = 0;
  let buildFrame = 0;
  let observer: ResizeObserver | undefined;
  let debug: DesignerDebug | undefined;
  let firstFrame = true;

  function publish() {
    onUpdate(getSnapshot());
  }

  function syncParameters() {
    const drawing = currentDrawing();
    drawing.captureParameters(P);
    // 总长或最大料长变化后，在下一次重建或编辑前同步分段方式。
    const { purlinCutMode = 'auto', purlinCutLengths = [] } = drawing.active;
    P.purlinCutMode = purlinCutMode;
    P.purlinCutLengths = [...purlinCutLengths];
  }

  function rebuild(refit = false) {
    if (disposed) return;
    cancelAnimationFrame(buildFrame);
    buildFrame = 0;
    closeEdit(false);
    syncParameters();
    build();
    if (refit) setView(state.view);
    publish();
  }

  function scheduleBuild() {
    syncParameters();
    if (!buildFrame && !disposed) buildFrame = requestAnimationFrame(() => rebuild());
  }

  function draw() {
    updateLabels(getCamera());
    updateEditor();
    const { renderer, scene } = getScene();
    renderer.render(scene, getCamera());
  }

  function fitCanvas() {
    if (!disposed && resize()) {
      resizeTieJointView();
      draw();
    }
  }

  function frame(now: number) {
    if (disposed) return;
    try {
      tick(now);
      draw();
      if (firstFrame) {
        firstFrame = false;
        onReady();
      }
      animationFrame = requestAnimationFrame(frame);
    } catch (error) {
      dispose();
      onError(error);
    }
  }

  function selectView(name: ViewName, instant?: boolean) {
    if (buildFrame) rebuild();
    closeEdit(false);
    setView(name, instant);
    publish();
  }

  function selectJoint(kind: 'side' | 'type', value: number | JointType) {
    if (buildFrame) rebuild();
    if (!['side', 'type'].includes(kind)) return;
    const type = kind === 'side' ? state.jointType : value;
    if (typeof type !== 'string') return;
    const specs = state.layout?.jointSpecs?.[type];
    if (!Array.isArray(specs) || !specs.some(Boolean) || (type === 'side' && P.fix !== 'clamp')
      || (type === 'splice' && !state.layout?.cuts.positions.length)) return;
    let side = kind === 'side' ? Number(value) : state.jointSel;
    if (![0, 1].includes(side)) return;
    if (!specs[side]) {
      if (kind === 'side') return;
      side = specs.findIndex(Boolean);
    }
    state.jointType = type;
    state.jointSel = side;
    const next = state.view.startsWith('joint') ? state.view
      : ['mod', 'side', 'splice', 'postTie', 'purlinTie'].includes(state.jointType) ? 'joint-iso' : 'joint-elev';
    selectView(next);
  }

  function getAutomaticPurlinCutLengths() {
    const { cuts } = layoutEW({ ...P, purlinCutMode: 'auto' });
    return cuts.valid ? cuts.segments.map(segment => segment.length) : null;
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
    const definition = PARAMS.find(item => item.key === key);
    if (definition?.type === 'select') {
      if (!definition.options.some(([option]) => option === value)) return P[key];
      if (key === 'purlinCutMode' && value === 'custom' && !P.purlinCutLengths?.length) {
        P.purlinCutLengths = getAutomaticPurlinCutLengths() ?? [];
      }
      if (key === 'purlinTies' && value === 'custom') {
        const { layout } = getBuiltState();
        const installed = new Set(layout.purlinTies.rods.map(rod => rod.bay));
        P.purlinTieSpans = Array.from({ length: layout.zs.length - 1 }, (_, index) => Number(installed.has(index)));
      }
      Object.assign(P, { [key]: value });
      scheduleBuild();
    } else if (definition?.type === 'bool') {
      Object.assign(P, { [key]: Number(value) });
      scheduleBuild();
    } else if (String(value).trim() !== '' && Number.isFinite(Number(value))) {
      setParam(key as NumericParameterKey, Number(value));
    }
    return P[key];
  }

  function changeSection(key: MemberKey, text: string) {
    const section = findSection(key, text);
    if (section) {
      applySection(key, section);
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

  function loadActiveLayout() {
    const drawing = currentDrawing();
    Object.assign(P, drawing.getModelParameters());
    applyPresetSections(state.preset, drawing.active.sections);
    rebuild(true);
  }

  function applyPreset(preset: PresetId) {
    if (!Object.hasOwn(drawings, preset) || preset === state.preset) return;
    closeEdit(true);
    state.preset = preset;
    loadActiveLayout();
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

  function changePurlinCutLengths(lengths: number[]) {
    if (P.purlinCutMode !== 'custom') return '请先选择自定义分段。';
    const { cuts } = layoutEW({ ...P, purlinCutLengths: lengths });
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

  function changeDisplay(key: keyof typeof show, enabled: boolean) {
    show[key] = enabled;
    applyVisibility();
    publish();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    cancelAnimationFrame(buildFrame);
    observer?.disconnect();
    window.removeEventListener('resize', fitCanvas);
    disposeEditing();
    clearDynamic();
    disposeView();
    disposeDimensions();
    disposeMaterials();
    disposeScene();
    Object.assign(state, { S: null, layout: null, groups: null, dims: null });
    if (window.pvDemo === debug) delete window.pvDemo;
  }

  try {
    const { controls } = initScene(canvas, stage);
    initMaterials();
    initView();
    initEditing(editor, scheduleBuild);
    resize();
    rebuild();
    selectView(state.view, true);
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(fitCanvas);
      observer.observe(stage);
    } else {
      window.addEventListener('resize', fitCanvas);
    }
    debug = window.pvDemo = {
      P, show, solve, setView: selectView, rebuild, controls,
      labels: shared.labels, pickLabel,
      get layouts() { return structuredClone(currentDrawing().layouts); },
      get camera() { return getCamera(); },
      get state() { return { S: state.S, layout: state.layout, view: state.view, cam: getCamera().type }; },
    };
    animationFrame = requestAnimationFrame(frame);
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    changeParameter, changeSection, changeMaterialGrade, applyPreset, resetPreset, addLayout, removeLayout, selectLayout, changeLayoutQuantity,
    changePostTieMode, changePostTieBay,
    changePurlinTieBay, changePurlinCutLengths, resetPurlinCutLengths, changeDisplay, selectView, selectJoint, fitCanvas, dispose,
  };
}
