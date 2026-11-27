import type { ModelParameters } from '../domain/design-types.ts';
import type { ViewName, JointType } from '../model/joint-view-types.ts';
import type { DrawingLayout } from '../domain/layout-variants.ts';
import { createRuntimeContext, type RuntimeContext, type RuntimeState } from '../viewer/runtime-context.ts';
import { createSceneController, type SceneController } from '../viewer/scene.ts';
import { createMaterials } from '../viewer/materials.ts';
import { createView, type ViewController } from '../viewer/view.ts';
import { createDimensions } from '../viewer/dims.ts';
import { createEditor, type EditorController } from '../viewer/edit.ts';
import { solve } from '../domain/solve.ts';
import { createModel } from './model.ts';
import { createLayoutController } from './layout-controller.ts';
import { createParameterEditor } from './designer-parameters.ts';
import { buildSnapshot, type DesignerSnapshot } from './designer-snapshot.ts';

export type Designer = ReturnType<typeof createDesigner>;
export type { PostSide } from './designer-parameters.ts';
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
  show: RuntimeContext['display'];
  solve(parameters: ModelParameters): ReturnType<typeof solve>;
  setView(name: ViewName, instant?: boolean): void;
  rebuild(refit?: boolean): void;
  controls: ReturnType<SceneController['getScene']>['controls'];
  labels: RuntimeContext['labels'];
  pickLabel: EditorController['pickLabel'];
  readonly layouts: DrawingLayout[];
  readonly camera: ReturnType<ViewController['getCamera']>;
  readonly state: Pick<RuntimeState, 'S' | 'layout' | 'view'> & { cam: string };
}
declare global { interface Window { pvDemo?: DesignerDebug } }

export function createDesigner({ canvas, stage, editor, onUpdate, onReady, onError }: DesignerOptions) {
  const context = createRuntimeContext();
  const { parameters, display, state } = context;
  const sceneController = createSceneController();
  const materials = createMaterials(context, sceneController);
  const view = createView(context, sceneController, materials);
  const dimensions = createDimensions(context, sceneController);
  const editing = createEditor(context, sceneController, view);
  const model = createModel(context, sceneController, materials, view, dimensions);
  const layouts = createLayoutController(context, { closeEdit: editing.closeEdit, rebuild, publish });
  const { currentDrawing, currentSections, syncParameters, ...layoutActions } = layouts;

  let disposed = false;
  let animationFrame = 0;
  let buildFrame = 0;
  let observer: ResizeObserver | undefined;
  let debug: DesignerDebug | undefined;
  let firstFrame = true;

  function publish() {
    onUpdate(buildSnapshot(context, currentDrawing(), sceneController.tryGetScene()?.controls.enableRotate === false));
  }

  function rebuild(refit = false) {
    if (disposed) return;
    cancelAnimationFrame(buildFrame);
    buildFrame = 0;
    editing.closeEdit(false);
    syncParameters();
    model.build(currentSections());
    if (refit) view.setView(state.view);
    publish();
  }

  function scheduleBuild() {
    syncParameters();
    if (!buildFrame && !disposed) buildFrame = requestAnimationFrame(() => rebuild());
  }

  function draw() {
    dimensions.updateLabels(view.getCamera());
    editing.update();
    const { renderer, scene } = sceneController.getScene();
    renderer.render(scene, view.getCamera());
  }

  function fitCanvas() {
    if (!disposed && sceneController.resize()) {
      view.resizeTieJointView();
      draw();
    }
  }

  function frame(now: number) {
    if (disposed) return;
    try {
      view.tick(now);
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
    editing.closeEdit(false);
    view.setView(name, instant);
    publish();
  }

  function selectJoint(kind: 'side' | 'type', value: number | JointType) {
    if (buildFrame) rebuild();
    if (!['side', 'type'].includes(kind)) return;
    const type = kind === 'side' ? state.jointType : value;
    if (typeof type !== 'string') return;
    const specs = state.layout?.jointSpecs?.[type];
    if (!Array.isArray(specs) || !specs.some(Boolean) || (type === 'side' && parameters.fix !== 'clamp')
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

  function changeDisplay(key: keyof typeof display, enabled: boolean) {
    display[key] = enabled;
    view.applyVisibility();
    publish();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(animationFrame);
    cancelAnimationFrame(buildFrame);
    observer?.disconnect();
    window.removeEventListener('resize', fitCanvas);
    editing.disposeEditing();
    model.clearDynamic();
    view.disposeView();
    dimensions.disposeDimensions();
    materials.disposeMaterials();
    sceneController.disposeScene();
    Object.assign(state, { S: null, layout: null, groups: null, dims: null });
    if (window.pvDemo === debug) delete window.pvDemo;
  }

  try {
    const { controls } = sceneController.initScene(canvas, stage);
    materials.initMaterials();
    view.initView();
    editing.initEditing(editor, scheduleBuild);
    sceneController.resize();
    rebuild();
    selectView(state.view, true);
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(fitCanvas);
      observer.observe(stage);
    } else {
      window.addEventListener('resize', fitCanvas);
    }
    debug = window.pvDemo = {
      P: parameters, show: display, solve: parameters => solve(parameters, currentSections()), setView: selectView, rebuild, controls,
      labels: context.labels, pickLabel: editing.pickLabel,
      get layouts() { return structuredClone(currentDrawing().layouts); },
      get camera() { return view.getCamera(); },
      get state() { return { S: state.S, layout: state.layout, view: state.view, cam: view.getCamera().type }; },
    };
    animationFrame = requestAnimationFrame(frame);
  } catch (error) {
    dispose();
    throw error;
  }

  return {
    ...createParameterEditor(context, { currentDrawing, currentSections, scheduleBuild, publish }),
    ...layoutActions,
    changeDisplay, selectView, selectJoint, fitCanvas, dispose,
  };
}
